import { create } from 'zustand'
import {
  computeFit,
  computePan,
  computeZoom,
  type Camera,
  type ContainerSize,
} from '@/utils/camera'

interface CameraStore extends Camera {
  panBy: (deltaPx: { x: number; y: number }, container: ContainerSize) => void
  zoomBy: (
    factor: number,
    cursorPx: { x: number; y: number },
    container: ContainerSize,
  ) => void
  fitTo: (
    zones: Array<{ position: { x: number; y: number } }>,
    container: ContainerSize,
  ) => void
  reset: () => void
}

const DEFAULT: Camera = { x: 0, y: 0, zoom: 1 }

export const useCameraStore = create<CameraStore>((set, get) => ({
  ...DEFAULT,

  panBy: (deltaPx, container) => {
    const next = computePan(deltaPx, container, {
      x: get().x,
      y: get().y,
      zoom: get().zoom,
    })
    set(next)
  },

  zoomBy: (factor, cursorPx, container) => {
    const next = computeZoom(factor, cursorPx, container, {
      x: get().x,
      y: get().y,
      zoom: get().zoom,
    })
    set(next)
  },

  fitTo: (zones, container) => {
    const next = computeFit(zones, container, { defaultCamera: DEFAULT })
    set(next)
  },

  reset: () => set(DEFAULT),
}))
