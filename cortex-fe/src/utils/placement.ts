interface Pos {
  x: number // 0..1
  y: number // 0..1
}

interface Anchor {
  position: Pos
}

interface AdjustOptions {
  clicked: Pos
  existing: Anchor[]
  /** Boundary radius in viewBox units. Default matches Zone.tsx. */
  radius?: number
  /** Padding multiplier on the centre-to-centre distance. */
  padding?: number
  viewBoxW?: number
  viewBoxH?: number
}

/**
 * Iteratively pushes the clicked position away from existing anchors until it no
 * longer overlaps any of them, then clamps to the viewport with a margin for the
 * label below. Existing anchors are immutable — only the new position moves.
 */
export function adjustPlacement({
  clicked,
  existing,
  radius = 110,
  padding = 1.35,
  viewBoxW = 1600,
  viewBoxH = 900,
}: AdjustOptions): Pos {
  let px = clicked.x * viewBoxW
  let py = clicked.y * viewBoxH
  const minDist = radius * 2 * padding

  for (let attempt = 0; attempt < 40; attempt++) {
    let overlapped = false
    for (const z of existing) {
      const ex = z.position.x * viewBoxW
      const ey = z.position.y * viewBoxH
      const dx = px - ex
      const dy = py - ey
      const dist = Math.hypot(dx, dy) || 0.0001
      if (dist < minDist) {
        const push = (minDist - dist) * 1.1
        px += (dx / dist) * push
        py += (dy / dist) * push
        overlapped = true
      }
    }
    if (!overlapped) break
  }

  // World is unbounded: no clamp. The user can pan the atlas to find the zone.
  return { x: px / viewBoxW, y: py / viewBoxH }
}
