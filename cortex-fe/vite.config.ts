import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'

const MAX_BODY_BYTES = 5 * 1024 * 1024

const CORTEX_ROOT =
  process.env.CORTEX_ROOT || path.join(os.homedir(), 'cortex')

// ─── SSE live-update state (module-scoped, shared across requests) ────────
const sseClients = new Set<ServerResponse>()
let pushTimer: ReturnType<typeof setTimeout> | null = null
/** Until this timestamp, suppress watcher-driven SSE pushes — used to silence
 *  the echo of our own POST /api/atlas writes while cortex commits. */
let suppressUntil = 0

interface CortexResult {
  code: number
  stdout: string
  stderr: string
}

function runCortex(args: string[]): Promise<CortexResult> {
  return new Promise((resolve) => {
    const proc = spawn('cortex', args, { env: process.env })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf-8')))
    proc.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf-8')))
    proc.on('error', (err) =>
      resolve({ code: -1, stdout, stderr: stderr + String(err) }),
    )
    proc.on('close', (code) =>
      resolve({ code: code ?? 0, stdout, stderr }),
    )
  })
}

/** Append `?v=<mtime>` to every sceneAsset URL so the browser refetches PNGs
 *  after `cortex image gen` overwrites them at the same path. */
function addAssetVersions(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload
  const p = payload as { scenes?: Array<Record<string, unknown>> }
  if (!Array.isArray(p.scenes)) return payload
  const scenes = p.scenes.map((s) => {
    const url = s.sceneAsset
    if (typeof url !== 'string') return s
    const m = url.match(/^\/cortex-asset\/(.+?)(\?.*)?$/)
    if (!m) return s
    const filePath = path.join(CORTEX_ROOT, 'assets', m[1])
    try {
      const stat = fsSync.statSync(filePath)
      return { ...s, sceneAsset: `${m[0].split('?')[0]}?v=${Math.floor(stat.mtimeMs)}` }
    } catch {
      return s
    }
  })
  return { ...p, scenes }
}

/** Run `cortex atlas view --json`, attach asset versions, return the JSON
 *  string. Returns null on CLI failure. */
async function snapshotJson(): Promise<string | null> {
  const r = await runCortex(['atlas', 'view', '--json'])
  if (r.code !== 0) return null
  try {
    return JSON.stringify(addAssetVersions(JSON.parse(r.stdout)))
  } catch {
    return null
  }
}

/** Debounced push of the current snapshot to all SSE clients. Skipped during
 *  the suppression window after a POST. */
function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(async () => {
    pushTimer = null
    if (Date.now() < suppressUntil) return
    if (sseClients.size === 0) return
    const json = await snapshotJson()
    if (!json) return
    const data = `data: ${json}\n\n`
    for (const client of sseClients) {
      try {
        client.write(data)
      } catch {
        sseClients.delete(client)
      }
    }
  }, 250)
}

/** Watch ~/cortex/ for any .md or .png change and trigger a push. Resilient
 *  to the directory not existing yet (retries every few seconds). */
function startWatcher() {
  if (!fsSync.existsSync(CORTEX_ROOT)) {
    setTimeout(startWatcher, 5000)
    return
  }
  try {
    const watcher = fsSync.watch(
      CORTEX_ROOT,
      { recursive: true },
      (_event, filename) => {
        if (!filename) return
        const f = filename.toString()
        // ignore vcs / index churn — those don't affect what the FE renders
        if (f.startsWith('.git/') || f === '.git' || f.startsWith('.index/'))
          return
        if (!f.endsWith('.md') && !f.endsWith('.png')) return
        schedulePush()
      },
    )
    watcher.on('error', (err) => {
      console.warn('[cortex-bridge] watcher error:', err)
    })
    console.log(`[cortex-bridge] watching ${CORTEX_ROOT} for live updates`)
  } catch (err) {
    console.warn('[cortex-bridge] failed to start watcher:', err)
  }
}

function gitCommit(message: string): Promise<CortexResult> {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'HUMAN',
      GIT_AUTHOR_EMAIL: 'human@cortex.local',
      GIT_COMMITTER_NAME: 'HUMAN',
      GIT_COMMITTER_EMAIL: 'human@cortex.local',
    }
    const proc = spawn('git', ['-C', CORTEX_ROOT, 'commit', '-am', message], { env })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf-8')))
    proc.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf-8')))
    proc.on('close', (code) =>
      resolve({ code: code ?? 0, stdout, stderr }),
    )
  })
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

interface IncomingScene {
  id: string
  position?: { x: number; y: number }
  color?: string
}

