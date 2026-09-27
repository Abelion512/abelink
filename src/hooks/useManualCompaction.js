import { useEffect, useRef } from 'react'
import { MAX_SESSION_CHARS } from '../api/ai/sessionCompactor'

const MAX_CHARS = MAX_SESSION_CHARS

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
//
// Tracker memakai metrik yang SAMA dengan jalur kompaksi otomatis (setelah
// pointer lastCompactedMessageId, atas riwayat penuh) supaya persentase gauge
// memprediksi kapan kompaksi benar-benar menyala. Provider untuk summarizer
// diambil dari config sesi (bukan fallback hardcoded).
export function useManualCompaction({ messages, setMessages, sessionId }) {
  const sid = String(sessionId ?? 1)
  const latest = useRef({ messages, setMessages })
  const activeConfigRef = useRef({})

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
        const [{ calculateSessionChars }, { getSessionCompact, getAllConfig }] = await Promise.all([
          import('../api/ai/sessionCompactor'),
          import('../api/db')
        ])
        const [compact, configRows] = await Promise.all([
          getSessionCompact(sid).catch(() => null),
          getAllConfig().catch(() => [])
        ])
        if (Array.isArray(configRows) && configRows[0]) {
          activeConfigRef.current = configRows[0]
        }
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
            // persist:false disengaja: ringkasan tetap disimpan via
            // saveSessionCompact; persist:true hanya menambah tulis pruned ke
            // store `sessions` (destruktif, UI tak sinkron) — tanpa manfaat.
            persist: false,
            activeConfig: activeConfigRef.current,
            onProgress: (p) => setProgress(p?.text || 'Merangkum konteks percakapan lama...')
          })
          if (!res?.success) {
            throw new Error(res?.error || 'Ringkasan konteks gagal disimpan.')
          }
          const coverage = res?.summaryCoverage
          const summarized = coverage ? coverage.covered : before
          const partialNote =
            coverage && coverage.partial
              ? ` Cakupan ringkasan ${coverage.covered}/${coverage.total} pesan — sisanya diproses kompaksi berikutnya.`
              : ''
          setProgress(
            res?.isCompacted
              ? `Selesai: ${summarized} pesan masuk ringkasan, ${Number(res.currentChars || 0).toLocaleString('id-ID')} chars dalam budget.${partialNote}`
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
