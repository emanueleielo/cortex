import { useUserStore } from '@/stores/user'

interface Props {
  className?: string
}

const INK = '#1F1F1F'
const CREAM = '#FAF6ED'

export function Cartouche({ className }: Props) {
  const name = useUserStore((s) => s.name)

  return (
    <div className={`relative ${className ?? ''}`}>
      <svg
        viewBox="0 0 600 280"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {/* outer scroll-shaped cartouche silhouette */}
        <path
          d="M 80 50
             Q 60 50 50 70
             Q 42 90 50 110
             Q 38 125 50 140
             Q 38 155 50 170
             Q 42 190 50 210
             Q 60 230 80 230
             L 520 230
             Q 540 230 550 210
             Q 558 190 550 170
             Q 562 155 550 140
             Q 562 125 550 110
             Q 558 90 550 70
             Q 540 50 520 50 Z"
          fill={CREAM}
          stroke={INK}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />

        {/* double inner frame */}
        <rect
          x="74"
          y="68"
          width="452"
          height="144"
          rx="3"
          fill="none"
          stroke={INK}
          strokeWidth="0.5"
        />
        <rect
          x="80"
          y="74"
          width="440"
          height="132"
          rx="2"
          fill="none"
          stroke={INK}
          strokeWidth="0.3"
          opacity="0.55"
        />

        {/* top-centre flourish: 3 dots beneath an arc */}
        <g transform="translate(300 38)" stroke={INK}>
          <path d="M -22 6 Q 0 -10 22 6" fill="none" strokeWidth="0.7" />
          <circle cx="-15" cy="3" r="1.3" fill={INK} />
          <circle cx="0" cy="-2" r="1.5" fill={INK} />
          <circle cx="15" cy="3" r="1.3" fill={INK} />
        </g>

        {/* bottom-centre flourish: mirror */}
        <g transform="translate(300 242)" stroke={INK}>
          <path d="M -22 -6 Q 0 10 22 -6" fill="none" strokeWidth="0.7" />
          <circle cx="-15" cy="-3" r="1.3" fill={INK} />
          <circle cx="0" cy="2" r="1.5" fill={INK} />
          <circle cx="15" cy="-3" r="1.3" fill={INK} />
        </g>

        {/* left side: leafy vine flourish (no enclosed eye-shapes) */}
        <g transform="translate(30 140)" fill="none" stroke={INK} strokeLinecap="round">
          <path d="M 0 -28 Q -10 -15 -8 0 Q -10 15 0 28" strokeWidth="0.9" />
          <path d="M -8 -16 Q -18 -8 -16 0 Q -18 8 -8 16" strokeWidth="0.6" />
          {/* leaves */}
          <path d="M -8 -16 L -22 -22" strokeWidth="0.6" />
          <path d="M -16 0 L -32 0" strokeWidth="0.7" />
          <path d="M -8 16 L -22 22" strokeWidth="0.6" />
          <path d="M -22 -22 L -28 -27" strokeWidth="0.4" />
          <path d="M -22 22 L -28 27" strokeWidth="0.4" />
        </g>

        {/* right side: mirror */}
        <g transform="translate(570 140)" fill="none" stroke={INK} strokeLinecap="round">
          <path d="M 0 -28 Q 10 -15 8 0 Q 10 15 0 28" strokeWidth="0.9" />
          <path d="M 8 -16 Q 18 -8 16 0 Q 18 8 8 16" strokeWidth="0.6" />
          <path d="M 8 -16 L 22 -22" strokeWidth="0.6" />
          <path d="M 16 0 L 32 0" strokeWidth="0.7" />
          <path d="M 8 16 L 22 22" strokeWidth="0.6" />
          <path d="M 22 -22 L 28 -27" strokeWidth="0.4" />
          <path d="M 22 22 L 28 27" strokeWidth="0.4" />
        </g>

        {/* corner accents inside the frame */}
        <g stroke={INK} fill="none" strokeWidth="0.5" strokeLinecap="round">
          <path d="M 80 84 L 90 74 M 80 80 L 86 74" />
          <path d="M 520 84 L 510 74 M 520 80 L 514 74" />
          <path d="M 80 196 L 90 206 M 80 200 L 86 206" />
          <path d="M 520 196 L 510 206 M 520 200 L 514 206" />
        </g>
      </svg>

      {/* HTML overlay - semantic markup */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-16 text-center">
        <h1 className="font-serif italic font-medium text-ink leading-[1.05] tracking-wide text-[clamp(1.95rem,4.6vw,3rem)]">
          Atlas of {name}
        </h1>

        <div className="mt-3 flex items-center gap-3 text-ink/70">
          <span className="h-px w-12 bg-ink/35" />
          <span className="font-serif italic text-[clamp(0.85rem,1.4vw,1.05rem)]">
            Terra incognita.
          </span>
          <span className="h-px w-12 bg-ink/35" />
        </div>

        <p className="mt-2 font-serif text-ink/55 max-w-md leading-relaxed text-[clamp(0.78rem,1.15vw,0.95rem)]">
          Tell Cortex your first memory
          <br />
          to draw the first region.
        </p>
      </div>
    </div>
  )
}
