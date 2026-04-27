const INK = '#1F1F1F'
const CREAM = '#FAF6ED'

/**
 * Iconic stylised building. Drawn in viewBox-local coords, centred on (0, 0)
 * so the caller can `<g transform="translate(cx cy)">` to place it.
 */
export function BuildingLandmark() {
  return (
    <g transform="translate(-30 -45)">
      {/* foundation */}
      <rect
        x="0"
        y="55"
        width="60"
        height="14"
        fill={CREAM}
        stroke={INK}
        strokeWidth="1"
      />
      <line x1="0" y1="60" x2="60" y2="60" stroke={INK} strokeWidth="0.4" />

      {/* main body */}
      <rect
        x="6"
        y="20"
        width="48"
        height="35"
        fill={CREAM}
        stroke={INK}
        strokeWidth="1.2"
      />

      {/* roof */}
      <path
        d="M 4 22 L 30 4 L 56 22 Z"
        fill={CREAM}
        stroke={INK}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <line x1="10" y1="14" x2="50" y2="14" stroke={INK} strokeWidth="0.4" />
      <line x1="14" y1="9" x2="46" y2="9" stroke={INK} strokeWidth="0.4" />

      {/* arched door */}
      <path
        d="M 24 55 L 24 38 Q 30 32 36 38 L 36 55"
        fill={INK}
        stroke={INK}
        strokeWidth="0.5"
        strokeLinejoin="round"
      />

      {/* windows (paned) */}
      <rect x="11" y="29" width="6" height="9" fill={INK} />
      <line x1="14" y1="29" x2="14" y2="38" stroke={CREAM} strokeWidth="0.5" />
      <line x1="11" y1="33.5" x2="17" y2="33.5" stroke={CREAM} strokeWidth="0.5" />
      <rect x="43" y="29" width="6" height="9" fill={INK} />
      <line x1="46" y1="29" x2="46" y2="38" stroke={CREAM} strokeWidth="0.5" />
      <line x1="43" y1="33.5" x2="49" y2="33.5" stroke={CREAM} strokeWidth="0.5" />

      {/* flag pole + flag on roof apex */}
      <line x1="30" y1="4" x2="30" y2="-10" stroke={INK} strokeWidth="0.7" />
      <path d="M 30 -10 L 38 -8 L 30 -6 Z" fill={INK} />
    </g>
  )
}
