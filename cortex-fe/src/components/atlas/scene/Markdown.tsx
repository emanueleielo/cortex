import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import { type Scene } from '@/stores/scenes'

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  theme: 'base',
  themeVariables: {
    fontFamily: '"EB Garamond", "Georgia", serif',
    fontSize: '14px',
    background: '#FAF6ED',
    primaryColor: '#FAF6ED',
    primaryTextColor: '#1F1F1F',
    primaryBorderColor: '#1F1F1F',
    secondaryColor: '#A8C4B0',
    tertiaryColor: '#B8CAD6',
    lineColor: '#1F1F1F',
    textColor: '#1F1F1F',
    mainBkg: '#FAF6ED',
    secondBkg: '#FAF6ED',
    tertiaryBkg: '#FAF6ED',
    nodeBorder: '#1F1F1F',
    clusterBkg: '#FAF6ED',
    clusterBorder: '#1F1F1F',
    edgeLabelBackground: '#FAF6ED',
  },
})

let mermaidCounter = 0

function MermaidBlock({ code }: { code: string }) {
  const id = useMemo(() => `mmd-${++mermaidCounter}`, [])
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    mermaid
      .render(id, code)
      .then((res) => {
        if (!cancelled) setSvg(res.svg)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message ?? String(err))
      })
    return () => {
      cancelled = true
    }
  }, [code, id])

  if (error) {
    return (
      <div className="my-5 border border-ink/15 rounded bg-cream/60 p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/55 mb-2">
          mermaid · render error
        </div>
        <pre className="font-mono text-[12px] text-ink/75 whitespace-pre-wrap">
          {error}
        </pre>
        <details className="mt-3">
          <summary className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/45 cursor-pointer">
            source
          </summary>
          <pre className="mt-2 font-mono text-[12px] text-ink/65 whitespace-pre">
            {code}
          </pre>
        </details>
      </div>
    )
  }

  return (
    <div className="my-6 border border-ink/12 rounded bg-cream overflow-hidden">
      <div
        ref={ref}
        className="px-4 py-5 overflow-x-auto flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  )
}

const WIKILINK_RE = /\[\[(\?)?([^\]|]+)(?:\|([^\]]+))?\]\]/g
const CODE_SPLIT_RE = /(```[\s\S]*?```|`[^`\n]+`)/g

// `cortex link <a> <b> [--kind X]` records the relation by appending
// `[[b]]` or `[[b|X]]` to the body on its own line. The Related panel
// already surfaces these — rendering them inline as a bare "X" button
// (or just the target id) is pure noise. Detect lines whose only content
// is one or more such standalone wikilinks, and drop the line entirely.
// Inline wikilinks inside prose stay untouched.
const STANDALONE_LINK_LINE_RE =
  /^[ \t]*(?:\[\[\??[^\]|]+(?:\|(?:link|uses|feeds|part-of|maintained-by|promoted-to))?\]\][ \t,;]*)+$/

function stripStandaloneWikilinkLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !STANDALONE_LINK_LINE_RE.test(line))
    .join('\n')
}

function processWikilinks(md: string, sceneById: Map<string, Scene>): string {
  // Split on fenced/inline code so we never rewrite [[X]] inside code blocks.
  const parts = md.split(CODE_SPLIT_RE)
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part
      const cleaned = stripStandaloneWikilinkLines(part)
      return cleaned.replace(WIKILINK_RE, (_match, _q, id, label) => {
        const target = sceneById.get(id)
        const display = (label?.trim() || target?.title || id).replace(
          /[\[\]]/g,
          ' ',
        )
        return `[${display}](wikilink:${id})`
      })
    })
    .join('')
}

interface Props {
  md: string
  sceneById?: Map<string, Scene>
  onNavigate?: (id: string) => void
}

export function Markdown({ md, sceneById, onNavigate }: Props) {
  const processed = useMemo(
    () => (sceneById ? processWikilinks(md, sceneById) : md),
    [md, sceneById],
  )
  return (
    <div className="font-serif text-ink/85 leading-[1.72] text-[16px] [&_p]:my-4 [&_h1]:mt-8 [&_h2]:mt-7 [&_h3]:mt-6 [&_h2]:mb-3 [&_h3]:mb-2 [&_ul]:my-3 [&_ol]:my-3 [&_li]:my-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="font-serif italic text-ink text-[clamp(1.5rem,2.2vw,2rem)] tracking-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-serif italic text-ink text-[clamp(1.2rem,1.6vw,1.5rem)] tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-serif italic text-ink/90 text-[1.15rem]">
              {children}
            </h3>
          ),
          a: ({ href, children }) => {
            if (href?.startsWith('wikilink:')) {
              const id = href.slice('wikilink:'.length)
              const target = sceneById?.get(id)
              if (target && onNavigate) {
                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onNavigate(id)
                    }}
                    className="text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink/70 transition cursor-pointer"
                  >
                    {children}
                  </button>
                )
              }
              // Unknown target — show the label as plain text so the brackets
              // disappear but the reader still sees the name.
              return <span className="text-ink/55">{children}</span>
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink/70 transition"
              >
                {children}
              </a>
            )
          },
          ul: ({ children }) => (
            <ul className="pl-5 list-disc marker:text-ink/40">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="pl-5 list-decimal marker:text-ink/50">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-5 pl-4 border-l-2 border-ink/25 font-serif italic text-ink/70">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-7 border-0 border-t border-ink/15" />,
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto">
              <table className="w-full border-collapse font-serif text-[15px]">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-ink/15 px-3 py-2 text-left bg-ink/[0.04] font-mono text-[11px] uppercase tracking-[0.18em] text-ink/65">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-ink/15 px-3 py-2 align-top">
              {children}
            </td>
          ),
          code: (props) => {
            const { className, children, ...rest } = props as {
              className?: string
              children?: React.ReactNode
              inline?: boolean
            }
            const match = /language-(\w+)/.exec(className ?? '')
            const lang = match?.[1]
            const raw = String(children ?? '').replace(/\n$/, '')
            // Inline code: no className with language, single line typically.
            if (!lang) {
              return (
                <code
                  className="font-mono text-[0.88em] bg-ink/[0.06] px-1.5 py-0.5 rounded"
                  {...rest}
                >
                  {children}
                </code>
              )
            }
            if (lang === 'mermaid') {
              return <MermaidBlock code={raw} />
            }
            return (
              <pre className="my-5 px-4 py-3 font-mono text-[13px] leading-[1.55] bg-ink/[0.04] border border-ink/10 rounded text-ink/85 overflow-x-auto whitespace-pre">
                <code className={className}>{raw}</code>
              </pre>
            )
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}
