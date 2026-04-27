import { useEffect, useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTimeStore } from '@/stores/time'
import { useSceneStore } from '@/stores/scenes'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]
const DAY = 86_400_000

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function TimeSlider() {
  const enabled = useTimeStore((s) => s.enabled)
  const start = useTimeStore((s) => s.start)
  const end = useTimeStore((s) => s.end)
  const setRange = useTimeStore((s) => s.setRange)
  const disable = useTimeStore((s) => s.disable)
  const scenes = useSceneStore((s) => s.scenes)

  const trackRef = useRef<HTMLDivElement>(null)

  const bounds = useMemo(() => {
    if (scenes.length === 0) {
      const now = Date.now()
      return { min: now - DAY * 30, max: now }
    }
    const times = scenes.map((sc) => sc.createdAt)
    const min = Math.min(...times)
    const max = Math.max(...times)
    const padding = Math.max(DAY, (max - min) * 0.1)
    return { min: min - padding, max: max + padding }
  }, [scenes])

  // Initialize range when slider opens or bounds change with no range yet
  useEffect(() => {
    if (!enabled) return
    if (start === null || end === null) {
      setRange(bounds.min, bounds.max)
    }
  }, [enabled, bounds, start, end, setRange])

  const effectiveStart = start ?? bounds.min
  const effectiveEnd = end ?? bounds.max
  const span = bounds.max - bounds.min || 1
  const startPct = ((effectiveStart - bounds.min) / span) * 100
  const endPct = ((effectiveEnd - bounds.min) / span) * 100

  const beginDrag =
    (which: 'start' | 'end') => (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation()
      const thumb = e.currentTarget
      thumb.setPointerCapture(e.pointerId)

      const handleMove = (ev: PointerEvent) => {
        const rect = trackRef.current?.getBoundingClientRect()
        if (!rect) return
        const pct = Math.max(
          0,
          Math.min(1, (ev.clientX - rect.left) / rect.width),
        )
        const ts = bounds.min + span * pct
        if (which === 'start') {
          setRange(Math.min(ts, effectiveEnd), effectiveEnd)
        } else {
          setRange(effectiveStart, Math.max(ts, effectiveStart))
        }
      }

      const handleUp = () => {
        if (thumb.hasPointerCapture(e.pointerId)) {
          thumb.releasePointerCapture(e.pointerId)
        }
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleUp)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleUp)
    }

  return (
    <AnimatePresence>
      {enabled && (
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 36 }}
          transition={{ duration: 0.42, ease: EASE }}
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(72vw,760px)] bg-cream/95 backdrop-blur-md border border-ink/12 rounded-md shadow-xl px-6 pt-4 pb-5 select-none"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/45">
              {formatDate(effectiveStart)}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/55">
              Tempora&nbsp;Memoriae
            </span>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/45">
                {formatDate(effectiveEnd)}
              </span>
              <button
                type="button"
                onClick={disable}
                aria-label="Close time slider"
                className="text-ink/35 hover:text-ink/80 leading-none text-lg"
              >
                ×
              </button>
            </div>
          </div>

          <div ref={trackRef} className="relative h-1.5 bg-ink/15 rounded-full">
            <div
              className="absolute h-full bg-ink/60 rounded-full pointer-events-none"
              style={{ left: `${startPct}%`, right: `${100 - endPct}%` }}
            />
            <div
              role="slider"
              aria-label="Range start"
              tabIndex={0}
              onPointerDown={beginDrag('start')}
              className="absolute w-4 h-4 -top-[5px] bg-ink rounded-full cursor-ew-resize shadow-sm ring-2 ring-cream"
              style={{ left: `${startPct}%`, transform: 'translateX(-50%)' }}
            />
            <div
              role="slider"
              aria-label="Range end"
              tabIndex={0}
              onPointerDown={beginDrag('end')}
              className="absolute w-4 h-4 -top-[5px] bg-ink rounded-full cursor-ew-resize shadow-sm ring-2 ring-cream"
              style={{ left: `${endPct}%`, transform: 'translateX(-50%)' }}
            />
          </div>

          <div className="mt-3 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ink/35">
            <kbd className="border border-ink/15 rounded px-1 py-0.5">T</kbd>
            <span>toggle</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
