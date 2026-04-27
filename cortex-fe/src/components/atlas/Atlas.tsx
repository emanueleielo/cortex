import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useCameraStore } from '@/stores/camera'
import { useSceneStore } from '@/stores/scenes'
import { useTimeStore } from '@/stores/time'
import { AtlasProvider } from './AtlasContext'
import { Breadcrumb } from './Breadcrumb'
import { ControlPanel } from './ControlPanel'
import { EmptyState } from './EmptyState'
import { PopulatedAtlas } from './PopulatedAtlas'
import { SceneView } from './SceneView'
import { SearchOverlay } from './SearchOverlay'
import { TimeSlider } from './TimeSlider'

export function Atlas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const hasZones = useSceneStore((s) =>
    s.scenes.some((sc) => sc.parentId === null),
  )
  const inSceneDepth = useSceneStore((s) => s.currentPath.length)
  const isInScene = inSceneDepth > 0
  const [searchOpen, setSearchOpen] = useState(false)

  const panBy = useCameraStore((s) => s.panBy)
  const zoomBy = useCameraStore((s) => s.zoomBy)
  const fitTo = useCameraStore((s) => s.fitTo)
  const resetCamera = useCameraStore((s) => s.reset)

  const [panning, setPanning] = useState(false)
  const panStateRef = useRef<{
    pointerId: number
    lastX: number
    lastY: number
  } | null>(null)

  const isInteractionLocked = () => useSceneStore.getState().currentPath.length > 0

  // ─── Pan handlers ──────
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (isInteractionLocked()) return
    const target = e.target as HTMLElement | null
    if (
      target &&
      target.closest?.('button, a, input, textarea, select, [role="button"]')
    ) {
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    panStateRef.current = {
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
    }
    setPanning(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = panStateRef.current
    if (!state || state.pointerId !== e.pointerId) return
    const el = containerRef.current
    if (!el) return
    const dx = e.clientX - state.lastX
    const dy = e.clientY - state.lastY
    state.lastX = e.clientX
    state.lastY = e.clientY
    const rect = el.getBoundingClientRect()
    panBy({ x: dx, y: dy }, { width: rect.width, height: rect.height })
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = panStateRef.current
    if (!state || state.pointerId !== e.pointerId) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    panStateRef.current = null
    setPanning(false)
  }

  // ─── Auto-fit on first hydrate ──────
  // After scenes load, frame the populated zones once so the user doesn't
  // open onto an empty parchment (the default camera is centred and zoomed
  // for an empty atlas). Subsequent SSE pushes / pans / drags don't re-fit
  // — once the user has moved the camera, leave it alone.
  const autoFittedRef = useRef(false)
  useLayoutEffect(() => {
    if (autoFittedRef.current) return
    if (!hasZones) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const rootScenes = useSceneStore
      .getState()
      .scenes.filter((sc) => sc.parentId === null && sc.position) as Array<{
      position: { x: number; y: number }
    }>
    if (rootScenes.length === 0) return
    fitTo(rootScenes, { width: rect.width, height: rect.height })
    autoFittedRef.current = true
  }, [hasZones, fitTo])

  // ─── Wheel zoom ──────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (isInteractionLocked()) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.0015)
      zoomBy(
        factor,
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        { width: rect.width, height: rect.height },
      )
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomBy])

  // ─── Hotkeys ──────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setSearchOpen((open) => !open)
        return
      }
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }
      if (isInteractionLocked()) return
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        const rootScenes = useSceneStore
          .getState()
          .scenes.filter((sc) => sc.parentId === null && sc.position) as Array<{
          position: { x: number; y: number }
        }>
        fitTo(rootScenes, { width: rect.width, height: rect.height })
      } else if (e.key === '0') {
        e.preventDefault()
        resetCamera()
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        useTimeStore.getState().toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTo, resetCamera])

  return (
    <AtlasProvider containerRef={containerRef}>
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative w-screen h-screen overflow-hidden bg-cream touch-none ${panning ? 'cursor-grabbing' : ''}`}
      >
        {hasZones ? <PopulatedAtlas /> : <EmptyState />}

        {!isInScene && (
          <ControlPanel
            onSearch={() => setSearchOpen(true)}
            onFit={() => {
              const el = containerRef.current
              if (!el) return
              const rect = el.getBoundingClientRect()
              const rootScenes = useSceneStore
                .getState()
                .scenes.filter(
                  (sc) => sc.parentId === null && sc.position,
                ) as Array<{ position: { x: number; y: number } }>
              fitTo(rootScenes, { width: rect.width, height: rect.height })
            }}
            onResetView={() => resetCamera()}
          />
        )}

        <SceneView />
        <Breadcrumb />
        <TimeSlider />
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </AtlasProvider>
  )
}
