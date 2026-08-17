import React, { useEffect, useRef } from 'react';

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
}) => {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  return (
    <dialog ref={dialogRef} className="modal" onClose={onCancel}>
      <div className="modal-box">
        <h3 className={`font-bold text-lg ${isError ? 'text-error' : 'text-primary'}`}>{title}</h3>
        <p className="py-4 text-sm opacity-60 whitespace-pre-wrap">
          {message}
        </p>
        <div className="modal-action">
          {!hideCancel && (
            <button className="btn btn-ghost btn-sm" onClick={(e) => {
              e.preventDefault();
              onCancel();
            }}>{cancelText}</button>
          )}
          <button 
            className={`btn ${isError ? 'btn-error' : 'btn-primary'} btn-sm`} 
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={(e) => {
          e.preventDefault();
          onCancel();
        }}>close</button>
      </form>
    </dialog>
  );
};

export default ConfirmModal;
