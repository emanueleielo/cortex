import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useCameraStore } from '@/stores/camera'
import { useLensStore } from '@/stores/lens'
import { useIsSubtreeStale, useSceneStore, type Scene } from '@/stores/scenes'
import { useTimeStore } from '@/stores/time'
import { generateBoundary } from '@/utils/boundary'
import { BASE_H, BASE_W, pixelToWorld, worldToPixel } from '@/utils/camera'
import { useAtlasContainer } from './AtlasContext'
import { BuildingLandmark } from './landmarks/BuildingLandmark'

const INK = '#1F1F1F'
const RADIUS = 110
const THUMB_R = 52
const DRAG_THRESHOLD = 4

const COLOR_HEX: Record<string, string> = {
  ochre: '#C9A363',
  mint: '#A8C4B0',
  dust: '#B8CAD6',
}

interface Props {
  scene: Scene
  viewBoxW: number
  viewBoxH: number
}

/**
 * A root scene rendered as a "zone" on the atlas — boundary, thumbnail of the
 * scene asset, label. Click navigates into the scene.
 */
export function Zone({ scene, viewBoxW, viewBoxH }: Props) {
  const containerRef = useAtlasContainer()
  const updatePosition = useSceneStore((s) => s.updatePosition)
  const finalizeDrag = useSceneStore((s) => s.finalizeDrag)
  const navigateTo = useSceneStore((s) => s.navigateTo)

  const timeEnabled = useTimeStore((s) => s.enabled)
  const timeStart = useTimeStore((s) => s.start)
  const timeEnd = useTimeStore((s) => s.end)
  const inTimeRange =
    !timeEnabled ||
    timeStart === null ||
    timeEnd === null ||
    (scene.createdAt >= timeStart && scene.createdAt <= timeEnd)

  const activeLensTag = useLensStore((s) => s.activeTag)
  const activeLensPerson = useLensStore((s) => s.activePerson)
  const inLens = (() => {
    if (!activeLensTag && !activeLensPerson) return true
    if (activeLensTag && scene.tags?.includes(activeLensTag)) return true
    if (activeLensPerson && scene.people?.includes(activeLensPerson)) return true
    return false
  })()

  const isFiltered = !inTimeRange || !inLens

  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    moved: boolean
  } | null>(null)

  const cx = (scene.position?.x ?? 0.5) * viewBoxW
  const cy = (scene.position?.y ?? 0.5) * viewBoxH
  const fill = COLOR_HEX[scene.color ?? 'ochre'] ?? COLOR_HEX.ochre
  const subtreeStale = useIsSubtreeStale(scene.id)

  const boundary = useMemo(
    () => generateBoundary({ cx: 0, cy: 0, radius: RADIUS, seed: scene.id }),
    [scene.id],
  )

  const onPointerDown = (e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const el = containerRef.current
    if (!el) return

    const dx = e.clientX - drag.startClientX
    const dy = e.clientY - drag.startClientY
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    if (!drag.moved) {
      drag.moved = true
      setDragging(true)
    }

    const rect = el.getBoundingClientRect()
    const camera = useCameraStore.getState()
    const world = pixelToWorld(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      { width: rect.width, height: rect.height },
      { x: camera.x, y: camera.y, zoom: camera.zoom },
    )
    updatePosition(scene.id, world)
  }

  const onPointerUp = (e: React.PointerEvent<SVGGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragRef.current = null
    if (drag.moved) {
      finalizeDrag(scene.id)
      setDragging(false)
    } else {
      const el = containerRef.current
      const pos = scene.position
      if (!el || !pos) {
        navigateTo(scene.id)
        return
      }
      const rect = el.getBoundingClientRect()
      const camera = useCameraStore.getState()
      const center = worldToPixel(
        pos,
        { width: rect.width, height: rect.height },
        { x: camera.x, y: camera.y, zoom: camera.zoom },
      )
      const pxScale = Math.max(
        rect.width / (BASE_W / camera.zoom),
        rect.height / (BASE_H / camera.zoom),
      )
      const radiusPx = THUMB_R * pxScale
      navigateTo(scene.id, undefined, {
        cx: center.x,
        cy: center.y,
        r: radiusPx,
      })
    }
  }

  return (
    <g
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      transform={`translate(${cx} ${cy})`}
      style={{
        cursor: isFiltered ? 'default' : dragging ? 'grabbing' : 'grab',
        filter: isFiltered
          ? 'saturate(0.3)'
          : dragging
            ? 'drop-shadow(0 6px 8px rgba(31,31,31,0.18))'
            : hovered
              ? 'drop-shadow(0 2px 3px rgba(31,31,31,0.10))'
              : 'none',
        opacity: isFiltered ? 0.22 : 1,
        pointerEvents: isFiltered ? 'none' : 'auto',
        transition: 'opacity 350ms ease, filter 350ms ease',
        touchAction: 'none',
      }}
    >
      <motion.path
        d={boundary}
        fill={fill}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.18 }}
        transition={{ duration: 0.7, delay: 0.6, ease: 'easeOut' }}
      />
      <motion.path
        d={boundary}
        fill="none"
        stroke={fill}
        strokeWidth="1.5"
        opacity="0.85"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.path
        d={boundary}
        fill="none"
        stroke={INK}
        strokeWidth="0.5"
        strokeDasharray="2 4"
        opacity="0.42"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      />

      <motion.g
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.85, ease: 'easeOut' }}
      >
        {scene.sceneAsset ? (
          <>
            <defs>
              <clipPath id={`clip-${scene.id}`}>
                <circle cx="0" cy="0" r={THUMB_R} />
              </clipPath>
            </defs>
            <circle cx="0" cy="0" r={THUMB_R + 1} fill="#FAF6ED" />
            <image
              href={scene.sceneAsset}
              x={-THUMB_R}
              y={-THUMB_R}
              width={THUMB_R * 2}
              height={THUMB_R * 2}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#clip-${scene.id})`}
            />
            <circle
              cx="0"
              cy="0"
              r={THUMB_R}
              fill="none"
              stroke={INK}
              strokeWidth="1.4"
            />
            <circle
              cx="0"
              cy="0"
              r={THUMB_R + 4}
              fill="none"
              stroke={fill}
              strokeWidth="1.2"
              opacity="0.55"
              strokeDasharray="2 3"
            />
          </>
        ) : (
          <BuildingLandmark />
        )}

        {subtreeStale && (
          <g
            transform={`translate(${THUMB_R - 4} ${-THUMB_R + 4})`}
            aria-label="scene contains memories not yet drawn"
          >
            <title>Scene has memories not yet drawn — run cortex image gen --all-stale</title>
            <circle
              cx="0"
              cy="0"
              r="9"
              fill={COLOR_HEX.ochre}
              opacity="0.3"
            >
              <animate
                attributeName="r"
                values="9;13;9"
                dur="2s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.35;0.05;0.35"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx="0"
              cy="0"
              r="6"
              fill={COLOR_HEX.ochre}
              stroke={INK}
              strokeWidth="0.8"
            />
            <text
              x="0"
              y="0.5"
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="'EB Garamond', serif"
              fontStyle="italic"
              fontSize="9"
              fill={INK}
            >
              +
            </text>
          </g>
        )}
      </motion.g>

      <motion.text
        x={0}
        y={RADIUS + 22}
        textAnchor="middle"
        fontFamily="'EB Garamond', serif"
        fontStyle="italic"
        fontSize="22"
        fill={INK}
        letterSpacing="0.04em"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.05 }}
      >
        {scene.title}
      </motion.text>
    </g>
  )
}
