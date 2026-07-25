import { useState, useContext, createContext, useRef, useCallback, useEffect } from 'react'

const YoutubeMusicContext = createContext()

export const YoutubeMusicProvider = ({ children }) => {
  const [musicUrl, setMusicUrl] = useState('https://www.youtube.com')
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playId, setPlayId] = useState(0)
  const [playbackError, setPlaybackError] = useState(null)
  const webviewRef = useRef(null)

  const [currentTrack, setCurrentTrack] = useState({ title: '', artist: '', thumbnail: '' })
  const isPollingRef = useRef(false)

  // Poll webview every 5s for track info + thumbnail — hanya saat player terbuka
  useEffect(() => {
    let interval
    const poll = async () => {
      if (!isPlayerOpen || isPollingRef.current) return
      isPollingRef.current = true

      // Defer via requestAnimationFrame agar tidak blocking click handler
      await new Promise(r => requestAnimationFrame(r))

      const webview = webviewRef.current
      if (!webview) { setIsPlaying(false); isPollingRef.current = false; return }
      try {
        const info = await webview.executeJavaScript(
          `(function(){ 
            const titleEl = document.querySelector('#title h1 yt-formatted-string.ytd-watch-metadata, .ytd-video-primary-info-renderer h1 yt-formatted-string');
            const subtitleEl = document.querySelector('#owner #channel-name a');
            const imgEl = document.querySelector('link[itemprop="thumbnailUrl"]');
            const video = document.querySelector('video');
            const url = window.location.href;
            const vidMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
            return {
              title: titleEl ? (titleEl.innerText || titleEl.textContent || '').trim() : '',
              artist: subtitleEl ? subtitleEl.innerText.trim() : '',
              thumbnail: imgEl ? imgEl.href : (vidMatch ? 'https://i.ytimg.com/vi/' + vidMatch[1] + '/maxresdefault.jpg' : ''),
              paused: video ? video.paused : true
            };
          })()`
        )
        setIsPlaying(!info.paused)
        if (info.title && info.title !== currentTrack.title) {
          setCurrentTrack(prev => ({
            title: info.title,
            artist: info.artist || prev.artist,
            thumbnail: info.thumbnail || prev.thumbnail
          }))
        }
      } catch { setIsPlaying(false) }
      isPollingRef.current = false
    }
    interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [isPlayerOpen])

  // Sync to MPRIS
  useEffect(() => {
    if (window.api?.updateMprisTrack && currentTrack.title)
      window.api.updateMprisTrack(currentTrack, !isPlaying)
  }, [currentTrack.title, currentTrack.artist])
  useEffect(() => {
    if (window.api?.setMprisPlaybackStatus)
      window.api.setMprisPlaybackStatus(isPlaying)
  }, [isPlaying])

  const playUrl = useCallback(async (url, initialTrack = null) => {
    setPlaybackError(null)
    setMusicUrl(url)
    setPlayId(prev => prev + 1)
    setIsPlayerOpen(true)
    if (initialTrack) {
      setCurrentTrack(initialTrack)
    } else {
      // Auto-generate thumbnail from URL if available
      const vidMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
      if (vidMatch) {
        setCurrentTrack(prev => ({
          ...prev,
          thumbnail: 'https://i.ytimg.com/vi/' + vidMatch[1] + '/maxresdefault.jpg'
        }))
      }
    }
  }, [])

  const togglePlayer = useCallback(() => setIsPlayerOpen(prev => !prev), [])

  const nextTrack = useCallback(() => {
    webviewRef.current?.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent('keydown', {key: 'N', shiftKey: true, bubbles: true}));`
    )
  }, [])

  const prevTrack = useCallback(() => {
    webviewRef.current?.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent('keydown', {key: 'P', shiftKey: true, bubbles: true}));`
    )
  }, [])

  const playPause = useCallback(() => {
    webviewRef.current?.executeJavaScript(
      `document.dispatchEvent(new KeyboardEvent('keydown', {key: 'k', bubbles: true}));`
    )
  }, [])

  const value = {
    musicUrl, setMusicUrl, playUrl, playId,
    isPlayerOpen, setIsPlayerOpen, togglePlayer,
    webviewRef, isPlaying, currentTrack,
    nextTrack, prevTrack, playPause,
    playbackError, setPlaybackError
  }

  return <YoutubeMusicContext.Provider value={value}>{children}</YoutubeMusicContext.Provider>
}

export const useYoutubeMusic = () => useContext(YoutubeMusicContext)
