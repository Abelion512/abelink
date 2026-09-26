import { memo, useState } from 'react'
import { toMinimapAnchorId } from './core/TocMinimap'
import { Copy, Check, ThumbsUp, ThumbsDown, Send } from 'lucide-react'
import {
  MessageBubble,
  ThinkingBubble,
  PlanningBubble,
  MemoryFooterBubble,
  PluginExecutionBubble,
  YoutubeSummaryBubble,
  YoutubeSearchBubble
} from './Chat'

const ChatList = ({
  msgId = null,
  role = 'user',
  content = '',
  reasoning = null,
  isThinking = false,
  isSearching: _isSearching = false,
  query: _query = null,
  isMemorySaved = false,
  isMemoryUpdated = false,
  isMemoryDeleted = false,
  isSummarizing = false,
  isYoutubeSummary = false,
  isYoutubeSearch = false,
  queryYoutube = '',
  youtubeLink = '',
  isSearchingMusic = false,
  sources = [],
  executedTools = [],
  isPlanSteps = false,
  plan = [],
  currentStep,
  isPlanConclusion = false,
  pluginExecution = null,
  choice = null,
  mood: _mood = 'neutral',
  timestamp = '',
  source = null,
  sender = null
}) => {
  const resolvedCurrentStep = currentStep !== undefined ? currentStep : (plan ? plan.length : 0)
  const [isCopied, setIsCopied] = useState(false)
  const [feedback, setFeedback] = useState(null) // 'up' | 'down' | null

  const handleCopy = () => {
    if (!content) return
    navigator.clipboard.writeText(content)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const handleFeedback = (type) => {
    setFeedback((prev) => (prev === type ? null : type))
    try {
      window.api?.harnessAppend?.('chat_eval_feedback', {
        msgId,
        role,
        feedback: feedback === type ? 'cancelled' : type,
        timestamp: Date.now()
      })
    } catch (_) {}
  }

  const isUser = role === 'user'
  const isTelegram = source === 'telegram'

  if (isPlanSteps && plan && plan.length > 0) {
    return (
      <PlanningBubble
        plan={plan}
        resolvedCurrentStep={resolvedCurrentStep}
        reasoning={reasoning}
        executedTools={executedTools}
      />
    )
  }

  return (
    <div
      id={msgId != null ? toMinimapAnchorId(msgId) : undefined}
      className={`w-full mb-6 group animate-[response-fade-in_0.2s_ease-out_forwards] scroll-mt-14 ${
        isUser ? 'flex flex-col items-end' : 'flex flex-col items-start'
      }`}
    >
      {/* Header Info (Sender Name & Time) */}
      <div
        className={`text-[11px] font-medium text-white/40 mb-1.5 flex items-center gap-2 px-1 ${
          isUser ? 'justify-end' : 'justify-start'
        }`}
      >
        <span>{isUser ? (isTelegram ? (sender || 'Telegram Admin') : 'You') : 'Abelink'}</span>
        {isTelegram && (
          <span className="badge badge-xs bg-[#229ED9]/15 text-[#229ED9] border-[#229ED9]/30 gap-1 font-mono text-[9px] py-0.5 px-1.5 flex items-center font-normal">
            <Send className="w-2.5 h-2.5" /> {isUser ? 'Telegram' : 'Telegram Reply'}
          </span>
        )}
        {timestamp && <span className="text-[10px] opacity-60 font-mono">{timestamp}</span>}
      </div>

      {/* Message Content Container */}
      {isUser ? (
        /* User Pill: Modern Apple iOS/macOS Bubble */
        <div
          className={`max-w-[85%] md:max-w-[75%] rounded-3xl rounded-tr-sm px-5 py-3 shadow-md text-white text-sm font-normal leading-relaxed break-words overflow-hidden ${
            isTelegram
              ? 'bg-gradient-to-br from-[#229ED9] to-[#0088cc] shadow-[#229ED9]/20 border border-[#229ED9]/40'
              : 'bg-[#0a84ff] shadow-[0_4px_16px_rgba(10,132,255,0.25)]'
          }`}
        >
          {content}
        </div>
      ) : (
        /* Assistant Stream: Borderless Canvas Layout */
        <div className="w-full max-w-full text-white/90 text-sm leading-relaxed overflow-hidden">
          {isThinking || isSummarizing || isSearchingMusic ? (
            <ThinkingBubble
              isThinking={isThinking}
              isSummarizing={isSummarizing}
              isSearchingMusic={isSearchingMusic}
              content={content}
              youtubeLink={youtubeLink}
              reasoning={reasoning}
              executedTools={executedTools}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {isYoutubeSummary && <YoutubeSummaryBubble youtubeLink={youtubeLink} />}
              {isYoutubeSearch && (
                <YoutubeSearchBubble queryYoutube={queryYoutube} youtubeLink={youtubeLink} />
              )}
              {pluginExecution && <PluginExecutionBubble pluginExecution={pluginExecution} />}
              <MessageBubble
                isUser={isUser}
                content={content}
                reasoning={reasoning}
                sources={sources}
                executedTools={executedTools}
                isPlanConclusion={isPlanConclusion}
                choice={choice}
              />
            </div>
          )}

          {/* Footer Actions: Thumbs Up, Thumbs Down, Copy */}
          {content && !isThinking && !isSummarizing && !isSearchingMusic && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 mt-2 px-1 text-white/40">
              <button
                type="button"
                onClick={handleCopy}
                className="h-7 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all text-[11px] font-medium flex items-center gap-1.5 cursor-pointer"
                title="Salin teks pesan"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3 h-3 text-[#30d158]" />
                    <span className="text-[#30d158]">Tersalin</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Salin</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleFeedback('up')}
                className={`h-7 w-7 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                  feedback === 'up'
                    ? 'bg-[#30d158]/20 text-[#30d158] border border-[#30d158]/40'
                    : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'
                }`}
                title="Bagus / Akurat"
                aria-label="Thumbs up"
              >
                <ThumbsUp className="w-3 h-3" />
              </button>

              <button
                type="button"
                onClick={() => handleFeedback('down')}
                className={`h-7 w-7 rounded-lg transition-all flex items-center justify-center cursor-pointer ${
                  feedback === 'down'
                    ? 'bg-[#ff453a]/20 text-[#ff453a] border border-[#ff453a]/40'
                    : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'
                }`}
                title="Kurang tepat / Perlu perbaikan"
                aria-label="Thumbs down"
              >
                <ThumbsDown className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      <MemoryFooterBubble
        isMemorySaved={isMemorySaved}
        isMemoryUpdated={isMemoryUpdated}
        isMemoryDeleted={isMemoryDeleted}
      />
    </div>
  )
}

export default memo(ChatList)
