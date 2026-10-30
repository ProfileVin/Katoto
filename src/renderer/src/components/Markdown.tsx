import { memo, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children)
  }
  return ''
}

function CodeBlock({ children }: { children?: ReactNode }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = (): void => {
    void navigator.clipboard.writeText(textOf(children)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }
  return (
    <div className="group relative">
      <button
        onClick={copy}
        className="no-drag absolute right-2 top-2 rounded bg-white/10 px-2 py-0.5 text-[11px] text-neutral-300 opacity-0 transition group-hover:opacity-100 hover:bg-white/20"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre>{children}</pre>
    </div>
  )
}

export const Markdown = memo(function Markdown({
  text,
  streaming = false
}: {
  text: string
  streaming?: boolean
}): React.JSX.Element {
  return (
    <div className={`md ${streaming ? 'cursor-blink' : ''}`}>
      <ReactMarkdown
        rehypePlugins={[[rehypeHighlight, { detect: true }]]}
        components={{ pre: CodeBlock }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
