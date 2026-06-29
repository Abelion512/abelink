import React from 'react'

export const PluginExecutionBubble = ({ pluginExecution }) => {
  if (!pluginExecution) return null
  
  return (
    <div className="chat-bubble bg-transparent text-white p-0 shadow-none flex flex-col gap-1 mb-2">
      <details className="group">
        <summary className="text-xs cursor-pointer select-none flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
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
          <span className="truncate max-w-[250px]">
            Plugin digunakan: {pluginExecution.action}
          </span>
        </summary>
        <div className="pl-4 pt-1 flex flex-col gap-1 border-l border-white/20 ml-1.5 mt-1.5 mb-2">
          <div className="flex items-start text-[11px] font-mono transition-opacity text-white">
            <span className="opacity-100 text-success mr-1 font-bold inline-block w-3 text-center">
              ✓
            </span>
            <div className="flex-1 w-full overflow-hidden">
              <div>
                Mengeksekusi {pluginExecution.action}
                {pluginExecution.query && (
                  <span className="opacity-50 ml-1 italic">: {pluginExecution.query}</span>
                )}
              </div>
              {pluginExecution.result && (
                <div className="mt-1.5 mb-1 opacity-80 text-[10px] text-info bg-info/10 p-2 rounded-md border border-info/20 whitespace-pre-wrap font-sans leading-relaxed break-words">
                  {pluginExecution.result}
                </div>
              )}
            </div>
          </div>
        </div>
      </details>
    </div>
  )
}
