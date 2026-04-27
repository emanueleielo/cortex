export interface Camera {
  /** Top-left X of the visible viewBox, in viewBox units (BASE_W=1600). 0 = no pan. */
  x: number
  /** Top-left Y of the visible viewBox, in viewBox units (BASE_H=900). */
  y: number
  /** 1 = default. >1 zoom in, <1 zoom out. */
  zoom: number
}

export interface ContainerSize {
  width: number
  height: number
}

export const BASE_W = 1600
export const BASE_H = 900
export const MIN_ZOOM = 0.4
export const MAX_ZOOM = 4

interface Viewport {
  vbW: number
  vbH: number
  scale: number
  offsetX: number
  offsetY: number
}

/**
 * Compute viewport metrics for the current camera against a container.
 * Uses `slice` (cover) semantics — same as the SVG `preserveAspectRatio="xMidYMid slice"`.
 */
function viewport(camera: Camera, container: ContainerSize): Viewport {
  const vbW = BASE_W / camera.zoom
  const vbH = BASE_H / camera.zoom
  const scale = Math.max(container.width / vbW, container.height / vbH)
  const offsetX = (container.width - vbW * scale) / 2
  const offsetY = (container.height - vbH * scale) / 2
  return { vbW, vbH, scale, offsetX, offsetY }
}

/**
 * Screen pixel → normalized world coords. Normalized space: 1.0 == BASE_W viewBox units.
 */
export function pixelToWorld(
  pixel: { x: number; y: number },
  container: ContainerSize,
  camera: Camera,
): { x: number; y: number } {
  const { scale, offsetX, offsetY } = viewport(camera, container)
  const vbX = (pixel.x - offsetX) / scale + camera.x
  const vbY = (pixel.y - offsetY) / scale + camera.y
  return { x: vbX / BASE_W, y: vbY / BASE_H }
}

/**
 * Normalized world coords → screen pixel.
 */
export function worldToPixel(
  world: { x: number; y: number },
  container: ContainerSize,
  camera: Camera,
): { x: number; y: number } {
  const { scale, offsetX, offsetY } = viewport(camera, container)
  return {
    x: (world.x * BASE_W - camera.x) * scale + offsetX,
    y: (world.y * BASE_H - camera.y) * scale + offsetY,
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Pan the camera by a pixel delta. Returns the next camera (does not mutate).
 */
export function computePan(
  deltaPx: { x: number; y: number },
  container: ContainerSize,
  camera: Camera,
): Camera {
  const { scale } = viewport(camera, container)
  return {
    ...camera,
    x: camera.x - deltaPx.x / scale,
    y: camera.y - deltaPx.y / scale,
  }
}

/**
 * Zoom by a factor anchored at a screen-pixel cursor position. Keeps the world point
 * under the cursor stationary while the rest of the world zooms.
 */
export function computeZoom(
  factor: number,
  cursorPx: { x: number; y: number },
  container: ContainerSize,
  camera: Camera,
): Camera {
  const newZoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  if (newZoom === camera.zoom) return camera

  const before = pixelToWorld(cursorPx, container, camera)

  const vbW_new = BASE_W / newZoom
  const vbH_new = BASE_H / newZoom
  const scale_new = Math.max(container.width / vbW_new, container.height / vbH_new)
  const offsetX_new = (container.width - vbW_new * scale_new) / 2
  const offsetY_new = (container.height - vbH_new * scale_new) / 2

  return {
    x: before.x * BASE_W - (cursorPx.x - offsetX_new) / scale_new,
    y: before.y * BASE_H - (cursorPx.y - offsetY_new) / scale_new,
    zoom: newZoom,
  }
}

/**
 * Compute a camera that frames all given zones in view with padding.
 */
export function computeFit(
  zones: Array<{ position: { x: number; y: number } }>,
  container: ContainerSize,
  options: { paddingNorm?: number; defaultCamera?: Camera } = {},
): Camera {
  const { paddingNorm = 0.18, defaultCamera = { x: 0, y: 0, zoom: 1 } } = options
  if (zones.length === 0) return defaultCamera

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const z of zones) {
    minX = Math.min(minX, z.position.x)
    maxX = Math.max(maxX, z.position.x)
    minY = Math.min(minY, z.position.y)
    maxY = Math.max(maxY, z.position.y)
  }

  const ZONE_RADIUS_NORM_X = 110 / BASE_W
  const ZONE_RADIUS_NORM_Y = 110 / BASE_H
  minX -= ZONE_RADIUS_NORM_X + paddingNorm
  maxX += ZONE_RADIUS_NORM_X + paddingNorm
  minY -= ZONE_RADIUS_NORM_Y + paddingNorm
  maxY += ZONE_RADIUS_NORM_Y + paddingNorm

  const bboxNormW = Math.max(0.001, maxX - minX)
  const bboxNormH = Math.max(0.001, maxY - minY)

  // slice cover scaling factor (matches preserveAspectRatio="xMidYMid slice")
  const k = Math.max(container.width / BASE_W, container.height / BASE_H)
  // Max zoom that lets the bbox fit horizontally / vertically in the visible area
  const zoomX = container.width / (k * BASE_W * bboxNormW)
  const zoomY = container.height / (k * BASE_H * bboxNormH)
  const targetZoom = clamp(Math.min(zoomX, zoomY), MIN_ZOOM, MAX_ZOOM)

  const centerVbX = ((minX + maxX) / 2) * BASE_W
  const centerVbY = ((minY + maxY) / 2) * BASE_H
  const visibleVbW = BASE_W / targetZoom
  const visibleVbH = BASE_H / targetZoom

  return {
    x: centerVbX - visibleVbW / 2,
    y: centerVbY - visibleVbH / 2,
    zoom: targetZoom,
  }
}
