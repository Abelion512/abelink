import React, { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { CodeBlock } from './CodeBlock'

export const MessageBubble = ({ isUser, content, reasoning, sources, isPlanConclusion }) => {
  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  return (
    <div className="text-sm leading-relaxed custom-markdown flex flex-col gap-1 relative group">
      {isPlanConclusion && (
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary uppercase tracking-wider mb-2 border-b border-primary/20 pb-1.5 w-max">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
            <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
          </svg>
          Plan Conclusion
        </div>
      )}
      {reasoning && (
        <details className="group mb-2">
          <summary className="list-none flex items-center gap-1.5 cursor-pointer text-[12px] font-semibold opacity-70 hover:opacity-100 transition-opacity">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="1em"
              height="1em"
              viewBox="0 0 1024 1024"
              className="group-open:rotate-90 transition-transform text-[11px]"
            >
              <path d="M0 0h1024v1024H0z" fill="none" />
              <path
                fill="currentColor"
                d="M340.9 149.3a30.6 30.6 0 0 0 0 42.8L652.7 512L341 831.9a30.6 30.6 0 0 0 0 42.7a29 29 0 0 0 41.7 0l331.6-340.3a32 32 0 0 0 0-44.6L382.6 149.4a29 29 0 0 0-41.7 0z"
              />
            </svg>
            Proses pemikiran Mark
          </summary>
          <div className="pl-4 pt-1 pb-1 text-[11px] opacity-60 border-l border-white/20 ml-1.5 mt-1.5 mb-2 whitespace-pre-wrap font-mono leading-relaxed">
            {reasoning}
          </div>
        </details>
      )}
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]
        ]}
        components={{
          code: CodeBlock
        }}
      >
        {content}
      </Markdown>

      {sources && sources.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-primary/10">
          <span className="text-[10px] font-bold opacity-50 w-full mb-1 uppercase tracking-wider">
            Sources:
          </span>
          {sources.map((source, i) => (
            <button
              key={i}
              onClick={() => window.api.openExternal(source.link)}
              className="btn btn-xs btn-neutral border border-primary/20 hover:border-primary/50 normal-case text-[10px] flex items-center gap-1 bg-base-300 transform transition hover:scale-105"
              title={source.link}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3 h-3 text-primary"
              >
                <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
              </svg>
              <span className="truncate max-w-37.5">{source.title}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end mt-1 -mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={handleCopy}
          className="btn btn-ghost btn-xs text-[10px] p-1 h-auto min-h-0 font-normal opacity-70 hover:opacity-100 hover:bg-transparent"
          title="Copy text"
        >
          {isCopied ? (
            <span className="text-success flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Copied!
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
