
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { CodeBlock } from './CodeBlock'

// Single shared react-markdown component map: code (block + styled inline),
// external-link hardening via window.api, responsive tables, lazy images.
export const sharedMarkdownComponents = {
  code({ _node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    return !inline ? (
      <CodeBlock match={match}>{children}</CodeBlock>
    ) : (
      <code
        className="bg-base-300/90 text-accent font-mono text-[11px] px-1.5 py-0.5 rounded border border-base-content/10"
        {...props}
      >
        {children}
      </code>
    )
  },
  a: ({ _node, ...props }) => {
    let url = props.href || '#'
    if (url !== '#' && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }
    return (
      <a
        {...props}
        onClick={(e) => {
          e.preventDefault()
          if (window.api && window.api.openExternal && url !== '#') {
            window.api.openExternal(url)
          }
        }}
      />
    )
  },
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-4">
      <table {...props}>{children}</table>
    </div>
  ),
  img: ({ _node, ...props }) => (
    <span className="block my-3 text-center">
      <img
        {...props}
        className="max-h-72 w-auto mx-auto rounded-lg object-contain border border-white/10 shadow-lg max-w-full bg-black/40 cursor-pointer hover:scale-[1.02] transition-transform"
        loading="lazy"
        onClick={() => {
          if (props.src && window.api?.openExternal) {
            window.api.openExternal(props.src)
          }
        }}
        onError={(e) => {
          e.target.style.display = 'none'
        }}
      />
    </span>
  )
}

export const SharedMarkdown = ({ children, ...props }) => (
  <Markdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[[rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]]}
    components={sharedMarkdownComponents}
    {...props}
  >
    {children}
  </Markdown>
)

export default SharedMarkdown
