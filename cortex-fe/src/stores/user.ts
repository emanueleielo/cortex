import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UserState {
  name: string
  setName: (name: string) => void
  clearName: () => void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      name: '',
      setName: (name) => set({ name: name.trim() }),
      clearName: () => set({ name: '' }),
    }),
    { name: 'cortex-user' },
  ),
)
