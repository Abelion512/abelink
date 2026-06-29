import React from 'react'

export const PlanningBubble = ({ plan, resolvedCurrentStep, reasoning }) => {
  return (
    <div className="chat chat-start mb-1 mt-2 opacity-70 ml-10">
      <div className="chat-bubble bg-transparent text-white p-0 shadow-none flex flex-col gap-1">
        {reasoning && (
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
              Proses pemikiran Mark
            </summary>
            <div className="pl-4 pt-1 pb-1 text-[11px] opacity-60 border-l border-white/20 ml-1.5 mt-1.5 mb-2 whitespace-pre-wrap font-mono leading-relaxed">
              {reasoning}
            </div>
          </details>
        )}
        <details className="group">
          <summary className="text-xs cursor-pointer select-none flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
            {resolvedCurrentStep < plan.length ? (
              <span className="loading loading-spinner loading-xs text-primary scale-75"></span>
            ) : (
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
            )}
            <span className="truncate max-w-[250px]">
              {resolvedCurrentStep < plan.length 
                ? `[Step ${resolvedCurrentStep + 1}/${plan.length}] ${plan[resolvedCurrentStep]?.task || 'Memproses...'}` 
                : `Selesai (${plan.length} steps)`}
            </span>
          </summary>
          <div className="pl-4 pt-1 flex flex-col gap-1 border-l border-white/20 ml-1.5 mt-1.5 mb-2">
            {plan.map((step, idx) => {
              let prefix = idx + 1 + '.'
              let opacity = 'opacity-50'
              let suffix = ''

              if (idx < resolvedCurrentStep) {
                prefix = '✓'
                opacity = 'opacity-100 text-success'
              } else if (idx === resolvedCurrentStep) {
                opacity = 'opacity-100 text-white'
                suffix = '...'
              } else {
                opacity = 'opacity-50 text-white'
              }

              return (
                <div
                  key={idx}
                  className={`text-[11px] font-mono transition-opacity ${idx === resolvedCurrentStep ? 'animate-pulse text-white' : 'text-white/70'}`}
                >
                  <span className={`${opacity} mr-1 font-bold inline-block w-3 text-center`}>
                    {prefix}
                  </span>
                  {typeof step === 'object' ? step.task : step}
                  {suffix}
                </div>
              )
            })}
          </div>
        </details>
      </div>
    </div>
  )
}
