interface Props {
  className?: string
}

const INK = '#1F1F1F'
const CREAM = '#FAF6ED'

const ticks = [0, 25, 50, 75, 100, 125, 150]

export function ScaleBar({ className }: Props) {
  const width = 280
  const step = width / (ticks.length - 1)

  return (
    <svg
      viewBox="0 0 320 80"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* caption above */}
      <text
        x="160"
        y="11"
        textAnchor="middle"
        fontFamily="'EB Garamond', serif"
        fontStyle="italic"
        fontSize="11"
        fill={INK}
      >
        Leucae Memoriae
      </text>

      {/* decorative scrolled end-caps */}
      <g fill="none" stroke={INK} strokeWidth="0.6" strokeLinecap="round">
        <path d="M 14 26 Q 8 32 8 38 Q 8 44 14 50" />
        <path d="M 306 26 Q 312 32 312 38 Q 312 44 306 50" />
      </g>

      <g transform="translate(20 28)">
        <rect width={width} height="16" fill={CREAM} stroke={INK} strokeWidth="0.8" />

        {/* top row alternating */}
        <rect x="0" y="0" width="40" height="8" fill={INK} />
        <rect x="80" y="0" width="40" height="8" fill={INK} />
        <rect x="160" y="0" width="40" height="8" fill={INK} />
        <rect x="240" y="0" width="40" height="8" fill={INK} />

        {/* bottom row alternating (offset = double-banded chequered) */}
        <rect x="40" y="8" width="40" height="8" fill={INK} />
        <rect x="120" y="8" width="40" height="8" fill={INK} />
        <rect x="200" y="8" width="40" height="8" fill={INK} />

        {/* middle separator */}
        <line x1="0" y1="8" x2={width} y2="8" stroke={INK} strokeWidth="0.5" />

        {/* tick marks */}
        {ticks.map((_, i) => (
          <line
            key={i}
            x1={i * step}
            x2={i * step}
            y1="-3"
            y2="19"
            stroke={INK}
            strokeWidth="0.5"
          />
        ))}

        {/* labels */}
        <g
          fontFamily="'EB Garamond', serif"
          fontStyle="italic"
          fontSize="9.5"
          fill={INK}
          textAnchor="middle"
        >
          {ticks.map((t, i) => (
            <text key={t} x={i * step} y="32">
              {t}
            </text>
          ))}
        </g>
      </g>

      {/* small ornamental flourish */}
      <g transform="translate(160 64)">
        <path d="M -16 0 Q 0 -6 16 0" fill="none" stroke={INK} strokeWidth="0.5" />
        <circle r="0.9" fill={INK} />
      </g>
    </svg>
  )
}
