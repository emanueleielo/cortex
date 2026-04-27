import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { type Scene } from '@/stores/scenes'
import { LiveImage } from '../LiveImage'
import { Markdown } from './Markdown'
import { RelatedSection } from './RelatedSection'
import { RichText } from './RichText'

const EASE: [number, number, number, number] = [0.65, 0, 0.35, 1]

interface Props {
  scene: Scene
  allScenes: Scene[]
  onClose: () => void
  onNavigateRelation: (sceneId: string) => void
}

function formatYear(ts: number) {
  return new Date(ts).getFullYear()
}

export function ReadingMode({
  scene,
  allScenes,
  onClose,
  onNavigateRelation,
}: Props) {
  const sceneById = useMemo(
    () => new Map(allScenes.map((s) => [s.id, s])),
    [allScenes],
  )
  return (
    <motion.div
      key={`reading-${scene.id}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="fixed inset-0 z-[60] bg-cream overflow-y-auto"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 px-8 py-4 bg-cream/92 backdrop-blur-md border-b border-ink/10">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/45 truncate">
          atlas
          <span className="mx-2 text-ink/25">/</span>
          <span className="italic font-serif text-ink/80 normal-case tracking-normal text-[14px]">
            {scene.title}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/55 hover:text-ink px-3 py-1.5 border border-ink/15 hover:border-ink/40 rounded-sm transition flex-shrink-0"
          aria-label="Close reading mode"
        >
          esc · close
        </button>
      </header>

      <article className="max-w-[760px] mx-auto px-6 pt-10 pb-24">
        <h1 className="font-serif italic text-ink text-[clamp(1.8rem,3vw,2.5rem)] leading-[1.15] tracking-tight">
          {scene.title}
        </h1>
        <div className="mt-3 flex items-center flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.22em] text-ink/45">
          <span>{formatYear(scene.createdAt)}</span>
          {scene.tags && scene.tags.length > 0 && (
            <>
              <span className="text-ink/20">·</span>
              <span>{scene.tags.slice(0, 6).join(' · ')}</span>
            </>
          )}
          {scene.people && scene.people.length > 0 && (
            <>
              <span className="text-ink/20">·</span>
              <span className="normal-case tracking-normal text-[11.5px] font-serif italic text-ink/55">
                with {scene.people.join(', ')}
              </span>
            </>
          )}
        </div>

        {scene.sceneAsset && (
          <motion.figure
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1, ease: EASE }}
            className="my-8"
          >
            <div className="rounded border border-ink/15 overflow-hidden shadow-[0_18px_44px_rgba(31,31,31,0.18),0_4px_10px_rgba(31,31,31,0.10)]">
              <LiveImage
                src={scene.sceneAsset}
                alt={scene.title}
                className="w-full h-auto block"
                wrapperClassName="w-full"
              />
            </div>
            {scene.description && (
              <figcaption className="mt-3 font-serif italic text-ink/55 text-[0.95rem] text-center">
                <RichText
                  text={scene.description}
                  sceneById={sceneById}
                  onNavigate={onNavigateRelation}
                />
              </figcaption>
            )}
          </motion.figure>
        )}

        {scene.text ? (
          <Markdown
            md={scene.text}
            sceneById={sceneById}
            onNavigate={onNavigateRelation}
          />
        ) : (
          <div className="mt-12 py-12 border-t border-b border-ink/10 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/40">
              no notes yet
            </span>
          </div>
        )}

        {/* Visualization #2 — full editorial Related section */}
        <RelatedSection
          scene={scene}
          allScenes={allScenes}
          onNavigate={onNavigateRelation}
        />
      </article>
    </motion.div>
  )
}
