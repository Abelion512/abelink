import { useEffect, useState } from 'react';
import DraggableHoloCard from './DraggableHoloCard';

import { CheckCircle, List, Zap, Check, ChevronRight } from 'lucide-react';

const ProcessPanel = ({ processes, onDismiss }) => {
  const [renderedProcesses, setRenderedProcesses] = useState([]);

  // Sync rendered processes with delayed unmount
  useEffect(() => {
    setRenderedProcesses(prev => {
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
          const { steps, currentStep, reasoning } = proc.data;
          const isDone = proc.status === 'done';
          return (
            <div className="pointer-events-auto" key={proc.id}>
              <DraggableHoloCard
                id={proc.id}
                title={isDone ? <><CheckCircle className="inline mr-1" size={14} /> Eksekusi Selesai</> : <><List className="inline mr-1" size={14} /> Eksekusi [{currentStep + 1}/{steps?.length || 1}]</>}
                defaultPosition={{ x: isRight ? window.innerWidth - 390 - cascadeX : 40 + cascadeX, y: 80 + cascadeY }}
                onClose={() => onDismiss(proc.id)}
                isVisible={!proc.isExiting}
              >
                <div className="w-[320px] flex flex-col gap-2">
                  {reasoning && (
                    <details className="group">
                      <summary className="text-[10px] cursor-pointer select-none flex items-center gap-1.5 opacity-50 hover:opacity-100 transition-opacity uppercase tracking-wider mb-2">
                        <ChevronRight className="group-open:rotate-90 transition-transform text-[8px]" size={10} />
                        Proses Pemikiran
                      </summary>
                      <div className="text-[11px] opacity-60 border-l border-white/20 pl-2 mb-2 font-mono whitespace-pre-wrap">
                        {reasoning}
                      </div>
                    </details>
                  )}
                  {steps && steps.map((step, idx) => {
                    let prefix = idx + 1 + '.';
                    let opacity = 'opacity-50 text-white';
                    let suffix = '';

                    if (idx < currentStep) {
                      prefix = <Check className="inline" size={10} />;
                      opacity = 'opacity-100 text-white font-bold';
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
                              <summary className="cursor-pointer select-none flex items-center hover:opacity-80 outline-none list-none [&::-webkit-details-marker]:hidden">
                                <ChevronRight className="group-open/step:rotate-90 transition-transform text-[8px] mr-1 opacity-50" size={10} />
                                {step.task} {suffix}
                              </summary>
                              <div className="mt-1 pl-3 opacity-70 text-[9px] border-l border-white/20 ml-[3px] mb-1 break-words font-sans glass glass-hover p-1.5 rounded">
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
                title={<><Zap className="inline mr-1" size={14} /> Plugin: {proc.data.action}</>}
                defaultPosition={{ x: isRight ? window.innerWidth - 340 - cascadeX : 40 + cascadeX, y: 80 + cascadeY }}
                onClose={() => onDismiss(proc.id)}
                isVisible={!proc.isExiting}
              >
                <div className="w-[280px] text-xs font-mono text-white/80">
                  <div className="mb-2">Mengeksekusi: <span className="text-white">{proc.data.query || proc.data.action}</span></div>
                  {proc.data.result && (
                    <div className="p-2 glass glass-hover text-white/90 border border-white/20 rounded-md">
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
