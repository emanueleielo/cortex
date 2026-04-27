import { useMemo } from 'react'
import { create } from 'zustand'
import { adjustPlacement } from '@/utils/placement'

export type ZoneColor = 'ochre' | 'mint' | 'dust'

export interface Bbox {
  x: number
  y: number
  w: number
  h: number
}

/** Pixel-space origin captured when the user clicks a zone on the atlas —
 *  used by SceneView to expand the new scene from that zone's thumbnail. */
export interface Origin {
  cx: number
  cy: number
  r: number
}

export interface Edge {
  sceneId: string
  kind: string
  label?: string
}

export interface Hotspot {
  id: string
  bbox: { x: number; y: number; w: number; h: number }
  color: string
  /** Required on every meaningful hotspot — a hotspot is a doorway to another scene. */
  childSceneId?: string
  /** Optional override of the child scene's title for hover label. */
  label?: string
}

export interface Scene {
  id: string
  parentId: string | null
  title: string
  description: string
  text?: string
  sceneAsset?: string
  sceneSize?: { width: number; height: number }
  hotspots?: Hotspot[]
  /** Root-only fields (parentId=null): atlas position + tint */
  position?: { x: number; y: number }
  color?: ZoneColor
  domain?: 'personal' | 'software'
  /** Tagging / lensable fields */
  tags?: string[]
  people?: string[]
  /** Scene-level relations to other scenes. */
  connectsTo?: Edge[]
  createdAt: number
}

interface ScenesState {
  scenes: Scene[]
  /** Path of scene ids root → leaf. Empty = atlas. */
  currentPath: string[]
  /**
   * Bbox of the last hotspot click that triggered a navigation.
   * Used as the initial viewBox for the new scene's zoom-out match-cut.
   */
  lastNavBbox: Bbox | null
  /**
   * Pixel-space origin captured when navigating from a zone on the atlas.
   * Used by SceneView to expand the new scene from the zone thumbnail.
   */
  lastNavOrigin: Origin | null
  /** True once /api/atlas has responded (success or empty). */
  hydrated: boolean

  // ─── lifecycle ──────
  hydrate: () => Promise<void>
  /** Subscribe to /api/atlas/stream — server pushes a fresh snapshot whenever
   *  cortex notes/assets change on disk. Returns an unsubscribe fn. */
  subscribeToStream: () => () => void

  // ─── navigation ──────
  navigateTo: (sceneId: string, fromBbox?: Bbox, fromOrigin?: Origin) => void
  back: () => void
  goToRoot: () => void
  goToPath: (path: string[]) => void
  /** Re-derive currentPath from the browser URL. Called on initial load and
   *  on `popstate` (back/forward buttons). No-op if the URL doesn't resolve
   *  to a known scene chain. */
  syncFromUrl: () => void

  /** Used during drag to update a root scene position (in-memory only). */
  updatePosition: (id: string, position: { x: number; y: number }) => void
  /** Apply anti-overlap to the dragged scene; persist diff to backend. */
  finalizeDrag: (id: string) => void
}

interface AtlasJsonScene extends Omit<Scene, 'createdAt'> {
  createdAt: string
}

function fromJsonScenes(raw: AtlasJsonScene[]): Scene[] {
  return raw.map((s) => ({
    ...s,
    createdAt: new Date(s.createdAt).getTime() || Date.now(),
  })) as Scene[]
}

// ─── URL routing ──────────────────────────────────────────────────────────
//
// The path of scene ids is encoded in the URL as `/<id1>/<id2>/...`. Slashes
// in scene ids (the sibling-named convention uses them: `compact-middleware/
// config`) are encoded so they don't collide with the path separator. We
// decode on read; any segment that doesn't resolve to a known scene drops
// the rest of the chain (handles renames / deletions gracefully).

function pushUrl(path: string[]): void {
  if (typeof window === 'undefined') return
  const encoded =
    path.length === 0
      ? '/'
      : '/' + path.map((id) => encodeURIComponent(id)).join('/')
  if (window.location.pathname === encoded) return
  window.history.pushState(null, '', encoded)
}

function readUrl(scenes: Scene[]): string[] {
  if (typeof window === 'undefined') return []
  const segments = window.location.pathname
    .split('/')
    .filter(Boolean)
    .map((s) => decodeURIComponent(s))
  const byId = new Map(scenes.map((sc) => [sc.id, sc]))
  const out: string[] = []
  for (const id of segments) {
    if (!byId.has(id)) break
    out.push(id)
  }
  return out
}

// ─── persistence (drag updates only) ──────────────────────────────────────
//
// POST /api/atlas → vite plugin diffs against `cortex atlas view --json`,
// calls `cortex update <id> --set cortex.position.x=… --set cortex.color=…`
// for changed scenes. Creates and deletes are not exposed in the UI —
// new notes go through the `cortex` CLI or the agent skill.
let persistTimer: ReturnType<typeof setTimeout> | null = null

function toJsonScene(s: Scene): AtlasJsonScene {
  return {
    ...s,
    createdAt: new Date(s.createdAt).toISOString().slice(0, 10),
  }
}

