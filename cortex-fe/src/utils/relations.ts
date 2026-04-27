import { type Scene } from '@/stores/scenes'

export interface RelEdge {
  scene: Scene
  kind: string
  label?: string
}

export interface SceneRelations {
  outgoing: RelEdge[]
  incoming: RelEdge[]
  parent: Scene | null
  children: Scene[]
}

export function getRelations(
  scene: Scene,
  allScenes: Scene[],
): SceneRelations {
  const byId = new Map(allScenes.map((s) => [s.id, s]))

  // Dedup edges by (otherSceneId, kind). The cortex CLI surfaces edges from
  // two sources — wikilink scans of the body and explicit `cortex link`
  // entries in the frontmatter — and a single relationship often shows up in
  // both, producing identical connectsTo records. We keep the first one we
  // see; if a labelled entry comes second it loses to the unlabelled one,
  // which is fine since labels on `kind=link` edges are noise anyway.
  const outgoing: RelEdge[] = []
  const outgoingSeen = new Set<string>()
  for (const e of scene.connectsTo ?? []) {
    const target = byId.get(e.sceneId)
    if (!target) continue
    const key = `${e.sceneId}::${e.kind}`
    if (outgoingSeen.has(key)) continue
    outgoingSeen.add(key)
    outgoing.push({ scene: target, kind: e.kind, label: e.label })
  }

  const incoming: RelEdge[] = []
  const incomingSeen = new Set<string>()
  for (const s of allScenes) {
    if (s.id === scene.id) continue
    for (const e of s.connectsTo ?? []) {
      if (e.sceneId !== scene.id) continue
      const key = `${s.id}::${e.kind}`
      if (incomingSeen.has(key)) continue
      incomingSeen.add(key)
      incoming.push({ scene: s, kind: e.kind, label: e.label })
    }
  }

  const parent = scene.parentId ? (byId.get(scene.parentId) ?? null) : null
  const children = allScenes.filter((s) => s.parentId === scene.id)

  // Hide wikilink edges that just restate the parent-child structure: a body
  // `[[child]]` line on a parent doesn't deserve its own "LINK" card when the
  // child is already listed under "Inside" (and vice versa for the parent).
  const structuralIds = new Set<string>()
  if (parent) structuralIds.add(parent.id)
  for (const c of children) structuralIds.add(c.id)

  const outgoingFiltered = outgoing.filter(
    (e) => !structuralIds.has(e.scene.id),
  )
  const incomingFiltered = incoming.filter(
    (e) => !structuralIds.has(e.scene.id),
  )

  // If the same target appears on both sides of an edge (A links to B AND
  // B links back to A), the outgoing card already tells the user "this
  // node points at B" — repeating B under "Referenced by" adds no signal,
  // just visual noise. Drop incoming entries whose target is anywhere in
  // outgoing.
  const outgoingFinal = collapseRedundantLink(outgoingFiltered)
  const outgoingTargets = new Set(outgoingFinal.map((e) => e.scene.id))
  const incomingFinal = collapseRedundantLink(incomingFiltered).filter(
    (e) => !outgoingTargets.has(e.scene.id),
  )

  return {
    outgoing: outgoingFinal,
    incoming: incomingFinal,
    parent,
    children,
  }
}

// When a single target appears with multiple kinds, drop the generic `link`
// edges if any informative kind (uses / feeds / part-of / maintained-by /
// promoted-to / …) is present for the same target. The CLI emits both a
// typed `cortex link --kind X` edge and an implicit body-wikilink edge for
// the same pair, and the typed one wins — `link` is just noise next to it.
function collapseRedundantLink(edges: RelEdge[]): RelEdge[] {
  const byTarget = new Map<string, RelEdge[]>()
  for (const e of edges) {
    const list = byTarget.get(e.scene.id) ?? []
    list.push(e)
    byTarget.set(e.scene.id, list)
  }
  const result: RelEdge[] = []
  for (const list of byTarget.values()) {
    const hasInformative = list.some((e) => e.kind && e.kind !== 'link')
    for (const e of list) {
      if (hasInformative && e.kind === 'link') continue
      result.push(e)
    }
  }
  return result
}

export function totalRelations(r: SceneRelations): number {
  return (
    r.outgoing.length +
    r.incoming.length +
    (r.parent ? 1 : 0) +
    r.children.length
  )
}
