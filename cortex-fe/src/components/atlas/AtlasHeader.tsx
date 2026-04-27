import { useUserStore } from '@/stores/user'

export function AtlasHeader() {
  const name = useUserStore((s) => s.name)

  return (
    <div className="absolute inset-x-0 top-0 pointer-events-none flex flex-col items-center pt-[2.4vh]">
      <h1 className="font-serif italic text-ink leading-tight tracking-wide text-[clamp(1.3rem,2.4vw,1.95rem)]">
        Atlas of {name}
      </h1>
      <div className="mt-1 flex items-center gap-3 text-ink/45">
        <span className="h-px w-8 bg-ink/30" />
        <span className="font-serif italic tracking-[0.42em] text-[clamp(0.6rem,0.85vw,0.78rem)]">
          MMXXVI
        </span>
        <span className="h-px w-8 bg-ink/30" />
      </div>
    </div>
  )
}
