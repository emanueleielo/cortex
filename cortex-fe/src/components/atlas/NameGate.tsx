import { useState, type FormEvent } from 'react'
import { useUserStore } from '@/stores/user'

export function NameGate() {
  const setName = useUserStore((s) => s.setName)
  const [value, setValue] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    setName(trimmed)
  }

  return (
    <div className="fixed inset-0 grid place-items-center bg-cream">
      <form
        onSubmit={submit}
        className="w-[min(30rem,90vw)] flex flex-col items-center text-center px-8"
      >
        <h1 className="font-serif italic text-ink leading-tight text-[clamp(1.7rem,3.2vw,2.4rem)]">
          Welcome, traveler.
        </h1>

        <div className="mt-3 flex items-center gap-3 text-ink/45">
          <span className="h-px w-10 bg-ink/30" />
          <span className="font-serif italic tracking-[0.42em] text-[0.7rem]">
            MMXXVI
          </span>
          <span className="h-px w-10 bg-ink/30" />
        </div>

        <p className="mt-7 font-serif italic text-ink/65 leading-relaxed text-[clamp(0.9rem,1.15vw,1.05rem)]">
          Whose atlas is this?
        </p>

        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="your name"
          spellCheck={false}
          autoComplete="off"
          className="mt-5 w-full bg-transparent text-center font-serif italic text-ink placeholder:text-ink/25 text-[clamp(1.15rem,1.9vw,1.5rem)] border-b border-ink/30 focus:border-ink/70 outline-none py-2 transition-colors"
        />

        <button
          type="submit"
          disabled={!value.trim()}
          className="mt-9 px-7 py-2 font-serif italic text-ink/75 hover:text-ink border border-ink/25 hover:border-ink/55 rounded-sm tracking-[0.2em] text-xs uppercase disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          enter
        </button>
      </form>
    </div>
  )
}
