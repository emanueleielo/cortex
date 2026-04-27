import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionTemplate,
  animate,
  type MotionValue,
} from 'framer-motion'
import {
  resolveDisplay,
  useSceneStore,
  useChildrenStatus,
  useIsSceneStale,
  type Bbox,
  type ChildStatus,
  type Hotspot,
  type Origin,
  type Scene,
  type SceneDisplay,
} from '@/stores/scenes'
import { HotspotsLayer } from './scene/HotspotsLayer'
import { ReadingMode } from './scene/ReadingMode'
import { MarginaliaLayer } from './scene/MarginaliaLayer'
import { RichText } from './scene/RichText'
import { LiveImage } from './LiveImage'
import { pathFromScene } from '@/stores/scenes'

// ─── Cinematic timings ─────────────────────────────────────────────────────
// Inspired by Powers-of-Ten / Inception / Gorogoa: a single continuous zoom
// where the swap is masked by a synchronous cross-dissolve, so the eye never
// catches the pixelation or the cut.

const ZOOM_IN_DURATION = 1.4
const ZOOM_OUT_DURATION = 1.1
// The crossfade STRADDLES the apex. It starts late into the zoom-in (so the
// first stretch is pure zoom on the OLD scene) and ends well into the de-zoom
// (so the resolution of the swap happens while the camera is already pulling
// out — the new world is "settling" as it reveals itself).
//
//   0────[ zoom-in only on OLD ]──┬────[ crossfade OLD→NEW ]────┬────[ de-zoom only on NEW ]──── 2.5
//                                0.7s                          2.2s
//                                       apex (1.4) sits inside the crossfade
const CROSSFADE_DELAY = 0.7
const CROSSFADE_DURATION = 1.5
const SIMPLE_FADE_DURATION = 0.5
// Blur (the "censoring" filter that hides what's happening during the swap).
// Lifecycle keyframes — values normalized over the full transition (2.5s):
//   0   ─ no blur (camera starts cleanly)
//   0.16 (≈0.4s) ─ blur ramps up
//   0.40 (≈1.0s) ─ blur at max (just before apex)
//   0.72 (≈1.8s) ─ blur still at max (well into de-zoom)
//   0.92 (≈2.3s) ─ blur ramps down
//   1   ─ no blur (camera at rest on full new scene)
const BLUR_MAX_PX = 14
// Long, smooth ease-in-out — the camera "breathes" toward the detail
const VIEWBOX_EASE: [number, number, number, number] = [0.65, 0, 0.35, 1]
const OPACITY_EASE: [number, number, number, number] = [0.4, 0, 0.6, 1]

// While in scene mode the atlas is visible UNDER the scene as a dim, blurred
// backdrop. Click on it (the side gutters left by aspect-ratio letterbox) =
// reverse-cinematic exit back to the atlas root. These are the steady-state
// values for the cream veil sitting between atlas and scene.
const ATLAS_DIM_OPACITY = 0.72
const ATLAS_DIM_BLUR_PX = 22
// Reverse transition: the clip-path circle collapses back toward the
// thumbnail origin while the cream veil fades out, revealing the atlas.
const EXIT_DURATION = 0.95
const EXIT_FADE_DURATION = 0.55

// ─── Renderer for one scene image (used twice during transitions) ──────────

interface SceneRendererProps {
  scene: Scene
  viewBoxStr: MotionValue<string>
  opacity: MotionValue<number> | number
  filter?: MotionValue<string>
  clipPath?: MotionValue<string>
  zIndex: number
  hotspots?: Hotspot[]
  onNavigate?: (childSceneId: string, bbox: Bbox) => void
  /** Resolved render config: own asset, or parent-crop fallback when the
   *  scene hasn't been drawn individually but its parent has it as a region. */
  display: SceneDisplay | null
}

