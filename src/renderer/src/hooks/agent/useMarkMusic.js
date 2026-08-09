import { getBestMusicMatch } from '../../api/ai/tools'

export const useMarkMusic = (setChatData, abortControllerRef, youtubeMusicTools) => {
  const { playUrl, nextTrack, prevTrack, playPause } = youtubeMusicTools

  const handleMusic = async (action, query) => {
    if (action === 'music-next') { nextTrack(); return 'Memutar lagu selanjutnya.' }
    if (action === 'music-prev') { prevTrack(); return 'Memutar lagu sebelumnya.' }
    if (action === 'music-toggle') { playPause(); return 'Pause/Resume lagu.' }
    if (action === 'music-recent') {
      const limit = parseInt(query, 10) || 15
      const history = (await window.api.getPlaybackHistory(limit)) || []
      if (history.length === 0) return 'Belum ada riwayat pemutaran lokal (record dimulai sejak fitur ini aktif). Coba last.fm jika user punya akun.'
      return 'Lagu terakhir diputar (lokal, terbaru dulu):\n' + history
        .map((h, i) => `${i + 1}. ${new Date(h.ts).toLocaleString('id-ID')} — ${h.title} oleh ${h.artist}`)
        .join('\n')
    }

    setChatData((prev) => [...prev, { role: 'ai', content: 'Mencari lagu...', isSearchingMusic: true }])
    const music = await window.api.searchMusic(query)
    const isAutoplay = action === 'music-play'

    let selectedMusicList = [...music]
    let selectedId = music[0]?.id

    if (isAutoplay && music.length > 0) {
      setChatData((prev) => [
        ...prev.filter((item) => !item.isSearchingMusic),
        { role: 'ai', content: 'Menganalisis versi lagu terbaik...', isSearchingMusic: true }
      ])
      
      const bestMatch = await getBestMusicMatch(query, music.slice(0, 10), abortControllerRef.current?.signal)
      if (bestMatch && bestMatch.selectedId) {
        selectedId = bestMatch.selectedId
        const found = music.find((m) => m.id === selectedId)
        if (found) {
          selectedMusicList = [found]
        } else {
          selectedMusicList = [music[0]]
          selectedId = music[0].id
        }
      } else {
        selectedMusicList = [music[0]]
      }
    }

    if (!isAutoplay) {
      setChatData((prev) => [
        ...prev.filter((item) => !item.isSearchingMusic),
        {
          role: 'ai',
          content: `Hasil Pencarian Lagu untuk "${query}": \n ${music.map((item) => item.title).join('\n')}`,
          isMusic: true,
          isMusicAutoplay: false,
          musicQuery: query,
          musicList: [...music]
        }
      ])
    } else {
      setChatData((prev) => prev.filter((item) => !item.isSearchingMusic))
    }

    if (isAutoplay && selectedId) {
      const trackUrl = `https://www.youtube.com/watch?v=${selectedId}`
      await playUrl(trackUrl, selectedMusicList[0])
      const t = selectedMusicList[0]
      // Scrobble ke Last.fm (updateNowPlaying)
      try { window.api?.lastfmUpdateNowPlaying?.(t.title, t.artist) } catch {}
      return `✅ Berhasil memutar: "${t.title}" oleh ${t.artist || 'Unknown'}. JANGAN panggil music-play lagi — lagu sudah diproses. Tunggu user minta lagu baru.`
    }

    const resultText = music.slice(0, 5).map(m => `${m.title} oleh ${m.artist}`).join(', ')
    return `[SYSTEM LOG] Hasil pencarian lagu untuk "${query}": ${resultText}`
  }


  return { handleMusic }
}
