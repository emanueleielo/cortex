import { motion } from 'framer-motion'
import { Caravel } from './ornaments/Caravel'
import { Cartouche } from './ornaments/Cartouche'
import { CompassRose } from './ornaments/CompassRose'
import { Graticule } from './ornaments/Graticule'
import { InkBlots } from './ornaments/InkBlots'
import { Marginalia } from './ornaments/Marginalia'
import { RhumbLines } from './ornaments/RhumbLines'
import { ScaleBar } from './ornaments/ScaleBar'
import { SeaMonster } from './ornaments/SeaMonster'

const EASE = [0.16, 1, 0.3, 1]

const fade = (delay: number, duration = 0.85) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration, ease: EASE, delay },
})

export function EmptyState() {
  return (
    <>
      {/* parchment base */}
      <motion.img
        src="/textures/parchment-base.png"
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />

      {/* vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 38%, rgba(31,31,31,0.04) 78%, rgba(31,31,31,0.13) 100%)',
        }}
      />

      {/* atmosphere layers */}
      <motion.div className="absolute inset-0 pointer-events-none" {...fade(0.4)}>
        <RhumbLines className="absolute inset-0 w-full h-full" />
      </motion.div>
      <motion.div className="absolute inset-0 pointer-events-none" {...fade(0.55)}>
        <Graticule className="absolute inset-0 w-full h-full" />
      </motion.div>
      <motion.div className="absolute inset-0 pointer-events-none" {...fade(0.7)}>
        <InkBlots className="absolute inset-0 w-full h-full" />
      </motion.div>

      {/* top centre marginalia */}
      <motion.div {...fade(0.85)}>
        <Marginalia />
      </motion.div>

      {/* compass */}
      <motion.div
        className="absolute top-[5%] right-[4%] w-32 lg:w-44 pointer-events-none"
        {...fade(0.95)}
      >
        <CompassRose className="w-full" />
      </motion.div>

      {/* caravel */}
      <motion.div
        className="absolute top-[7%] left-[4%] w-40 lg:w-56 pointer-events-none"
        {...fade(1.05)}
      >
        <motion.div
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Caravel className="w-full" />
        </motion.div>
      </motion.div>

      {/* sea monster */}
      <motion.div
        className="absolute bottom-[6%] right-[3%] w-72 lg:w-[28rem] pointer-events-none"
        {...fade(1.15)}
      >
        <SeaMonster className="w-full" />
      </motion.div>

      {/* scale bar */}
      <motion.div
        className="absolute bottom-[7%] left-[4%] w-64 lg:w-80 pointer-events-none"
        {...fade(1.25)}
      >
        <ScaleBar className="w-full" />
      </motion.div>

      {/* central cartouche – absolutely centred */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-[min(64vw,720px)] max-w-[85vw]"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 1.2, ease: EASE, delay: 1.5 }}
      >
        <Cartouche />
      </motion.div>
    </>
  )
}
