import { AnimatePresence, motion } from 'framer-motion'

interface Props {
  src: string | undefined
  alt?: string
  /** Tailwind classes applied to each <img> layer. */
  className?: string
  /** Tailwind classes for the wrapper that holds the stacked layers. */
  wrapperClassName?: string
  /** Crossfade duration in seconds. */
  duration?: number
}

const EASE: [number, number, number, number] = [0.65, 0, 0.35, 1]

/** An <img> that crossfades the previous PNG under the new one when `src`
 *  changes. The first mount is instant; only subsequent src changes animate.
 *  Used to make backend-driven asset regeneration (cortex image gen, remote
 *  pull) feel like the rest of the atlas — a smooth swap, not a hard flip.
 *
 *  All layers stack in a single CSS grid cell so old/new naturally overlap
 *  during the transition. The wrapper sizes itself; pass dimensions or the
 *  caller's flex/grid layout via `wrapperClassName`. */
export function LiveImage({
  src,
  alt = '',
  duration = 0.55,
  className,
  wrapperClassName,
}: Props) {
  return (
    <div
      className={wrapperClassName}
      style={{ display: 'grid', gridTemplate: '"img" / 1fr' }}
    >
      <AnimatePresence initial={false}>
        {src && (
          <motion.img
            key={src}
            src={src}
            alt={alt}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration, ease: EASE }}
            style={{ gridArea: 'img' }}
            className={className}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
