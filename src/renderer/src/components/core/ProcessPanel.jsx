import React, { useEffect } from 'react';
import DraggableHoloCard from './DraggableHoloCard';
import { WebSearchBubble } from '../Chat/WebSearchBubble';
import { FaCheckCircle, FaSearch, FaListUl, FaBolt, FaCheck, FaChevronRight } from 'react-icons/fa';

const ProcessPanel = ({ processes, onDismiss }) => {
  // Auto-dismiss logic for 'done' status
  useEffect(() => {
    processes.forEach(proc => {
      if (proc.status === 'done') {
        const timeout = proc.type === 'planning' ? 3000 : 5000;
        const timer = setTimeout(() => {
          onDismiss(proc.id);
        }, timeout);
        return () => clearTimeout(timer);
      }
    });
  }, [processes, onDismiss]);

  if (!processes || processes.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-40">
      {processes.map((proc, index) => {
        // Spawn even indices on the right, odd indices on the left
        const isRight = index % 2 === 0;
        const sideIndex = Math.floor(index / 2);
        const cascadeY = sideIndex * 40;
        const cascadeX = sideIndex * 30;
        
        if (proc.type === 'web-search') {
          return (
            <div className="pointer-events-auto" key={proc.id}>
              <DraggableHoloCard
                id={proc.id}
                title={proc.status === 'done' ? <><FaCheckCircle className="inline mr-1" /> Web Search Selesai</> : <><FaSearch className="inline mr-1" /> Web Search Aktif</>}
                defaultPosition={{ x: isRight ? window.innerWidth - 440 - cascadeX : 40 + cascadeX, y: 80 + cascadeY }}
                onClose={() => onDismiss(proc.id)}
              >
                <div className="w-[400px]">
                  {/* Reuse existing WebSearchBubble logic, but styled differently inside */}
                  <WebSearchBubble 
                    query={proc.data.query} 
                    sendDataWebSearch={proc.data.sendDataWebSearch} 
                  />
                </div>
              </DraggableHoloCard>
            </div>
          );
        }

        if (proc.type === 'planning') {
          const { plan, currentStep, reasoning } = proc.data;
          const isDone = proc.status === 'done';
          return (
            <div className="pointer-events-auto" key={proc.id}>
              <DraggableHoloCard
                id={proc.id}
                title={isDone ? <><FaCheckCircle className="inline mr-1" /> Planning Selesai</> : <><FaListUl className="inline mr-1" /> Planning [{currentStep + 1}/{plan.length}]</>}
                defaultPosition={{ x: isRight ? window.innerWidth - 390 - cascadeX : 40 + cascadeX, y: 80 + cascadeY }}
                onClose={() => onDismiss(proc.id)}
              >
                <div className="w-[320px] flex flex-col gap-2">
                  {reasoning && (
                    <details className="group">
                      <summary className="text-[10px] cursor-pointer select-none flex items-center gap-1.5 opacity-50 hover:opacity-100 transition-opacity uppercase tracking-wider mb-2">
                        <FaChevronRight className="group-open:rotate-90 transition-transform text-[8px]" />
                        Proses Pemikiran
                      </summary>
                      <div className="text-[11px] opacity-60 border-l border-white/20 pl-2 mb-2 font-mono whitespace-pre-wrap">
                        {reasoning}
                      </div>
                    </details>
                  )}
                  {plan.map((step, idx) => {
                    let prefix = idx + 1 + '.';
                    let opacity = 'opacity-50 text-white';
                    let suffix = '';

                    if (idx < currentStep) {
                      prefix = <FaCheck className="inline" size={10} />;
                      opacity = 'opacity-100 text-success font-bold';
                    } else if (idx === currentStep && !isDone) {
                      opacity = 'opacity-100 text-white animate-pulse';
                      suffix = '...';
                    }

                    return (
                      <div key={idx} className={`flex items-start text-[11px] font-mono transition-all ${opacity}`}>
                        <span className="w-4 inline-block">{prefix}</span>
                        <div className="flex-1">
                          {typeof step === 'object' ? step.task : step}
                          {suffix}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </DraggableHoloCard>
            </div>
          );
        }

        if (proc.type === 'plugin-execution') {
          return (
            <div className="pointer-events-auto" key={proc.id}>
              <DraggableHoloCard
                id={proc.id}
                title={<><FaBolt className="inline mr-1" /> Plugin: {proc.data.action}</>}
                defaultPosition={{ x: isRight ? window.innerWidth - 340 - cascadeX : 40 + cascadeX, y: 80 + cascadeY }}
                onClose={() => onDismiss(proc.id)}
              >
                <div className="w-[280px] text-xs font-mono text-white/80">
                  <div className="mb-2">Mengeksekusi: <span className="text-success">{proc.data.query || proc.data.action}</span></div>
                  {proc.data.result && (
                    <div className="p-2 bg-info/10 text-info border border-info/20 rounded-md">
                      {proc.data.result}
                    </div>
                  )}
                </div>
              </DraggableHoloCard>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

export default ProcessPanel;
