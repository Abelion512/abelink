import React, { memo } from 'react'
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
  MemoryFooterBubble
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
  isPlanConclusion = false
}) => {
  const resolvedCurrentStep = currentStep !== undefined ? currentStep : plan.length
  const { playUrl } = useYoutubeMusic()

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
      className={`chat ${isUser ? 'chat-end' : 'chat-start'} ${isSearching && 'flex flex-col'} mb-4 `}
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
        <div className={`${containerClass} shadow-md min-h-0 transition-all duration-300`}>
          {isThinking || isSummarizing || isSearchingMusic ? (
            <ThinkingBubble 
              isThinking={isThinking} 
              isSummarizing={isSummarizing} 
              isSearchingMusic={isSearchingMusic} 
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
      
      <MemoryFooterBubble 
        isMemorySaved={isMemorySaved}
        isMemoryUpdated={isMemoryUpdated}
        isMemoryDeleted={isMemoryDeleted}
      />
    </div>
  )
}

export default memo(ChatList)
