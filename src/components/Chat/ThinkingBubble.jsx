import React from 'react'
import { Music, Brain, ChevronRight, SquarePlay } from 'lucide-react'
import { MobiusLoader } from '../core/MobiusLoader'
import { ToolCallsSection } from '../core/ToolCallsSection'

export const ThinkingBubble = ({
  isThinking = false,
  isSummarizing = false,
  isSearchingMusic = false,
  content = '',
  youtubeLink = '',
  reasoning = null,
  executedTools = []
}) => {
  const toolCalls = (executedTools || []).map((step) => ({
    tool_name: step.tool || step.task || 'tool',
    tool_category: step.tool || step.task || '',
    message: step.status === 'running' ? 'mengeksekusi...' : undefined,
    inputs: step.query,
    output: step.fullResult || step.resultSummary,
  }))

  return (
    <div className="flex flex-col gap-2.5 py-1 text-sm select-text">
      {/* Loading Status Header with Tech Radar (ResponseArea style) */}
      <div className="flex items-center gap-2.5">
        {isSummarizing ? (
          <div className="flex items-center gap-2 text-warning font-medium">
            <SquarePlay className="w-4 h-4 animate-bounce text-error" />
            <span className="text-xs">{content || 'Meringkas video YouTube...'}</span>
          </div>
        ) : isSearchingMusic ? (
          <div className="flex items-center gap-2 text-info font-medium">
            <Music className="w-4 h-4 animate-spin text-info" />
            <span className="text-xs">{content || 'Mencari lagu di YouTube Music...'}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 text-primary font-medium">
            <MobiusLoader size={16} className="text-primary shrink-0" />
            <span className="text-xs font-semibold animate-pulse text-white/90">
              {content || 'Abelink sedang menganalisis & mengeksekusi...'}
            </span>
          </div>
        )}
      </div>

      {/* Live Process Execution Card (ProcessPanel style) */}
      {(reasoning || (executedTools && executedTools.length > 0)) && (
        <div className="flex flex-col gap-2 bg-black/30 backdrop-blur-md rounded-xl border border-white/10 p-3 shadow-inner">
          {/* Collapsible Reasoning Section */}
          {reasoning && (
            <details open className="group/details">
              <summary className="text-[10px] cursor-pointer select-none flex items-center justify-between opacity-70 hover:opacity-100 uppercase tracking-wider mb-1.5 transition-opacity list-none [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-1.5 text-primary font-bold">
                  <Brain className="w-3.5 h-3.5" />
                  <span>Proses Pemikiran</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 group-open/details:rotate-90 transition-transform opacity-60" />
              </summary>
              <div className="text-[11px] opacity-80 border-l-2 border-primary/40 pl-2.5 my-1.5 font-mono whitespace-pre-wrap leading-relaxed text-base-content/90 max-h-48 overflow-y-auto custom-scrollbar">
                {typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning, null, 2)}
              </div>
            </details>
          )}

          {/* Executed Tools (shared ToolCallsSection) */}
          {toolCalls.length > 0 && (
            <div className="pt-1.5 border-t border-white/5">
              <ToolCallsSection
                toolCalls={toolCalls}
                defaultExpanded={false}
                title={`Langkah Alat (${toolCalls.length} Aksi)`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
