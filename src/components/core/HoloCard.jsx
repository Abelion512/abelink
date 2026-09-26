import { useState, useRef, useEffect } from 'react';
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
    <HoloChrome className="w-full shadow-lg">
      <div className="relative z-10 flex flex-col p-4">
        {title && (
          <h3 className="text-white/60 font-semibold text-xs mb-3 uppercase tracking-wider flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[#0a84ff] rounded-full" />
            {title}
          </h3>
        )}

        <div 
          ref={contentRef}
          className={`transition-all duration-300 ease-out relative custom-markdown text-sm text-white/90 ${isExpanded ? 'max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar' : 'max-h-[200px] overflow-hidden'}`}
        >
          {children}
        </div>

        {isOverflowing && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-[#0a84ff] hover:text-white hover:bg-white/10 transition-all bg-white/5 py-1.5 px-3 rounded-lg border border-white/5 cursor-pointer"
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
