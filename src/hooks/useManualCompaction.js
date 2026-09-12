import { useEffect, useRef } from 'react'

const MAX_CHARS = 525000

const dispatchTracker = (sessionId, currentChars, lastCompactedAt = null) => {
  window.dispatchEvent(
    new CustomEvent('context-tracker-updated', {
      detail: {
        sessionId: String(sessionId),
        currentChars,
        maxChars: MAX_CHARS,
        percentage: Math.min(100, (currentChars / MAX_CHARS) * 100),
        lastCompactedAt
      }
    })
  )
}

// Kompaksi manual per permukaan chat (ATM upstream, adaptasi).
// props: messages (array tampil), setMessages (setter), sessionId.
// Mendengar `request-manual-compaction`; menghitung tracker tiap jumlah
// pesan berubah; banner progres role system (difilter dari hitungan).
export function useManualCompaction({ messages, setMessages, sessionId }) {
  const sid = String(sessionId ?? 1)
  const latest = useRef({ messages, setMessages })

  useEffect(() => {
    latest.current = { messages, setMessages }
  })
  const busy = useRef(false)

  const count = Array.isArray(messages) ? messages.length : 0

  // Tracker hidup: hitung ulang tiap jumlah pesan berubah.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [{ calculateSessionChars }, { getSessionCompact }] = await Promise.all([
          import('../api/ai/sessionCompactor'),
          import('../api/db')
        ])
        const compact = await getSessionCompact(sid).catch(() => null)
        const chars = calculateSessionChars(
          (latest.current.messages || []).filter((m) => !m?.isCompacting),
          compact?.summaryBlock || '',
          compact?.lastCompactedMessageId || null
        )
        if (!cancelled) dispatchTracker(sid, chars, compact?.lastCompactedAt || null)
      } catch {
        /* tracker tidak boleh mengganggu chat */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [count, sid])

  useEffect(() => {
    const onRequest = (e) => {
      if (e?.detail && String(e.detail.sessionId ?? '') !== sid) return
      const { messages: msgs, setMessages: set } = latest.current
      if (typeof set !== 'function' || busy.current) return
      busy.current = true
      ;(async () => {
        const bannerId = `compact-banner-${Date.now()}`
        const setProgress = (text, done = false) =>
          set((prev) =>
            (prev || []).map((m) => (m.id === bannerId ? { ...m, content: text, compactProgress: text, compactDone: done } : m))
          )
        set((prev) => [
          ...(prev || []),
          { id: bannerId, role: 'system', isCompacting: true, content: 'Memangkas log tool di memori...', compactProgress: 'Memangkas log tool di memori...' }
        ])
        try {
          const { executeSessionCompaction } = await import('../api/ai/sessionCompactor')
          const before = (msgs || []).filter((m) => !m?.isCompacting).length
          const res = await executeSessionCompaction({
            sessionId: sid,
            messages: (msgs || []).filter((m) => !m.isCompacting),
            force: true,
            persist: false,
            onProgress: (p) => setProgress(p?.text || 'Merangkum konteks percakapan lama...')
          })
          setProgress(
            res?.isCompacted
              ? `Selesai: ${before} pesan, ${Number(res.currentChars || 0).toLocaleString('id-ID')} chars dalam budget.`
              : 'Tidak ada yang perlu dikompaksi (masih di bawah budget).',
            true
          )
          dispatchTracker(sid, Number(res?.currentChars || 0), Date.now())
        } catch (err) {
          setProgress(`Kompaksi gagal: ${err?.message || err}`, true)
        } finally {
          setTimeout(() => {
            try {
              latest.current.setMessages?.((prev) => (prev || []).filter((m) => m.id !== bannerId))
            } catch { /* abaikan */ }
          }, 8000)
          busy.current = false
        }
      })()
    }
    window.addEventListener('request-manual-compaction', onRequest)
    return () => window.removeEventListener('request-manual-compaction', onRequest)
  }, [sid])
}
