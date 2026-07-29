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
      // Navigate in DEDICATED YouTube player (not the automation browser)
      if (window.api?.ytLoad) {
        await window.api.ytLoad(url)
      } else if (window.api?.browserNavigate) {
        await window.api.browserNavigate(url)
      }
      setIsPlayerOpen(true)
      setIsPlaying(true)
    } catch (e) {
      setPlaybackError(e.message)
    }
  }, [])

  const togglePlayer = useCallback(() => {
    setIsPlayerOpen(prev => !prev)
  }, [])

  // React to isPlayerOpen changes — show/hide the dedicated YouTube player
  useEffect(() => {
    if (isPlayerOpen) {
      if (window.api?.showPlayer) {
        window.api.showPlayer()
      } else if (window.api?.showBrowserWindow) {
        window.api.showBrowserWindow()
      }
    } else {
      if (window.api?.ytHide) {
        window.api.ytHide()
      }
    }
  }, [isPlayerOpen])

  const nextTrack = useCallback(() => {
    window.api.ytCommand('next')
  }, [])

  const prevTrack = useCallback(() => {
    window.api.ytCommand('prev')
  }, [])

  const playPause = useCallback(() => {
    window.api.ytCommand('playPause')
  }, [])

  // Listener for track metadata from main process
  useEffect(() => {
    if (window.api?.onYtTrackUpdated) {
      window.api.onYtTrackUpdated((track) => {
        setCurrentTrack(track)
        setIsPlaying(true)
      })
    }
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

  // Listen for track info from browser-agent.js (when YouTube is playing)
  useEffect(() => {
    if (window.api?.onYtTrackUpdated) {
      window.api.onYtTrackUpdated((track) => {
        if (track && track.title) {
          setCurrentTrack(track)
        }
      })
    }
  }, [])

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