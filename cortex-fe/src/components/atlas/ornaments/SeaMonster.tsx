interface Props {
  className?: string
}

const INK = '#1F1F1F'
const CREAM = '#FAF6ED'

export function SeaMonster({ className }: Props) {
  return (
    <svg
      viewBox="0 0 360 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* background waves */}
      <g stroke={INK} fill="none" strokeLinecap="round">
        <path
          d="M 0 168 Q 20 164 40 168 T 80 168 T 120 168 T 160 168 T 200 168 T 240 168 T 280 168 T 320 168 T 360 168"
          strokeWidth="0.7"
        />
        <path
          d="M 0 178 Q 24 174 48 178 T 96 178 T 144 178 T 192 178 T 240 178 T 288 178 T 336 178 T 360 178"
          strokeWidth="0.5"
        />
        <path
          d="M 0 188 Q 28 184 56 188 T 112 188 T 168 188 T 224 188 T 280 188 T 336 188 T 360 188"
          strokeWidth="0.4"
        />
      </g>

      {/* body humps — irregular widths, varying heights, asymmetric peaks */}
      <path
        d="M 0 158
           L 28 158
           Q 42 110 60 158
           Q 88 132 100 158
           Q 130 122 160 158
           Q 172 128 200 158
           Q 224 110 246 158"
        fill="none"
        stroke={INK}
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* dorsal fins — sized & placed per hump (peaks computed from Q control) */}
      <g fill={INK} stroke={INK} strokeWidth="0.5" strokeLinejoin="round">
        {/* hump 1: tall, narrow → tall fin */}
        <path d="M 40 134 L 43 119 L 46 134 Z" />
        {/* hump 2: short, wide, asymmetric right → small fin shifted right */}
        <path d="M 82 145 L 84 134 L 86 145 Z" />
        {/* hump 3: wide, medium → medium fin */}
        <path d="M 127 140 L 130 126 L 133 140 Z" />
        {/* hump 4: small, asymmetric left → small fin shifted left */}
        <path d="M 174 143 L 176 132 L 178 143 Z" />
        {/* hump 5: tall, wide → tall fin */}
        <path d="M 220 134 L 224 119 L 228 134 Z" />
      </g>

      {/* neck rising */}
      <path
        d="M 246 158 Q 268 138 282 116 Q 296 90 290 64 Q 282 42 296 36"
        fill="none"
        stroke={INK}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* neck inner thickness shadow */}
      <path
        d="M 250 158 Q 270 140 285 118 Q 298 92 293 66"
        fill="none"
        stroke={INK}
        strokeWidth="0.5"
      />

      {/* head — elongated dragon profile */}
      <path
        d="M 296 36
           Q 296 18 318 16
           Q 340 16 352 30
           Q 360 42 354 56
           Q 350 64 340 66
           Q 326 66 316 60
           Q 304 54 296 48 Z"
        fill={CREAM}
        stroke={INK}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />

      {/* mouth — slightly open, simple */}
      <path
        d="M 326 50 Q 340 48 354 50"
        fill="none"
        stroke={INK}
        strokeWidth="0.8"
      />
      <path
        d="M 328 56 Q 340 56 350 55"
        fill="none"
        stroke={INK}
        strokeWidth="0.6"
      />

      {/* eye */}
      <circle cx="322" cy="32" r="2.2" fill={INK} />
      <circle cx="322" cy="32" r="4.2" fill="none" stroke={INK} strokeWidth="0.5" />

      {/* brow ridge */}
      <path
        d="M 312 26 Q 322 22 334 28"
        fill="none"
        stroke={INK}
        strokeWidth="0.8"
      />

      {/* nostril */}
      <ellipse cx="348" cy="38" rx="1.3" ry="0.8" fill={INK} />

      {/* crown spikes — 3 evenly spaced */}
      <g fill="none" stroke={INK} strokeWidth="1" strokeLinejoin="round">
        <path d="M 304 14 L 308 2 L 312 14" />
        <path d="M 318 12 L 322 0 L 326 12" />
        <path d="M 332 14 L 336 2 L 340 14" />
      </g>

      {/* whisker tendrils — 2 from cheek/jaw */}
      <path
        d="M 296 52 Q 290 64 282 70"
        fill="none"
        stroke={INK}
        strokeWidth="0.7"
        strokeLinecap="round"
      />
      <path
        d="M 316 60 Q 312 74 308 84"
        fill="none"
        stroke={INK}
        strokeWidth="0.7"
        strokeLinecap="round"
      />

      {/* splash droplets near where the neck rises */}
      <g fill={INK} opacity="0.5">
        <circle cx="262" cy="142" r="0.9" />
        <circle cx="270" cy="128" r="1" />
        <circle cx="278" cy="138" r="0.8" />
      </g>
    </svg>
  )
}
