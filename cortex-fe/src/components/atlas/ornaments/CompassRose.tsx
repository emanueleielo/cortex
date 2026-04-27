interface Props {
  className?: string
}

const RAD = Math.PI / 180
const INK = '#1F1F1F'
const CREAM = '#FAF6ED'

const ticks32 = Array.from({ length: 32 }, (_, i) => i)
const microRots = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]

export function CompassRose({ className }: Props) {
  return (
    <svg
      viewBox="-30 -38 260 268"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* outer thin ring + main ring */}
      <circle cx="100" cy="100" r="100" fill="none" stroke={INK} strokeWidth="0.5" />
      <circle cx="100" cy="100" r="96" fill="none" stroke={INK} strokeWidth="1.4" />

      {/* outer degree ticks */}
      {ticks32.map((i) => {
        const angle = (i * 360) / 32 - 90
        const isMajor = i % 4 === 0
        const r1 = 88
        const r2 = isMajor ? 78 : 84
        const x1 = 100 + r1 * Math.cos(angle * RAD)
        const y1 = 100 + r1 * Math.sin(angle * RAD)
        const x2 = 100 + r2 * Math.cos(angle * RAD)
        const y2 = 100 + r2 * Math.sin(angle * RAD)
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={INK}
            strokeWidth={isMajor ? '0.9' : '0.4'}
          />
        )
      })}

      {/* middle dotted ring */}
      <circle
        cx="100"
        cy="100"
        r="72"
        fill="none"
        stroke={INK}
        strokeWidth="0.4"
        strokeDasharray="2 3"
      />

      {/* 8 micro spokes */}
      {microRots.map((rot) => (
        <g key={`micro-${rot}`} transform={`rotate(${rot} 100 100)`}>
          <line x1="100" y1="56" x2="100" y2="100" stroke={INK} strokeWidth="0.55" />
        </g>
      ))}

      {/* 4 minor (45° offset) points */}
      {[45, 135, 225, 315].map((rot) => (
        <g key={`minor-${rot}`} transform={`rotate(${rot} 100 100)`}>
          <polygon points="100,30 102,76 100,100" fill={INK} />
          <polygon
            points="100,30 98,76 100,100"
            fill={CREAM}
            stroke={INK}
            strokeWidth="0.5"
          />
        </g>
      ))}

      {/* 4 major (cardinal) points - half-filled */}
      {[0, 90, 180, 270].map((rot) => (
        <g key={`major-${rot}`} transform={`rotate(${rot} 100 100)`}>
          <polygon points="100,12 105,72 100,100" fill={INK} />
          <polygon
            points="100,12 95,72 100,100"
            fill={CREAM}
            stroke={INK}
            strokeWidth="0.7"
          />
          <polyline
            points="100,12 105,72 100,100"
            fill="none"
            stroke={INK}
            strokeWidth="0.7"
          />
        </g>
      ))}

      {/* inner concentric details */}
      <circle cx="100" cy="100" r="14" fill={CREAM} stroke={INK} strokeWidth="0.5" />
      <circle cx="100" cy="100" r="6" fill={CREAM} stroke={INK} strokeWidth="0.4" />
      <circle cx="100" cy="100" r="3" fill={INK} />

      {/* fleur-de-lis above the North point */}
      <g transform="translate(100 -22)" stroke={INK} strokeLinecap="round" strokeLinejoin="round">
        {/* top petal */}
        <path d="M 0 -10 Q -3 -3 0 0 Q 3 -3 0 -10 Z" fill={INK} />
        {/* central stem */}
        <line x1="0" y1="-3" x2="0" y2="14" strokeWidth="1.2" />
        {/* left curl */}
        <path d="M 0 4 Q -8 4 -8 11 Q -4 14 0 11" fill="none" strokeWidth="1.2" />
        {/* right curl */}
        <path d="M 0 4 Q 8 4 8 11 Q 4 14 0 11" fill="none" strokeWidth="1.2" />
        {/* cross band */}
        <line x1="-7" y1="8" x2="7" y2="8" strokeWidth="1.5" />
      </g>

      {/* E S W labels */}
      <g
        fontFamily="'EB Garamond', serif"
        fontStyle="italic"
        fontSize="14"
        fill={INK}
        textAnchor="middle"
      >
        <text x="218" y="105">E</text>
        <text x="100" y="222">S</text>
        <text x="-18" y="105">W</text>
      </g>
    </svg>
  )
}
