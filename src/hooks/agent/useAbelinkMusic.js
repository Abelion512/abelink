import { getBestMusicMatch, trustworthyTopHit } from '../../api/ai/tools'
import { db, insertMemory } from '../../api/db'

export const useAbelinkMusic = (setChatData, abortControllerRef, youtubeMusicTools) => {
  const { playUrl, nextTrack, prevTrack, playPause } = youtubeMusicTools

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

    let effectiveQuery = (query || '').trim()

    // Self-improvement (Hermes-style): Resolve vague preference queries from memory
    const isVagueQuery = !effectiveQuery || /^(lagu favorit|musik favorit|lagu kesukaan|musik kesukaan|lagu santai|musik santai|lagu biasa|musik biasa|favorit|kesukaan|biasa|bebas|apa aja)$/i.test(effectiveQuery)
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
