import { create } from 'zustand'

interface LensStore {
  /** Active theme tag. Mutually exclusive with activePerson. */
  activeTag: string | null
  /** Active person filter. Mutually exclusive with activeTag. */
  activePerson: string | null

  setTag: (tag: string | null) => void
  toggleTag: (tag: string) => void

  setPerson: (person: string | null) => void
  togglePerson: (person: string) => void

  clear: () => void
}

export const useLensStore = create<LensStore>((set, get) => ({
  activeTag: null,
  activePerson: null,

  setTag: (tag) => set({ activeTag: tag, activePerson: null }),
  toggleTag: (tag) =>
    set({
      activeTag: get().activeTag === tag ? null : tag,
      activePerson: null,
    }),

  setPerson: (person) => set({ activePerson: person, activeTag: null }),
  togglePerson: (person) =>
    set({
      activePerson: get().activePerson === person ? null : person,
      activeTag: null,
    }),

  clear: () => set({ activeTag: null, activePerson: null }),
}))
