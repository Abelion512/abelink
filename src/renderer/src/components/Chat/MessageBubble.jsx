import React, { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { CodeBlock } from './CodeBlock'
import { Brain, ChevronRight, ExternalLink, Sparkles, Activity, Check } from 'lucide-react'

export const MessageBubble = React.memo(({
  isUser,
  content,
  reasoning,
  sources = [],
  executedTools = [],
  isPlanConclusion = false,
  isLearned = false
}) => {
  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = () => {
    if (!content) return
    navigator.clipboard.writeText(content)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const formatContent = (val) => {
    if (val == null) return ''
    if (typeof val === 'string') return val
    if (Array.isArray(val)) {
      return val.map((item) => (typeof item === 'string' ? item : JSON.stringify(item, null, 2))).join('\n\n')
    }
    if (typeof val === 'object') {
      return JSON.stringify(val, null, 2)
    }
    return String(val)
  }

  const stringContent = formatContent(content)

  return (
    <div className="text-sm leading-relaxed custom-markdown flex flex-col gap-1 relative group">
      {/* Plan Conclusion Header */}
      {isPlanConclusion && (
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary uppercase tracking-wider mb-2 border-b border-primary/20 pb-1.5 w-max">
          <Sparkles className="w-3.5 h-3.5" />
          Kesimpulan Rencana
        </div>
      )}

      {/* Executed Tools & Reasoning Summary Card */}
      {((executedTools && executedTools.length > 0) || reasoning) && (
        <details className="group/tools mb-2.5 bg-primary/5 rounded-lg border border-primary/15 overflow-hidden">
          <summary className="list-none flex items-center justify-between px-3 py-1.5 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-primary/90 hover:bg-primary/10 transition-all select-none">
            <div className="flex items-center gap-1.5">
              {executedTools && executedTools.length > 0 ? (
                <>
                  <Activity className="w-3.5 h-3.5" />
                  <span>{executedTools.length} Langkah Alat Dieksekusi</span>
                </>
              ) : (
                <>
                  <Brain className="w-3.5 h-3.5" />
                  <span>Proses Analisis & Pemikiran</span>
                </>
              )}
            </div>
            <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 group-open/tools:rotate-90 opacity-70" />
          </summary>
          <div className="p-2 space-y-2 border-t border-primary/10 bg-black/30 max-h-60 overflow-y-auto custom-scrollbar">
            {/* Thought / Reasoning Section */}
            {reasoning && (
              <div className="text-[11px] font-mono bg-base-300/60 p-2 rounded border border-white/5 whitespace-pre-wrap leading-relaxed text-base-content/90">
                <div className="flex items-center gap-1.5 text-primary font-bold mb-1 uppercase tracking-wider text-[10px]">
                  <Brain className="w-3 h-3" />
                  <span>Pemikiran AI</span>
                </div>
                {typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning, null, 2)}
              </div>
            )}

            {/* Executed Tools List */}
            {executedTools && executedTools.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-white/5">
                {executedTools.map((t, idx) => {
                  const hasQuery = t.query !== undefined && t.query !== null && t.query !== ''
                  const queryString =
                    typeof t.query === 'string' ? t.query : JSON.stringify(t.query, null, 2)

                  if (!hasQuery) {
                    return (
                      <div
                        key={idx}
                        className="text-[11px] font-mono bg-base-300/60 px-2 py-1 rounded border border-white/5 flex items-center gap-1.5"
                      >
                        <Check className="w-3 h-3 text-success font-bold shrink-0" />
                        <span className="text-primary font-bold">[{t.tool || t.task || 'tool'}]</span>
                      </div>
                    )
                  }

                  return (
                    <details
                      key={idx}
                      className="group/query bg-base-300/60 rounded border border-white/5 overflow-hidden"
                    >
                      <summary className="list-none flex items-center justify-between px-2 py-1 cursor-pointer text-[11px] font-mono hover:bg-white/5 transition-all select-none">
                        <div className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-success font-bold shrink-0" />
                          <span className="text-primary font-bold">[{t.tool || t.task || 'tool'}]</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-60 group-hover/query:opacity-100">
                          <span className="text-[10px] text-white/50 lowercase">query</span>
                          <ChevronRight className="w-3 h-3 transition-transform duration-150 group-open/query:rotate-90" />
                        </div>
                      </summary>
                      <div className="px-2.5 py-1.5 text-[10px] font-mono border-t border-white/5 bg-black/40 text-white/80 whitespace-pre-wrap break-all max-h-36 overflow-y-auto custom-scrollbar border-l-2 border-primary/30">
                        {queryString}
                      </div>
                    </details>
                  )
                })}
              </div>
            )}
          </div>
        </details>
      )}

      {/* Markdown Content / Plain User Message */}
      {isUser ? (
        <div className="whitespace-pre-wrap leading-relaxed">{stringContent}</div>
      ) : (
        <div className="prose prose-sm max-w-none text-inherit prose-pre:p-0 prose-pre:bg-transparent prose-headings:text-inherit prose-strong:text-inherit">
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[
              [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]
            ]}
            components={{
              code: CodeBlock
            }}
          >
            {stringContent}
          </Markdown>
        </div>
      )}

      {/* Sources */}
      {sources && sources.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-white/10">
          <span className="text-[10px] font-bold opacity-50 w-full mb-1 uppercase tracking-wider">
            Sumber & Referensi:
          </span>
          {sources.map((source, i) => (
            <button
              key={i}
              onClick={() => window.api?.openExternal?.(source.link)}
              className="btn btn-xs btn-neutral border border-primary/20 hover:border-primary/50 normal-case text-[10px] flex items-center gap-1.5 bg-base-300 transform transition hover:scale-105"
              title={source.link}
            >
              <ExternalLink className="w-3 h-3 text-primary" />
              <span className="truncate max-w-[150px]">{source.title || source.link}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
