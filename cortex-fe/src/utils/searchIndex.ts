import Fuse from 'fuse.js'
import type { Scene } from '@/stores/scenes'

export interface SearchEntry {
  sceneId: string
  title: string
  description: string
  text: string
  parentTitle: string
  tags: string[]
  people: string[]
  color: string
  domain: string
  isRoot: boolean
}

const ZONE_COLOR_HEX: Record<string, string> = {
  ochre: '#C9A363',
  mint: '#A8C4B0',
  dust: '#B8CAD6',
}

export function buildSearchEntries(scenes: Scene[]): SearchEntry[] {
  const byId = new Map(scenes.map((s) => [s.id, s]))
  return scenes.map((s) => {
    const parent = s.parentId ? byId.get(s.parentId) : null
    return {
      sceneId: s.id,
      title: s.title,
      description: s.description,
      text: s.text ?? '',
      parentTitle: parent?.title ?? '',
      tags: s.tags ?? [],
      people: s.people ?? [],
      color: s.color
        ? (ZONE_COLOR_HEX[s.color] ?? ZONE_COLOR_HEX.ochre)
        : '#C9A363',
      domain: s.domain ?? '',
      isRoot: s.parentId === null,
    }
  })
}

export function buildSearchIndex(scenes: Scene[]): Fuse<SearchEntry> {
  return new Fuse(buildSearchEntries(scenes), {
    keys: [
      { name: 'title', weight: 0.5 },
      { name: 'description', weight: 0.2 },
      { name: 'text', weight: 0.15 },
      { name: 'tags', weight: 0.08 },
      { name: 'people', weight: 0.05 },
      { name: 'parentTitle', weight: 0.02 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true,
  })
}
