import React, { useState, useEffect } from 'react'
import { FaStop, FaCircleNotch } from 'react-icons/fa'
import { useChat } from '../../contexts/useChat'

export default function AutomationHUD() {
  const { handleStop } = useChat() || {}
  const [activeAutomation, setActiveAutomation] = useState(null)

  useEffect(() => {
    const handleStart = (e) => {
      setActiveAutomation(e.detail || { action: 'Otomasi aktif' })
    }
    const handleEnd = () => {
      setActiveAutomation(null)
    }
    const handleEmergency = () => {
      setActiveAutomation(null)
    }

    window.addEventListener('mark:automation-start', handleStart)
    window.addEventListener('mark:automation-end', handleEnd)
    window.addEventListener('mark:emergency-stop', handleEmergency)

    return () => {
      window.removeEventListener('mark:automation-start', handleStart)
      window.removeEventListener('mark:automation-end', handleEnd)
      window.removeEventListener('mark:emergency-stop', handleEmergency)
    }
  }, [])

  if (!activeAutomation) return null

  const handleEmergencyStop = () => {
    try {
      handleStop?.()
    } catch (e) {
      console.error('[AutomationHUD] handleStop error:', e)
    }
    if (window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('mark:emergency-stop'))
    }
    setActiveAutomation(null)
  }

  const label =
    typeof activeAutomation?.action === 'string'
      ? activeAutomation.action
      : 'Otomasi sedang berjalan...'

  return (
    <div className="fixed top-3.5 right-20 z-[9999] flex items-center gap-2.5 animate-fade-in pointer-events-auto select-none">
      {/* Status Pill */}
      <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-900/90 backdrop-blur-xl border border-cyan-500/40 shadow-[0_4px_20px_rgba(0,0,0,0.6),0_0_15px_rgba(6,182,212,0.2)] text-xs text-cyan-300 font-medium">
        <FaCircleNotch className="animate-spin text-cyan-400" size={12} />
        <span className="tracking-wide">{label}</span>
      </div>

      {/* Emergency Stop Button */}
      <button
        type="button"
        onClick={handleEmergencyStop}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-bold tracking-wider uppercase shadow-[0_4px_15px_rgba(220,38,38,0.5)] border border-white/20 transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
        title="Hentikan eksekusi agen secara paksa (Ctrl+Shift+S)"
      >
        <FaStop size={10} />
        <span>Paksa Berhenti</span>
      </button>
    </div>
  )
}
