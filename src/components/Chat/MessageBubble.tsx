import React from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { CodeBlock } from './CodeBlock'
import { ChoiceButtons } from './ChoiceButtons'
import { Brain, ChevronRight, ExternalLink, FileText, Activity } from 'lucide-react'
import { ToolCallsSection, type ToolCallRow } from '../core/ToolCallsSection'

interface SourceRef {
  link?: string
  title?: string
  [key: string]: unknown
}

export const MessageBubble = React.memo(function MessageBubble({
  isUser,
  content,
  reasoning,
  sources = [],
  executedTools = [],
  isPlanConclusion = false,
  _isLearned = false,
  choice = null
}: {
  isUser: boolean
  content: unknown
  reasoning?: string
  sources?: SourceRef[]
  executedTools?: Array<{ tool?: string; task?: string; status?: string; query?: unknown; fullResult?: string; resultSummary?: string; [key: string]: unknown }>
  isPlanConclusion?: boolean
  _isLearned?: boolean
  choice?: unknown
}) {

  const extractContent = (val: unknown): { text: string; images: string[] } => {
    if (val == null) return { text: '', images: [] }
    if (typeof val === 'string') {
      if (val.startsWith('data:image/')) {
        return { text: '', images: [val] }
      }
      return { text: val, images: [] }
    }
    if (Array.isArray(val)) {
      const texts = []
      const images = []
      for (const item of val) {
        if (!item) continue
        if (typeof item === 'string') {
          if (item.startsWith('data:image/')) {
            images.push(item)
          } else {
            texts.push(item)
          }
        } else if (item.type === 'text') {
          if (item.text) texts.push(item.text)
        } else if (item.type === 'image_url') {
          const imgUrl =
            item.image_url?.url ||
            item.url ||
            (typeof item.image_url === 'string' ? item.image_url : null)
          if (imgUrl) images.push(imgUrl)
        } else if (item.image_url || item.url) {
          const imgUrl = item.image_url?.url || item.image_url || item.url
          if (typeof imgUrl === 'string') images.push(imgUrl)
        } else {
          texts.push(JSON.stringify(item, null, 2))
        }
      }
      return { text: texts.join('\n\n'), images }
    }
    if (typeof val === 'object') {
      const rec = val as {
        type?: string
        image_url?: { url?: string } | string
        url?: string
      }
      if (rec.type === 'image_url') {
        const imgUrl =
          (rec.image_url && typeof rec.image_url === 'object' ? rec.image_url.url : null) ||
          rec.url ||
          (typeof rec.image_url === 'string' ? rec.image_url : null)
        if (imgUrl) return { text: '', images: [imgUrl] }
      }
      return { text: JSON.stringify(val, null, 2), images: [] }
    }
    return { text: String(val), images: [] }
  }

  const { text: stringContent, images: attachedImages } = extractContent(content)

  const toolCalls: ToolCallRow[] = (executedTools || []).map((step) => ({
    tool_name: step.tool || step.task || 'tool',
    tool_category: step.tool || step.task || '',
    message: step.status === 'running' ? 'mengeksekusi...' : undefined,
    inputs: step.query,
    output: step.fullResult || step.resultSummary,
  }))

  return (
    <div className="text-sm leading-relaxed custom-markdown flex flex-col gap-1 relative group">
      {/* Plan Conclusion Header */}
      {isPlanConclusion && (
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary uppercase tracking-wider mb-2 border-b border-primary/20 pb-1.5 w-max">
          <FileText className="w-3.5 h-3.5" />
          Kesimpulan Rencana
        </div>
      )}

      {/* Executed Tools & Reasoning Summary Card (Apple / Claude Minimalist Style) */}
      {((executedTools && executedTools.length > 0) || reasoning) && (
        <details className="group/tools my-2 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-md overflow-hidden transition-all duration-200">
          <summary className="list-none flex items-center justify-between px-3.5 py-2 cursor-pointer text-[11px] font-medium tracking-wide text-white/70 hover:text-white hover:bg-white/[0.04] transition-all select-none">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                {executedTools && executedTools.length > 0 ? (
                  <Activity className="w-3 h-3" />
                ) : (
                  <Brain className="w-3 h-3" />
                )}
              </div>
              <span className="font-semibold text-white/85">
                {executedTools && executedTools.length > 0
                  ? `${executedTools.length} Langkah Alat Selesai`
                  : 'Proses Analisis & Pemikiran'}
              </span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 group-open/tools:rotate-90 text-white/40" />
          </summary>
          <div className="p-3 space-y-2.5 border-t border-white/[0.06] text-xs">
            {/* Thought / Reasoning Section */}
            {reasoning && (
              <div className="text-[11px] font-mono bg-black/20 p-2.5 rounded-xl border border-white/[0.04] whitespace-pre-wrap leading-relaxed text-white/80">
                <div className="flex items-center gap-1.5 text-primary font-semibold mb-1 uppercase tracking-wider text-[10px]">
                  <Brain className="w-3 h-3" />
                  <span>Pemikiran AI</span>
                </div>
                {typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning, null, 2)}
              </div>
            )}

            {/* Executed Tools (shared ToolCallsSection) */}
            {toolCalls.length > 0 && (
              <div className="pt-1 border-t border-white/5">
                <ToolCallsSection toolCalls={toolCalls} defaultExpanded={false} />
              </div>
            )}
          </div>
        </details>
      )}

      {/* Attached Images Preview Grid — adaptif: 1 kolom ≤2 gambar,
          2 kolom s/d 6, scroll horizontal beyond (tanpa batas jumlah). */}
      {attachedImages && attachedImages.length > 0 && (
        <div
          className={
            attachedImages.length <= 2
              ? 'flex flex-wrap gap-2 my-1.5'
              : attachedImages.length <= 6
                ? 'grid grid-cols-2 gap-2 my-1.5'
                : 'flex gap-2 my-1.5 overflow-x-auto pb-1'
          }
        >
          {attachedImages.map((imgSrc, idx) => (
            <div
              key={idx}
              className="relative group/img rounded-xl overflow-hidden border border-white/20 shadow-md bg-black/40 max-w-xs flex-shrink-0"
            >
              <img
                src={imgSrc}
                alt={`Lampiran ${idx + 1}`}
                className="max-h-56 w-auto object-contain cursor-pointer transition-transform duration-200 group-hover/img:scale-105"
                  onClick={() => {
                    const w = window.open('')
                    if (!w) return
                    // Bangun viewer lewat DOM API — imgSrc tidak pernah diinterpolasi
                    // ke string HTML agar tidak bisa breakout atribut di about:blank
                    const doc = w.document
                    doc.title = 'Lampiran'
                    doc.body.style.margin = '0'
                    doc.body.style.background = '#0d1117'
                    doc.body.style.display = 'flex'
                    doc.body.style.alignItems = 'center'
                    doc.body.style.justifyContent = 'center'
                    doc.body.style.minHeight = '100vh'
                    const img = doc.createElement('img')
                    img.src = imgSrc
                    img.alt = 'Lampiran'
                    img.style.maxWidth = '95vw'
                    img.style.maxHeight = '95vh'
                    img.style.borderRadius = '8px'
                    img.style.objectFit = 'contain'
                    doc.body.appendChild(img)
                  }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Markdown Content / Plain User Message */}
      {stringContent && (
        isUser ? (
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
        )
      )}

      {/* Inline Choice (tombol opsi ask-choice — klik lanjutkan loop, tanpa ketik) */}
      {!isUser && <ChoiceButtons choice={choice} />}

      {/* Sources */}
      {sources && sources.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-white/10">
          <span className="text-[10px] font-bold opacity-50 w-full mb-1 uppercase tracking-wider">
            Sumber & Referensi:
          </span>
          {sources.map((source: SourceRef, i: number) => (
            <button
              key={i}
              onClick={() => source?.link && void window.api?.openExternal?.(source.link)}
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
