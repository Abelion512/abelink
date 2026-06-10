import React from 'react'

export const ThinkingBubble = ({ isThinking, isSummarizing, isSearchingMusic }) => {
  return (
    <div className="flex items-center gap-2 py-1 animate-pulse">
      <span className="loading loading-dots loading-xs"></span>
      <span className="text-xs italic opacity-70">
        {isThinking && 'Mark is thinking...'}
        {isSummarizing && 'Mark is summarizing...'}
        {isSearchingMusic && 'Mark is searching music...'}
      </span>
    </div>
  )
}