function diffUpdates(
  incoming: IncomingScene[],
  current: { id: string; position?: { x: number; y: number }; color?: string }[],
): { id: string; setArgs: string[] }[] {
  const byId = new Map(current.map((s) => [s.id, s]))
  const out: { id: string; setArgs: string[] }[] = []
  for (const inc of incoming) {
    const cur = byId.get(inc.id)
    if (!cur) continue
    const setArgs: string[] = []
    const ip = inc.position
    const cp = cur.position
    if (ip && cp) {
      if (ip.x !== cp.x) setArgs.push('--set', `cortex.position.x=${ip.x}`)
      if (ip.y !== cp.y) setArgs.push('--set', `cortex.position.y=${ip.y}`)
    } else if (ip && !cp) {
      setArgs.push('--set', `cortex.position.x=${ip.x}`)
      setArgs.push('--set', `cortex.position.y=${ip.y}`)
    }
    if (inc.color && inc.color !== cur.color) {
      setArgs.push('--set', `cortex.color=${inc.color}`)
    }
    if (setArgs.length) out.push({ id: inc.id, setArgs })
  }
  return out
}

function cortexBridge(): Plugin {
  return {
    name: 'cortex-bridge',
    apply: 'serve',
    configureServer(server) {
      startWatcher()

      // GET /api/atlas/stream — SSE: initial snapshot + live updates on FS change.
      server.middlewares.use(
        '/api/atlas/stream',
        (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (req.method !== 'GET') {
            next()
            return
          }
          res.statusCode = 200
          res.setHeader('content-type', 'text/event-stream')
          res.setHeader('cache-control', 'no-cache')
          res.setHeader('connection', 'keep-alive')
          res.setHeader('x-accel-buffering', 'no')
          res.flushHeaders?.()
          sseClients.add(res)

          // initial snapshot
          snapshotJson().then((json) => {
            if (json) {
              try {
                res.write(`data: ${json}\n\n`)
              } catch {
                /* client gone */
              }
            }
          })

          // heartbeat keeps proxies / browsers from closing the connection
          const ping = setInterval(() => {
            try {
              res.write(': ping\n\n')
            } catch {
              /* dead client */
            }
          }, 25_000)

          req.on('close', () => {
            clearInterval(ping)
            sseClients.delete(res)
          })
        },
      )

      // GET/POST /api/atlas — read scenes / persist position+color updates
      server.middlewares.use(
        '/api/atlas',
        (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (req.method === 'GET') {
            snapshotJson()
              .then((json) => {
                if (!json) {
                  res.statusCode = 500
                  res.end('cortex atlas view failed')
                  return
                }
                res.statusCode = 200
                res.setHeader('content-type', 'application/json')
                res.end(json)
              })
              .catch((err) => {
                res.statusCode = 500
                res.end(String(err.message || err))
              })
            return
          }
          if (req.method === 'POST') {
            handlePost(req, res).catch((err) => {
              res.statusCode = 500
              res.end(String(err.message || err))
            })
            return
          }
          next()
        },
      )

      // /cortex-asset/* — serve binary assets from ~/cortex/assets/
      server.middlewares.use(
        '/cortex-asset',
        (req: IncomingMessage, res: ServerResponse) => {
          const url = req.url ?? ''
          const rel = url.split('?')[0].replace(/^\/+/, '')
          if (!rel || rel.includes('..')) {
            res.statusCode = 400
            res.end()
            return
          }
          const full = path.join(CORTEX_ROOT, 'assets', rel)
          fs.readFile(full)
            .then((data) => {
              const ext = path.extname(rel).toLowerCase()
              const ct: Record<string, string> = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml',
              }
              res.statusCode = 200
              res.setHeader('content-type', ct[ext] ?? 'application/octet-stream')
              res.setHeader('cache-control', 'no-cache')
              res.end(data)
            })
            .catch(() => {
              res.statusCode = 404
              res.end()
            })
        },
      )
    },
  }
}

async function handlePost(req: IncomingMessage, res: ServerResponse) {
  // Suppress watcher pushes for the duration of our own write+commit so the
  // FE doesn't see its own drag echoed back as a stale-then-fresh flicker.
  suppressUntil = Date.now() + 1500
  const body = await readBody(req)
  let payload: { scenes?: IncomingScene[] }
  try {
    payload = JSON.parse(body)
  } catch {
    res.statusCode = 400
    res.end('invalid json')
    return
  }
  const incoming = payload.scenes
  if (!Array.isArray(incoming)) {
    res.statusCode = 400
    res.end('expected { scenes: Scene[] }')
    return
  }

  const cur = await runCortex(['atlas', 'view', '--json'])
  if (cur.code !== 0) {
    res.statusCode = 500
    res.end(cur.stderr || 'cortex atlas view failed')
    return
  }
  const currentScenes = (JSON.parse(cur.stdout).scenes ?? []) as IncomingScene[]
  const updates = diffUpdates(incoming, currentScenes)

  for (const u of updates) {
    const r = await runCortex(['update', u.id, ...u.setArgs, '--no-commit'])
    if (r.code !== 0) {
      console.warn('[cortex-bridge] update failed:', u.id, r.stderr)
    }
  }

  if (updates.length) {
    const ids = updates.map((u) => u.id).join(', ')
    const msg = `atlas: update ${updates.length} scene${updates.length > 1 ? 's' : ''} (${ids.slice(0, 80)})`
    await gitCommit(msg)
  }

  res.statusCode = 200
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ ok: true, updated: updates.length }))
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cortexBridge()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
})
