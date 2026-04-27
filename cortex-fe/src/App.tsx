import { useEffect } from 'react'
import { Atlas } from './components/atlas/Atlas'
import { NameGate } from './components/atlas/NameGate'
import { useSceneStore } from './stores/scenes'
import { useUserStore } from './stores/user'

export function App() {
  const hydrate = useSceneStore((s) => s.hydrate)
  const subscribeToStream = useSceneStore((s) => s.subscribeToStream)
  const syncFromUrl = useSceneStore((s) => s.syncFromUrl)
  const hydrated = useSceneStore((s) => s.hydrated)
  const name = useUserStore((s) => s.name)

  useEffect(() => {
    hydrate().then(() => syncFromUrl())
    const unsubscribe = subscribeToStream()
    const onPop = () => syncFromUrl()
    window.addEventListener('popstate', onPop)
    return () => {
      unsubscribe()
      window.removeEventListener('popstate', onPop)
    }
  }, [hydrate, subscribeToStream, syncFromUrl])

  if (!hydrated) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-cream text-ink/50 font-mono text-xs uppercase tracking-[0.22em]">
        loading atlas…
      </div>
    )
  }

  if (!name) {
    return <NameGate />
  }

  return <Atlas />
}
