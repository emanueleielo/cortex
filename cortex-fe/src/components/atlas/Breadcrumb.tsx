import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSceneStore } from '@/stores/scenes'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export function Breadcrumb() {
  const path = useSceneStore((s) => s.currentPath)
  const scenes = useSceneStore((s) => s.scenes)
  const goToRoot = useSceneStore((s) => s.goToRoot)
  const goToPath = useSceneStore((s) => s.goToPath)

  const sceneById = useMemo(
    () => new Map(scenes.map((sc) => [sc.id, sc])),
    [scenes],
  )

  return (
    <AnimatePresence>
      {path.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.4, delay: 0.35, ease: EASE }}
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[55] bg-cream/90 backdrop-blur-md border border-ink/12 rounded-md shadow-md flex items-center gap-1.5 px-3 py-1.5 select-none max-w-[80vw] overflow-x-auto"
        >
          <button
            type="button"
            onClick={goToRoot}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/55 hover:text-ink/90 transition px-1"
          >
            Atlas
          </button>
          {path.map((id, i) => {
            const sc = sceneById.get(id)
            if (!sc) return null
            const isLast = i === path.length - 1
            return (
              <span key={id} className="flex items-center gap-1.5">
                <span className="text-ink/25" aria-hidden>
                  /
                </span>
                {isLast ? (
                  <span className="font-serif italic text-ink text-sm whitespace-nowrap">
                    {sc.title.split('/').pop() || sc.title}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => goToPath(path.slice(0, i + 1))}
                    className="font-serif italic text-ink/55 hover:text-ink/90 transition text-sm whitespace-nowrap"
                  >
                    {sc.title.split('/').pop() || sc.title}
                  </button>
                )}
              </span>
            )
          })}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
