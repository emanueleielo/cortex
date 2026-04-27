import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLensStore } from '@/stores/lens'
import { useTimeStore } from '@/stores/time'
import { useSceneStore } from '@/stores/scenes'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

interface Props {
  onSearch: () => void
  onFit: () => void
  onResetView: () => void
}

// ─── tiny inline icons ────────────────────────────────────────────────────

function Icon({ d, size = 14, sw = 1.4 }: { d: React.ReactNode; size?: number; sw?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      aria-hidden
    >
      {d}
    </svg>
  )
}

const SearchIcon = () => <Icon d={<><circle cx="6" cy="6" r="3.6" /><line x1="8.6" y1="8.6" x2="11.6" y2="11.6" /></>} />
const ClockIcon = () => <Icon d={<><circle cx="7" cy="7" r="4.7" /><line x1="7" y1="4.2" x2="7" y2="7" /><line x1="7" y1="7" x2="9.2" y2="8.4" /></>} />
const FitIcon = () => <Icon d={<><path d="M 2.5 5 V 2.5 H 5" /><path d="M 9 2.5 H 11.5 V 5" /><path d="M 11.5 9 V 11.5 H 9" /><path d="M 5 11.5 H 2.5 V 9" /></>} />
const ResetIcon = () => <Icon d={<><path d="M 11.5 7 A 4.5 4.5 0 1 1 7 2.5" /><path d="M 8.5 1.2 L 11.5 2.5 L 10.2 5.4" /></>} />
const LensIcon = () => <Icon d={<><path d="M 1.5 4.5 L 7 1 L 12.5 4.5 L 7 13 Z" /><line x1="4.4" y1="4.5" x2="9.6" y2="4.5" /></>} sw={1.3} />
const ChevronIcon = () => <Icon d={<path d="M 3 5 L 7 9 L 11 5" />} sw={1.4} size={10} />

// ─── tool button ──────────────────────────────────────────────────────────

interface ToolBtnProps {
  icon: React.ReactNode
  label: string
  kbd?: string
  onClick: () => void
  active?: boolean
  primary?: boolean
}

function ToolButton({ icon, label, kbd, onClick, active, primary }: ToolBtnProps) {
  const base =
    'group flex items-center gap-2 px-3 py-2 transition relative font-mono text-[10px] uppercase tracking-[0.18em]'
  const colors = primary
    ? 'bg-ink text-cream hover:bg-ink-soft'
    : active
      ? 'bg-ink text-cream'
      : 'text-ink/65 hover:text-ink hover:bg-ink/[0.04]'
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={`${base} ${colors}`}
      aria-pressed={active ? true : undefined}
    >
      <span className={primary || active ? 'text-cream' : 'text-ink/70'}>
        {icon}
      </span>
      <span>{label}</span>
      {kbd && (
        <kbd
          className={`ml-1 border rounded px-1 py-px text-[9px] tracking-wider ${
            primary || active
              ? 'border-cream/30 text-cream/70'
              : 'border-ink/15 text-ink/40'
          }`}
        >
          {kbd}
        </kbd>
      )}
    </button>
  )
}

// ─── lens popover ─────────────────────────────────────────────────────────

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={`px-2.5 py-1 font-serif italic text-xs rounded-sm border transition ${
        active
          ? 'bg-ink text-cream border-ink'
          : 'bg-cream text-ink/70 border-ink/15 hover:border-ink/45 hover:text-ink/95'
      }`}
    >
      {children}
    </button>
  )
}

function LensPopover({ onClose }: { onClose: () => void }) {
  const scenes = useSceneStore((s) => s.scenes)
  const activeTag = useLensStore((s) => s.activeTag)
  const activePerson = useLensStore((s) => s.activePerson)
  const toggleTag = useLensStore((s) => s.toggleTag)
  const togglePerson = useLensStore((s) => s.togglePerson)
  const clear = useLensStore((s) => s.clear)

  const { tags, people } = useMemo(() => {
    const tagSet = new Set<string>()
    const personSet = new Set<string>()
    for (const sc of scenes) {
      for (const t of sc.tags ?? []) tagSet.add(t)
      for (const p of sc.people ?? []) personSet.add(p)
    }
    return {
      tags: Array.from(tagSet).sort(),
      people: Array.from(personSet).sort(),
    }
  }, [scenes])

  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
  }, [onClose])

  const hasActive = activeTag !== null || activePerson !== null

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.18, ease: EASE }}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute bottom-full right-0 mb-2 w-[340px] bg-cream border border-ink/15 rounded-md shadow-xl p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/45">
          Theme
        </span>
        {hasActive && (
          <button
            type="button"
            onClick={clear}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/40 hover:text-ink/80"
          >
            × clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {tags.map((t) => (
          <Chip
            key={`tag-${t}`}
            active={activeTag === t}
            onClick={() => toggleTag(t)}
          >
            {t}
          </Chip>
        ))}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/45 mb-2">
        Person
      </div>
      <div className="flex flex-wrap gap-1.5">
        {people.map((p) => (
          <Chip
            key={`person-${p}`}
            active={activePerson === p}
            onClick={() => togglePerson(p)}
          >
            {p}
          </Chip>
        ))}
      </div>
    </motion.div>
  )
}

// ─── main ────────────────────────────────────────────────────────────────

export function ControlPanel({ onSearch, onFit, onResetView }: Props) {
  const timeEnabled = useTimeStore((s) => s.enabled)
  const toggleTime = useTimeStore((s) => s.toggle)
  const activeTag = useLensStore((s) => s.activeTag)
  const activePerson = useLensStore((s) => s.activePerson)
  const lensActive = activeTag !== null || activePerson !== null
  const lensLabel = activeTag ?? activePerson ?? 'lens'

  const [lensOpen, setLensOpen] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 1.6, ease: EASE }}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 bg-cream/95 backdrop-blur-md border border-ink/15 rounded-md shadow-md flex items-stretch divide-x divide-ink/10 select-none"
    >
      <ToolButton
        icon={<SearchIcon />}
        label="search"
        kbd="⌘K"
        onClick={onSearch}
      />

      <ToolButton
        icon={<ClockIcon />}
        label="time"
        kbd="T"
        onClick={toggleTime}
        active={timeEnabled}
      />

      <ToolButton
        icon={<FitIcon />}
        label="fit"
        kbd="F"
        onClick={onFit}
      />

      <ToolButton
        icon={<ResetIcon />}
        label="view"
        kbd="0"
        onClick={onResetView}
      />

      <div className="relative">
        <ToolButton
          icon={<LensIcon />}
          label={lensActive ? lensLabel : 'lens'}
          onClick={() => setLensOpen((o) => !o)}
          active={lensActive}
        />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink/40 pointer-events-none">
          <ChevronIcon />
        </span>

        <AnimatePresence>
          {lensOpen && <LensPopover onClose={() => setLensOpen(false)} />}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