function SceneRenderer({
  scene,
  viewBoxStr,
  opacity,
  filter,
  clipPath,
  zIndex,
  hotspots,
  onNavigate,
  display,
}: SceneRendererProps) {
  // When we're showing a parent-crop, the SVG viewBox is fixed to that bbox —
  // we don't want the inception zoom motion to apply to a borrowed image
  // (the motion values are in the *new* scene's coord system, which doesn't
  // exist when the new scene has no own asset). The fade-in still works via
  // the wrapper's opacity.
  const usingCrop = !!display && display.cropBbox !== null
  const cropViewBox = display?.cropBbox
    ? `${display.cropBbox.x} ${display.cropBbox.y} ${display.cropBbox.w} ${display.cropBbox.h}`
    : null

  return (
    <motion.div
      className="fixed inset-0 pointer-events-none"
      style={{
        zIndex,
        opacity,
        filter,
        clipPath,
        WebkitClipPath: clipPath,
      }}
    >
      {display ? (
        <motion.svg
          viewBox={usingCrop ? cropViewBox! : viewBoxStr}
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid meet"
          overflow="visible"
          className="absolute inset-[22%]"
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          <defs>
            {/* Paper-on-parchment: a soft far drop + a tighter close drop so
                the image reads as a printed plate sitting above the atlas.
                Filter region is generous so the wide-radius drop isn't
                clipped at the image's own bounding box (default 110% is too
                tight for stdDeviation ≈ 42). */}
            <filter
              id={`paper-shadow-${scene.id}`}
              x="-25%"
              y="-25%"
              width="150%"
              height="150%"
            >
              <feDropShadow
                dx="0"
                dy="28"
                stdDeviation="42"
                floodColor="#1F1F1F"
                floodOpacity="0.50"
              />
              <feDropShadow
                dx="0"
                dy="10"
                stdDeviation="16"
                floodColor="#1F1F1F"
                floodOpacity="0.32"
              />
            </filter>
          </defs>
          <image
            href={display.asset}
            x={0}
            y={0}
            width={display.size.width}
            height={display.size.height}
            preserveAspectRatio="none"
            filter={`url(#paper-shadow-${scene.id})`}
            style={{ pointerEvents: 'auto' }}
          />
          {!usingCrop && (
            <rect
              x={0}
              y={0}
              width={display.size.width}
              height={display.size.height}
              fill="none"
              stroke="#1F1F1F"
              strokeOpacity={0.08}
              strokeWidth={1}
              pointerEvents="none"
            />
          )}
          {!usingCrop && hotspots && hotspots.length > 0 && onNavigate && (
            <HotspotsLayer hotspots={hotspots} onNavigate={onNavigate} />
          )}
        </motion.svg>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <h2 className="font-serif italic text-ink text-[clamp(2rem,4vw,3rem)] tracking-wide">
              {scene.title}
            </h2>
            <div className="mt-3 flex items-center gap-3 text-ink/55 justify-center">
              <span className="h-px w-10 bg-ink/30" />
              <span className="font-serif italic text-sm">
                Scene yet to be drawn
              </span>
              <span className="h-px w-10 bg-ink/30" />
            </div>
            <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/35">
              click anywhere · or press esc · to return
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ─── Bottom collapsible info card ───────────────────────────────────────────

function formatYear(ts: number) {
  return new Date(ts).getFullYear()
}

interface InfoCardProps {
  scene: Scene
  sceneById: Map<string, Scene>
  isLeaf: boolean
  expanded: boolean
  onToggleExpanded: () => void
  onOpenRead: () => void
  onNavigateChild: (sceneId: string) => void
}

// Compact 28-px landmark for child rows. Three render paths:
//  1) child has its own sceneAsset → show that as a circular thumb
//  2) parent has a sceneAsset and a hotspot for this child → crop the parent
//     at the hotspot bbox (so the user sees the building / room their parent
//     image already drew for this child)
//  3) neither → dashed-border landmark placeholder
function ChildAvatar({
  child,
  parent,
  hotspot,
}: {
  child: Scene
  parent?: Scene
  hotspot?: Hotspot
}) {
  if (child.sceneAsset) {
    return (
      <LiveImage
        src={child.sceneAsset}
        alt=""
        className="w-full h-full object-cover"
        wrapperClassName="w-7 h-7 rounded-full overflow-hidden border border-ink/35 bg-cream flex-shrink-0"
      />
    )
  }
  if (parent?.sceneAsset && parent.sceneSize && hotspot) {
    return (
      <span className="w-7 h-7 rounded-full border border-ink/35 bg-cream flex-shrink-0 overflow-hidden block">
        <svg
          viewBox={`${hotspot.bbox.x} ${hotspot.bbox.y} ${hotspot.bbox.w} ${hotspot.bbox.h}`}
          preserveAspectRatio="xMidYMid slice"
          className="w-full h-full"
          aria-hidden
        >
          <image
            href={parent.sceneAsset}
            x={0}
            y={0}
            width={parent.sceneSize.width}
            height={parent.sceneSize.height}
            preserveAspectRatio="none"
          />
        </svg>
      </span>
    )
  }
  return (
    <span className="w-7 h-7 rounded-sm border border-ink/35 border-dashed bg-cream flex-shrink-0 grid place-items-center">
      <svg viewBox="-32 -55 64 80" width="18" height="22" aria-hidden>
        <g stroke="#1F1F1F" strokeWidth="1.2" fill="#FAF6ED" strokeLinejoin="round">
          <rect x="-30" y="10" width="60" height="14" />
          <rect x="-24" y="-25" width="48" height="35" />
          <path d="M -28 -25 L 0 -45 L 28 -25 Z" />
        </g>
      </svg>
    </span>
  )
}

function ChildRow({
  status,
  parent,
  hotspot,
  onNavigate,
}: {
  status: ChildStatus
  parent: Scene
  hotspot?: Hotspot
  onNavigate: (id: string) => void
}) {
  const { child, hotspotted, labelStale } = status
  let tag: string | null = null
  if (!hotspotted) tag = 'pending'
  else if (labelStale) tag = 'label outdated'
  return (
    <button
      type="button"
      onClick={() => onNavigate(child.id)}
      className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-ink/[0.05] transition text-left group"
    >
      <ChildAvatar child={child} parent={parent} hotspot={hotspot} />
      <span className="font-serif italic text-ink text-[14px] leading-tight flex-1 truncate group-hover:text-ink">
        {child.title || child.id}
      </span>
      {tag && (
        <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-ochre/85 border border-ochre/40 rounded-sm px-1.5 py-px flex-shrink-0">
          {tag}
        </span>
      )}
      <span className="font-mono text-[12px] text-ink/30 group-hover:text-ink/60 transition-transform group-hover:translate-x-0.5 flex-shrink-0">
        →
      </span>
    </button>
  )
}

function SceneInfoCard({
  scene,
  sceneById,
  isLeaf,
  expanded,
  onToggleExpanded,
  onOpenRead,
  onNavigateChild,
}: InfoCardProps) {
  const childrenStatus = useChildrenStatus(scene.id)
  const sceneIsStale = useIsSceneStale(scene.id)
  const drawnDoors = childrenStatus.filter((c) => c.hotspotted).length
  const totalDoors = childrenStatus.length
  const hotspotByChildId = useMemo(() => {
    const m = new Map<string, Hotspot>()
    for (const h of scene.hotspots ?? []) {
      if (h.childSceneId) m.set(h.childSceneId, h)
    }
    return m
  }, [scene.hotspots])
  return (
    <motion.div
      key={`info-${scene.id}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="absolute bottom-[3vh] inset-x-0 px-4 pointer-events-none flex justify-center z-[55]"
    >
      <motion.div
        layout
        transition={{ layout: { duration: 0.4, ease: VIEWBOX_EASE } }}
        className="bg-cream/95 backdrop-blur-md border border-ink/12 rounded-md shadow-md pointer-events-auto overflow-hidden"
        style={{
          width: expanded ? 'min(720px, 90vw)' : 'auto',
          maxWidth: '90vw',
        }}
      >
        <button
          type="button"
          onClick={onToggleExpanded}
          className="w-full flex items-center gap-3 px-5 py-2.5 text-left hover:bg-ink/[0.03] transition"
        >
          {sceneIsStale && (
            <span
              aria-hidden
              title="children added or renamed since last image gen"
              className="w-1.5 h-1.5 rounded-full bg-ochre flex-shrink-0 animate-pulse"
            />
          )}
          <h1 className="font-serif italic text-ink text-[clamp(1rem,1.45vw,1.25rem)] leading-tight flex-1 truncate">
            {scene.title}
          </h1>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/35 flex-shrink-0">
            {formatYear(scene.createdAt)}
          </span>
          <motion.svg
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.25, ease: VIEWBOX_EASE }}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="#1F1F1F"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-50 flex-shrink-0"
            aria-hidden
          >
            <path d="M 3 8 L 6 5 L 9 8" />
          </motion.svg>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.32, ease: VIEWBOX_EASE }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 max-h-[40vh] overflow-y-auto">
                {scene.description && (
                  <p className="font-serif italic text-ink/75 text-[clamp(0.9rem,1.2vw,1.05rem)] leading-snug">
                    <RichText
                      text={scene.description}
                      sceneById={sceneById}
                      onNavigate={onNavigateChild}
                    />
                  </p>
                )}
                {scene.tags && scene.tags.length > 0 && (
                  <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/40">
                    {scene.tags.slice(0, 7).join('  ·  ')}
                  </div>
                )}

                {childrenStatus.length > 0 && (
                  <div className="mt-4">
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-ink/45 mb-1.5 flex items-center gap-2">
                      <span>Inside</span>
                      <span className="h-px flex-1 bg-ink/15" />
                      {sceneIsStale && (
                        <span className="text-ochre/85">awaiting regen</span>
                      )}
                    </div>
                    <div className="-mx-2 flex flex-col">
                      {childrenStatus.map((status) => (
                        <ChildRow
                          key={status.child.id}
                          status={status}
                          parent={scene}
                          hotspot={hotspotByChildId.get(status.child.id)}
                          onNavigate={onNavigateChild}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={onOpenRead}
                  className="mt-5 w-full border border-ink/15 hover:border-ink/45 hover:bg-ink/[0.04] rounded px-4 py-2.5 flex items-center justify-between gap-3 transition group"
                >
                  <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink/65 group-hover:text-ink">
                    {scene.text ? 'Read full notes' : 'Open reading mode'}
                  </span>
                  <span className="font-mono text-[12px] text-ink/35 group-hover:text-ink/60 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </button>

                <div className="mt-4 pt-3 border-t border-ink/10 flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink/40">
                  <div className="flex items-center gap-3 min-w-0">
                    {scene.people && scene.people.length > 0 ? (
                      <span className="truncate">
                        with {scene.people.join(', ')}
                      </span>
                    ) : (
                      <span className="text-ink/30">—</span>
                    )}
                  </div>
                  {isLeaf ? (
                    <span className="text-ink/35 flex-shrink-0">leaf</span>
                  ) : drawnDoors === totalDoors ? (
                    <span className="text-ink/35 flex-shrink-0">
                      {totalDoors} doors
                    </span>
                  ) : (
                    <span className="text-ink/35 flex-shrink-0">
                      {drawnDoors}/{totalDoors} doors
                      <span className="text-ochre/85"> · +{totalDoors - drawnDoors} pending</span>
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}

// ─── Main view ──────────────────────────────────────────────────────────────

export function SceneView() {
  const path = useSceneStore((s) => s.currentPath)
  const scenes = useSceneStore((s) => s.scenes)
  const navigateTo = useSceneStore((s) => s.navigateTo)
  const back = useSceneStore((s) => s.back)
  const goToRoot = useSceneStore((s) => s.goToRoot)
  const goToPath = useSceneStore((s) => s.goToPath)
  const lastNavBbox = useSceneStore((s) => s.lastNavBbox)
  const lastNavOrigin = useSceneStore((s) => s.lastNavOrigin)

  const sceneById = useMemo(
    () => new Map(scenes.map((sc) => [sc.id, sc])),
    [scenes],
  )

  const currentScene =
    path.length > 0 ? (sceneById.get(path[path.length - 1]) ?? null) : null
  const childCount = useMemo(
    () =>
      currentScene
        ? scenes.filter((s) => s.parentId === currentScene.id).length
        : 0,
    [currentScene, scenes],
  )
  const isLeaf = childCount === 0
  const currentDisplay = useMemo(
    () => (currentScene ? resolveDisplay(currentScene, sceneById) : null),
    [currentScene, sceneById],
  )

  const [outgoingScene, setOutgoingScene] = useState<Scene | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const [cardExpanded, setCardExpanded] = useState(false)
  const [reading, setReading] = useState(false)
  // Synchronous guard against rapid clicks (state lags behind by a render).
  const transitioningRef = useRef(false)

  // Shared viewBox motion values (used by both outgoing and current renderer)
  const vbX = useMotionValue(0)
  const vbY = useMotionValue(0)
  const vbW = useMotionValue(currentScene?.sceneSize?.width ?? 1270)
  const vbH = useMotionValue(currentScene?.sceneSize?.height ?? 952)
  const viewBoxStr = useMotionTemplate`${vbX} ${vbY} ${vbW} ${vbH}`

  // Crossfade motion values
  const outgoingOpacity = useMotionValue(0)
  const incomingOpacity = useMotionValue(1)

  // Shared blur motion value — applied to both layers via filter prop.
  // Drives the "censoring" effect that hides the moment of transformation.
  const blurPx = useMotionValue(0)
  const filterStr = useMotionTemplate`blur(${blurPx}px)`

  // Cream veil (z=39) sitting between atlas and scene. Steady-state values:
  // ATLAS_DIM_OPACITY / ATLAS_DIM_BLUR_PX — translucent + soft blur so the
  // atlas remains faintly visible behind the scene's letterbox gutters and
  // can be clicked to jump back to the root.
  const baseOpacity = useMotionValue(ATLAS_DIM_OPACITY)
  const baseBlurPx = useMotionValue(ATLAS_DIM_BLUR_PX)
  const baseFilterStr = useMotionTemplate`blur(${baseBlurPx}px)`

  // Clip-path circle expansion — used when navigating from a zone thumbnail.
  // The new scene starts clipped to the thumbnail's circle, then the radius
  // grows to cover the whole viewport (Gorogoa match-cut: thumbnail → full).
  // Default: huge radius = effectively no clip.
  const clipCx = useMotionValue(0)
  const clipCy = useMotionValue(0)
  const clipRadiusPx = useMotionValue(99999)
  const clipPathStr = useMotionTemplate`circle(${clipRadiusPx}px at ${clipCx}px ${clipCy}px)`

  // Refs to track previous and manage timeouts
  const prevSceneRef = useRef<Scene | null>(null)
  const transitionTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  // Origin captured on entry — replayed in reverse for the exit transition
  // when the user clicks the atlas-veil to jump back home.
  const lastEntryOriginRef = useRef<Origin | null>(null)

  const clearTransitionTimeouts = () => {
    transitionTimeoutsRef.current.forEach(clearTimeout)
    transitionTimeoutsRef.current = []
  }

  useEffect(() => () => clearTransitionTimeouts(), [])

  // Reset card expanded + close reading mode on scene change
  useEffect(() => {
    setCardExpanded(false)
    setReading(false)
  }, [currentScene?.id])

  // ─── Transition orchestration on scene change ─────────────────────────────
  // useLayoutEffect (not useEffect) so the transition state is set BEFORE the
  // browser paints. Otherwise we'd flash the new scene at full opacity for one
  // frame between the navigateTo render and the effect.
  useLayoutEffect(() => {
    const oldCurrent = prevSceneRef.current
    const newCurrent = currentScene
    prevSceneRef.current = newCurrent

    if (!newCurrent) {
      // Going back to atlas
      clearTransitionTimeouts()
      setOutgoingScene(null)
      setTransitioning(false)
      transitioningRef.current = false
      return
    }

    // First mount from atlas — same cinematic transition, but the "outgoing"
    // is the atlas itself (covered via cream-overlay backdrop-blur) instead
    // of a SceneRenderer.
    if (!oldCurrent && newCurrent) {
      runEnterFromAtlas(newCurrent, lastNavOrigin, lastNavBbox)
      return
    }

    // Same scene — just settle viewBox
    if (oldCurrent && oldCurrent.id === newCurrent.id) {
      clearTransitionTimeouts()
      const w = newCurrent.sceneSize?.width ?? 1270
      const h = newCurrent.sceneSize?.height ?? 952
      vbX.set(0)
      vbY.set(0)
      vbW.set(w)
      vbH.set(h)
      outgoingOpacity.set(0)
      incomingOpacity.set(1)
      baseOpacity.set(ATLAS_DIM_OPACITY)
      baseBlurPx.set(ATLAS_DIM_BLUR_PX)
      setOutgoingScene(null)
      setTransitioning(false)
      transitioningRef.current = false
      return
    }

    // At this point both oldCurrent and newCurrent exist and they're different.
    // TS narrowing doesn't fully infer this across the if-chain — assert it.
    if (!oldCurrent) return

    // Decide which bbox to zoom into
    let bbox: Bbox | null = null
    if (lastNavBbox) {
      // Forward: clicked hotspot bbox (in oldCurrent's image coords)
      bbox = lastNavBbox
    } else {
      // Back navigation: bbox is the hotspot of newCurrent that points to oldCurrent
      const hp = newCurrent.hotspots?.find(
        (h) => h.childSceneId === oldCurrent.id,
      )
      if (hp) bbox = hp.bbox
    }

    if (bbox) {
      runInception(oldCurrent, newCurrent, bbox)
    } else {
      // Search/breadcrumb jump — simple synchronous crossfade, viewBox stays full
      runSimpleCrossfade(oldCurrent, newCurrent)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScene?.id])

  // ─── Inception transition: zoom + dissolvenza simultanea ─────────────────
  function runInception(oldS: Scene, newS: Scene, bbox: Bbox) {
    clearTransitionTimeouts()
    transitioningRef.current = true

    const ow = oldS.sceneSize?.width ?? 1270
    const oh = oldS.sceneSize?.height ?? 952
    const nw = newS.sceneSize?.width ?? 1270
    const nh = newS.sceneSize?.height ?? 952

    // Reset viewBox + opacities to old scene's full state
    vbX.set(0)
    vbY.set(0)
    vbW.set(ow)
    vbH.set(oh)
    outgoingOpacity.set(1)
    incomingOpacity.set(0)
    clipRadiusPx.set(99999)

    setOutgoingScene(oldS)
    setTransitioning(true)

    // ZOOM-IN (full duration) — the camera moves the entire time
    const zoomInOpts = { duration: ZOOM_IN_DURATION, ease: VIEWBOX_EASE }
    animate(vbX, bbox.x, zoomInOpts)
    animate(vbY, bbox.y, zoomInOpts)
    animate(vbW, bbox.w, zoomInOpts)
    animate(vbH, bbox.h, zoomInOpts)

    // CROSSFADE — starts AFTER a stretch of pure zoom-in (CROSSFADE_DELAY).
    // The old scene is alone on screen while the camera begins traveling.
    animate(outgoingOpacity, 0, {
      duration: CROSSFADE_DURATION,
      delay: CROSSFADE_DELAY,
      ease: OPACITY_EASE,
    })
    animate(incomingOpacity, 1, {
      duration: CROSSFADE_DURATION,
      delay: CROSSFADE_DELAY,
      ease: OPACITY_EASE,
    })

    // BLUR — the "censoring" filter. Ramps up as the camera approaches the
    // apex, plateaus across the swap, ramps down as the de-zoom proceeds.
    blurPx.set(0)
    animate(blurPx, [0, BLUR_MAX_PX, BLUR_MAX_PX, 0], {
      duration: ZOOM_IN_DURATION + ZOOM_OUT_DURATION,
      times: [0, 0.4, 0.72, 1],
      ease: 'easeInOut',
    })

    transitionTimeoutsRef.current.push(
      // Once the crossfade is done, drop the outgoing layer. The remaining
      // stretch of zoom-in shows only the new scene closing the distance.
      setTimeout(
        () => {
          setOutgoingScene(null)
        },
        (CROSSFADE_DELAY + CROSSFADE_DURATION) * 1000,
      ),

      // After the camera reaches the bbox, start the de-zoom (zoom-out).
      // By this point the dissolve has long been over.
      setTimeout(() => {
        const zoomOutOpts = { duration: ZOOM_OUT_DURATION, ease: VIEWBOX_EASE }
        animate(vbX, 0, zoomOutOpts)
        animate(vbY, 0, zoomOutOpts)
        animate(vbW, nw, zoomOutOpts)
        animate(vbH, nh, zoomOutOpts)
      }, ZOOM_IN_DURATION * 1000),

      // Settle: unlock interactions
      setTimeout(
        () => {
          setTransitioning(false)
          transitioningRef.current = false
          transitionTimeoutsRef.current = []
        },
        (ZOOM_IN_DURATION + ZOOM_OUT_DURATION) * 1000,
      ),
    )
  }

  // ─── Atlas → first scene: cinematic entry ────────────────────────────────
  // Two flavors:
  //   • origin (zone-thumbnail expansion): clip-path circle grows from the
  //     thumbnail position to cover the viewport. The atlas dims and blurs
  //     behind. True Gorogoa match-cut.
  //   • bbox fallback (search/breadcrumb jump to a leaf): viewBox starts
  //     zoomed on entryBbox and de-zooms to full, atlas dissolves into cream.
  function runEnterFromAtlas(
    newS: Scene,
    origin: Origin | null,
    entryBbox: Bbox | null,
  ) {
    clearTransitionTimeouts()
    transitioningRef.current = true

    const nw = newS.sceneSize?.width ?? 1270
    const nh = newS.sceneSize?.height ?? 952

    setOutgoingScene(null)
    setTransitioning(true)

    if (origin) {
      // ── Thumbnail-expansion mode ───────────────────────────────────────
      // The clip-path circle grows from the zone's thumbnail to envelop
      // the viewport. The viewBox stays at full scene the whole time —
      // the visual "zoom" comes entirely from the clip-path expansion.
      lastEntryOriginRef.current = origin
      const giantR = Math.hypot(window.innerWidth, window.innerHeight) * 1.4
      const expandDuration = ZOOM_IN_DURATION + ZOOM_OUT_DURATION

      vbX.set(0)
      vbY.set(0)
      vbW.set(nw)
      vbH.set(nh)
      outgoingOpacity.set(0)
      incomingOpacity.set(1)
      blurPx.set(0)
      baseOpacity.set(0)
      baseBlurPx.set(0)

      clipCx.set(origin.cx)
      clipCy.set(origin.cy)
      clipRadiusPx.set(origin.r)

      // Clip-path: thumbnail circle → giant circle.
      animate(clipRadiusPx, giantR, {
        duration: expandDuration,
        ease: VIEWBOX_EASE,
      })

      // Atlas overlay: cream fades in to a translucent veil (so the atlas
      // stays faintly visible behind the scene's letterbox). The backdrop
      // blur peaks at the apex of the expansion then settles.
      animate(baseBlurPx, [0, BLUR_MAX_PX, BLUR_MAX_PX, ATLAS_DIM_BLUR_PX], {
        duration: expandDuration,
        times: [0, 0.4, 0.75, 1],
        ease: 'easeInOut',
      })
      animate(baseOpacity, ATLAS_DIM_OPACITY, {
        duration: expandDuration * 0.85,
        ease: OPACITY_EASE,
      })

      transitionTimeoutsRef.current.push(
        setTimeout(
          () => {
            setTransitioning(false)
            transitioningRef.current = false
            baseOpacity.set(ATLAS_DIM_OPACITY)
            baseBlurPx.set(ATLAS_DIM_BLUR_PX)
            // Reset clip to "no clip" so subsequent transitions aren't masked.
            clipRadiusPx.set(99999)
            transitionTimeoutsRef.current = []
          },
          expandDuration * 1000,
        ),
      )
      return
    }

    // ── Bbox fallback (search/breadcrumb jump to a leaf) ─────────────────
    lastEntryOriginRef.current = null
    const bbox: Bbox = entryBbox ?? {
      x: nw * 0.4,
      y: nh * 0.4,
      w: nw * 0.2,
      h: nh * 0.2,
    }

    // viewBox starts zoomed on entryBbox
    vbX.set(bbox.x)
    vbY.set(bbox.y)
    vbW.set(bbox.w)
    vbH.set(bbox.h)
    outgoingOpacity.set(0)
    incomingOpacity.set(0)
    blurPx.set(BLUR_MAX_PX)
    baseOpacity.set(0)
    baseBlurPx.set(0)
    clipRadiusPx.set(99999)

    animate(baseBlurPx, [0, BLUR_MAX_PX, BLUR_MAX_PX, ATLAS_DIM_BLUR_PX], {
      duration: ZOOM_IN_DURATION + ZOOM_OUT_DURATION,
      times: [0, 0.4, 0.72, 1],
      ease: 'easeInOut',
    })
    animate(baseOpacity, ATLAS_DIM_OPACITY, {
      duration: CROSSFADE_DELAY + CROSSFADE_DURATION,
      ease: OPACITY_EASE,
    })
    animate(incomingOpacity, 1, {
      duration: CROSSFADE_DURATION,
      delay: CROSSFADE_DELAY,
      ease: OPACITY_EASE,
    })
    animate(blurPx, [BLUR_MAX_PX, BLUR_MAX_PX, 0], {
      duration: ZOOM_IN_DURATION + ZOOM_OUT_DURATION,
      times: [0, 0.72, 1],
      ease: 'easeInOut',
    })

    transitionTimeoutsRef.current.push(
      setTimeout(() => {
        const zoomOutOpts = { duration: ZOOM_OUT_DURATION, ease: VIEWBOX_EASE }
        animate(vbX, 0, zoomOutOpts)
        animate(vbY, 0, zoomOutOpts)
        animate(vbW, nw, zoomOutOpts)
        animate(vbH, nh, zoomOutOpts)
      }, ZOOM_IN_DURATION * 1000),

      setTimeout(
        () => {
          setTransitioning(false)
          transitioningRef.current = false
          baseOpacity.set(ATLAS_DIM_OPACITY)
          baseBlurPx.set(ATLAS_DIM_BLUR_PX)
          transitionTimeoutsRef.current = []
        },
        (ZOOM_IN_DURATION + ZOOM_OUT_DURATION) * 1000,
      ),
    )
  }

  // ─── Scene → atlas: cinematic exit ───────────────────────────────────────
  // Reverse of runEnterFromAtlas. If we have an origin (came in from a zone),
  // the clip-path collapses back toward the thumbnail. Otherwise: simple fade.
  // onComplete fires after the animation so the caller can clear the path.
  function runExitToAtlas(onComplete: () => void) {
    clearTransitionTimeouts()
    transitioningRef.current = true
    setTransitioning(true)

    const origin = lastEntryOriginRef.current

    if (origin) {
      const giantR = Math.hypot(window.innerWidth, window.innerHeight) * 1.4
      clipCx.set(origin.cx)
      clipCy.set(origin.cy)
      clipRadiusPx.set(giantR)

      animate(clipRadiusPx, origin.r, {
        duration: EXIT_DURATION,
        ease: VIEWBOX_EASE,
      })
      animate(baseOpacity, 0, {
        duration: EXIT_DURATION,
        ease: OPACITY_EASE,
      })
      animate(baseBlurPx, 0, {
        duration: EXIT_DURATION,
        ease: 'easeOut',
      })

      transitionTimeoutsRef.current.push(
        setTimeout(() => {
          // Reset everything so the next entry starts clean.
          clipRadiusPx.set(99999)
          incomingOpacity.set(1)
          baseOpacity.set(ATLAS_DIM_OPACITY)
          baseBlurPx.set(ATLAS_DIM_BLUR_PX)
          transitionTimeoutsRef.current = []
          // Hand back to caller — typically goToRoot().
          onComplete()
        }, EXIT_DURATION * 1000),
      )
      return
    }

    // No origin — simple fade out.
    animate(baseOpacity, 0, {
      duration: EXIT_FADE_DURATION,
      ease: OPACITY_EASE,
    })
    animate(baseBlurPx, 0, {
      duration: EXIT_FADE_DURATION,
      ease: 'easeOut',
    })
    animate(incomingOpacity, 0, {
      duration: EXIT_FADE_DURATION,
      ease: OPACITY_EASE,
    })

    transitionTimeoutsRef.current.push(
      setTimeout(() => {
        incomingOpacity.set(1)
        baseOpacity.set(ATLAS_DIM_OPACITY)
        baseBlurPx.set(ATLAS_DIM_BLUR_PX)
        transitionTimeoutsRef.current = []
        onComplete()
      }, EXIT_FADE_DURATION * 1000),
    )
  }

  // ─── Simple synchronous crossfade (no zoom) ──────────────────────────────
  function runSimpleCrossfade(prevS: Scene, newS: Scene) {
    clearTransitionTimeouts()
    transitioningRef.current = true

    const w = newS.sceneSize?.width ?? 1270
    const h = newS.sceneSize?.height ?? 952
    vbX.set(0)
    vbY.set(0)
    vbW.set(w)
    vbH.set(h)
    outgoingOpacity.set(1)
    incomingOpacity.set(0)
    clipRadiusPx.set(99999)

    setOutgoingScene(prevS)
    setTransitioning(true)

    animate(outgoingOpacity, 0, {
      duration: SIMPLE_FADE_DURATION,
      ease: OPACITY_EASE,
    })
    animate(incomingOpacity, 1, {
      duration: SIMPLE_FADE_DURATION,
      ease: OPACITY_EASE,
    })

    transitionTimeoutsRef.current.push(
      setTimeout(() => {
        setOutgoingScene(null)
        setTransitioning(false)
        transitioningRef.current = false
        transitionTimeoutsRef.current = []
      }, SIMPLE_FADE_DURATION * 1000),
    )
  }

  const handleHotspotClick = (childId: string, bbox: Bbox) => {
    // Ref-based guard: state lags by a render, ref is synchronous.
    if (transitioningRef.current) return
    transitioningRef.current = true
    navigateTo(childId, bbox)
    // Transition itself runs in useLayoutEffect after the path change.
  }

  // Jump to an arbitrary scene via its full path (used by marginalia and
  // related-section). Reuses runSimpleCrossfade because no bbox/origin
  // is available.
  const navigateRelation = (sceneId: string) => {
    if (transitioningRef.current) return
    setReading(false)
    const targetPath = pathFromScene(scenes, sceneId)
    if (targetPath.length === 0) return
    transitioningRef.current = true
    goToPath(targetPath)
  }

  // Esc: close reading → collapse card → back (only when idle)
  useEffect(() => {
    if (path.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (reading) {
        setReading(false)
      } else if (cardExpanded) {
        setCardExpanded(false)
      } else if (!transitioning) {
        back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [path.length, back, cardExpanded, reading, transitioning])

  return (
    <>
      {/* Cream veil over the atlas. Translucent at idle (ATLAS_DIM_OPACITY)
          so the atlas remains faintly visible behind the scene's letterbox
          gutters. Clicking anywhere on it (i.e. on the gutters not covered
          by the scene image) jumps back to the atlas root. */}
      {(outgoingScene || currentScene) && (
        <motion.div
          className="fixed inset-0 bg-cream cursor-zoom-out"
          style={{
            zIndex: 39,
            opacity: baseOpacity,
            backdropFilter: baseFilterStr,
            WebkitBackdropFilter: baseFilterStr,
          }}
          onClick={() => {
            if (transitioningRef.current) return
            runExitToAtlas(() => goToRoot())
          }}
          aria-label="Back to atlas"
        />
      )}

      {/* Outgoing scene — rendered only during a transition */}
      {outgoingScene && (
        <SceneRenderer
          key={`out-${outgoingScene.id}`}
          scene={outgoingScene}
          viewBoxStr={viewBoxStr}
          opacity={outgoingOpacity}
          filter={filterStr}
          zIndex={40}
          display={resolveDisplay(outgoingScene, sceneById)}
        />
      )}

      {/* Current scene — always rendered when there's a current path */}
      {currentScene && (
        <SceneRenderer
          key={`cur-${currentScene.id}`}
          scene={currentScene}
          viewBoxStr={viewBoxStr}
          opacity={transitioning ? incomingOpacity : 1}
          filter={transitioning ? filterStr : undefined}
          clipPath={transitioning ? clipPathStr : undefined}
          zIndex={41}
          hotspots={!transitioning ? currentScene.hotspots : undefined}
          onNavigate={!transitioning ? handleHotspotClick : undefined}
          display={currentDisplay}
        />
      )}

      {/* Marginalia — relations sit in the side gutters around the image */}
      {!transitioning && currentScene && !reading && (
        <MarginaliaLayer
          scene={currentScene}
          allScenes={scenes}
          onNavigate={navigateRelation}
        />
      )}

      {/* Bottom info card — only when idle, animates with AnimatePresence on scene change */}
      <AnimatePresence mode="wait">
        {!transitioning && currentScene && !reading && (
          <SceneInfoCard
            key={currentScene.id}
            scene={currentScene}
            sceneById={sceneById}
            isLeaf={isLeaf}
            expanded={cardExpanded}
            onToggleExpanded={() => setCardExpanded((e) => !e)}
            onOpenRead={() => setReading(true)}
            onNavigateChild={navigateRelation}
          />
        )}
      </AnimatePresence>

      {/* Reading mode — full-page editorial overlay */}
      <AnimatePresence>
        {currentScene && reading && (
          <ReadingMode
            scene={currentScene}
            allScenes={scenes}
            onClose={() => setReading(false)}
            onNavigateRelation={navigateRelation}
          />
        )}
      </AnimatePresence>
    </>
  )
}
