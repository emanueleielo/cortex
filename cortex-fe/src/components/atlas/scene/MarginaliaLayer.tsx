import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { resolveDisplay, type Scene } from '@/stores/scenes'
import { getRelations } from '@/utils/relations'
import { LiveImage } from '../LiveImage'

const INK = '#1F1F1F'
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]
const MAX_PER_SIDE = 7
const TOP_MARGIN = 96
const BOTTOM_MARGIN = 130
const ITEM_HEIGHT = 64
const MIN_GUTTER = 150
const THUMB_SIZE = 44
// Must match SceneRenderer's inset in SceneView.tsx — the scene image is
// drawn at 56% of the viewport, centered, so the gutters are wider than the
// raw aspect-ratio letterbox would suggest.
const SCENE_INSET = 0.22
// Cap card width so we don't get giant editorial blocks when the gutter is
// huge (which is most of the time on wide monitors). 260px reads cleanly,
// keeps the card from competing with the scene image visually.
const MAX_CARD_WIDTH = 260

/** One marginalia card. A single related scene can have multiple semantic
 *  kinds (e.g. `link` AND `uses`), so we collect them here instead of
 *  rendering one card per (scene, kind) — that produced visually-noisy
 *  duplicates the user kept asking about. */
interface MargItem {
  scene: Scene
  arrow: string
  /** Semantic relationship kinds, in stable order. The first kind decides
   *  styling (e.g. `inside` / `pending`); the rest are listed inline as
   *  small tags so the user can still see *all* relationships. */
  kinds: string[]
  /** Free-form labels collected across the merged edges. */
  labels: string[]
  /** True for children that exist as notes but aren't yet drawn into the
   *  parent's scene image — marked visually so the user knows the parent
   *  needs `cortex image gen` to catch up. */
  pending?: boolean
}

interface PlacedItem {
  item: MargItem
  side: 'l' | 'r'
  y: number
  threadX1: number
  threadX2: number
}

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const onResize = () =>
      setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return vp
}

interface Props {
  scene: Scene
  allScenes: Scene[]
  onNavigate: (sceneId: string) => void
}

