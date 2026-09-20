import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Search,
  Pin,
  ArrowLeft,
  Sparkles,
  Check,
  RotateCcw,
  Bot,
  Folder,
  PanelLeft
} from 'lucide-react'
import { useChat } from '../contexts/useChat'
import {
  getAllSessions,
  createSession,
  saveSession,
  deleteSession,
  renameSession,
  getChatData,
  setSessionWorkspace
} from '../api/db'
import ChatList from '../components/ChatList'
import InputBar from '../components/core/InputBar'
import { useConfirm } from '../hooks/useConfirm'
import { useManualCompaction } from '../hooks/useManualCompaction'

const ChatStudio = () => {
  const navigate = useNavigate()
  const chatContext = useChat()
  const {
    chatData: mainChatData,
    setChatData: setMainChatData,
    handlePlanningCommand,
    isLoading: isMainLoading,
    isAgentBusy,
    runningSessionId,
    runningSessionIds = [],
    handleStop,
    isRecording,
    isProcessing,
    audioIntensity,
    startRecording,
    stopRecording,
    inputSource
  } = chatContext || {}

  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(1)
  const [activeSessionData, setActiveSessionData] = useState([])
  const [visibleMessageCount, setVisibleMessageCount] = useState(40)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingSessionId, setEditingSessionId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [isLocalLoading, setIsLocalLoading] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024)

  const messagesContainerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const localAbortControllerRef = useRef(null)
  const { confirm, ModalComponent } = useConfirm()

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false)
      } else {
        setIsSidebarOpen(true)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setIsSidebarOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const loadAllSessions = async () => {
    try {
      const list = await getAllSessions()
      setSessions(list || [])
    } catch (e) {
      console.error('Error loading sessions:', e)
    }
  }

  useEffect(() => {
    loadAllSessions()
  }, [])

  // Direct display pipeline: Main Thread uses mainChatData directly with 0ms lag
  const currentDisplayMessages = activeSessionId === 1 ? mainChatData || [] : activeSessionData

  // Kompaksi manual + tracker gauge (session compaction).
  useManualCompaction({
    messages: currentDisplayMessages,
    setMessages: (updater) => {
      if (Number(activeSessionId) === 1) setMainChatData?.(updater)
      else setActiveSessionData(updater)
    },
    sessionId: activeSessionId
  })

  const isCurrentLoading =
    runningSessionIds.map(Number).includes(Number(activeSessionId)) ||
    (Number(activeSessionId) === 1 && !runningSessionIds.length && (isMainLoading || isAgentBusy))

  // Sync active session data for custom sessions (id > 1)
  useEffect(() => {
    setVisibleMessageCount(30)
    if (activeSessionId === 1) return
    let isCancelled = false
    getChatData(activeSessionId).then((data) => {
      if (!isCancelled) {
        setActiveSessionData(data || [])
      }
    })
    return () => {
      isCancelled = true
    }
  }, [activeSessionId])

  // Real-time live background sync across sessions
  useEffect(() => {
    const handleSessionUpdate = (e) => {
      if (e.detail && e.detail.sessionId === activeSessionId) {
        setActiveSessionData(e.detail.data || [])
      }
    }
    window.addEventListener('session-updated', handleSessionUpdate)
    return () => {
      window.removeEventListener('session-updated', handleSessionUpdate)
    }
  }, [activeSessionId])

  const lastMessage = currentDisplayMessages[currentDisplayMessages.length - 1]
  const lastMessageContent = lastMessage?.content || ''
  const lastMessageIsThinking = !!lastMessage?.isThinking
  const isAutoScrollEnabledRef = useRef(true)

  const handleScroll = () => {
    const container = messagesContainerRef.current
    if (!container) return
    const { scrollTop, scrollHeight, clientHeight } = container
    // User is considered at bottom if within 80px
    isAutoScrollEnabledRef.current = scrollHeight - scrollTop - clientHeight < 80
  }

  const scrollToBottom = (behavior = 'auto') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior
      })
    }
  }

  // Auto scroll to bottom on session change
  useEffect(() => {
    isAutoScrollEnabledRef.current = true
    scrollToBottom('auto')
  }, [activeSessionId])

  // Direct stick-to-bottom without conflicting timers or layout thrashing
  useEffect(() => {
    if (isAutoScrollEnabledRef.current && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [
    currentDisplayMessages.length,
    lastMessageContent,
    lastMessageIsThinking,
    isCurrentLoading
  ])

  const handleCreateNewChat = async () => {
    try {
      const newSession = await createSession('Percakapan Baru', [])
      await loadAllSessions()
      setActiveSessionId(newSession.id)
      setActiveSessionData([])
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }

  const handleDeleteSessionClick = async (e, id) => {
    e.stopPropagation()
    if (id === 1) return

    const confirmed = await confirm({
      title: 'Hapus Sesi Obrolan',
      message: 'Apakah kamu yakin ingin menghapus sesi percakapan ini secara permanen?',
      confirmText: 'Hapus',
      confirmColor: 'btn-error'
    })

    if (confirmed?.isConfirmed) {
      await deleteSession(id)
      await loadAllSessions()
      if (activeSessionId === id) {
        setActiveSessionId(1)
      }
    }
  }

  const handleClearSessionChat = async (e, id) => {
    if (e?.stopPropagation) e.stopPropagation()
    const numId = Number(id)
    const isMain = numId === 1
    const target = sessions.find((s) => Number(s.id) === numId)
    const titleName = isMain ? (target?.title || 'Main Thread') : (target?.title || 'Sesi ini')

    const confirmed = await confirm({
      title: `Bersihkan Percakapan ${titleName}`,
      message: `Apakah kamu yakin ingin mengosongkan seluruh riwayat obrolan pada ${titleName}?`,
      confirmText: 'Bersihkan',
      confirmColor: 'btn-warning'
    })

    if (confirmed?.isConfirmed) {
      if (isMain) {
        setMainChatData?.([])
        await deleteSession(1)
      } else {
        setActiveSessionData([])
        await saveSession(numId, [])
      }
      await loadAllSessions()
    }
  }

  const handleStartRename = (e, session) => {
    e.stopPropagation()
    setEditingSessionId(session.id)
    setEditingTitle(session.title)
  }

  const handleSaveRename = async (id) => {
    if (editingTitle.trim()) {
      await renameSession(id, editingTitle.trim())
      await loadAllSessions()
    }
    setEditingSessionId(null)
  }

  const handleSelectSessionWorkspace = async () => {
    if (window.api && window.api.selectDirectory) {
      const selected = await window.api.selectDirectory()
      if (selected) {
        await setSessionWorkspace(activeSessionId, selected)
        setSessions((prev) =>
          prev.map((s) => (s.id === activeSessionId ? { ...s, workspaceRoot: selected } : s))
        )
      }
    }
  }

  const handleSendMessage = async (prompt) => {
    if (!prompt.trim()) return

    // Auto-update session title if it's default
    const currentSession = sessions.find((s) => s.id === activeSessionId)
    let newTitle = currentSession?.title
    if (newTitle === 'Percakapan Baru' && prompt.length > 0) {
      newTitle = prompt.slice(0, 30) + (prompt.length > 30 ? '...' : '')
      await renameSession(activeSessionId, newTitle)
      await loadAllSessions()
    }

    if (activeSessionId === 1) {
      handlePlanningCommand(prompt, false, false, {
        workspaceRoot: currentSession?.workspaceRoot
      })
    } else {
      handlePlanningCommand(prompt, false, false, {
        sessionId: activeSessionId,
        customChatData: activeSessionData,
        workspaceRoot: currentSession?.workspaceRoot
      })
    }
  }

  const handleStopSession = () => {
    if (handleStop) handleStop(activeSessionId)
    if (window.api && window.api.browserClose) {
      window.api.browserClose(activeSessionId === 1 ? 'default' : String(activeSessionId)).catch((e) => console.warn('browserClose gagal:', e?.message))
    }
    setIsLocalLoading(false)
  }

  const filteredSessions = sessions.filter((s) =>
    (s.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const activeSessionObj = sessions.find((s) => s.id === activeSessionId) || {
    id: 1,
    title: 'Main Thread'
  }

  return (
    <div className="h-screen w-screen pt-10 bg-base-300 flex flex-col overflow-hidden text-base-content select-none">
      {/* Top Navigation Bar */}
      <div
        className="h-14 px-5 border-b border-white/[0.08] flex items-center justify-between bg-base-200/60 backdrop-blur-2xl shrink-0 z-30 relative select-none"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <div
          className="flex items-center gap-3 pointer-events-auto"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn btn-ghost btn-sm btn-circle text-white/70 hover:text-white cursor-pointer"
            style={{ WebkitAppRegion: 'no-drag' }}
            title="Kembali ke Dashboard Utama"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className={`btn btn-ghost btn-sm btn-circle text-white/70 hover:text-white cursor-pointer ${
              isSidebarOpen ? 'bg-white/[0.08] text-white' : ''
            }`}
            style={{ WebkitAppRegion: 'no-drag' }}
            title={isSidebarOpen ? 'Tutup Panel Samping (Ctrl+B)' : 'Buka Panel Samping (Ctrl+B)'}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5 ml-1">
            <div className="w-7 h-7 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-sm">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-wide">Studio Percakapan</h2>
            </div>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div
          className="flex items-center gap-2 pointer-events-auto mr-32"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <button
            type="button"
            onClick={handleCreateNewChat}
            className="btn btn-sm btn-primary rounded-xl gap-2 font-medium shadow-md shadow-primary/20 cursor-pointer"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <Plus className="w-4 h-4" />
            Sesi Baru
          </button>
        </div>
      </div>

      {/* Workspace Area: Left List + Right Chat */}
      <div className="flex-1 flex overflow-hidden">
        {/* === LEFT SIDEBAR: SESSIONS LIST (Apple-style collapsible) === */}
        <div
          className={`transition-all duration-300 ease-in-out border-r border-white/[0.08] bg-base-200/40 backdrop-blur-2xl flex flex-col h-full shrink-0 overflow-hidden ${
            isSidebarOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 border-r-0 pointer-events-none'
          }`}
        >
          <div className="w-80 flex flex-col h-full">
            {/* Search bar */}
            <div className="p-3.5 border-b border-white/[0.06]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                <input
                  type="text"
                  placeholder="Cari obrolan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input input-sm bg-white/[0.04] border-white/[0.08] pl-9 w-full rounded-xl text-xs text-white placeholder:text-white/30 focus:border-primary/40 focus:bg-white/[0.06] transition-all"
                />
              </div>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
              {/* MAIN THREAD (CUSTOMIZABLE) */}
              {(() => {
                const mainSession = sessions.find((s) => Number(s.id) === 1) || { id: 1, title: 'Main Thread' }
                const isActive = Number(activeSessionId) === 1
                const isEditing = Number(editingSessionId) === 1
                const isMainRunning =
                  runningSessionIds.map(Number).includes(1) ||
                  (!runningSessionIds.length && (isMainLoading || isAgentBusy))

                return (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveSessionId(1)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setActiveSessionId(1)
                    }}
                    className={`w-full p-2.5 rounded-2xl text-left transition-all flex items-center justify-between group/main cursor-pointer ${
                      isActive
                        ? 'bg-primary/20 border border-primary/40 text-white shadow-sm'
                        : 'hover:bg-white/[0.04] text-white/70 hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isMainRunning
                            ? 'bg-warning animate-ping'
                            : 'bg-primary shadow-[0_0_8px_var(--color-primary)]'
                        }`}
                      />
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(1)
                            if (e.key === 'Escape') setEditingSessionId(null)
                          }}
                          autoFocus
                          className="input input-xs bg-base-300 border-primary/50 text-xs text-white p-1 h-6 w-full rounded-lg"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-semibold truncate">
                            {mainSession.title || 'Main Thread'}
                          </h4>
                          <p className="text-[10px] opacity-40">Sesi Utama (Default)</p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover/main:opacity-100 transition-opacity">
                      {isEditing ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSaveRename(1)
                          }}
                          className="btn btn-ghost btn-xs p-1 text-success hover:bg-success/20 rounded-lg"
                          title="Simpan nama"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={(e) => handleStartRename(e, mainSession)}
                            className="btn btn-ghost btn-xs p-1 text-white/40 hover:text-white rounded-lg"
                            title="Ubah nama sesi utama"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => handleClearSessionChat(e, 1)}
                            className="btn btn-ghost btn-xs p-1 text-white/40 hover:text-warning rounded-lg"
                            title="Bersihkan riwayat sesi utama"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })()}

              <div className="my-2 border-t border-white/[0.06]" />

              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/35">
                Workspace Threads
              </div>

              {filteredSessions
                .filter((s) => Number(s.id) !== 1)
                .map((s) => {
                  const isActive = activeSessionId === s.id
                  const isEditing = editingSessionId === s.id
                  const isThisSessionRunning = runningSessionIds.map(Number).includes(Number(s.id))

                  return (
                    <div
                      key={s.id}
                      onClick={() => setActiveSessionId(s.id)}
                      className={`w-full p-2.5 rounded-2xl text-left transition-all flex items-center justify-between group/session cursor-pointer ${
                        isActive
                          ? 'bg-white/[0.08] border border-white/[0.12] text-white shadow-sm'
                          : 'hover:bg-white/[0.04] text-white/70 hover:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                        <div
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isThisSessionRunning
                              ? 'bg-warning animate-ping'
                              : isActive
                              ? 'bg-primary shadow-[0_0_6px_var(--color-primary)]'
                              : 'bg-white/20'
                          }`}
                        />
                        <MessageSquare className="w-3.5 h-3.5 opacity-40 shrink-0" />
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(s.id)
                              if (e.key === 'Escape') setEditingSessionId(null)
                            }}
                            autoFocus
                            className="input input-xs bg-base-300 border-primary/50 text-xs text-white p-1 h-6 w-full rounded-lg"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-medium truncate">
                              {s.title || 'Percakapan'}
                            </h4>
                            <p className="text-[10px] opacity-40">
                              {s.timestamp
                                ? new Date(s.timestamp).toLocaleDateString('id-ID', {
                                    month: 'short',
                                    day: 'numeric'
                                  })
                                : ''}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover/session:opacity-100 transition-opacity">
                        {isEditing ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSaveRename(s.id)
                            }}
                            className="btn btn-ghost btn-xs p-1 text-success hover:bg-success/20 rounded-lg"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={(e) => handleStartRename(e, s)}
                              className="btn btn-ghost btn-xs p-1 text-white/40 hover:text-white rounded-lg"
                              title="Ubah judul sesi"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteSessionClick(e, s.id)}
                              className="btn btn-ghost btn-xs p-1 text-white/40 hover:text-error rounded-lg"
                              title="Hapus sesi"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}

              {filteredSessions.filter((s) => Number(s.id) !== 1).length === 0 && (
                <div className="text-center py-6 text-xs text-white/30">
                  Belum ada sesi workspace lain.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* === RIGHT MAIN: CLEAN CANVAS CHAT AREA === */}
        <div className="flex-1 flex flex-col h-full bg-base-300 relative min-w-0 overflow-hidden">
          {/* Canvas Sub-header */}
          <div className="h-12 px-6 border-b border-white/[0.08] flex items-center justify-between bg-base-200/30 backdrop-blur-xl shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {!isSidebarOpen && (
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="btn btn-ghost btn-xs btn-circle text-white/60 hover:text-white cursor-pointer"
                  title="Buka Panel Samping (Ctrl+B)"
                >
                  <PanelLeft className="w-4 h-4" />
                </button>
              )}
              <div className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
              <div>
                <h3 className="text-xs font-semibold text-white truncate max-w-md tracking-wide">
                  {activeSessionObj.title || 'Percakapan'}
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-white/35 font-mono">{currentDisplayMessages.length} pesan</span>
              {currentDisplayMessages.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => handleClearSessionChat(e, activeSessionId)}
                  className="btn btn-ghost btn-xs text-white/40 hover:text-warning gap-1 px-2 rounded-lg cursor-pointer transition-all"
                  title="Bersihkan riwayat percakapan sesi ini"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="text-[10px]">Bersihkan</span>
                </button>
              )}
            </div>
          </div>

          {/* Chat Stream Viewport (Centered Canvas) */}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-8 py-6 custom-scrollbar min-h-0"
          >
            <div className="max-w-4xl mx-auto w-full">
              {currentDisplayMessages.length > visibleMessageCount && (
                <div className="flex justify-center py-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setVisibleMessageCount((prev) => prev + 30)}
                    className="btn btn-xs btn-ghost text-[11px] text-white/50 hover:text-white border border-white/10 rounded-full px-4 normal-case cursor-pointer"
                  >
                    Muat pesan sebelumnya ({currentDisplayMessages.length - visibleMessageCount} pesan lagi)
                  </button>
                </div>
              )}

              {currentDisplayMessages.length === 0 ? (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 text-white/40 space-y-4">
                  <div className="w-14 h-14 rounded-3xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-primary shadow-xl">
                    <Sparkles className="w-7 h-7 animate-pulse" />
                  </div>
                  <div className="max-w-sm space-y-1">
                    <h4 className="text-sm font-bold text-white tracking-wide">Mulai Percakapan</h4>
                    <p className="text-xs text-white/45 leading-relaxed">
                      Tulis instruksi atau diskusikan kebutuhan tugas dengan Abelink.
                    </p>
                  </div>
                </div>
              ) : (
                currentDisplayMessages
                  .slice(-visibleMessageCount)
                  .map((msg, idx) => (
                    <ChatList
                      key={`${msg.id || 'msg'}-${idx}`}
                      role={msg.role}
                      content={msg.content}
                      reasoning={msg.reasoning}
                      isThinking={msg.isThinking}
                      isSearching={msg.isSearching}
                      isSummarizing={msg.isSummarizing}
                      isSearchingMusic={msg.isSearchingMusic}
                      sources={msg.sources}
                      executedTools={msg.executedTools}
                      isMemorySaved={msg.isMemorySaved}
                      choice={msg.choice}
                      isMemoryUpdated={msg.isMemoryUpdated}
                      isMemoryDeleted={msg.isMemoryDeleted}
                      timestamp={msg.timestamp}
                      mood={msg.mood}
                      source={msg.source}
                      sender={msg.sender}
                    />
                  ))
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          </div>

          {/* Bottom Floating/Centered Input Area */}
          <div className="p-3 md:p-4 border-t border-white/[0.08] bg-base-200/40 backdrop-blur-2xl shrink-0">
            <div className="max-w-4xl mx-auto w-full">
              <InputBar
                inline={true}
                onSubmit={handleSendMessage}
                isLoading={isCurrentLoading}
                isRecording={isRecording}
                isProcessing={isProcessing}
                audioIntensity={audioIntensity}
                onStartRecord={startRecording}
                onStopRecord={stopRecording}
                onStop={handleStopSession}
                source={inputSource || 'pc'}
                workspaceRoot={activeSessionObj?.workspaceRoot}
                onSelectWorkspace={handleSelectSessionWorkspace}
                sessionId={activeSessionId}
              />
            </div>
          </div>
        </div>
      </div>

      <ModalComponent />
    </div>
  )
}

export default ChatStudio
