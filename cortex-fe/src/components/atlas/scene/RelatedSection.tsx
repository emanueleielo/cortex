import { type Scene } from '@/stores/scenes'
import { getRelations, type RelEdge } from '@/utils/relations'
import { LiveImage } from '../LiveImage'

interface Props {
  scene: Scene
  allScenes: Scene[]
  onNavigate: (sceneId: string) => void
}

function groupByKind(edges: RelEdge[]): Map<string, RelEdge[]> {
  const m = new Map<string, RelEdge[]>()
  for (const e of edges) {
    const list = m.get(e.kind) ?? []
    list.push(e)
    m.set(e.kind, list)
  }
  return m
}

function RelCard({
  rel,
  onClick,
}: {
  rel: { scene: Scene; label?: string }
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-stretch gap-3 p-2.5 border border-ink/12 hover:border-ink/35 rounded bg-cream hover:bg-ink/[0.03] transition text-left"
    >
      <div className="w-14 h-14 rounded-sm overflow-hidden border border-ink/10 flex-shrink-0 bg-cream">
        <LiveImage
          src={rel.scene.sceneAsset}
          alt=""
          className="w-full h-full object-cover"
          wrapperClassName="w-full h-full"
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="font-serif italic text-ink/85 group-hover:text-ink text-[15px] leading-tight truncate">
          {rel.scene.title}
        </div>
        {rel.label && (
          <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink/45 truncate">
            {rel.label}
          </div>
        )}
      </div>
      <div className="flex items-center font-mono text-[12px] text-ink/30 group-hover:text-ink/60 transition pr-1">
        →
      </div>
    </button>
  )
}

function Group({
  title,
  items,
  onNavigate,
}: {
  title: string
  items: { scene: Scene; label?: string }[]
  onNavigate: (id: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="mt-7 first:mt-0">
      <h4 className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/45 mb-3">
        {title}
        <span className="ml-2 text-ink/25">({items.length})</span>
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((it, i) => (
          <RelCard key={`${it.scene.id}-${i}`} rel={it} onClick={() => onNavigate(it.scene.id)} />
        ))}
      </div>
    </div>
  )
}

// Visualization #2 — full editorial section in Reading mode.
export function RelatedSection({ scene, allScenes, onNavigate }: Props) {
  const rel = getRelations(scene, allScenes)
  const total =
    rel.outgoing.length +
    rel.incoming.length +
    (rel.parent ? 1 : 0) +
    rel.children.length
  if (total === 0) return null

  const outByKind = groupByKind(rel.outgoing)

  return (
    <section className="mt-14 pt-8 border-t border-ink/15">
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="font-serif italic text-ink text-[1.5rem]">Related</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/40">
          {total} {total === 1 ? 'connection' : 'connections'}
        </span>
      </div>

      {rel.parent && (
        <Group
          title="Parent"
          items={[{ scene: rel.parent }]}
          onNavigate={onNavigate}
        />
      )}

      {rel.children.length > 0 && (
        <Group
          title="Inside"
          items={rel.children.map((s) => ({ scene: s }))}
          onNavigate={onNavigate}
        />
      )}

      {[...outByKind.entries()].map(([kind, edges]) => (
        <Group
          key={`out-${kind}`}
          title={kind}
          items={edges.map((e) => ({ scene: e.scene, label: e.label }))}
          onNavigate={onNavigate}
        />
      ))}

      {rel.incoming.length > 0 && (
        <Group
          title="Referenced by"
          items={rel.incoming.map((e) => ({
            scene: e.scene,
            label: `${e.kind}${e.label ? ` · ${e.label}` : ''}`,
          }))}
          onNavigate={onNavigate}
        />
      )}
    </section>
  )
}
