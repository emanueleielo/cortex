interface Props {
  className?: string
}

const INK = '#1F1F1F'

const W = 1600
const H = 900

const verticalGuides = [200, 400, 600, 800, 1000, 1200, 1400]
const horizontalGuides = [150, 300, 450, 600, 750]

const xTicks = Array.from({ length: 33 }, (_, i) => i * 50)
const yTicks = Array.from({ length: 19 }, (_, i) => i * 50)

export function Graticule({ className }: Props) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      {/* ghost grid (very faint horizontals/verticals) */}
      <g stroke={INK} strokeWidth="0.4" opacity="0.05">
        {verticalGuides.map((x) => (
          <line key={`v-${x}`} x1={x} y1="0" x2={x} y2={H} />
        ))}
        {horizontalGuides.map((y) => (
          <line key={`h-${y}`} x1="0" y1={y} x2={W} y2={y} />
        ))}
      </g>

      {/* edge tick marks */}
      <g stroke={INK} strokeWidth="0.6" opacity="0.42">
        {xTicks.map((x) => (
          <line key={`tt-${x}`} x1={x} y1="0" x2={x} y2={x % 200 === 0 ? 12 : 6} />
        ))}
        {xTicks.map((x) => (
          <line
            key={`tb-${x}`}
            x1={x}
            y1={H}
            x2={x}
            y2={x % 200 === 0 ? H - 12 : H - 6}
          />
        ))}
        {yTicks.map((y) => (
          <line key={`tl-${y}`} x1="0" y1={y} x2={y % 200 === 0 ? 12 : 6} y2={y} />
        ))}
        {yTicks.map((y) => (
          <line
            key={`tr-${y}`}
            x1={W}
            y1={y}
            x2={y % 200 === 0 ? W - 12 : W - 6}
            y2={y}
          />
        ))}
      </g>

      {/* outer subtle border */}
      <rect
        x="0.5"
        y="0.5"
        width={W - 1}
        height={H - 1}
        fill="none"
        stroke={INK}
        strokeWidth="0.4"
        opacity="0.18"
      />
    </svg>
  )
}
