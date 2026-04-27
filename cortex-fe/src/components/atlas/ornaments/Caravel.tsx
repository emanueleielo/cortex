interface Props {
  className?: string
}

const INK = '#1F1F1F'
const CREAM = '#FAF6ED'

export function Caravel({ className }: Props) {
  return (
    <svg
      viewBox="0 0 220 156"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* waves under the hull */}
      <g stroke={INK} fill="none" strokeLinecap="round">
        <path
          d="M 0 134 Q 14 131 28 134 T 56 134 T 84 134 T 112 134 T 140 134 T 168 134 T 196 134 T 220 134"
          strokeWidth="0.6"
        />
        <path
          d="M 4 142 Q 22 138 40 142 T 78 142 T 116 142 T 154 142 T 192 142 T 220 142"
          strokeWidth="0.45"
        />
        <path
          d="M 0 150 Q 24 146 48 150 T 96 150 T 144 150 T 192 150 T 220 150"
          strokeWidth="0.35"
        />
      </g>

      {/* hull */}
      <path
        d="M 32 102 Q 110 119 188 102 L 178 122 Q 110 132 42 122 Z"
        fill={CREAM}
        stroke={INK}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M 38 108 Q 110 124 182 108" fill="none" stroke={INK} strokeWidth="0.4" />

      {/* portholes */}
      <g fill={INK}>
        <circle cx="62" cy="113" r="1.5" />
        <circle cx="86" cy="114" r="1.5" />
        <circle cx="110" cy="115" r="1.6" />
        <circle cx="134" cy="114" r="1.5" />
        <circle cx="158" cy="113" r="1.5" />
      </g>

      {/* bowsprit + jib */}
      <line x1="180" y1="103" x2="212" y2="92" stroke={INK} strokeWidth="0.9" />
      <path
        d="M 180 103 L 206 95 L 196 104 Z"
        fill={CREAM}
        stroke={INK}
        strokeWidth="0.6"
      />

      {/* mizzenmast (left) with lateen sail */}
      <line x1="56" y1="102" x2="56" y2="50" stroke={INK} strokeWidth="0.9" />
      <path d="M 56 60 L 88 60 L 56 92 Z" fill={CREAM} stroke={INK} strokeWidth="0.7" />
      <line x1="56" y1="60" x2="88" y2="60" stroke={INK} strokeWidth="0.7" />

      {/* mainmast (centre, tallest) */}
      <line x1="110" y1="102" x2="110" y2="14" stroke={INK} strokeWidth="1.1" />

      {/* crow's nest */}
      <ellipse cx="110" cy="34" rx="6" ry="2.5" fill={CREAM} stroke={INK} strokeWidth="0.7" />
      <line x1="106" y1="32" x2="106" y2="36" stroke={INK} strokeWidth="0.4" />
      <line x1="110" y1="32" x2="110" y2="36" stroke={INK} strokeWidth="0.4" />
      <line x1="114" y1="32" x2="114" y2="36" stroke={INK} strokeWidth="0.4" />

      {/* mainsail (billowed) */}
      <path
        d="M 78 46 Q 110 50 142 46 L 138 80 Q 110 84 82 80 Z"
        fill={CREAM}
        stroke={INK}
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <path d="M 80 62 Q 110 65 140 62" fill="none" stroke={INK} strokeWidth="0.4" />

      {/* topsail */}
      <path
        d="M 92 22 Q 110 24 128 22 L 126 30 Q 110 32 94 30 Z"
        fill={CREAM}
        stroke={INK}
        strokeWidth="0.6"
      />

      {/* mainmast pennant */}
      <path d="M 110 14 L 124 16 L 110 18 Z" fill={INK} />

      {/* foremast (right) */}
      <line x1="158" y1="102" x2="158" y2="22" stroke={INK} strokeWidth="0.9" />

      {/* foresail (billowed) */}
      <path
        d="M 132 50 Q 158 53 184 50 L 180 82 Q 158 86 136 82 Z"
        fill={CREAM}
        stroke={INK}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path d="M 134 65 Q 158 68 182 65" fill="none" stroke={INK} strokeWidth="0.4" />

      {/* foremast pennant */}
      <path d="M 158 22 L 170 24 L 158 26 Z" fill={INK} />

      {/* ratlines on mainmast (rope ladder shrouds) */}
      <g stroke={INK} fill="none">
        <line x1="110" y1="102" x2="92" y2="50" strokeWidth="0.3" />
        <line x1="110" y1="102" x2="128" y2="50" strokeWidth="0.3" />
        <line x1="93" y1="58" x2="127" y2="58" strokeWidth="0.25" />
        <line x1="95" y1="68" x2="125" y2="68" strokeWidth="0.25" />
        <line x1="98" y1="78" x2="122" y2="78" strokeWidth="0.25" />
        <line x1="100" y1="88" x2="120" y2="88" strokeWidth="0.25" />
      </g>

      {/* stern flagpole + flag */}
      <line x1="38" y1="102" x2="38" y2="86" stroke={INK} strokeWidth="0.7" />
      <path d="M 38 86 L 26 88 L 38 92 Z" fill={INK} />
    </svg>
  )
}
