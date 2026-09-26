import { getBestMusicMatch, trustworthyTopHit } from '../../api/ai/tools'
import { db, insertMemory } from '../../api/db'
import { extractVideoId, parseQueueAdd, parseLoopMode, isVagueMusicQuery, buildDirectTrack } from './musicQuery'

export const useAbelinkMusic = (setChatData, abortControllerRef, youtubeMusicTools) => {
  const { playUrl, playTrack, nextTrack, prevTrack, playPause } = youtubeMusicTools

  // Direct-play jalur cepat: mainkan ID video TANPA search ulang.
  // Dipakai URL exact-play + pilihan user dari tombol (mediaTools).
  const playDirect = async (id, meta, targetSet) => {
    if (!id) return null
    const track = buildDirectTrack(id, meta)
    const started = (typeof playTrack === 'function' ? playTrack(track) : false)
      || playUrl(`https://music.youtube.com/watch?v=${id}`, track)
    if (!started) {
      targetSet((prev) => prev.filter((item) => !item.isSearchingMusic))
      return '[SYSTEM LOG] GAGAL memutar lagu: engine pemutar musik belum siap. Laporkan ke user bahwa musik tidak bisa diputar saat ini.'
    }
    targetSet((prev) => prev.filter((item) => !item.isSearchingMusic))
    return `[SYSTEM LOG] Berhasil memutar lagu: ${track.title} oleh ${track.artist}`
  }

  const handleMusic = async (action, query, customSetChatData) => {
    const targetSet = customSetChatData || setChatData
    // Return value engine itu JUJUR sekarang: false/null = player belum siap/gagal.
    // Jangan pernah laporkan sukses palsu ke AI — itu yang bikin user kira musik nyala.
    if (action === 'music-next') {
      return nextTrack() ? 'Memutar lagu selanjutnya.' : '[SYSTEM LOG] Antrean kosong — tidak ada lagu berikutnya.'
    }
    if (action === 'music-prev') {
      return prevTrack() ? 'Memutar lagu sebelumnya.' : '[SYSTEM LOG] Antrean kosong — tidak ada lagu sebelumnya.'
    }
    if (action === 'music-toggle') {
      const state = playPause()
      if (state === 'playing') return 'Lagu dilanjutkan.'
      if (state === 'paused') return 'Lagu dijeda.'
      return '[SYSTEM LOG] Engine pemutar musik belum siap — coba lagi sebentar atau putar ulang lagunya.'
    }
    // Stream B: 4 tool antrean/loop. Ops ke queue Stream A bila tersedia
    // (cycleRepeatMode/setRepeatMode, queue.repeat); bila belum ada, lapor jujur.
    if (action === 'music-loop') {
      const parsed = parseLoopMode(query)
      if (!parsed) return '[SYSTEM LOG] Argumen music-loop tidak dikenal. Pakai: one | one <N>x | all | off.'
      if (parsed.mode === 'off') {
        youtubeMusicTools.setRepeatMode?.('off')
        return 'Repeat dimatikan.'
      }
      if (parsed.mode === 'all') {
        if (typeof youtubeMusicTools.setRepeatMode === 'function') {
          youtubeMusicTools.setRepeatMode('all')
          return 'Repeat antrean (all) dinyalakan.'
        }
        if (typeof youtubeMusicTools.cycleRepeatMode === 'function') {
          youtubeMusicTools.cycleRepeatMode()
          return 'Repeat antrean (all) dinyalakan.'
        }
        return '[SYSTEM LOG] Engine belum mendukung repeat — butuh Stream A (cycleRepeatMode/setRepeatMode).'
      }
      // mode one (+ limit opsional "one Nx")
      if (typeof youtubeMusicTools.setRepeatMode === 'function') {
        youtubeMusicTools.setRepeatMode('one', parsed.limit ?? undefined)
        return parsed.limit ? `Repeat lagu ini ${parsed.limit}x dinyalakan.` : 'Repeat lagu ini (one) dinyalakan.'
      }
      if (typeof youtubeMusicTools.cycleRepeatMode === 'function') {
        youtubeMusicTools.cycleRepeatMode()
        return parsed.limit ? `Repeat lagu ini ${parsed.limit}x dinyalakan.` : 'Repeat lagu ini (one) dinyalakan.'
      }
      return '[SYSTEM LOG] Engine belum mendukung repeat — butuh Stream A (cycleRepeatMode/setRepeatMode).'
    }
    if (action === 'music-queue-add') {
      const { query: title, repeat } = parseQueueAdd(query)
      if (!title) return '[SYSTEM LOG] Judul lagu kosong — sebutkan judul yang mau ditambahkan.'
      const q = Array.isArray(youtubeMusicTools.queue) ? youtubeMusicTools.queue : []
      const wasEmpty = q.length === 0
      // Resolve judul -> ID nyata DULU (tanpa ID, enqueue diam-diam drop item
      // dan klaim sukses palsu). Cari via searchMusic, pakai top hit.
      let resolved = null
      try {
        const hits = await window.api?.searchMusic?.(title)
        const top = Array.isArray(hits) && hits.length > 0 ? hits[0] : null
        if (top?.id && !String(top.id).startsWith('pending:')) resolved = top
      } catch (_) { resolved = null }
      if (!resolved) {
        return `[SYSTEM LOG] Tidak menemukan "${title}" — antrean tidak berubah. Coba judul/artis lebih spesifik.`
      }
      const track = { ...resolved, repeat }
      if (typeof youtubeMusicTools.enqueueTrack === 'function') {
        youtubeMusicTools.enqueueTrack(track, false)
      } else if (typeof youtubeMusicTools.enqueuePlaylist === 'function') {
        youtubeMusicTools.enqueuePlaylist([track], false)
      } else {
        return '[SYSTEM LOG] Engine belum mendukung antrean.'
      }
      if (wasEmpty) {
        // Antrean tadinya kosong -> putar langsung agar tidak diam.
        return handleMusic('music-play', title, customSetChatData)
      }
      return repeat > 1
        ? `Menambahkan "${track.title || title}" x${repeat} ke antrean.`
        : `Menambahkan "${track.title || title}" ke antrean.`
    }
    if (action === 'music-queue-remove') {
      const needle = String(query || '').trim().toLowerCase()
      if (!needle) return '[SYSTEM LOG] Sebutkan judul/id lagu yang mau dihapus dari antrean.'
      const q = Array.isArray(youtubeMusicTools.queue) ? youtubeMusicTools.queue : []
      const hit = q.find((t) => String(t?.title || '').toLowerCase().includes(needle) || String(t?.id || '').toLowerCase() === needle)
      if (!hit) return `[SYSTEM LOG] "${query}" tidak ada di antrean.`
      if (typeof youtubeMusicTools.removeFromQueue === 'function') {
        youtubeMusicTools.removeFromQueue(hit.id)
        return `Menghapus "${hit.title || hit.id}" dari antrean.`
      }
      if (typeof youtubeMusicTools.reorderQueue === 'function') {
        youtubeMusicTools.reorderQueue(q.filter((t) => t.id !== hit.id))
        return `Menghapus "${hit.title || hit.id}" dari antrean.`
      }
      return '[SYSTEM LOG] Engine belum mendukung hapus antrean.'
    }
    if (action === 'music-queue-clear') {
      const q = Array.isArray(youtubeMusicTools.queue) ? youtubeMusicTools.queue : []
      if (q.length === 0) return 'Antrean sudah kosong.'
      if (typeof youtubeMusicTools.reorderQueue === 'function') {
        youtubeMusicTools.reorderQueue([])
        return `Menghapus ${q.length} lagu dari antrean.`
      }
      return '[SYSTEM LOG] Engine belum mendukung clear antrean.'
    }

    let effectiveQuery = (query || '').trim()

    // URL exact-play: mainkan ID video LANGSUNG, tanpa search/substitusi.
    const urlId = extractVideoId(effectiveQuery)
    if (urlId) {
      targetSet((prev) => [...prev, { role: 'ai', content: 'Memutar dari tautan YouTube...', isSearchingMusic: true }])
      // Metadata opsional: jangan ganti ID; playDirect pakai ID apa adanya.
      return playDirect(urlId, null, targetSet)
    }

    // Self-improvement (Hermes-style): Resolve vague preference queries from memory
    const isVagueQuery = isVagueMusicQuery(effectiveQuery)
    if (isVagueQuery) {
      try {
        const savedMusic = await db.memory
          .where('type')
          .equals('preference')
          .filter(m => m.summary === 'Music Preference')
          .reverse()
          .toArray()

        if (savedMusic.length > 0) {
          // Ambil referensi lagu yang paling sering atau terakhir diputar
          const randomSaved = savedMusic[Math.floor(Math.random() * Math.min(savedMusic.length, 3))]
          const match = randomSaved.memory.match(/"([^"]+)"/)
          if (match && match[1]) {
            effectiveQuery = match[1]
          }
        }
      } catch (err) {
        console.warn('[useAbelinkMusic] Error retrieving saved music preferences:', err)
      }
      if (!effectiveQuery) effectiveQuery = 'lofi hip hop radio'
    }

    targetSet((prev) => [...prev, { role: 'ai', content: `Mencari lagu "${effectiveQuery}"...`, isSearchingMusic: true }])
    const music = await window.api.searchMusic(effectiveQuery)
    const isAutoplay = action === 'music-play'
    // Deteksi query multi-lagu/OST/Soundtrack/Album/Playlist:
    // User meminta kompilasi lagu bertema (OST, soundtrack, album, theme song) yang memiliki banyak judul lagu berbeda
    const isOstOrCompilation = /\b(ost|soundtrack|album|theme song|lagu tema|bgm)\b/i.test(effectiveQuery)
    if (isAutoplay && isOstOrCompilation && music.length > 1) {
      targetSet((prev) => prev.filter((item) => !item.isSearchingMusic))
      return {
        candidates: music.slice(0, 4),
        question: `Ditemukan beberapa track untuk "${effectiveQuery}" — lagu mana yang ingin diputar?`
      }
    }

    // Query kabur + hasil tak meyakinkan -> kembalikan kandidat agar pemanggil
    // menawarkan tombol (ask-choice), bukan autoplay buta music[0].
    const vagueNoMemory = isVagueQuery && effectiveQuery === 'lofi hip hop radio'
    if (isAutoplay && (vagueNoMemory || music.length === 0)) {
      targetSet((prev) => prev.filter((item) => !item.isSearchingMusic))
      if (music.length === 0) return '[SYSTEM LOG] Tidak ada hasil pencarian lagu. Minta query lebih spesifik.'
      return {
        candidates: music.slice(0, 4),
        question: `Query "${query || 'musik'}" terlalu umum — lagu mana yang dimaksud?`
      }
    }

    let selectedMusicList = [...music]
    let selectedId = music[0]?.id

    if (isAutoplay && music.length > 0) {
      targetSet((prev) => [
        ...prev.filter((item) => !item.isSearchingMusic),
        { role: 'ai', content: 'Menganalisis versi lagu terbaik...', isSearchingMusic: true }
      ])

      // Jalur cepat deterministik: hit teratas cocok kuat + tidak minta
      // varian versi -> langsung putar tanpa 1 LLM call tambahan.
      const fast = trustworthyTopHit(effectiveQuery, music.slice(0, 10))
      const bestMatch = fast || (await getBestMusicMatch(effectiveQuery, music.slice(0, 10), abortControllerRef.current?.signal))
      if (bestMatch && bestMatch.selectedId) {
        selectedId = bestMatch.selectedId
        const found = music.find((m) => m.id === selectedId)
        if (found) {
          selectedMusicList = [found]
        } else {
          // ID tak ada di hasil -> tawarkan kandidat, bukan autoplay buta.
          targetSet((prev) => prev.filter((item) => !item.isSearchingMusic))
          return {
            candidates: music.slice(0, 4),
            question: `Hasil "${effectiveQuery}" ambigu — lagu mana yang dimaksud?`
          }
        }
      } else {
        // Tak ada kecocokan yakin -> tawarkan kandidat, bukan music[0] buta.
        targetSet((prev) => prev.filter((item) => !item.isSearchingMusic))
        return {
          candidates: music.slice(0, 4),
          question: `Hasil "${effectiveQuery}" ambigu — lagu mana yang dimaksud?`
        }
      }
    }

    if (!isAutoplay) {
      targetSet((prev) => [
        ...prev.filter((item) => !item.isSearchingMusic),
        {
          role: 'ai',
          content: `Hasil Pencarian Lagu untuk "${effectiveQuery}": \n ${music.map((item) => item.title).join('\n')}`,
          isMusic: true,
          isMusicAutoplay: false,
          musicQuery: effectiveQuery,
          musicList: [...music]
        }
      ])
    } else {
      targetSet((prev) => prev.filter((item) => !item.isSearchingMusic))
    }

    if (isAutoplay && selectedId) {
      const started = playUrl(`https://music.youtube.com/watch?v=${selectedId}`, selectedMusicList[0])
      if (!started) {
        targetSet((prev) => prev.filter((item) => !item.isSearchingMusic))
        return `[SYSTEM LOG] GAGAL memutar lagu: engine pemutar musik belum siap. Laporkan ke user bahwa musik tidak bisa diputar saat ini.`
      }

      // Self-improvement (Hermes-style): Persist song preference automatically
      try {
        const trackTitle = selectedMusicList[0]?.title
        const trackArtist = selectedMusicList[0]?.artist || ''
        if (trackTitle) {
          const existing = await db.memory
            .where('type')
            .equals('preference')
            .filter(m => m.summary === 'Music Preference' && m.memory.includes(trackTitle))
            .first()

          if (!existing) {
            await insertMemory({
              type: 'preference',
              summary: 'Music Preference',
              memory: `Pengguna menyukai lagu: "${trackTitle}" oleh ${trackArtist}.`
            })
          }
        }
      } catch (memErr) {
        console.warn('[useAbelinkMusic] Gagal persist music memory:', memErr)
      }

      return `[SYSTEM LOG] Berhasil memutar lagu: ${selectedMusicList[0].title} oleh ${selectedMusicList[0].artist}`
    }

    const resultText = music.slice(0, 5).map(m => `${m.title} oleh ${m.artist}`).join(', ')
    return `[SYSTEM LOG] Hasil pencarian lagu untuk "${effectiveQuery}": ${resultText}`
  }


  return { handleMusic }
}