function persistAtlas(scenes: Scene[]) {
  if (!import.meta.env.DEV) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const payload = { scenes: scenes.map(toJsonScene) }
    fetch('/api/atlas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.warn('[atlas] persist failed:', err)
    })
  }, 500)
}

export const useSceneStore = create<ScenesState>()((set) => ({
  scenes: [],
  currentPath: [],
  lastNavBbox: null,
  lastNavOrigin: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const res = await fetch('/api/atlas')
      if (!res.ok) throw new Error(`hydrate: ${res.status}`)
      const data = (await res.json()) as { scenes: AtlasJsonScene[] }
      set({ scenes: fromJsonScenes(data.scenes ?? []), hydrated: true })
    } catch (err) {
      console.warn('[atlas] hydrate failed:', err)
      set({ hydrated: true })
    }
  },

  subscribeToStream: () => {
    if (typeof EventSource === 'undefined') return () => {}
    const es = new EventSource('/api/atlas/stream')
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as { scenes?: AtlasJsonScene[] }
        const incoming = fromJsonScenes(data.scenes ?? [])
        set({ scenes: incoming })
      } catch (err) {
        console.warn('[atlas] stream parse failed:', err)
      }
    }
    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do.
    }
    return () => es.close()
  },

  navigateTo: (sceneId, fromBbox, fromOrigin) =>
    set((s) => {
      const next = [...s.currentPath, sceneId]
      pushUrl(next)
      return {
        currentPath: next,
        lastNavBbox: fromBbox ?? null,
        lastNavOrigin: fromOrigin ?? null,
      }
    }),

  back: () =>
    set((s) => {
      const next = s.currentPath.slice(0, -1)
      pushUrl(next)
      return {
        currentPath: next,
        lastNavBbox: null,
        lastNavOrigin: null,
      }
    }),

  goToRoot: () => {
    pushUrl([])
    set({ currentPath: [], lastNavBbox: null, lastNavOrigin: null })
  },

  goToPath: (path) => {
    pushUrl(path)
    set({ currentPath: path, lastNavBbox: null, lastNavOrigin: null })
  },

  syncFromUrl: () =>
    set((s) => {
      const path = readUrl(s.scenes)
      // Only update if it actually changed — avoids React tearing if user
      // hits popstate with the same URL (e.g. back to root from root).
      if (
        path.length === s.currentPath.length &&
        path.every((id, i) => id === s.currentPath[i])
      ) {
        return s
      }
      return { currentPath: path, lastNavBbox: null, lastNavOrigin: null }
    }),

  updatePosition: (id, position) =>
    set((s) => ({
      scenes: s.scenes.map((sc) => (sc.id === id ? { ...sc, position } : sc)),
    })),

  finalizeDrag: (id) =>
    set((s) => {
      const sc = s.scenes.find((x) => x.id === id)
      if (!sc || !sc.position) return s
      const others = s.scenes.filter(
        (x) => x.id !== id && x.parentId === null && x.position,
      ) as (Scene & { position: { x: number; y: number } })[]
      const adjusted = adjustPlacement({ clicked: sc.position, existing: others })
      const scenes = s.scenes.map((x) =>
        x.id === id ? { ...x, position: adjusted } : x,
      )
      persistAtlas(scenes)
      return { scenes }
    }),
}))

// ─── selectors ──────────────────────────────────────────────

export function useRootScenes(): Scene[] {
  return useSceneStore((s) =>
    s.scenes.filter((sc) => sc.parentId === null),
  )
}

export function useSceneById(id: string | null): Scene | null {
  return useSceneStore((s) =>
    id ? (s.scenes.find((sc) => sc.id === id) ?? null) : null,
  )
}

export function useCurrentScene(): Scene | null {
  return useSceneStore((s) => {
    const id = s.currentPath[s.currentPath.length - 1]
    if (!id) return null
    return s.scenes.find((sc) => sc.id === id) ?? null
  })
}

