import React from 'react'
import { FaCheck, FaChevronRight } from 'react-icons/fa';

export const PlanningBubble = ({ plan, resolvedCurrentStep, reasoning }) => {
  return (
    <div className="chat chat-start mb-1 mt-2 opacity-70 ml-10">
      <div className="chat-bubble bg-transparent text-white p-0 shadow-none flex flex-col gap-1">
        {reasoning && (
          <details className="group">
            <summary className="text-xs cursor-pointer select-none flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
              <FaChevronRight className="group-open:rotate-90 transition-transform text-[11px]" />
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
              <FaChevronRight className="group-open:rotate-90 transition-transform text-[11px]" />
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
                prefix = <FaCheck className="inline" size={10} />
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
                  className={`flex items-start text-[11px] font-mono transition-opacity ${idx === resolvedCurrentStep ? 'animate-pulse text-white' : 'text-white/70'}`}
                >
                  <span className={`${opacity} mr-1 font-bold inline-block w-3 text-center`}>
                    {prefix}
                  </span>
                  {typeof step === 'object' 
                    ? (
                      <div className="flex-1 w-full overflow-hidden">
                        <div>
                          {step.task}
                          {step.query && step.action !== 'none' && (
                            <span className="opacity-50 ml-1 italic">: {step.query}</span>
                          )}
                        </div>
                        {step.result && (
                          <div className="mt-1.5 mb-1 opacity-80 text-[10px] text-info bg-info/10 p-2 rounded-md border border-info/20 whitespace-pre-wrap font-sans leading-relaxed break-words">
                            {step.result}
                          </div>
                        )}
                      </div>
                    )
                    : step
                  }
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
