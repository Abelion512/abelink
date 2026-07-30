import { useRef, useEffect, useState, useCallback } from 'react';
import { FaMicrophone, FaStop, FaArrowUp, FaSmile } from 'react-icons/fa';
import ConfirmModal from './ConfirmModal';

const EMOJIS = ['😂', '🤣', '😅', '🗿', '🙏', '🔥', '🚀', '💀', '😎', '🤔', '😭', '❤️', '👍', '✨', '👀', '💯'];

const InputBar = ({ value, onChange, onSubmit, isLoading, isRecording, onToggleRecord, onStop }) => {
  const textareaRef = useRef(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  const historyStackRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const savedInputRef = useRef('');

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const newH = Math.min(el.scrollHeight, 160);
    el.style.height = 'auto';
    el.style.height = newH + 'px';
  }, []);

  useEffect(() => { autoResize() }, [value, autoResize]);

  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [isLoading]);

  useEffect(() => {
    if (historyIndexRef.current === -1) savedInputRef.current = value;
  }, [value]);

  const handleEmojiClick = (emoji) => {
    onChange({ target: { value: value + emoji } });
    setShowEmojiPicker(false);
    setTimeout(() => textareaRef.current?.focus(), 10);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      const form = e.currentTarget.closest('form');
      if (form) form.requestSubmit();
      return;
    }
    if (e.key === 'ArrowUp' && historyStackRef.current.length > 0) {
      e.preventDefault();
      if (historyIndexRef.current === -1) savedInputRef.current = value;
      historyIndexRef.current = Math.min(historyIndexRef.current + 1, historyStackRef.current.length - 1);
      const idx = historyStackRef.current.length - 1 - historyIndexRef.current;
      onChange({ target: { value: historyStackRef.current[idx] } });
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndexRef.current <= 0) {
        historyIndexRef.current = -1;
        onChange({ target: { value: savedInputRef.current || '' } });
      } else {
        historyIndexRef.current -= 1;
        const idx = historyStackRef.current.length - 1 - historyIndexRef.current;
        onChange({ target: { value: historyStackRef.current[idx] } });
      }
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (value.trim()) {
      if (historyStackRef.current.length >= 50) historyStackRef.current.shift();
      historyStackRef.current.push(value.trim());
      historyIndexRef.current = -1;
    }
    onSubmit();
  };

  return (
    <div className="w-full">
      <form onSubmit={handleFormSubmit}
        className="relative flex items-center bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] rounded-[2rem] p-1.5 pr-2 shadow-[0_8px_32px_rgba(0,0,0,0.3)] transition-all focus-within:border-primary/50 focus-within:shadow-[0_0_20px_oklch(var(--su)/0.2)]">
        <button type="button" onClick={onToggleRecord}
          className={`p-2.5 rounded-full transition-all shrink-0 ${isRecording ? 'text-error bg-error/20 animate-pulse' : 'text-white/40 hover:text-white/80 hover:bg-white/5'}`}
          title={isRecording ? 'Stop Recording' : 'Click to Talk'}>
          <FaMicrophone size={15} />
        </button>
        <div className="relative shrink-0">
          <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2.5 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-full transition-all" title="Insert Emoji">
            <FaSmile size={15} />
          </button>
          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-3 bg-[var(--glass-bg)] backdrop-blur-3xl border border-[var(--glass-border)] rounded-2xl p-2 shadow-2xl flex flex-wrap w-52 gap-1 z-[100] animate-[fade-up_0.15s_ease-out_forwards]">
              {EMOJIS.map(emoji => (
                <button key={emoji} type="button" onClick={() => handleEmojiClick(emoji)}
                  className="w-9 h-9 flex items-center justify-center hover:bg-white/10 rounded-xl text-xl transition-all hover:scale-110 active:scale-95">{emoji}</button>
              ))}
            </div>
          )}
        </div>
        <textarea ref={textareaRef} value={value}
          onChange={(e) => { onChange(e); autoResize(); }} onKeyDown={handleKeyDown}
          disabled={isLoading} rows={1}
          placeholder={isLoading ? 'Beri intervensi ke Mark...' : 'Tanya apapun ke Mark...'}
          className="flex-1 bg-transparent border-none outline-none text-white px-2 py-2.5 placeholder:text-white/30 disabled:opacity-50 resize-none overflow-y-auto custom-scrollbar max-h-36 leading-relaxed text-sm" />
        <div className="flex items-center gap-1.5 shrink-0">
          {isLoading ? (
            <button type="button" onClick={() => setShowAbortConfirm(true)}
              className="p-2.5 rounded-full bg-error/20 text-error hover:bg-error hover:text-white transition-all" title="Stop">
              <FaStop size={14} />
            </button>
          ) : (
            <button type="submit" disabled={!value.trim()}
              className="p-2.5 rounded-full bg-success text-success-content disabled:opacity-40 disabled:bg-white/10 disabled:text-white/30 hover:bg-success/80 active:scale-95 transition-all" title="Send (Ctrl+Enter)">
              <FaArrowUp size={14} />
            </button>
          )}
        </div>
      </form>
      <ConfirmModal
        isOpen={showAbortConfirm}
        title="Hard Abort Proses?"
        message="Yakin mau memberhentikan proses Mark secara paksa? Tindakan ini akan menghentikan secara langsung semua alat yang sedang berjalan dan memutuskan koneksi ke otak AI-nya seketika."
        confirmText="Berhentikan"
        cancelText="Batal"
        isError={true}
        onConfirm={() => { setShowAbortConfirm(false); if (onStop) onStop(); }}
        onCancel={() => setShowAbortConfirm(false)}
      />
    </div>
  );
};

export default InputBar;
