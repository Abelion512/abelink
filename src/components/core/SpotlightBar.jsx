import React, { useState, useEffect, useRef } from 'react'
import { FaMicrophone, FaMicrophoneSlash, FaPaperPlane, FaExpand, FaTimes } from 'react-icons/fa'
import { useChat } from '../../contexts/useChat'
import { useVAD } from '../../hooks/useVAD'

export default function SpotlightBar({ onExpandDashboard }) {
  const { handlePlanningCommand, isLoading, isAgentBusy, chatData = [] } = useChat()
  const [text, setText] = useState('')
  const [lastAnswer, setLastAnswer] = useState('')
  const inputRef = useRef(null)

  // Voice VAD handler
  const {
    isRecording,
    isProcessing,
    audioIntensity,
    toggleRecording,
    cancelRecording,
    toastMessage
  } = useVAD({
    onTranscript: (transcript) => {
      if (transcript && transcript.trim()) {
        handleSend(transcript.trim())
      }
    }
  })

  // Mic hanya dari tombol mic (user gesture); auto-start dihapus agar
  // getUserMedia tanpa gesture/pipewire stall tidak menggantung saat mount.
  useEffect(() => {
    inputRef.current?.focus()
    return () => {
      cancelRecording()
    }
  }, [])

  // Keyboard shortcut handler (Escape to hide / return to dashboard)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelRecording()
        if (window.api?.windowSetMode) {
          window.api.windowSetMode('dashboard')
        }
        onExpandDashboard?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cancelRecording, onExpandDashboard])

  // Ambil respons asisten terbaru untuk mini ticker
  useEffect(() => {
    if (chatData && chatData.length > 0) {
      const last = chatData[chatData.length - 1]
      if (last && (last.role === 'assistant' || last.role === 'model') && last.content) {
        setLastAnswer(last.content.replace(/\[.*?\]/g, '').trim())
      }
    }
  }, [chatData])

  // Interupsi cerdas: saat user mengetik, matikan mic agar tidak bentrok suara ketikan
  const handleInputChange = (e) => {
    const val = e.target.value
    setText(val)
    if (isRecording) {
      cancelRecording()
    }
  }

  const handleSend = async (contentToSend) => {
    const query = (contentToSend || text).trim()
    if (!query) return

    setText('')
    if (isRecording) cancelRecording()

    try {
      await handlePlanningCommand(query)
    } catch (err) {
      console.error('[SpotlightBar] Gagal eksekusi perintah:', err)
    }
  }

  const handleFormSubmit = (e) => {
    e.preventDefault()
    handleSend()
  }

  const isBusy = isLoading || isAgentBusy || isProcessing

  return (
    <div
      className="w-[660px] h-[76px] rounded-xl bg-neutral-900/85 backdrop-blur-2xl border border-primary/30 shadow-[0_16px_40px_rgba(0,0,0,0.85),0_0_20px_rgba(10,132,255,0.15)] flex items-center px-4 gap-3 select-none transition-all duration-300 pointer-events-auto"
      data-tauri-drag-region
    >
      {/* Tombol Mic / Visualizer */}
      <button
        type="button"
        onClick={toggleRecording}
        disabled={isBusy}
        className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0 ${
          isRecording
            ? 'bg-primary text-white shadow-[0_0_15px_rgba(10,132,255,0.6)]'
            : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10'
        }`}
        title={isRecording ? 'Sedang mendengarkan (klik untuk jeda)' : 'Nyalakan mic'}
        aria-label={isRecording ? 'Sedang mendengarkan (klik untuk jeda)' : 'Nyalakan mic'}
      >
        {isRecording ? (
          <>
            <span
              className="absolute inset-0 rounded-xl bg-info animate-ping opacity-30"
              style={{ transform: `scale(${1 + Math.min(audioIntensity * 2, 0.4)})` }}
            />
            <FaMicrophone size={16} className="relative z-10 animate-pulse" />
          </>
        ) : (
          <FaMicrophoneSlash size={16} />
        )}
      </button>

      {/* Area Tengah: Input Text atau Mini Ticker saat berpikir/menjawab */}
      <div className="flex-1 min-w-0 flex flex-col justify-center h-full">
        <form onSubmit={handleFormSubmit} className="w-full flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={handleInputChange}
            placeholder={
              isRecording
                ? 'Mendengarkan suara... (bicara langsung atau mulai ketik)'
                : isBusy
                ? 'Abelink sedang memproses...'
                : 'Ketik pesan atau klik mic untuk bicara...'
            }
            disabled={isBusy}
            className="w-full bg-transparent text-sm text-white placeholder-white/40 focus:outline-none font-medium truncate"
          />
        </form>

        {/* Mini Ticker: status suara, toast, atau potongan jawaban */}
        <div className="text-[11px] truncate flex items-center gap-1.5 mt-0.5">
          {toastMessage ? (
            <span className="text-amber-400 font-medium">{toastMessage}</span>
          ) : isProcessing ? (
            <span className="text-info animate-pulse font-medium">Mentranskrip suara...</span>
          ) : isBusy ? (
            <span className="text-info animate-pulse font-medium">Abelink sedang merespons...</span>
          ) : lastAnswer ? (
            <span className="text-white/60 truncate">
              <strong className="text-info font-semibold mr-1">Abelink:</strong>
              {lastAnswer}
            </span>
          ) : (
            <span className="text-white/60">Tekan Enter untuk kirim, Esc untuk keluar</span>
          )}
        </div>
      </div>

      {/* Tombol Aksi Kanan */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Tombol Kirim Teks jika ada input */}
        {text.trim() && (
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={isBusy}
            className="w-8 h-8 rounded-lg bg-primary hover:bg-primary/80 text-white flex items-center justify-center transition-colors"
            title="Kirim (Enter)"
          aria-label="Kirim (Enter)"
          >
            <FaPaperPlane size={12} />
          </button>
        )}

        {/* Tombol Buka Dashboard Penuh */}
        <button
          type="button"
          onClick={() => {
            cancelRecording()
            if (window.api?.windowSetMode) {
              window.api.windowSetMode('dashboard')
            }
            onExpandDashboard?.()
          }}
          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition-colors"
          title="Buka Dashboard Penuh"
          aria-label="Buka Dashboard Penuh"
        >
          <FaExpand size={13} />
        </button>

        {/* Tombol Tutup / Sembunyi */}
        <button
          type="button"
          onClick={() => {
            cancelRecording()
            if (window.api?.windowSetMode) {
              window.api.windowSetMode('dashboard')
            }
            onExpandDashboard?.()
          }}
          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-400 flex items-center justify-center transition-colors"
          title="Tutup (Esc)"
          aria-label="Tutup (Esc)"
        >
          <FaTimes size={13} />
        </button>
      </div>
    </div>
  )
}
