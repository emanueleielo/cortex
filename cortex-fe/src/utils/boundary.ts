function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h = h & h
  }
  return h
}

interface BoundaryOptions {
  cx: number
  cy: number
  radius: number
  points?: number
  jitter?: number
  seed: string
}

/**
 * Generate an organic, irregular closed boundary path (SVG `d` string).
 * Uses Catmull-Rom → cubic-bezier conversion to smooth control points.
 * Stable for the same seed.
 */
export function generateBoundary({
  cx,
  cy,
  radius,
  points = 14,
  jitter = 0.32,
  seed,
}: BoundaryOptions): string {
  const rng = mulberry32(hashSeed(seed))
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2
    const r = radius * (1 - jitter + rng() * jitter * 2)
    pts.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    })
  }

  const parts: string[] = []
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % pts.length]
    const p3 = pts[(i + 2) % pts.length]
    if (i === 0) parts.push(`M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`)
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    parts.push(
      `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    )
  }
  parts.push('Z')
  return parts.join(' ')
}
