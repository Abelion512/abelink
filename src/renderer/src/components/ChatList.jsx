import React, { memo, useState } from 'react'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'
import {
  CommandBubble,
  PlanningBubble,
  WebSearchBubble,
  MusicBubble,
  YoutubeSummaryBubble,
  YoutubeSearchBubble,
  MessageBubble,
  ThinkingBubble,
  MemoryFooterBubble,
  PluginExecutionBubble
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
  isMusic = false,
  isMusicAutoplay = false,
  musicList = [],
  musicQuery = '',
  risk = 'safe',
  sources = [],
  isPlanSteps = false,
  plan = [],
  currentStep,
  sendDataWebSearch,
  onRun,
  isPlanConclusion = false,
  pluginExecution = null
}) => {
  const resolvedCurrentStep = currentStep !== undefined ? currentStep : plan.length
  const { playUrl } = useYoutubeMusic()
  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = () => {
    if (!content) return
    navigator.clipboard.writeText(content)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const isUser = role === 'user'
  const isCommand = role === 'command'

  if (isPlanSteps && plan.length > 0) {
    return (
      <PlanningBubble
        plan={plan}
        resolvedCurrentStep={resolvedCurrentStep}
        reasoning={reasoning}
      />
    )
  }

  if (isCommand) {
    return <CommandBubble content={content} risk={risk} onRun={onRun} />
  }

  let containerClass = isUser
    ? 'chat-bubble-primary chat-bubble'
    : 'bg-neutral text-white chat-bubble overflow-x-auto w-full border border-base-300 p-3 rounded-xl'



  return (
    <div
      className={`chat ${isUser ? 'chat-end' : 'chat-start'} ${isSearching && 'flex flex-col'} mb-4 group`}
    >
      {!isSearching && !isMusic && (
        <>
          <div className={`chat-image avatar ${isPlanConclusion ? 'opacity-0 pointer-events-none select-none' : ''}`}>
            <div className="w-10 rounded-full bg-neutral text-white flex items-center justify-center border border-primary/20">
              <span className="text-xs font-bold uppercase">{isUser ? 'U' : 'M'}</span>
            </div>
          </div>
          {!isPlanConclusion && (
            <div className="chat-header opacity-50 text-[10px] uppercase font-bold mb-1 px-1">
              {isUser ? 'You' : 'Mark'}
            </div>
          )}
        </>
      )}
      
      {isSearching ? (
        <WebSearchBubble query={query} sendDataWebSearch={sendDataWebSearch} />
      ) : isMusic ? (
        <MusicBubble 
          musicList={musicList}
          musicQuery={musicQuery}
          isMusicAutoplay={isMusicAutoplay}
          playUrl={playUrl}
        />
      ) : (
        <div className={`${containerClass} shadow-md min-h-0 transition-all duration-300 relative`}>
          {isThinking || isSummarizing || isSearchingMusic ? (
            <ThinkingBubble 
              isThinking={isThinking} 
              isSummarizing={isSummarizing} 
              isSearchingMusic={isSearchingMusic}
              content={content}
              youtubeLink={youtubeLink}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {isYoutubeSummary && (
                <YoutubeSummaryBubble youtubeLink={youtubeLink} />
              )}
              {isYoutubeSearch && (
                <YoutubeSearchBubble queryYoutube={queryYoutube} youtubeLink={youtubeLink} />
              )}
              {pluginExecution && (
                <PluginExecutionBubble pluginExecution={pluginExecution} />
              )}
              <MessageBubble 
                isUser={isUser}
                content={content}
                reasoning={reasoning}
                sources={sources}
                isPlanConclusion={isPlanConclusion}
              />
            </div>
          )}
        </div>
      )}

      {content && !isSearching && !isMusic && !isThinking && !isSummarizing && !isSearchingMusic && (
        <div className={`chat-footer opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mt-1 ${isPlanConclusion ? 'ml-10' : ''}`}>
          <button 
            onClick={handleCopy}
            className="btn btn-ghost btn-xs p-1 min-h-0 h-auto"
            title="Copy text"
          >
            {isCopied ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-success"><polyline points="20 6 9 17 4 12"></polyline></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50 hover:opacity-100"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            )}
          </button>
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
