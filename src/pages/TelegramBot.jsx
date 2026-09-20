import React, { useRef, useEffect, useState } from 'react'
import { useTelegramBot } from '../hooks/telegram/useTelegramBot'
import {
  Send,
  Settings,
  Power,
  Square,
  X
} from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { CodeBlock } from '../components/Chat/CodeBlock'
import { MobiusLoader } from '../components/core/MobiusLoader'
import { getAllConfig, saveConfiguration } from '../api/db'

const TelegramBot = () => {
  const { status, messages, isThinking, currentSender, startBot, stopBot } = useTelegramBot()

  const [tokenInput, setTokenInput] = useState('')
  const [adminIdsInput, setAdminIdsInput] = useState('')
  const [showConfigModal, setShowConfigModal] = useState(false)
  const messagesEndRef = useRef(null)
  const hasAutoConnectedRef = useRef(false)

  const loadConfigData = async () => {
    try {
      const configs = await getAllConfig()
      const config = configs[0] || {}
      if (config.tgBotToken) {
        setTokenInput(config.tgBotToken)
      }
      if (config.tgAdminIds) {
        setAdminIdsInput(config.tgAdminIds)
      }
      return config
    } catch (err) {
      console.error('[TelegramBot] Error loading config:', err)
      return {}
    }
  }

  useEffect(() => {
    loadConfigData().then(async (config) => {
      if (config.tgBotToken && !hasAutoConnectedRef.current) {
        hasAutoConnectedRef.current = true
        const res = await window.api?.tgGetStatus()
        if (!res || res.status === 'disconnected') {
          startBot(config.tgBotToken)
        }
      }
    })
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 150)
    return () => clearTimeout(timeout)
  }, [messages, isThinking])

  const handleSaveConfigAndConnect = async () => {
    const token = tokenInput.trim()
    const adminIds = adminIdsInput.trim()

    if (!token) {
      alert('Silakan masukkan Telegram Bot Token terlebih dahulu.')
      return
    }

    try {
      const configs = await getAllConfig()
      const currentCfg = configs[0] || {}
      const newCfg = { ...currentCfg, tgBotToken: token, tgAdminIds: adminIds }
      await saveConfiguration(newCfg)
      if (window.api?.syncConfig) {
        window.api.syncConfig(newCfg)
      }
      setShowConfigModal(false)
      startBot(token)
    } catch (e) {
      console.error('[TelegramBot] Gagal simpan pengaturan Telegram:', e)
      alert('Gagal menyimpan pengaturan: ' + e.message)
    }
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-[#161618] text-white select-none">
      {/* Header with Safe Area Gutter */}
      <div className="h-14 pl-16 pr-28 border-b border-white/10 flex items-center justify-between bg-[#1c1c1e]/80 backdrop-blur-xl shrink-0 z-10 select-none">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0a84ff]/20 border border-[#0a84ff]/30 flex items-center justify-center text-[#0a84ff]">
            <Send size={18} />
          </div>
          <div>
            <h1 className="font-semibold text-sm text-white">Telegram Relay Monitor</h1>
            <div className="flex items-center gap-2 text-[11px] text-white/50">
              <span
                className={`w-2 h-2 rounded-full ${
                  status === 'connected'
                    ? 'bg-[#30d158] shadow-[0_0_8px_rgba(48,209,88,0.6)]'
                    : status === 'connecting'
                      ? 'bg-[#ffbd2e] animate-pulse'
                      : 'bg-[#ff453a]'
                }`}
              />
              <span className="capitalize">{status}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              loadConfigData()
              setShowConfigModal(true)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all text-xs font-medium"
            title="Buka Pengaturan Telegram Token & Admin"
          >
            <Settings size={14} />
            <span>Pengaturan</span>
          </button>

          {status === 'disconnected' && (
            <button
              type="button"
              onClick={handleSaveConfigAndConnect}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0a84ff] hover:bg-[#0a84ff]/90 text-white transition-all text-xs font-medium shadow-md shadow-[#0a84ff]/20"
            >
              <Power size={14} />
              <span>Hubungkan</span>
            </button>
          )}

          {(status === 'connected' || status === 'connecting') && (
            <button
              type="button"
              onClick={stopBot}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#ff453a] hover:bg-[#ff453a]/90 text-white transition-all text-xs font-medium shadow-md shadow-[#ff453a]/20"
            >
              <Square size={13} className="fill-current" />
              <span>Putuskan</span>
            </button>
          )}
        </div>
      </div>

      {/* Content Area: Apple Messages Console */}
      <div className="flex-1 overflow-y-auto w-full p-6 flex flex-col gap-4 custom-scrollbar">
        {status === 'disconnected' && (
          <div className="rounded-3xl bg-[#1c1c1e]/60 border border-white/10 p-8 max-w-md mx-auto my-auto text-center space-y-4 shadow-2xl backdrop-blur-xl">
            <div className="w-14 h-14 rounded-2xl bg-[#0a84ff]/20 border border-[#0a84ff]/30 flex items-center justify-center text-[#0a84ff] mx-auto">
              <Send size={26} />
            </div>
            <h2 className="text-base font-semibold text-white">Hubungkan Bot Telegram</h2>
            <p className="text-xs text-white/50 leading-relaxed">
              Masukkan API Bot Token dari <b>@BotFather</b> di Telegram untuk menghubungkan agen ini
              dengan obrolan Telegram kamu.
            </p>
            <div className="space-y-3 text-left">
              <div>
                <label className="text-[11px] font-medium text-white/60 block mb-1">Bot Token</label>
                <input
                  type="password"
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#0a84ff]/60 text-xs text-white font-mono outline-none transition-all placeholder:text-white/30"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-white/60 block mb-1">
                  Telegram Admin Usernames
                </label>
                <input
                  type="text"
                  placeholder="@username1, @username2"
                  value={adminIdsInput}
                  onChange={(e) => setAdminIdsInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#0a84ff]/60 text-xs text-white font-mono outline-none transition-all placeholder:text-white/30"
                />
                <span className="text-[10px] text-white/40 block mt-1">
                  Pisahkan dengan koma jika ada lebih dari satu username.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveConfigAndConnect}
              className="w-full py-2.5 rounded-xl bg-[#0a84ff] text-white hover:bg-[#0a84ff]/90 text-xs font-semibold shadow-lg shadow-[#0a84ff]/20 transition-all flex items-center justify-center gap-2"
            >
              <Power size={14} />
              <span>Simpan &amp; Hubungkan Bot</span>
            </button>
          </div>
        )}

        {status === 'connected' && messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-white/40 select-none space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#0a84ff]">
              <Send size={24} />
            </div>
            <p className="text-sm font-semibold text-white">Menunggu Pesan Masuk</p>
            <p className="text-xs text-white/40">Bot aktif terhubung. Percakapan Telegram akan muncul di sini.</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isOutgoing = msg.type === 'outgoing'
          return (
            <div
              key={idx}
              className={`flex flex-col max-w-xl ${isOutgoing ? 'ml-auto items-end' : 'mr-auto items-start'} animate-fade-in space-y-1`}
            >
              <div className="text-[10px] text-white/40 px-2 flex items-center gap-2">
                <span>{msg.sender}</span>
                <span>•</span>
                <time>{msg.time}</time>
              </div>

              <div
                className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                  isOutgoing
                    ? 'bg-[#0a84ff] text-white rounded-tr-sm shadow-md'
                    : 'bg-[#1c1c1e] text-white/90 border border-white/10 rounded-tl-sm'
                }`}
              >
                <div className="custom-markdown overflow-x-hidden">
                  <Markdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[
                      [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]
                    ]}
                    components={{
                      code: CodeBlock
                    }}
                  >
                    {isOutgoing ? msg.reply : msg.text}
                  </Markdown>
                  {isOutgoing && msg.toolsUsed && msg.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {msg.toolsUsed.map((tool, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-mono"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {isThinking && (
          <div className="flex flex-col ml-auto items-end animate-fade-in space-y-1">
            <div className="text-[10px] text-white/40 px-2">
              Abelink sedang memproses pesan {currentSender}...
            </div>
            <div className="p-3 rounded-2xl bg-[#0a84ff]/20 border border-[#0a84ff]/30 text-[#0a84ff]">
              <MobiusLoader size={16} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Telegram Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#1c1c1e] border border-white/15 rounded-3xl max-w-lg w-full p-6 text-white shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <h3 className="font-semibold text-sm flex items-center gap-2 text-white">
                <Settings className="text-[#0a84ff]" size={16} /> Pengaturan Telegram Bot
              </h3>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-all"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4 text-left">
              <div>
                <label className="text-[11px] font-medium text-white/60 block mb-1">Bot Token</label>
                <input
                  type="password"
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#0a84ff]/60 text-xs text-white font-mono outline-none transition-all placeholder:text-white/30"
                />
                <span className="text-[10px] text-white/40 block mt-1">
                  Dapatkan token resmi dari <b>@BotFather</b> di Telegram.
                </span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-white/60 block mb-1">
                  Telegram Admin Usernames
                </label>
                <input
                  type="text"
                  placeholder="@username1, @username2"
                  value={adminIdsInput}
                  onChange={(e) => setAdminIdsInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-[#0a84ff]/60 text-xs text-white font-mono outline-none transition-all placeholder:text-white/30"
                />
                <span className="text-[10px] text-white/40 block mt-1">
                  Hanya akun ini yang dapat memberikan perintah langsung ke bot.
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-3.5 py-1.5 text-xs text-white/60 hover:text-white transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveConfigAndConnect}
                className="px-4 py-2 rounded-xl bg-[#0a84ff] text-white hover:bg-[#0a84ff]/90 text-xs font-semibold shadow-md shadow-[#0a84ff]/20 transition-all"
              >
                Simpan &amp; Hubungkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TelegramBot
