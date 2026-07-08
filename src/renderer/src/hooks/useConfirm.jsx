import React, { useState } from 'react'
import ConfirmModal from '../components/core/ConfirmModal'

export const useConfirm = () => {
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    isError: false,
    confirmText: 'Ya',
    cancelText: 'Batal'
  })
  const [promiseRef, setPromiseRef] = useState(null)

  const confirm = (config) => {
    return new Promise((resolve) => {
      setPromiseRef({ resolve })
      setModalConfig({
        isOpen: true,
        title: config.title || 'Konfirmasi',
        message: config.message || config.text || '',
        isError: config.isError || config.icon === 'error' || config.icon === 'warning' || false,
        confirmText: config.confirmText || config.confirmButtonText || 'Ya',
        cancelText: config.cancelText || config.cancelButtonText || 'Batal',
        hideCancel:
          config.hideCancel || (!config.showCancelButton && config.showCancelButton !== undefined)
            ? true
            : false
      })
    })
  }

  const handleConfirm = () => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }))
    if (promiseRef) promiseRef.resolve({ isConfirmed: true })
  }

  const handleCancel = () => {
    setModalConfig((prev) => ({ ...prev, isOpen: false }))
    if (promiseRef) promiseRef.resolve({ isConfirmed: false })
  }

  const ModalComponent = () => (
    <ConfirmModal
      isOpen={modalConfig.isOpen}
      title={modalConfig.title}
      message={modalConfig.message}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      confirmText={modalConfig.confirmText}
      cancelText={modalConfig.cancelText}
      isError={modalConfig.isError}
      hideCancel={modalConfig.hideCancel}
    />
  )
  return { confirm, ModalComponent }
}
