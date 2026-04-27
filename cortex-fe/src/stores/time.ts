import { create } from 'zustand'

interface TimeStore {
  enabled: boolean
  start: number | null
  end: number | null
  toggle: () => void
  enable: () => void
  disable: () => void
  setRange: (start: number, end: number) => void
  resetRange: () => void
}

export const useTimeStore = create<TimeStore>((set) => ({
  enabled: false,
  start: null,
  end: null,
  toggle: () => set((s) => ({ enabled: !s.enabled })),
  enable: () => set({ enabled: true }),
  disable: () => set({ enabled: false }),
  setRange: (start, end) => set({ start, end }),
  resetRange: () => set({ start: null, end: null }),
}))
