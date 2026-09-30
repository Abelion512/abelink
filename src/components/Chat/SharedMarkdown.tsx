import type { Components } from 'react-markdown'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { CodeBlock } from './CodeBlock'

// Single shared react-markdown component map: code (block + styled inline),
// external-link hardening via window.api, responsive tables, lazy images.
// Typed via Components (react-markdown) supaya semua konsumen lolos tsc.
export const sharedMarkdownComponents: Components = {
  code: (({ className, children }: {
    className?: string
    children?: React.ReactNode
    [key: string]: unknown
  }) => {
    const match = /language-(\w+)/.exec(className || '')
    return match ? (
      <CodeBlock className={className}>{children}</CodeBlock>
    ) : (
      <code
        className="bg-base-300/90 text-accent font-mono text-[11px] px-1.5 py-0.5 rounded border border-base-content/10"
      >
        {children}
      </code>
    )
  }) as Components['code'],
  a: ((props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
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
  }) as Components['a'],
  table: (({ children, ...props }) => (
    <div className="overflow-x-auto my-4">
      <table {...props}>{children}</table>
    </div>
  )) as Components['table'],
  img: ((props: React.ImgHTMLAttributes<HTMLImageElement>) => (
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
          e.currentTarget.style.display = 'none'
        }}
      />
    </span>
  )) as Components['img']
}

export const SharedMarkdown = ({ children }: { children?: string }) => (
  <Markdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[[rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]]}
    components={sharedMarkdownComponents}
  >
    {children ?? ''}
  </Markdown>
)

export default SharedMarkdown
