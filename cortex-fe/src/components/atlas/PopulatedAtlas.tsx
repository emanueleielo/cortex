import { motion } from 'framer-motion'
import { Caravel } from './ornaments/Caravel'
import { CompassRose } from './ornaments/CompassRose'
import { Graticule } from './ornaments/Graticule'
import { RhumbLines } from './ornaments/RhumbLines'
import { ScaleBar } from './ornaments/ScaleBar'
import { SeaMonster } from './ornaments/SeaMonster'
import { AtlasHeader } from './AtlasHeader'
import { ConnectionsLayer } from './ConnectionsLayer'
import { ZonesLayer } from './ZonesLayer'

const EASE = [0.16, 1, 0.3, 1]

const fade = (delay: number, duration = 0.7) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration, ease: EASE, delay },
})

export function PopulatedAtlas() {
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
        transition={{ duration: 0.4, ease: 'easeOut' }}
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
      <motion.div className="absolute inset-0 pointer-events-none" {...fade(0.3)}>
        <RhumbLines className="absolute inset-0 w-full h-full" />
      </motion.div>
      <motion.div className="absolute inset-0 pointer-events-none" {...fade(0.4)}>
        <Graticule className="absolute inset-0 w-full h-full" />
      </motion.div>

      {/* connections (only when a lens is active) */}
      <motion.div className="absolute inset-0 pointer-events-none" {...fade(0.5)}>
        <ConnectionsLayer className="absolute inset-0 w-full h-full" />
      </motion.div>

      {/* zones (interactive — drag to reposition) */}
      <motion.div className="absolute inset-0" {...fade(0.6)}>
        <ZonesLayer className="absolute inset-0 w-full h-full" />
      </motion.div>

      {/* header */}
      <motion.div {...fade(0.5)}>
        <AtlasHeader />
      </motion.div>

      {/* compass */}
      <motion.div
        className="absolute top-[5%] right-[4%] w-32 lg:w-44 pointer-events-none"
        {...fade(0.7)}
      >
        <CompassRose className="w-full" />
      </motion.div>

      {/* caravel */}
      <motion.div
        className="absolute top-[7%] left-[4%] w-40 lg:w-56 pointer-events-none"
        {...fade(0.75)}
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
        {...fade(0.8)}
      >
        <SeaMonster className="w-full" />
      </motion.div>

      {/* scale bar */}
      <motion.div
        className="absolute bottom-[7%] left-[4%] w-64 lg:w-80 pointer-events-none"
        {...fade(0.85)}
      >
        <ScaleBar className="w-full" />
      </motion.div>
    </>
  )
}
