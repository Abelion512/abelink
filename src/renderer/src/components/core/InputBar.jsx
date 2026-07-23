import React, { useRef, useEffect, useState, useCallback } from 'react';
import { FaMicrophone, FaStop, FaArrowUp, FaDesktop, FaWhatsapp, FaSmile } from 'react-icons/fa';
import ConfirmModal from './ConfirmModal';

const EMOJIS = ['😂', '🤣', '😅', '🗿', '🙏', '🔥', '🚀', '💀', '😎', '🤔', '😭', '❤️', '👍', '✨', '👀', '💯'];

const InputBar = ({ 
  value, 
  onChange, 
  onSubmit, 
  isLoading, 
  isRecording, 
  onToggleRecord, 
  onStop,
  source = 'pc'
}) => {
  const textareaRef = useRef(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  // Auto-resize textarea height (max 160px ~10 lines)
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      setTimeout(() => {
        if (textareaRef.current) textareaRef.current.focus();
      }, 50);
    }
  }, [isLoading]);

  const handleEmojiClick = (emoji) => {
    onChange({ target: { value: value + emoji } });
    setShowEmojiPicker(false);
    setTimeout(() => {
      if (textareaRef.current) textareaRef.current.focus();
    }, 10);
  };

  const handleKeyDown = (e) => {
    // Enter tanpa Shift = submit, Shift+Enter = newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50">
      <form 
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        className="relative flex items-center bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] rounded-[2rem] p-2 pr-3 shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all focus-within:border-primary/50 focus-within:shadow-[0_0_20px_oklch(var(--su)/0.2)]"
      >
        {/* Mic / Record Toggle */}
        <button
          type="button"
          onClick={onToggleRecord}
          className={`p-3 rounded-full transition-all flex-shrink-0 self-end ${
            isRecording 
              ? 'text-error bg-error/20 animate-pulse' 
              : 'text-white/40 hover:text-white/80 hover:bg-white/5'
          }`}
          title={isRecording ? 'Stop Recording' : 'Click to Talk'}
        >
          <FaMicrophone size={18} />
        </button>

        {/* Emoji Button */}
        <div className="relative flex-shrink-0 self-end">
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-3 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-full transition-all"
            title="Insert Emoji"
          >
            <FaSmile size={18} />
          </button>
          
          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-4 bg-[var(--glass-bg)] backdrop-blur-3xl border border-[var(--glass-border)] rounded-2xl p-2 shadow-2xl flex flex-wrap w-52 gap-1 z-[100] animate-[holo-project-in_0.2s_ease-out_forwards]">
              {EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiClick(emoji)}
                  className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-xl text-2xl transition-all hover:scale-110 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Textarea Input — multi-line with auto-resize & scrollbar */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => { onChange(e); autoResize(); }}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          rows={1}
          placeholder={isLoading ? 'Beri intervensi ke Mark...' : 'Tanya apapun ke Mark...'}
          className="flex-1 bg-transparent border-none outline-none text-white px-3 py-3 placeholder:text-white/30 disabled:opacity-50 resize-none overflow-y-auto custom-scrollbar max-h-40 leading-relaxed"
        />

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0 self-end">
          {isLoading && (
            <button
              type="button"
              onClick={() => setShowAbortConfirm(true)}
              className="p-3 rounded-full bg-error/20 text-error hover:bg-error hover:text-white transition-all"
              title="Stop Generation (Hard Abort)"
            >
              <FaStop size={16} />
            </button>
          )}
          <button
            type="submit"
            disabled={!value.trim()}
            className="p-3 rounded-full bg-success text-success-content disabled:opacity-30 disabled:bg-white/10 disabled:text-white/30 hover:bg-success/80 hover:scale-105 active:scale-95 transition-all"
            title="Send Message"
          >
            <FaArrowUp size={16} />
          </button>
        </div>
      </form>

      <ConfirmModal
        isOpen={showAbortConfirm}
        title="Hard Abort Proses?"
        message="Yakin mau memberhentikan proses Mark secara paksa? Tindakan ini akan menghentikan secara langsung semua alat yang sedang berjalan dan memutuskan koneksi ke otak AI-nya seketika."
        confirmText="Berhentikan"
        cancelText="Batal"
        isError={true}
        onConfirm={() => {
          setShowAbortConfirm(false);
          if (onStop) onStop();
        }}
        onCancel={() => setShowAbortConfirm(false)}
      />
    </div>
  );
};

export default InputBar;
