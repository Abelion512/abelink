import React, { useState, useEffect, useRef } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { sharedMarkdownComponents } from '../Chat/SharedMarkdown'
import { subagentStore } from '../../api/subagent/subagentStore'
import {
  Bot,
  Send,
  Square,
  Terminal,
  Brain,
  X,
  Clock,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react'
import { runSubagentTurn, killSubagentExecution } from '../../api/subagent/subagentExecutor'
import { useConfirm } from '../../hooks/useConfirm'
import { getAllConfig } from '../../api/db'
import { stripAgentTags } from '../../utils/messageTags'

// Komponen Single Unified Bubble untuk Sub-Agent
function SubagentUnifiedBubble({ turn, subagentName, isRunning }) {
  const [isThoughtOpen, setIsThoughtOpen] = useState(false)
  const [isStepsOpen, setIsStepsOpen] = useState(false)
  const [openStepIdx, setOpenStepIdx] = useState(null)

  return (
    <div className="chat chat-start animate-fade-in">
      <div className="chat-image avatar placeholder">
        <div className="w-8 h-8 rounded-2xl text-[10px] font-bold shadow-md flex items-center justify-center bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          SUB
        </div>
      </div>
      <div className="chat-header text-[11px] text-zinc-400 mb-1 flex items-center gap-1.5">
        <span>{subagentName}</span>
        <span className="text-[10px] text-zinc-500 font-mono">
          {new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="chat-bubble bg-white/[0.03] text-zinc-200 border border-white/[0.08] shadow-xl max-w-[88%] rounded-2xl p-4 space-y-3.5">
        {/* 1. Dropdown Thought (Reasoning Analisis) */}
        {turn.thoughts && turn.thoughts.length > 0 && (
          <div className="bg-cyan-950/20 rounded-xl border border-cyan-500/20 overflow-hidden text-xs select-none shadow-sm">
            <button
              type="button"
              onClick={() => setIsThoughtOpen(!isThoughtOpen)}
              className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-cyan-500/5 transition-colors text-left"
            >
              <div className="flex items-center gap-2 font-medium text-cyan-400 text-[11px]">
                <Brain className="w-3.5 h-3.5 shrink-0" />
                <span>Pemikiran Sub-Agent</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                <span>{isThoughtOpen ? 'Tutup' : 'Lihat'}</span>
                {isThoughtOpen ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </div>
            </button>
            {isThoughtOpen && (
              <div className="p-3.5 bg-black/40 border-t border-cyan-500/20 space-y-2 text-[11px] text-zinc-300 whitespace-pre-wrap leading-relaxed">
                <div className="border-l-2 border-cyan-400/60 pl-2.5 py-0.5">
                  {turn.thoughts[turn.thoughts.length - 1] || ''}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Dropdown Langkah Eksekusi (Tools) */}
        {turn.steps && turn.steps.length > 0 && (
          <div className="bg-black/30 rounded-xl border border-white/[0.08] overflow-hidden text-xs select-none shadow-sm">
            <button
              type="button"
              onClick={() => setIsStepsOpen(!isStepsOpen)}
              className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-white/[0.03] transition-colors text-left"
            >
              <div className="flex items-center gap-2 font-medium text-amber-400 text-[11px]">
                <Terminal className="w-3.5 h-3.5 shrink-0" />
                <span>Langkah Eksekusi ({turn.steps.length})</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                <span>{isStepsOpen ? 'Tutup' : 'Lihat'}</span>
                {isStepsOpen ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </div>
            </button>

            {isStepsOpen && (
              <div className="p-3.5 bg-black/40 border-t border-white/[0.08] space-y-2 font-mono text-[11px]">
                {turn.steps.map((step, idx) => {
                  const isObsOpen = openStepIdx === idx
                  return (
                    <div
                      key={idx}
                      className="space-y-1 bg-white/[0.02] p-2 rounded-lg border border-white/[0.05]"
                    >
                      <div
                        onClick={() => step.observation && setOpenStepIdx(isObsOpen ? null : idx)}
                        className={`flex items-start gap-1.5 py-0.5 ${step.observation ? 'cursor-pointer hover:text-cyan-300 transition-colors' : ''}`}
                      >
                        <span className="text-amber-400/80 font-semibold shrink-0">{idx + 1}.</span>
                        <span className="text-cyan-400 font-semibold shrink-0">{step.tool}</span>
                        <span className="text-zinc-500 shrink-0">:</span>
                        <span
                          className={`text-zinc-300 break-all flex-1 ${isObsOpen ? '' : 'truncate'}`}
                        >
                          {step.query || ''}
                        </span>
                        {step.observation &&
                          (isObsOpen ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          ))}
                      </div>

                      {isObsOpen && step.observation && (
                        <div className="p-2.5 bg-black/60 rounded-lg text-zinc-300 whitespace-pre-wrap break-all text-[10px] max-h-44 overflow-y-auto mt-1 border border-white/[0.08] font-mono">
                          {step.observation.replace(/^\[OBSERVATION\]:\s*/, '')}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 3. Final Content / Answer or Loading */}
        {turn.answer ? (
          <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed font-normal pt-1 text-zinc-200">
            <Markdown remarkPlugins={[remarkGfm]} components={sharedMarkdownComponents}>
              {stripAgentTags(turn.answer)}
            </Markdown>
          </div>
        ) : isRunning ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400 py-1 font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
            <span className="text-[11px]">Memproses langkah...</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// Helper untuk mengelompokkan pesan mentah menjadi satu bubble per giliran
function groupSubagentMessages(rawMessages) {
  const grouped = []
  let currentSubTurn = null

  for (const msg of rawMessages) {
    if (msg.sender === 'user' || msg.sender === 'mark') {
      if (currentSubTurn) {
        grouped.push(currentSubTurn)
        currentSubTurn = null
      }
      grouped.push({
        type: 'dialogue',
        id: msg.id,
        sender: msg.sender,
        content: msg.content,
        timestamp: msg.timestamp
      })
    } else if (msg.sender === 'subagent') {
      let parsed = {}
      try {
        parsed = typeof msg.content === 'object' ? msg.content : JSON.parse(msg.content)
      } catch (e) {
        parsed = { answer: msg.content }
      }

      const thought = msg.thought || parsed.thought
      const action = msg.action || parsed.action
      const answer = parsed.answer || (action ? null : msg.content)

      if (!currentSubTurn) {
        currentSubTurn = {
          type: 'subagent_turn',
          id: msg.id,
          sender: 'subagent',
          timestamp: msg.timestamp,
          thoughts: [],
          steps: [],
          answer: null
        }
      }

      if (thought && !currentSubTurn.thoughts.includes(thought)) {
        currentSubTurn.thoughts.push(thought)
      }

      if (action) {
        const acts = Array.isArray(action) ? action : [action]
        acts.forEach((act) => {
          if (act?.tool) {
            currentSubTurn.steps.push({
              tool: act.tool,
              query: act.query || '',
              observation: null
            })
          }
        })
      }

      if (answer) {
        currentSubTurn.answer = answer
      }
    } else if (msg.sender === 'tool') {
      if (currentSubTurn && currentSubTurn.steps.length > 0) {
        const lastStepWithoutObs = [...currentSubTurn.steps].reverse().find((s) => !s.observation)
        if (lastStepWithoutObs) {
          lastStepWithoutObs.observation = msg.content
        } else {
          currentSubTurn.steps[currentSubTurn.steps.length - 1].observation = msg.content
        }
      } else {
        if (!currentSubTurn) {
          currentSubTurn = {
            type: 'subagent_turn',
            id: msg.id,
            sender: 'subagent',
            timestamp: msg.timestamp,
            thoughts: [],
            steps: [{ tool: 'tool-execution', query: '', observation: msg.content }],
            answer: null
          }
        }
      }
    }
  }

  if (currentSubTurn) {
    grouped.push(currentSubTurn)
  }

  return grouped
}

export default function SubagentIntercom({ subagentId, onClose }) {
  const [subagent, setSubagent] = useState(null)
  const [messages, setMessages] = useState([])
  const [config, setConfig] = useState({})
  const [inputText, setInputText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false)

  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)
  const isAutoScrollRef = useRef(true)
  const prevMsgCountRef = useRef(0)

  const loadData = async () => {
    if (!subagentId) return
    try {
      const sub = await subagentStore.getSubagent(subagentId)
      const msgs = await subagentStore.getMessages(subagentId)
      setSubagent(sub)
      setMessages(msgs || [])
    } catch (err) {
      console.error('[SubagentIntercom] Load error:', err)
    }
  }

  const loadConfig = async () => {
    try {
      const data = await getAllConfig()
      if (data && data.length > 0) setConfig(data[0] || {})
    } catch (err) {
      console.error('[SubagentIntercom] Config load error:', err)
    }
  }

  const scrollToBottom = (behavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior })
      isAutoScrollRef.current = true
      setShowScrollBottomBtn(false)
    }
  }

  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60
    isAutoScrollRef.current = isAtBottom
    setShowScrollBottomBtn(!isAtBottom)
  }

  // Reset scroll dan muat data ketika subagentId berubah
  useEffect(() => {
    prevMsgCountRef.current = 0
    isAutoScrollRef.current = true
    setShowScrollBottomBtn(false)
    loadConfig()
    loadData().then(() => {
      setTimeout(() => scrollToBottom('auto'), 50)
    })
    const interval = setInterval(loadData, 1000)
    return () => clearInterval(interval)
  }, [subagentId])

  // Hanya auto-scroll jika ada pesan baru DAN user sedang berada di posisi bawah
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      if (isAutoScrollRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
      prevMsgCountRef.current = messages.length
    }
  }, [messages.length])

  const { confirm, ModalComponent } = useConfirm()

  const handleSendMessage = async (e) => {
    e?.preventDefault()
    if (!inputText.trim() || isSending) return

    const textToSend = inputText.trim()
    setInputText('')
    setIsSending(true)
    isAutoScrollRef.current = true
    setShowScrollBottomBtn(false)

    try {
      await runSubagentTurn(subagentId, textToSend, 'user')
      await loadData()
      setTimeout(() => scrollToBottom('smooth'), 50)
    } catch (err) {
      console.error('[SubagentIntercom] Send error:', err)
    } finally {
      setIsSending(false)
    }
  }

  const handleKill = async () => {
    const result = await confirm({
      title: 'Hentikan Eksekusi Sub-Agent',
      message: 'Apakah kamu yakin ingin menghentikan eksekusi sub-agent ini secara paksa?',
      isError: true,
      confirmText: 'Hentikan',
      cancelText: 'Batal'
    })
    if (result?.isConfirmed) {
      killSubagentExecution(subagentId)
      loadData()
    }
  }

  if (!subagent) return null

  const isRunning = subagent.status === 'running'
  const groupedTurns = groupSubagentMessages(messages)

  return (
    <div className="flex flex-col h-full bg-[#0a0e0c]/90 rounded-2xl overflow-hidden select-none border border-white/[0.08] relative font-['Poppins',sans-serif]">
      {/* Header Intercom */}
      <div className="p-3.5 bg-black/40 backdrop-blur-xl border-b border-white/[0.08] flex items-center justify-between flex-none z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-xs tracking-wide text-white">{subagent.name}</h3>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wider ${
                  isRunning
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 animate-pulse'
                    : subagent.status === 'idle'
                      ? 'bg-white/[0.05] text-zinc-400 border border-white/[0.1]'
                      : subagent.status === 'failed'
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {subagent.status}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">[{subagent.id}]</span>
            </div>
            <p className="text-[11px] text-zinc-400">{subagent.role}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              onClick={handleKill}
              className="px-2.5 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs flex items-center gap-1 transition-all"
              title="Hentikan Paksa"
            >
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center transition-all"
              title="Tutup Panel"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Goal & Mission Info Strip */}
      <div className="px-4 py-2.5 bg-black/20 border-b border-white/[0.05] text-xs flex items-center justify-between gap-4 flex-none z-10">
        <div className="flex items-center gap-2 truncate">
          <span className="font-semibold text-cyan-400 shrink-0 uppercase text-[10px] tracking-wider">
            Mission Goal:
          </span>
          <span className="text-zinc-300 truncate font-normal">{subagent.goal}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono shrink-0">
          <Clock className="w-3 h-3" />
          <span>Turns: {subagent.turnCount || 0}</span>
        </div>
      </div>

      {/* Message Feed Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 p-4 overflow-y-auto space-y-4 relative"
      >
        {groupedTurns.map((item, idx) => {
          if (item.type === 'subagent_turn') {
            const isLastTurn = idx === groupedTurns.length - 1
            return (
              <SubagentUnifiedBubble
                key={item.id}
                turn={item}
                subagentName={subagent.name}
                isRunning={isRunning && isLastTurn}
              />
            )
          }

          const isUser = item.sender === 'user'

          return (
            <div key={item.id} className="chat chat-end animate-fade-in">
              <div className="chat-image avatar placeholder">
                <div
                  className={`w-7 h-7 rounded-xl text-[10px] font-bold shadow-md flex items-center justify-center ${
                    isUser
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-cyan-500/10'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-emerald-500/10'
                  }`}
                >
                  {isUser ? 'USER' : 'ABELINK'}
                </div>
              </div>
              <div className="chat-header text-[11px] text-zinc-400 mb-1 flex items-center gap-1.5">
                <span className={isUser ? 'text-cyan-400 font-medium' : 'text-emerald-400 font-medium'}>
                  {isUser ? config.ownerName?.trim() || 'User' : 'Lead Agent (Abelink)'}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {new Date(item.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              <div
                className={`chat-bubble text-xs leading-relaxed max-w-[85%] rounded-2xl shadow-md p-3.5 ${
                  isUser
                    ? 'bg-cyan-950/40 text-cyan-100 border border-cyan-500/30'
                    : 'bg-emerald-950/40 text-emerald-100 border border-emerald-500/30'
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed font-normal">
                  {stripAgentTags(item.content)}
                </div>
              </div>
            </div>
          )
        })}

        {/* Initial Loading State jika belum ada bubble giliran sub-agent yang aktif */}
        {isRunning &&
          (groupedTurns.length === 0 ||
            groupedTurns[groupedTurns.length - 1]?.type !== 'subagent_turn') && (
            <div className="chat chat-start animate-fade-in">
              <div className="chat-image avatar placeholder">
                <div className="w-7 h-7 rounded-xl text-[10px] font-bold shadow-md flex items-center justify-center bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  SUB
                </div>
              </div>
              <div className="chat-header text-[11px] text-zinc-400 mb-1">
                <span>{subagent.name}</span>
              </div>
              <div className="chat-bubble bg-white/[0.03] text-zinc-200 border border-white/[0.08] text-xs flex items-center gap-2.5 py-2.5 px-4 shadow-md rounded-2xl">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span className="font-mono text-[11px] text-zinc-400">
                  Memproses langkah...
                </span>
              </div>
            </div>
          )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll-to-Bottom Button */}
      {showScrollBottomBtn && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-16 right-5 w-8 h-8 rounded-full bg-cyan-500 text-black shadow-lg shadow-cyan-500/30 flex items-center justify-center z-20 transition-all hover:bg-cyan-400"
          title="Scroll ke bawah"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      {/* User Intervention Whisper Input */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 bg-black/40 border-t border-white/[0.08] flex items-center gap-2 flex-none backdrop-blur-xl z-10"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            config.ownerName?.trim()
              ? `Ketik instruksi atau arahan langsung sebagai ${config.ownerName}...`
              : 'Ketik instruksi atau arahan langsung sebagai User...'
          }
          disabled={isSending}
          className="flex-1 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.1] focus:border-cyan-500/50 text-xs text-zinc-200 outline-none transition-all placeholder:text-zinc-600"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isSending}
          className="px-3.5 py-2 rounded-xl bg-cyan-500 text-black hover:bg-cyan-400 disabled:opacity-50 text-xs font-medium shadow-sm shadow-cyan-500/20 transition-all flex items-center gap-1.5 shrink-0"
        >
          {isSending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <>
              <Send className="w-3.5 h-3.5" /> Kirim
            </>
          )}
        </button>
      </form>

      {/* Confirmation Modal */}
      <ModalComponent />
    </div>
  )
}
