interface Props {
  className?: string
}

const RAD = Math.PI / 180
const INK = '#1F1F1F'

const W = 1600
const H = 900
const REACH = 2400

const centers = [
  { cx: 1450, cy: 110 }, // top right – matches CompassRose location
  { cx: 200, cy: 800 }, // bottom left – matches ScaleBar area
]

const directions = Array.from({ length: 16 }, (_, i) => (i * 360) / 16)

export function RhumbLines({ className }: Props) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      {centers.flatMap((c, ci) =>
        directions.map((angle) => {
          const x2 = c.cx + REACH * Math.cos((angle - 90) * RAD)
          const y2 = c.cy + REACH * Math.sin((angle - 90) * RAD)
          const isCardinal = angle % 90 === 0
          return (
            <line
              key={`r-${ci}-${angle}`}
              x1={c.cx}
              y1={c.cy}
              x2={x2}
              y2={y2}
              stroke={INK}
              strokeWidth={isCardinal ? '0.5' : '0.35'}
              opacity={isCardinal ? '0.08' : '0.05'}
            />
          )
        }),
      )}
    </svg>
  )
}
