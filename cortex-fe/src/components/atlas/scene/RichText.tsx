import { Fragment, type ReactNode } from 'react'
import { type Scene } from '@/stores/scenes'

// Matches either a wikilink ([[id]] / [[?id]] / [[id|kind]]) or inline-code
// (`text`). Capture groups:
//   1 = optional '?' (inferred marker, dropped from display)
//   2 = wikilink target id
//   3 = optional kind after '|' (dropped from display)
//   4 = inline code body
const TOKEN_RE = /\[\[(\?)?([^\]|]+)(?:\|([^\]]+))?\]\]|`([^`]+)`/g

interface Props {
  text: string
  sceneById: Map<string, Scene>
  onNavigate?: (sceneId: string) => void
  /** Tailwind classes for the wrapping span. The caller usually sets the
   *  base font + color; we only override for inline tokens. */
  className?: string
}

/** Render a short string of body content with two markdown-lite features:
 *
 *   • `[[X]]` / `[[?X]]` / `[[X|kind]]` — render as the target scene's
 *     title (falls back to the slug). Clickable when `onNavigate` and the
 *     target exists in `sceneById`. The wikilink syntax itself is hidden.
 *
 *   • `` `code` `` — render as monospace inline code, backticks hidden.
 *
 *  Anything else passes through verbatim so the parchment-style italic
 *  paragraph still reads as prose. */
export function RichText({ text, sceneById, onNavigate, className }: Props) {
  const nodes: ReactNode[] = []
  let cursor = 0
  let key = 0
  // RegExp.exec is stateful with the global flag — reset just in case the
  // same instance is re-entered.
  TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(text))) {
    if (m.index > cursor) {
      nodes.push(<Fragment key={`t${key++}`}>{text.slice(cursor, m.index)}</Fragment>)
    }
    if (m[2] !== undefined) {
      const targetId = m[2]
      const target = sceneById.get(targetId)
      const label = target?.title || targetId
      if (target && onNavigate) {
        nodes.push(
          <button
            key={`w${key++}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onNavigate(targetId)
            }}
            className="text-ink/85 underline decoration-ink/25 underline-offset-2 hover:decoration-ink/70 hover:text-ink transition"
          >
            {label}
          </button>,
        )
      } else {
        // Unknown target or no nav handler — render as plain text so the
        // brackets disappear but the reader still sees the name.
        nodes.push(<Fragment key={`w${key++}`}>{label}</Fragment>)
      }
    } else if (m[4] !== undefined) {
      nodes.push(
        <code
          key={`c${key++}`}
          className="font-mono text-[0.86em] text-ink/85 bg-ink/[0.05] rounded px-1 py-[1px] not-italic"
        >
          {m[4]}
        </code>,
      )
    }
    cursor = TOKEN_RE.lastIndex
  }
  if (cursor < text.length) {
    nodes.push(<Fragment key={`t${key++}`}>{text.slice(cursor)}</Fragment>)
  }
  return <span className={className}>{nodes}</span>
}
