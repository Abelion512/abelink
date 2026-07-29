import { useState, useContext, createContext, useCallback, useEffect } from 'react'

const YoutubeMusicContext = createContext()

export const YoutubeMusicProvider = ({ children }) => {
  const [musicUrl, setMusicUrl] = useState('https://www.youtube.com')
  const [isPlayerOpen, setIsPlayerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrack, setCurrentTrack] = useState({ title: '', artist: '', thumbnail: '' })
  const [playbackError, setPlaybackError] = useState(null)

  const playUrl = useCallback(async (url, initialTrack = null) => {
    if (!url) return
    setMusicUrl(url)
    setPlaybackError(null)
    if (initialTrack) {
      setCurrentTrack(initialTrack)
    } else {
      const vidMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
      if (vidMatch) {
        setCurrentTrack(prev => ({
          ...prev,
          thumbnail: 'https://i.ytimg.com/vi/' + vidMatch[1] + '/maxresdefault.jpg'
        }))
      }
    }
    try {
      // Use physical browser-agent (visible, same partition) instead of hidden BrowserWindow
      // This avoids Google's embedded browser detection
      if (window.api?.showBrowserWindow && window.api?.browserNavigate) {
        window.api.showBrowserWindow()
        await window.api.browserNavigate(url)
        setIsPlayerOpen(true)
        setIsPlaying(true)
      } else {
        // Fallback: hidden BrowserWindow
        await window.api.ytLoad(url)
        window.api.ytShow()
        setIsPlayerOpen(true)
        setIsPlaying(true)
      }
    } catch (e) {
      setPlaybackError(e.message)
    }
  }, [])

  const togglePlayer = useCallback(() => {
    setIsPlayerOpen(prev => !prev)
  }, [])

  // React to isPlayerOpen changes — show/hide the BrowserWindow
  useEffect(() => {
    if (isPlayerOpen) {
      window.api.ytShow()
      window.api.ytGetUrl().then(currentUrl => {
        if (currentUrl) window.api.ytLoad(currentUrl)
      }).catch(() => {})
    } else {
      window.api.ytHide()
    }
  }, [isPlayerOpen])

  const nextTrack = useCallback(() => {
    window.api.ytShow()
  }, [])

  const prevTrack = useCallback(() => {
    window.api.ytShow()
  }, [])

  const playPause = useCallback(() => {
    setIsPlaying(p => !p)
  }, [])

  // Route WA/remote music commands to the active functions
  useEffect(() => {
    if (window.api?.onExecuteMusicCommand) {
      window.api.onExecuteMusicCommand((command, payload) => {
        if (command === 'play' && payload) playUrl(payload)
        else if (command === 'next') nextTrack()
        else if (command === 'prev') prevTrack()
        else if (command === 'toggle') playPause()
      })
    }
    if (window.api?.onExecuteMusicCommandWa) {
      window.api.onExecuteMusicCommandWa((command, payload) => {
        if (command === 'play' && payload) {
          window.api.searchMusic(payload).then((music) => {
            if (music && music.length > 0) {
              const url = `https://www.youtube.com/watch?v=${music[0].id}`
              playUrl(url)
            }
          })
        } else if (command === 'next') nextTrack()
        else if (command === 'prev') prevTrack()
        else if (command === 'toggle') playPause()
      })
    }
  }, [playUrl, nextTrack, prevTrack, playPause])

  // Sync to MPRIS
  useEffect(() => {
    if (window.api?.updateMprisTrack && currentTrack.title)
      window.api.updateMprisTrack(currentTrack, !isPlaying)
  }, [currentTrack.title, currentTrack.artist])
  useEffect(() => {
    if (window.api?.setMprisPlaybackStatus)
      window.api.setMprisPlaybackStatus(isPlaying)
  }, [isPlaying])

  const value = {
    musicUrl, setMusicUrl, isPlayerOpen, setIsPlayerOpen,
    isPlaying, setIsPlaying,
    currentTrack, setCurrentTrack, playbackError, setPlaybackError,
    playUrl, nextTrack, prevTrack, playPause, togglePlayer
  }

  return (
    <YoutubeMusicContext.Provider value={value}>
      {children}
    </YoutubeMusicContext.Provider>
  )
}

export const useYoutubeMusic = () => {
  const ctx = useContext(YoutubeMusicContext)
  if (!ctx) throw new Error('useYoutubeMusic must be used within YoutubeMusicProvider')
  return ctx
}