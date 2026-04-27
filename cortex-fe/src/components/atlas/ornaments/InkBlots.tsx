interface Props {
  className?: string
}

interface Region {
  fill: string
  blot: string
}

const REGIONES: Region[] = [
  {
    fill: '#C9A363',
    blot:
      'M 360 240 C 410 226, 470 238, 488 280 C 502 322, 478 360, 432 364 C 388 368, 342 350, 326 312 C 314 276, 326 250, 360 240 Z',
  },
  {
    fill: '#A8C4B0',
    blot:
      'M 1180 440 C 1232 430, 1284 452, 1292 494 C 1296 538, 1256 568, 1212 562 C 1170 556, 1140 532, 1144 498 C 1148 470, 1160 446, 1180 440 Z',
  },
  {
    fill: '#B8CAD6',
    blot:
      'M 600 670 C 650 658, 706 678, 716 712 C 722 748, 690 776, 644 768 C 608 762, 580 740, 580 712 C 580 690, 588 678, 600 670 Z',
  },
]

export function InkBlots({ className }: Props) {
  return (
    <svg
      viewBox="0 0 1600 900"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
    >
      {REGIONES.map((r, i) => (
        <g key={i}>
          {/* filled blot */}
          <path d={r.blot} fill={r.fill} opacity="0.14" />
          {/* dotted boundary suggesting future zone outline */}
          <path
            d={r.blot}
            fill="none"
            stroke={r.fill}
            strokeWidth="0.9"
            strokeDasharray="3 4"
            opacity="0.55"
          />
        </g>
      ))}
    </svg>
  )
}
