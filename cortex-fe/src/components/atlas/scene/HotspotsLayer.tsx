import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useLensStore } from '@/stores/lens'
import { useSceneStore, type Bbox, type Hotspot } from '@/stores/scenes'

const INK = '#1F1F1F'
const CREAM = '#FAF6ED'

interface Props {
  hotspots: Hotspot[]
  onNavigate: (childSceneId: string, bbox: Bbox) => void
}

export function HotspotsLayer({ hotspots, onNavigate }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const activeLensTag = useLensStore((s) => s.activeTag)
  const activeLensPerson = useLensStore((s) => s.activePerson)
  const scenes = useSceneStore((s) => s.scenes)
  const sceneById = useMemo(
    () => new Map(scenes.map((sc) => [sc.id, sc])),
    [scenes],
  )

  return (
    <>
      {hotspots.map((h, i) => {
        const child = h.childSceneId ? sceneById.get(h.childSceneId) : undefined
        const isHovered = hoveredId === h.id
        const inLens = (() => {
          if (!activeLensTag && !activeLensPerson) return true
          if (activeLensTag && child?.tags?.includes(activeLensTag)) return true
          if (activeLensPerson && child?.people?.includes(activeLensPerson))
            return true
          return false
        })()
        const label = h.label ?? child?.title ?? ''
        const navigable = !!h.childSceneId

        const plusCx = h.bbox.x + h.bbox.w - 14
        const plusCy = h.bbox.y + 14

        return (
          <motion.g
            key={h.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: inLens ? 1 : 0.16 }}
            transition={{
              duration: 0.5,
              delay: 0.5 + i * 0.07,
              ease: 'easeOut',
            }}
            onMouseEnter={() => inLens && setHoveredId(h.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={(e) => {
              e.stopPropagation()
              if (inLens && navigable && h.childSceneId) {
                onNavigate(h.childSceneId, h.bbox)
              }
            }}
            style={{
              cursor: inLens && navigable ? 'pointer' : 'default',
              pointerEvents: inLens ? 'auto' : 'none',
            }}
          >
            <motion.rect
              x={h.bbox.x}
              y={h.bbox.y}
              width={h.bbox.w}
              height={h.bbox.h}
              rx={3}
              fill={INK}
              stroke={INK}
              strokeLinejoin="round"
              animate={{
                fillOpacity: isHovered ? 0.04 : 0,
                strokeOpacity: isHovered ? 0.55 : 0.2,
                strokeWidth: isHovered ? 1.4 : 0.8,
                strokeDasharray: isHovered ? '0' : '5 5',
              }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            />

            {navigable && (
              <motion.g
                animate={{ opacity: isHovered ? 1 : 0.4 }}
                transition={{ duration: 0.18 }}
              >
                <circle
                  cx={plusCx}
                  cy={plusCy}
                  r={9}
                  fill={CREAM}
                  stroke={INK}
                  strokeWidth={0.8}
                />
                <line
                  x1={plusCx - 4}
                  y1={plusCy}
                  x2={plusCx + 4}
                  y2={plusCy}
                  stroke={INK}
                  strokeWidth={1.1}
                  strokeLinecap="round"
                />
                <line
                  x1={plusCx}
                  y1={plusCy - 4}
                  x2={plusCx}
                  y2={plusCy + 4}
                  stroke={INK}
                  strokeWidth={1.1}
                  strokeLinecap="round"
                />
              </motion.g>
            )}

            {isHovered && label && (
              <motion.g
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                pointerEvents="none"
              >
                <rect
                  x={h.bbox.x}
                  y={h.bbox.y - 32}
                  width={label.length * 10 + 24}
                  height={26}
                  rx={2}
                  fill={CREAM}
                  stroke={INK}
                  strokeWidth={0.7}
                />
                <text
                  x={h.bbox.x + 12}
                  y={h.bbox.y - 14}
                  fill={INK}
                  fontSize={14}
                  fontFamily="'EB Garamond', serif"
                  fontStyle="italic"
                >
                  {label}
                </text>
              </motion.g>
            )}
          </motion.g>
        )
      })}
    </>
  )
}
