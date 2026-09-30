import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmModalProps {
  isOpen: boolean
  title?: string
  message?: string
  onConfirm?: () => void
  onCancel?: () => void
  confirmText?: string
  cancelText?: string
  isError?: boolean
  hideCancel?: boolean
}

const ConfirmModal = ({ 
  isOpen,
  title, 
  message, 
  onConfirm, 
  onCancel,
  confirmText = "Ya", 
  cancelText = "Batal", 
  isError = false,
  hideCancel = false
}: ConfirmModalProps) => {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel?.();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      confirmRef.current?.focus();
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const content = (
    <div className="modal modal-open z-40 fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[response-fade-in_0.15s_ease-out_forwards]">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" className="modal-box relative bg-base-300 border border-white/10 shadow-2xl z-10 max-w-md rounded-[18px]">
        <div aria-hidden="true" className="md:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        <h3 id="confirm-modal-title" className={`font-bold text-lg ${isError ? 'text-error' : 'text-primary'}`}>{title}</h3>
        <p className="py-4 text-sm opacity-80 whitespace-pre-wrap">
          {message}
        </p>
        <div className="modal-action">
          {!hideCancel && (
            <button 
              type="button"
              className="btn btn-ghost btn-sm" 
              onClick={(e: ReactMouseEvent<HTMLButtonElement>) => {
                e.preventDefault();
                e.stopPropagation();
                onCancel?.();
              }}
            >
              {cancelText}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${isError ? 'btn-error' : 'btn-primary'} btn-sm shadow-md`}
            onClick={(e: ReactMouseEvent<HTMLButtonElement>) => {
              e.preventDefault();
              e.stopPropagation();
              onConfirm?.();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
      <div 
        className="modal-backdrop fixed inset-0 cursor-pointer" 
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onCancel?.();
        }} 
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
};

export default ConfirmModal;
