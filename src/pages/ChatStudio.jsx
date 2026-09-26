import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  Search,
  Check,
  Bot,
  Folder,
  PanelLeft
} from 'lucide-react'
import { useChat } from '../contexts/useChat'
import {
  getAllSessions,
  createSession,
  deleteSession,
  renameSession,
  getChatData,
  setSessionWorkspace
} from '../api/db'
import ChatList from '../components/ChatList'
import InputBar from '../components/core/InputBar'
import { TocMinimap, toMinimapAnchorId } from '../components/core/TocMinimap'
import { useConfirm } from '../hooks/useConfirm'
import { useManualCompaction } from '../hooks/useManualCompaction'

const ChatStudio = () => {
  const chatContext = useChat()
  const {
    chatData: mainChatData,
    setChatData: setMainChatData,
    handlePlanningCommand,
    isLoading: isMainLoading,
    isAgentBusy,
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
  const [, setIsLocalLoading] = useState(false)

  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  const messagesContainerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const { confirm, ModalComponent } = useConfirm()

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
    void (async () => {
      await loadAllSessions()
    })()
  }, [])

  // Direct display pipeline: Main Thread uses mainChatData directly with 0ms lag
  // (memoized on raw sources so downstream memos keep stable deps).
  const currentDisplayMessages = useMemo(
    () => (activeSessionId === 1 ? mainChatData || [] : activeSessionData),
    [activeSessionId, mainChatData, activeSessionData]
  )

  const visibleMessages = useMemo(
    () => currentDisplayMessages.slice(-visibleMessageCount),
    [currentDisplayMessages, visibleMessageCount]
  )

  // Minimap items mirror the visible slice: user = depth 2, assistant = depth 3.
  const minimapItems = useMemo(
    () =>
      visibleMessages
        .map((msg, idx) => {
          const rawId = msg.id || msg.created_at || idx
          const raw = msg.content
          let text = ''
          if (typeof raw === 'string') text = raw.startsWith('data:image/') ? '' : raw
          else if (Array.isArray(raw)) {
            text = raw
              .map((item) => {
                if (!item) return ''
                if (typeof item === 'string') return item.startsWith('data:image/') ? '' : item
                return item.type === 'text' ? item.text || '' : ''
              })
              .join('\n')
          } else if (raw != null && typeof raw !== 'object') text = String(raw)
          text = text.replace(/\s+/g, ' ').trim()
          if (!text) return null
          return {
            id: toMinimapAnchorId(rawId),
            title: text.slice(0, 60),
            depth: msg.role === 'user' ? 2 : 3
          }
        })
        .filter(Boolean),
    [visibleMessages]
  )

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

  // Sync active session data for custom sessions (id > 1).
  // Reset + fetch dibungkus async agar lolos set-state-in-effect.
  useEffect(() => {
    let isCancelled = false
    void (async () => {
      setVisibleMessageCount(30)
      if (activeSessionId === 1) return
      const data = await getChatData(activeSessionId)
      if (!isCancelled) {
        setActiveSessionData(data || [])
      }
    })()
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

  const handleStartRename = (e, session) => {
    e.stopPropagation()
    setEditingSessionId(session.id)
    setEditingTitle(session.title)
  }

  const handleSaveRenameSession = async (id) => {
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
    <div className="h-screen w-screen pt-10 bg-[#161618] flex flex-col overflow-hidden text-white select-none">
      {/* Top Navigation Bar with Safe Area Gutter */}
      <div
        className="h-14 pl-16 pr-28 border-b border-white/10 flex items-center justify-between bg-[#1c1c1e]/80 backdrop-blur-xl shrink-0 z-30 relative select-none"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <div
          className="flex items-center gap-3 pointer-events-auto"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <button
            type="button"
            onClick={() => setIsSidebarOpen((v) => !v)}
            className={`p-2 rounded-xl border transition-all ${
              isSidebarOpen
                ? 'bg-[#0a84ff]/20 border-[#0a84ff]/40 text-[#0a84ff]'
                : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
            }`}
            title={`${isSidebarOpen ? 'Sembunyikan' : 'Tampilkan'} Daftar Sesi (Ctrl+B)`}
          >
            <PanelLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-[#0a84ff]" />
            <h2 className="text-sm font-semibold text-white tracking-wide">Studio Percakapan</h2>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div
          className="flex items-center gap-2 pointer-events-auto"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <button
            type="button"
            onClick={handleCreateNewChat}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0a84ff] text-white hover:bg-[#0a84ff]/90 text-xs font-medium shadow-md shadow-[#0a84ff]/20 cursor-pointer transition-all active:scale-95"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Sesi Baru
          </button>
        </div>
      </div>

      {/* Workspace Area: Left List + Right Chat */}
      <div className="flex-1 flex overflow-hidden">
        {/* === LEFT SIDEBAR: SESSIONS LIST === */}
        <div
          className={`border-r border-white/10 bg-[#1c1c1e]/50 backdrop-blur-xl flex flex-col h-full shrink-0 transition-all duration-300 overflow-hidden ${
            isSidebarOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 border-r-0 pointer-events-none'
          }`}
        >
          {/* Search bar */}
          <div className="p-3 border-b border-white/10">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Cari obrolan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white/5 border border-white/10 pl-8 pr-3 py-1.5 w-full rounded-xl text-xs text-white placeholder:text-white/30 focus:border-[#0a84ff]/60 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {/* MAIN THREAD (STATIC) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setActiveSessionId(1)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setActiveSessionId(1)
              }}
              className={`w-full p-2.5 rounded-xl text-left transition-all flex items-center justify-between group/item cursor-pointer ${
                activeSessionId === 1
                  ? 'bg-[#0a84ff] text-white shadow-md'
                  : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    runningSessionIds.map(Number).includes(1) ||
                    (!runningSessionIds.length && (isMainLoading || isAgentBusy))
                      ? 'bg-[#ffbd2e] animate-ping'
                      : activeSessionId === 1
                        ? 'bg-white'
                        : 'bg-[#0a84ff]'
                  }`}
                />
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold truncate">Main Thread</h4>
                </div>
              </div>
            </div>

            <div className="my-2 border-t border-white/5" />

            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
              Workspace Threads
            </div>

            {filteredSessions
              .filter((s) => s.id !== 1)
              .map((s) => {
                const isActive = activeSessionId === s.id
                const isEditing = editingSessionId === s.id
                const isThisSessionRunning = runningSessionIds.map(Number).includes(Number(s.id))

                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveSessionId(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setActiveSessionId(s.id)
                    }}
                    className={`w-full p-2.5 rounded-xl text-left transition-all flex items-center justify-between group/item cursor-pointer ${
                      isActive
                        ? 'bg-[#0a84ff] text-white shadow-md'
                        : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isThisSessionRunning
                            ? 'bg-[#ffbd2e] animate-ping'
                            : isActive
                              ? 'bg-white'
                              : 'bg-white/30'
                        }`}
                      />
                      <div className="min-w-0 flex-1 pr-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRenameSession(s.id)
                              if (e.key === 'Escape') setEditingSessionId(null)
                            }}
                            autoFocus
                            className="bg-black/40 border border-white/20 rounded px-1.5 py-0.5 text-xs text-white w-full focus:outline-none focus:border-[#0a84ff]"
                          />
                        ) : (
                          <h4 className="text-xs font-medium truncate">{s.title || 'Tanpa Judul'}</h4>
                        )}
                        {s.workspaceRoot && (
                          <div className="flex items-center gap-1 text-[10px] opacity-50 truncate mt-0.5">
                            <Folder size={10} />
                            <span className="truncate">{s.workspaceRoot.split('/').pop()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                      {isEditing ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSaveRenameSession(s.id)
                          }}
                          className="p-1 rounded-lg hover:bg-white/20 text-white"
                          title="Simpan nama"
                          aria-label="Simpan nama"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={(e) => handleStartRename(e, s)}
                            className="p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                            title="Ubah nama"
                            aria-label="Ubah nama"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteSessionClick(e, s.id)}
                            className="p-1 rounded-lg text-white/60 hover:text-[#ff453a] hover:bg-[#ff453a]/20 transition-colors"
                            title="Hapus sesi"
                            aria-label="Hapus sesi"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}

            {filteredSessions.filter((s) => s.id !== 1).length === 0 && (
              <div className="text-center py-6 text-xs text-white/40">
                Belum ada sesi workspace lain.
              </div>
            )}
          </div>
        </div>

        {/* === RIGHT MAIN: BUBBLE CHAT AREA === */}
        <div className="flex-1 flex flex-col h-full bg-[#161618] relative min-w-0 overflow-hidden">
          <div className="h-12 px-6 border-b border-white/10 flex items-center justify-between bg-[#1c1c1e]/40 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-2.5 h-2.5 rounded-full bg-[#0a84ff] shadow-[0_0_10px_rgba(10,132,255,0.6)]" />
              <div>
                <h3 className="text-xs font-semibold text-white truncate max-w-md">
                  {activeSessionObj.title || 'Percakapan'}
                </h3>
              </div>
            </div>
            <span className="text-[11px] text-white/40">{currentDisplayMessages.length} pesan</span>
          </div>

          <div className="relative flex-1 min-h-0 flex">
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto overflow-x-hidden px-8 py-6 pb-28 custom-scrollbar space-y-2 min-h-0"
            >
              {currentDisplayMessages.length > visibleMessageCount && (
                <div className="flex justify-center py-2">
                  <button
                    type="button"
                    onClick={() => setVisibleMessageCount((prev) => prev + 30)}
                    className="px-4 py-1 text-xs text-white/70 hover:text-white border border-white/15 rounded-full hover:bg-white/10 transition-all cursor-pointer"
                  >
                    Muat pesan sebelumnya ({currentDisplayMessages.length - visibleMessageCount}{' '}
                    pesan lagi)
                  </button>
                </div>
              )}

              {currentDisplayMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-white/50 space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#0a84ff] shadow-xl">
                    <Bot className="w-7 h-7" />
                  </div>
                  <div className="max-w-sm space-y-1">
                    <h4 className="text-sm font-semibold text-white">Sesi Percakapan Baru</h4>
                    <p className="text-xs text-white/50">
                      Tulis instruksi atau diskusikan kebutuhanmu dengan Abelink.
                    </p>
                  </div>
                </div>
              ) : (
                visibleMessages.map((msg, idx) => (
                  <ChatList
                    key={msg.id || msg.created_at || idx}
                    msgId={msg.id || msg.created_at || idx}
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
              <div ref={messagesEndRef} className="h-2" />
            </div>
            <TocMinimap items={minimapItems} scrollRoot={messagesContainerRef} />

            {/* Floating InputBar pill above messages */}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-20 pointer-events-auto">
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
