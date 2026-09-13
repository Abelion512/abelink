import React, { useState, useRef, useEffect } from 'react';
import { HoloChrome } from './HoloChrome';

const HoloCard = ({ children, title, defaultExpanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef(null);

  useEffect(() => {
    if (contentRef.current) {
      if (contentRef.current.scrollHeight > 200) {
        setIsOverflowing(true);
      }
    }
  }, [children]);

  return (
    <HoloChrome className="w-full animate-[holo-enter_0.4s_ease-out_forwards] shadow-xl [transform:translateZ(0)]">
      <div className="relative z-10 flex flex-col p-5">
        {title && (
          <h3 className="text-success font-semibold text-xs mb-3 uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse shadow-[0_0_8px_oklch(var(--su))]" />
            {title}
          </h3>
        )}

        <div 
          ref={contentRef}
          className={`transition-all duration-500 ease-in-out relative custom-markdown text-sm text-[#e2e8f0] ${isExpanded ? 'max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar' : 'max-h-[200px] overflow-hidden'}`}
        >
          {children}
        </div>

        {isOverflowing && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-success opacity-70 hover:opacity-100 hover:bg-white/10 transition-all bg-white/5 py-2 rounded-lg border border-white/5"
          >
            {isExpanded ? (
              <>▲ Ringkas Detail</>
            ) : (
              <>▼ Baca Detail Sepenuhnya</>
            )}
          </button>
        )}
      </div>
    </HoloChrome>
  );
};

export default HoloCard;