// Visualize a scene's relations as marginalia: small thumbnail + title + kind
// in the left/right gutters left by the image's letterbox, connected back to
// the image edge by a dashed filament. Editorial atlas / illuminated-bible feel.
export function MarginaliaLayer({ scene, allScenes, onNavigate }: Props) {
  const vp = useViewport()
  const sceneW = scene.sceneSize?.width ?? 1270
  const sceneH = scene.sceneSize?.height ?? 952
  const aspect = sceneW / sceneH

  // For drawing thumbnails of scenes that don't have their own image yet,
  // fall back to a crop of THEIR parent at the matching hotspot — same
  // logic the SceneView uses for the main view, applied at thumb scale.
  const sceneById = useMemo(
    () => new Map(allScenes.map((s) => [s.id, s])),
    [allScenes],
  )

  // The SVG is inset by SCENE_INSET on every side; inside that box, the
  // image fits with preserveAspectRatio="xMidYMid meet". So the actual image
  // width is min(boxW, boxH * aspect), and the gutter spans from viewport
  // edge to image edge (including the inset margin).
  const boxW = vp.w * (1 - 2 * SCENE_INSET)
  const boxH = vp.h * (1 - 2 * SCENE_INSET)
  const imageW = Math.min(boxW, boxH * aspect)
  const gutterW = (vp.w - imageW) / 2

  const rel = getRelations(scene, allScenes)

  // We deliberately do NOT list direct children on the right: they're
  // already visible *inside* the scene image as buildings/rooms (the user
  // clicks the hotspot to enter), and the bottom "Inside" card surfaces any
  // children that are pending an image-gen pass. Repeating them in the
  // gutter just doubles the noise.
  //
  // Scenes are grouped *across* sides: a target referenced both ways (X has
  // `[[me]]` in its body and I have `[[X]]` in mine) becomes a single card
  // with arrow `↔`, on the right side. The arrow + kinds combined still tell
  // the user the full story, but they don't have to scan two columns to see
  // the same node listed twice.
  const { leftItems, rightItems } = buildMarginaliaSides(rel)

  const lefts = leftItems.slice(0, MAX_PER_SIDE)
  const rights = rightItems.slice(0, MAX_PER_SIDE)

  // Skip on very narrow viewports — would crowd the image.
  if (gutterW < MIN_GUTTER) return null
  if (lefts.length === 0 && rights.length === 0) return null

  const layoutSide = (items: MargItem[], side: 'l' | 'r'): PlacedItem[] => {
    const n = items.length
    if (n === 0) return []
    const usableH = vp.h - TOP_MARGIN - BOTTOM_MARGIN
    const stride = usableH / (n + 1)
    return items.map((it, i) => {
      const y = TOP_MARGIN + stride * (i + 1)
      const imageEdge = side === 'l' ? gutterW : vp.w - gutterW
      const itemEdge =
        side === 'l'
          ? gutterW - 16 - THUMB_SIZE / 2
          : vp.w - gutterW + 16 + THUMB_SIZE / 2
      return { item: it, side, y, threadX1: imageEdge, threadX2: itemEdge }
    })
  }

  const placedLefts = layoutSide(lefts, 'l')
  const placedRights = layoutSide(rights, 'r')
  const all = [...placedLefts, ...placedRights]

  return (
    <div className="fixed inset-0 z-[42] pointer-events-none" aria-hidden="false">
      {/* Threads — dashed filaments from image edge to each item */}
      <svg
        width={vp.w}
        height={vp.h}
        viewBox={`0 0 ${vp.w} ${vp.h}`}
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0"
      >
        {all.map((m, i) => (
          <motion.line
            key={`thread-${m.item.scene.id}-${m.side}-${i}`}
            x1={m.threadX1}
            y1={m.y}
            x2={m.threadX2}
            y2={m.y}
            stroke={INK}
            strokeOpacity={0.45}
            strokeWidth={1}
            strokeDasharray="2 4"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              pathLength: { duration: 0.55, delay: 0.35 + i * 0.05, ease: EASE },
              opacity: { duration: 0.4, delay: 0.35 + i * 0.05 },
            }}
          />
        ))}
      </svg>

      {/* Items */}
      {all.map((m, i) => {
        const isLeft = m.side === 'l'
        return (
          <motion.button
            key={`item-${m.item.scene.id}-${m.side}-${i}`}
            type="button"
            onClick={() => onNavigate(m.item.scene.id)}
            initial={{ opacity: 0, x: isLeft ? -10 : 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.45,
              delay: 0.5 + i * 0.05,
              ease: EASE,
            }}
            className={`pointer-events-auto absolute flex items-center gap-3 px-2.5 py-1.5 rounded-sm group bg-cream/70 hover:bg-cream/95 border border-ink/12 hover:border-ink/40 backdrop-blur-md shadow-[0_2px_6px_rgba(31,31,31,0.06)] hover:shadow-[0_4px_12px_rgba(31,31,31,0.10)] transition ${
              isLeft ? 'flex-row' : 'flex-row-reverse text-right'
            }`}
            style={{
              top: m.y - ITEM_HEIGHT / 2,
              [isLeft ? 'left' : 'right']: 12,
              width: Math.min(gutterW - 24, MAX_CARD_WIDTH),
            }}
            title={`${m.item.arrow} ${m.item.kinds.join(' · ')} · ${m.item.scene.title}${m.item.labels.length ? ` · ${m.item.labels.join(', ')}` : ''}`}
          >
            <div
              className={`rounded-full overflow-hidden bg-cream flex-shrink-0 transition shadow-[0_1px_3px_rgba(31,31,31,0.10)] ${
                m.item.pending
                  ? 'border-2 border-ochre/70 border-dashed group-hover:border-ochre'
                  : 'border border-ink/40 group-hover:border-ink/70'
              }`}
              style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
            >
              <ItemThumb scene={m.item.scene} sceneById={sceneById} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-ink/55 group-hover:text-ink/80 transition truncate">
                {m.item.arrow} {m.item.kinds.join(' · ')}
              </div>
              <div className="font-serif italic text-[14px] leading-tight text-ink group-hover:text-ink transition truncate">
                {leafTitle(m.item.scene)}
              </div>
              {(prefixOf(m.item.scene) || m.item.labels.length > 0) && (
                <div className="font-serif italic text-[11.5px] text-ink/55 truncate">
                  {[prefixOf(m.item.scene), ...m.item.labels]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}

/** Pull out the leaf segment of a slug-style id so cards stay compact when
 *  half a dozen siblings all share a parent prefix. We prefer the scene
 *  title when the user has typed a clean human title; only when the title
 *  is *exactly* the slug (the common case for agent-created notes) do we
 *  trim. That way `Claude Code` stays `Claude Code`, but
 *  `compact-middleware/config` becomes `config`. */
function leafTitle(scene: Scene): string {
  const title = scene.title || scene.id
  if (title !== scene.id) return title
  const parts = scene.id.split('/')
  return parts[parts.length - 1] || scene.id
}

/** Inverse of leafTitle — returns a small "in <parent-slug>" hint when the
 *  scene id has nested segments and the title is the bare slug. Empty
 *  otherwise. Goes into the card subtitle so the user keeps context after
 *  we trimmed the visible name. */
function prefixOf(scene: Scene): string {
  const title = scene.title || scene.id
  if (title !== scene.id) return ''
  const parts = scene.id.split('/')
  if (parts.length <= 1) return ''
  return `in ${parts.slice(0, -1).join('/')}`
}

/** Build the left + right marginalia lists with cross-side dedup.
 *
 *  A scene that appears as BOTH incoming and outgoing collapses to a single
 *  card with arrow `↔`. The card lands on the right (outgoing is the more
 *  active framing: "I link to X"). Pure-incoming stays left with `←`,
 *  pure-outgoing stays right with `→`. The parent (enclosing scene) is
 *  always pinned to the left with `↑` so the user can navigate up
 *  predictably even if the parent is also referenced via wikilinks. */
function buildMarginaliaSides(rel: ReturnType<typeof getRelations>): {
  leftItems: MargItem[]
  rightItems: MargItem[]
} {
  type Bucket = {
    scene: Scene
    isParent: boolean
    hasIn: boolean
    hasOut: boolean
    kinds: string[]
    labels: string[]
  }
  const byId = new Map<string, Bucket>()

  const upsert = (
    scene: Scene,
    direction: 'in' | 'out' | 'parent',
    kind: string,
    label?: string,
  ) => {
    let b = byId.get(scene.id)
    if (!b) {
      b = {
        scene,
        isParent: false,
        hasIn: false,
        hasOut: false,
        kinds: [],
        labels: [],
      }
      byId.set(scene.id, b)
    }
    if (direction === 'parent') {
      b.isParent = true
      b.hasIn = true
    } else if (direction === 'in') {
      b.hasIn = true
    } else {
      b.hasOut = true
    }
    if (!b.kinds.includes(kind)) b.kinds.push(kind)
    if (label && !b.labels.includes(label)) b.labels.push(label)
  }

  if (rel.parent) upsert(rel.parent, 'parent', 'enclosing')
  for (const e of rel.incoming) upsert(e.scene, 'in', e.kind, e.label)
  for (const e of rel.outgoing) upsert(e.scene, 'out', e.kind, e.label)

  const left: MargItem[] = []
  const right: MargItem[] = []
  for (const b of byId.values()) {
    const arrow = b.isParent
      ? '↑'
      : b.hasIn && b.hasOut
        ? '↔'
        : b.hasIn
          ? '←'
          : '→'
    const item: MargItem = {
      scene: b.scene,
      arrow,
      kinds: b.kinds,
      labels: b.labels,
    }
    // Parent always left so "go up" is predictable. Bidirectional goes
    // right (outgoing voice). Otherwise place by direction.
    if (b.isParent || (b.hasIn && !b.hasOut)) {
      left.push(item)
    } else {
      right.push(item)
    }
  }
  return { leftItems: left, rightItems: right }
}

function ItemThumb({
  scene,
  sceneById,
}: {
  scene: Scene
  sceneById: Map<string, Scene>
}) {
  const display = resolveDisplay(scene, sceneById)
  if (!display) return null
  if (display.cropBbox) {
    const { cropBbox: bbox } = display
    return (
      <svg
        viewBox={`${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`}
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        aria-hidden
      >
        <image
          href={display.asset}
          x={0}
          y={0}
          width={display.size.width}
          height={display.size.height}
          preserveAspectRatio="none"
        />
      </svg>
    )
  }
  return (
    <LiveImage
      src={display.asset}
      alt=""
      className="w-full h-full object-cover"
      wrapperClassName="w-full h-full"
    />
  )
}
