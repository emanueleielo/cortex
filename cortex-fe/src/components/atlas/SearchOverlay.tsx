import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { pathFromScene, useSceneStore } from '@/stores/scenes'
import { buildSearchIndex, type SearchEntry } from '@/utils/searchIndex'

interface Props {
  open: boolean
  onClose: () => void
}

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export function SearchOverlay({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const scenes = useSceneStore((s) => s.scenes)
  const goToPath = useSceneStore((s) => s.goToPath)

  const fuse = useMemo(() => buildSearchIndex(scenes), [scenes])

  const results = useMemo(() => {
    if (!query.trim()) return []
    return fuse.search(query, { limit: 10 })
  }, [fuse, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  useEffect(() => setActiveIndex(0), [query])

  const handleSelect = (entry: SearchEntry) => {
    const path = pathFromScene(scenes, entry.sceneId)
    goToPath(path.length > 1 ? path : entry.isRoot ? [entry.sceneId] : path)
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        const r = results[activeIndex]
        if (r) {
          e.preventDefault()
          handleSelect(r.item)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, activeIndex])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] bg-ink/30 backdrop-blur-sm"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="fixed top-[16vh] left-1/2 -translate-x-1/2 z-[61] w-[600px] max-w-[92vw] bg-cream border border-ink/15 rounded-md shadow-2xl overflow-hidden"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center px-5 py-4 border-b border-ink/10">
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="#1F1F1F"
                strokeWidth="1.4"
                className="opacity-50 mr-3 flex-shrink-0"
                aria-hidden
              >
                <circle cx="8" cy="8" r="5" />
                <line
                  x1="11.6"
                  y1="11.6"
                  x2="15.6"
                  y2="15.6"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="text"
                autoFocus
                placeholder="Search scenes, hotspots, people, tags…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none font-serif italic text-ink text-lg placeholder:text-ink/30"
              />
              <kbd className="ml-3 font-mono text-[10px] uppercase tracking-wider text-ink/40 border border-ink/15 rounded px-1.5 py-0.5">
                esc
              </kbd>
            </div>

            {results.length > 0 ? (
              <ul className="max-h-[52vh] overflow-y-auto py-1">
                {results.map((res, i) => {
                  const entry = res.item
                  const isActive = i === activeIndex
                  return (
                    <li key={entry.sceneId}>
                      <button
                        type="button"
                        onClick={() => handleSelect(entry)}
                        onMouseEnter={() => setActiveIndex(i)}
                        className={`w-full flex items-start gap-3 px-5 py-3 text-left transition-colors ${
                          isActive ? 'bg-ink/5' : ''
                        }`}
                      >
                        <span
                          className="w-1 h-9 rounded-sm flex-shrink-0 mt-1"
                          style={{ backgroundColor: entry.color }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/40">
                              {entry.isRoot ? 'region' : 'scene'}
                            </span>
                            {entry.parentTitle && (
                              <>
                                <span className="text-ink/20">·</span>
                                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/40 truncate">
                                  in {entry.parentTitle}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="font-serif italic text-ink text-base leading-tight">
                            {entry.title}
                          </div>
                          {entry.description && (
                            <div className="mt-0.5 font-serif text-ink/55 text-sm truncate">
                              {entry.description}
                            </div>
                          )}
                        </div>
                        <kbd
                          className={`font-mono text-[10px] uppercase tracking-wider flex-shrink-0 mt-2 transition-opacity ${
                            isActive ? 'opacity-50 text-ink/60' : 'opacity-0'
                          }`}
                        >
                          ↵
                        </kbd>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : query.trim() ? (
              <div className="px-5 py-10 text-center font-serif italic text-ink/45 text-sm">
                Nothing found for &ldquo;{query}&rdquo;
              </div>
            ) : (
              <div className="px-5 py-10 text-center font-serif italic text-ink/35 text-sm">
                Type to search across the whole atlas tree.
              </div>
            )}

            <div className="px-5 py-2 border-t border-ink/10 flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-ink/35">
              <kbd className="border border-ink/15 rounded px-1 py-0.5">↑↓</kbd>
              <span>navigate</span>
              <kbd className="border border-ink/15 rounded px-1 py-0.5">↵</kbd>
              <span>open</span>
              <span className="ml-auto">
                {results.length} result{results.length === 1 ? '' : 's'}
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
