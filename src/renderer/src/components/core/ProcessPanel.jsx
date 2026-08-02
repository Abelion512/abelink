import React, { useEffect, useState } from 'react';
import DraggableHoloCard from './DraggableHoloCard';

import { FaCheckCircle, FaSearch, FaListUl, FaBolt, FaCheck, FaChevronRight } from 'react-icons/fa';

const ProcessPanel = ({ processes, onDismiss }) => {
  const [renderedProcesses, setRenderedProcesses] = useState([]);

  // Sync rendered processes with delayed unmount
  useEffect(() => {
    setRenderedProcesses(prev => {
      const currentIds = processes.map(p => p.id);
      
      // Update existing or mark as exiting
      let next = prev.map(rp => {
        const updated = processes.find(p => p.id === rp.id);
        if (updated) return { ...updated, isExiting: false };
        if (!rp.isExiting) return { ...rp, isExiting: true };
        return rp;
      });

      // Add new ones
      processes.forEach(p => {
        if (!prev.find(rp => rp.id === p.id)) {
          next.push({ ...p, isExiting: false });
        }
      });

      return next;
    });
  }, [processes]);

  // Clean up exiting processes after animation
  useEffect(() => {
    const hasExiting = renderedProcesses.some(p => p.isExiting);
    if (hasExiting) {
      const timer = setTimeout(() => {
        setRenderedProcesses(prev => prev.filter(p => !p.isExiting));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [renderedProcesses]);
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

  if (!renderedProcesses || renderedProcesses.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-40">
      {renderedProcesses.map((proc, index) => {
        // Spawn even indices on the right, odd indices on the left
        const isRight = index % 2 === 0;
        const sideIndex = Math.floor(index / 2);
        const cascadeY = sideIndex * 40;
        const cascadeX = sideIndex * 30;
        
        if (proc.type === 'planning') {
          const { steps, currentStep } = proc.data;
          const isDone = proc.status === 'done';
          return (
            <div className="pointer-events-auto" key={proc.id}>
              <DraggableHoloCard
                id={proc.id}
                title={isDone ? <><FaCheckCircle className="inline mr-1" /> Eksekusi Selesai</> : <><FaListUl className="inline mr-1" /> Eksekusi [{currentStep + 1}/{steps?.length || 1}]</>}
                defaultPosition={{ x: isRight ? window.innerWidth - 390 - cascadeX : 40 + cascadeX, y: 80 + cascadeY }}
                onClose={() => onDismiss(proc.id)}
                isVisible={!proc.isExiting}
              >
                <div className="w-[320px] flex flex-col gap-2">
                  {steps && steps.map((step, idx) => {
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
                          {typeof step === 'object' && step.query ? (
                            <details className="group/step outline-none">
                              <summary className="cursor-pointer select-none flex items-center hover:opacity-80 outline-none list-none [&::-webkit-details-marker]:hidden px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors group-open/step:bg-white/5">
                                <FaChevronRight className="group-open/step:rotate-90 transition-transform text-[8px] mr-1.5 opacity-60 group-open/step:opacity-100" />
                                <span className="group-open/step:font-semibold">{step.task}</span> {suffix}
                              </summary>
                              <div className="mt-1.5 pl-4 opacity-70 text-[9px] border-l-2 border-success/30 ml-[3px] mb-1.5 break-words font-sans bg-black/20 p-2 rounded-md">
                                {step.query}
                              </div>
                            </details>
                          ) : (
                            <>
                              {typeof step === 'object' ? step.task : step}
                              {suffix}
                            </>
                          )}
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
                isVisible={!proc.isExiting}
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