/** Build the path (root → target) from an arbitrary sceneId, walking parentId. */
export function pathFromScene(scenes: Scene[], targetId: string): string[] {
  const byId = new Map(scenes.map((s) => [s.id, s]))
  const out: string[] = []
  let cur: Scene | undefined = byId.get(targetId)
  while (cur) {
    out.unshift(cur.id)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return out
}

// ─── stale + drawn-status helpers ─────────────────────────────────────────
//
// Mirrors the CLI's `_is_stale` (cortex-cli/src/cortex/commands/image.py): a
// parent is stale if any of these holds:
//   1. it has children but no sceneAsset yet,
//   2. its hotspots' childSceneId set ≠ its current children's id set,
//   3. a hotspot's label disagrees with the current child's title (rename).
// The FE computes this client-side so users see staleness the moment a child
// is added or renamed — not only after `cortex image stale` runs.

export interface ChildStatus {
  child: Scene
  /** True if this child has a hotspot bbox painted into the parent's image. */
  hotspotted: boolean
  /** True if hotspotted but the label baked into the hotspot is now wrong. */
  labelStale: boolean
}

function computeChildrenStatus(
  parent: Scene | undefined,
  children: Scene[],
): ChildStatus[] {
  const labelById = new Map(
    (parent?.hotspots ?? [])
      .map((h) => [h.childSceneId, h.label] as const)
      .filter((entry): entry is readonly [string, string | undefined] => !!entry[0]),
  )
  return children.map((child) => {
    const hotspotted = labelById.has(child.id)
    const expected = child.title || child.id
    const stored = labelById.get(child.id)
    const labelStale = hotspotted && stored !== undefined && stored !== expected
    return { child, hotspotted, labelStale }
  })
}

function checkSceneStale(scene: Scene, kids: Scene[]): boolean {
  if (kids.length === 0) return false
  if (!scene.sceneAsset) return true
  const hotspotIds = new Set(
    (scene.hotspots ?? [])
      .map((h) => h.childSceneId)
      .filter((x): x is string => !!x),
  )
  if (hotspotIds.size !== kids.length) return true
  for (const c of kids) if (!hotspotIds.has(c.id)) return true
  // ID sets match — check label drift
  const labelById = new Map(
    (scene.hotspots ?? [])
      .map((h) => [h.childSceneId, h.label] as const)
      .filter((entry): entry is readonly [string, string | undefined] => !!entry[0]),
  )
  for (const c of kids) {
    const stored = labelById.get(c.id)
    const expected = c.title || c.id
    if (stored !== undefined && stored !== expected) return true
  }
  return false
}

/** Children of `parentId` annotated with hotspotted / labelStale status.
 *  Sorted to match the CLI's deterministic order (by id).
 *
 *  Implementation note: the inner zustand selector returns the stable
 *  `s.scenes` reference; the derived ChildStatus[] is built via useMemo so it
 *  keeps the same object identity across unrelated re-renders (otherwise
 *  React's useSyncExternalStore loops because `getSnapshot` keeps producing
 *  new arrays). */
export function useChildrenStatus(parentId: string | null): ChildStatus[] {
  const scenes = useSceneStore((s) => s.scenes)
  return useMemo(() => {
    if (!parentId) return []
    const parent = scenes.find((sc) => sc.id === parentId)
    const children = scenes
      .filter((sc) => sc.parentId === parentId)
      .sort((a, b) => a.id.localeCompare(b.id))
    return computeChildrenStatus(parent, children)
  }, [parentId, scenes])
}

/** True if the scene's image / hotspots are out of sync with its children. */
export function useIsSceneStale(id: string | null): boolean {
  const scenes = useSceneStore((s) => s.scenes)
  return useMemo(() => {
    if (!id) return false
    const scene = scenes.find((sc) => sc.id === id)
    if (!scene) return false
    const children = scenes.filter((sc) => sc.parentId === id)
    return checkSceneStale(scene, children)
  }, [id, scenes])
}

/** Resolve what to actually render for a scene. If the scene has its own
 *  `sceneAsset`, that's used full-frame. Otherwise — when the parent has an
 *  image with a hotspot painted for this child — we crop the parent's image
 *  at the hotspot bbox. This means a freshly-scanned leaf shows up as the
 *  building / island / room its parent already drew it as, instead of
 *  "Scene yet to be drawn". Returns null when neither path applies (root
 *  with no image, orphan, etc. — caller falls back to the title placeholder). */
export interface SceneDisplay {
  asset: string
  size: { width: number; height: number }
  /** If set, render the asset clipped to this bbox (in parent-image coords).
   *  Null means render the asset full-frame at (0, 0, size.width, size.height). */
  cropBbox: Bbox | null
}

export function resolveDisplay(
  scene: Scene,
  byId: Map<string, Scene>,
): SceneDisplay | null {
  if (scene.sceneAsset && scene.sceneSize) {
    return { asset: scene.sceneAsset, size: scene.sceneSize, cropBbox: null }
  }
  if (!scene.parentId) return null
  const parent = byId.get(scene.parentId)
  if (!parent?.sceneAsset || !parent.sceneSize) return null
  const hp = parent.hotspots?.find((h) => h.childSceneId === scene.id)
  if (!hp) return null
  return { asset: parent.sceneAsset, size: parent.sceneSize, cropBbox: hp.bbox }
}

/** True if the scene OR any of its descendants is stale. Used for the
 *  atlas-zone badge so a buried staleness still surfaces at the root. */
export function useIsSubtreeStale(id: string | null): boolean {
  const scenes = useSceneStore((s) => s.scenes)
  return useMemo(() => {
    if (!id) return false
    const byParent = new Map<string, Scene[]>()
    for (const sc of scenes) {
      const p = sc.parentId ?? '__root__'
      const list = byParent.get(p) ?? []
      list.push(sc)
      byParent.set(p, list)
    }
    const root = scenes.find((sc) => sc.id === id)
    if (!root) return false
    const stack: Scene[] = [root]
    while (stack.length) {
      const cur = stack.pop()!
      if (checkSceneStale(cur, byParent.get(cur.id) ?? [])) return true
      stack.push(...(byParent.get(cur.id) ?? []))
    }
    return false
  }, [id, scenes])
}
