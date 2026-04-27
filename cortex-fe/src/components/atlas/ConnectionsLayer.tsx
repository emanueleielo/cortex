import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useCameraStore } from '@/stores/camera'
import { useLensStore } from '@/stores/lens'
import { useSceneStore, type Scene } from '@/stores/scenes'
import { BASE_H, BASE_W } from '@/utils/camera'

interface Props {
  className?: string
}

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]
const INK = '#1F1F1F'

interface Edge {
  fromId: string
  toId: string
  fromPos: { x: number; y: number }
  toPos: { x: number; y: number }
  kind: string
}

function buildEdges(roots: Scene[]): Edge[] {
  const byId = new Map(roots.map((s) => [s.id, s]))
  const seen = new Set<string>()
  const edges: Edge[] = []
  for (const fromScene of roots) {
    if (!fromScene.position) continue
    for (const c of fromScene.connectsTo ?? []) {
      const to = byId.get(c.sceneId)
      if (!to || !to.position || to.id === fromScene.id) continue
      const k = `${fromScene.id}::${to.id}::${c.kind}`
      if (seen.has(k)) continue
      seen.add(k)
      edges.push({
        fromId: fromScene.id,
        toId: to.id,
        fromPos: fromScene.position,
        toPos: to.position,
        kind: c.kind,
      })
    }
  }
  return edges
}

function sceneMatches(
  s: Scene,
  activeTag: string | null,
  activePerson: string | null,
): boolean {
  if (activeTag) return s.tags?.includes(activeTag) ?? false
  if (activePerson) return s.people?.includes(activePerson) ?? false
  return false
}

function arcPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
): string {
  const x1 = a.x * BASE_W
  const y1 = a.y * BASE_H
  const x2 = b.x * BASE_W
  const y2 = b.y * BASE_H
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const offset = Math.min(110, len * 0.16)
  const px = mx - (dy / len) * offset
  const py = my + (dx / len) * offset
  return `M ${x1} ${y1} Q ${px} ${py} ${x2} ${y2}`
}

export function ConnectionsLayer({ className }: Props) {
  const scenes = useSceneStore((s) => s.scenes)
  const roots = useMemo(
    () => scenes.filter((sc) => sc.parentId === null && sc.position),
    [scenes],
  )
  const activeTag = useLensStore((s) => s.activeTag)
  const activePerson = useLensStore((s) => s.activePerson)
  const camX = useCameraStore((s) => s.x)
  const camY = useCameraStore((s) => s.y)
  const zoom = useCameraStore((s) => s.zoom)

  const lensActive = activeTag !== null || activePerson !== null

  const matching = useMemo(() => {
    const set = new Set<string>()
    if (!lensActive) return set
    for (const r of roots) {
      if (sceneMatches(r, activeTag, activePerson)) set.add(r.id)
    }
    return set
  }, [roots, activeTag, activePerson, lensActive])

  const edges = useMemo(() => buildEdges(roots), [roots])

  const vbW = BASE_W / zoom
  const vbH = BASE_H / zoom

  return (
    <svg
      viewBox={`${camX} ${camY} ${vbW} ${vbH}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      {edges.map((e) => {
        const a = matching.has(e.fromId)
        const b = matching.has(e.toId)
        const isHighlighted = lensActive && a && b
        const isFaded = lensActive && !(a && b)
        const targetOpacity = isHighlighted ? 0.5 : isFaded ? 0.03 : 0.12
        const targetWidth = isHighlighted ? 1.5 : 0.7
        return (
          <motion.path
            key={`${e.fromId}-${e.toId}-${e.kind}`}
            d={arcPath(e.fromPos, e.toPos)}
            fill="none"
            stroke={INK}
            strokeDasharray="2 7"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{
              pathLength: 1,
              opacity: targetOpacity,
              strokeWidth: targetWidth,
            }}
            transition={{
              pathLength: { duration: 1.1, ease: EASE, delay: 0.6 },
              opacity: { duration: 0.45, ease: EASE },
              strokeWidth: { duration: 0.45, ease: EASE },
            }}
          />
        )
      })}
    </svg>
  )
}
