import { createContext, useContext, type ReactNode, type RefObject } from 'react'

interface AtlasContextValue {
  containerRef: RefObject<HTMLDivElement | null>
}

const AtlasContext = createContext<AtlasContextValue | null>(null)

export function AtlasProvider({
  children,
  containerRef,
}: {
  children: ReactNode
  containerRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <AtlasContext.Provider value={{ containerRef }}>
      {children}
    </AtlasContext.Provider>
  )
}

export function useAtlasContainer() {
  const ctx = useContext(AtlasContext)
  if (!ctx) {
    throw new Error('useAtlasContainer must be used within an AtlasProvider')
  }
  return ctx.containerRef
}
