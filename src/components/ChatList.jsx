import React, { memo, useState } from 'react'
import { Copy, Check, Bot, User, Sparkles } from 'lucide-react'
import { FaTelegramPlane } from 'react-icons/fa'
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
  role = 'user',
  content = '',
  reasoning = null,
  isThinking = false,
  isSearching = false,
  query = null,
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
  mood = 'neutral',
  timestamp = '',
  source = null,
  sender = null
}) => {
  const resolvedCurrentStep = currentStep !== undefined ? currentStep : (plan ? plan.length : 0)
  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = () => {
    if (!content) return
    navigator.clipboard.writeText(content)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const isUser = role === 'user'
  const isTelegram = source === 'telegram'

  if (isPlanSteps && plan && plan.length > 0) {
    return (
      <div className="w-full mb-6 animate-[response-fade-in_0.2s_ease-out_forwards]">
        <PlanningBubble
          plan={plan}
          resolvedCurrentStep={resolvedCurrentStep}
          reasoning={reasoning}
        />
      </div>
    )
  }

  if (isUser) {
    return (
      <div className="w-full flex flex-col items-end mb-5 group animate-[response-fade-in_0.2s_ease-out_forwards]">
        {/* User Header */}
        <div className="flex items-center gap-2 mb-1.5 px-1 text-[11px] font-medium text-white/40 select-none">
          <span>{isTelegram ? (sender || 'Telegram Admin') : 'You'}</span>
          {isTelegram && (
            <span className="badge badge-xs bg-[#229ED9]/15 text-[#229ED9] border-[#229ED9]/30 gap-1 font-mono text-[9px] py-0.5 px-1.5 flex items-center font-normal">
              <FaTelegramPlane className="w-2.5 h-2.5" /> Telegram
            </span>
          )}
          {timestamp && <span className="text-[10px] text-white/30 font-normal">{timestamp}</span>}
        </div>

        {/* User Bubble (Apple Pill / Card) */}
        <div
          className={`max-w-[85%] md:max-w-[75%] rounded-3xl rounded-tr-md px-5 py-3 shadow-md break-words transition-all duration-200 ${
            isTelegram
              ? 'bg-gradient-to-br from-[#229ED9] to-[#0088cc] text-white border border-[#229ED9]/40'
              : 'bg-primary text-primary-content font-medium border border-primary/20 shadow-primary/10'
          }`}
        >
          <MessageBubble
            isUser={true}
            content={content}
            sources={sources}
          />
        </div>
      </div>
    )
  }

  // AI Response: Clean Canvas Stream (Full width, borderless, unconstrained)
  return (
    <div className="w-full flex flex-col items-start mb-8 group animate-[response-fade-in_0.2s_ease-out_forwards]">
      {/* AI Header & Actions Bar */}
      <div className="flex items-center justify-between w-full mb-2 px-0.5 text-[11px] font-medium text-white/40 select-none">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--color-primary)]" />
          <span className="text-white/80 font-semibold tracking-wide">Abelink</span>
          {isTelegram && (
            <span className="badge badge-xs bg-[#229ED9]/15 text-[#229ED9] border-[#229ED9]/30 gap-1 font-mono text-[9px] py-0.5 px-1.5 flex items-center font-normal">
              <FaTelegramPlane className="w-2.5 h-2.5" /> Telegram Reply
            </span>
          )}
          {timestamp && <span className="text-[10px] text-white/30 font-normal">{timestamp}</span>}
        </div>

        {/* Copy Button (Apple Ghost pill on hover) */}
        {content && !isThinking && !isSummarizing && !isSearchingMusic && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center">
            <button
              onClick={handleCopy}
              className="px-2 py-0.5 text-[11px] text-white/40 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.1] rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
              title="Salin teks pesan"
            >
              {isCopied ? (
                <>
                  <Check className="w-3 h-3 text-success" />
                  <span className="text-[10px] text-success font-medium">Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span className="text-[10px]">Salin</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* AI Body Stream (No outer card border, fluid document flow) */}
      <div className={`w-full text-base-content leading-relaxed ${isTelegram ? 'border-l-2 border-[#229ED9]/40 pl-3.5' : ''}`}>
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
          <div className="flex flex-col gap-3 w-full">
            {isYoutubeSummary && <YoutubeSummaryBubble youtubeLink={youtubeLink} />}
            {isYoutubeSearch && (
              <YoutubeSearchBubble queryYoutube={queryYoutube} youtubeLink={youtubeLink} />
            )}
            {pluginExecution && <PluginExecutionBubble pluginExecution={pluginExecution} />}
            <MessageBubble
              isUser={false}
              content={content}
              reasoning={reasoning}
              sources={sources}
              executedTools={executedTools}
              isPlanConclusion={isPlanConclusion}
              choice={choice}
            />
          </div>
        )}
      </div>

      <MemoryFooterBubble
        isMemorySaved={isMemorySaved}
        isMemoryUpdated={isMemoryUpdated}
        isMemoryDeleted={isMemoryDeleted}
      />
    </div>
  )
}

export default memo(ChatList)
