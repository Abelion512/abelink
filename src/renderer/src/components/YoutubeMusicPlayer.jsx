import { useEffect, useState, useRef, useCallback } from 'react'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'

export const YoutubeMusicPlayer = () => {
  const {
    musicUrl,
    isPlayerOpen,
    setIsPlayerOpen,
    togglePlayer,
    webviewRef,
    playUrl,
    playId,
    nextTrack,
    prevTrack,
    playPause,
    playbackError,
    setPlaybackError
  } = useYoutubeMusic()
  const [isReady, setIsReady] = useState(false)

  // IPC listeners — register sekali saja saat mount, pakai ref agar selalu akses fungsi terbaru
  const playUrlRef = useRef(playUrl)
  const nextTrackRef = useRef(nextTrack)
  const prevTrackRef = useRef(prevTrack)
  const playPauseRef = useRef(playPause)

  useEffect(() => {
    playUrlRef.current = playUrl
    nextTrackRef.current = nextTrack
    prevTrackRef.current = prevTrack
    playPauseRef.current = playPause
  }, [playUrl, nextTrack, prevTrack, playPause])

  useEffect(() => {
    if (window.api?.onExecuteMusicCommand) {
      window.api.onExecuteMusicCommand((command, payload) => {
        if (command === 'play' && payload) playUrlRef.current(payload)
        else if (command === 'next') nextTrackRef.current()
        else if (command === 'prev') prevTrackRef.current()
        else if (command === 'toggle') playPauseRef.current()
      })
    }
    if (window.api?.onExecuteMusicCommandWa) {
      window.api.onExecuteMusicCommandWa((command, payload) => {
        if (command === 'play' && payload) {
          window.api.searchMusic(payload).then((music) => {
            if (music && music.length > 0) {
              // Gunakan URL bersih tanpa parameter _t yang asing bagi YouTube Music
              const url = `https://music.youtube.com/watch?v=${music[0].id}`
              playUrlRef.current(url)
            }
          })
        } else if (command === 'next') nextTrackRef.current()
        else if (command === 'prev') prevTrackRef.current()
        else if (command === 'toggle') playPauseRef.current()
      })
    }
  }, [])

  // Retry state untuk ERR_FAILED (-2/-3) — ref agar tidak trigger re-render
  const lastLoadedUrlRef = useRef(null)
  const retryTimerRef = useRef(null)
  const retryCountRef = useRef(0)

  // Init webview: CSS, ad-blaster, error detection, new-window handler
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleDomReady = () => {
      setIsReady(true)

      // CSS: hide scrollbar, premium upsells, login popups
      webview.insertCSS(`
        ::-webkit-scrollbar { display: none !important; width: 0 !important; }
        html, body { overflow-y: scroll !important; scrollbar-width: none !important; }
        .ytp-chrome-top, .ytp-chrome-bottom, .ytp-gradient-top, .ytp-gradient-bottom {
          opacity: 1 !important;
        }
        #movie_player, .html5-video-player { max-height: 400px !important; }
        #premium-ytd, ytd-mealbar-promo-renderer, ytd-banner-promo-renderer,
        ytd-banner-promo-renderer-background, ytd-popup-container {
          display: none !important;
        }
        ytd-guide-entry-renderer[icon*='premium'],
        ytd-pivot-bar-item-renderer[tab-id*='premium'] {
          display: none !important;
        }
        /* Sembunyikan popup promosi, overlay backdrop, dan promo login/sign-in */
        ytmusic-popup-container, iron-overlay-backdrop, ytmusic-upsell-dialog-renderer,
        ytmusic-sign-in-promo-renderer, ytmusic-modal-with-title-and-button-renderer,
        yt-confirm-dialog-renderer, #consent-bump, ytmusic-consent-bump-renderer {
          display: none !important;
        }
      `)

      // Ad-blaster — smart: uses MutationObserver instead of aggressive setInterval
      // Only engages when ad container appears, never overrides user controls
      webview.executeJavaScript(`
        (function() {
          let adActive = false;
          const observer = new MutationObserver(() => {
            const ad = document.querySelector('.ad-showing, .ad-interrupting');
            const skip = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
            const video = document.querySelector('video');
            if (ad && video && !adActive) {
              adActive = true;
              video.muted = true;
              video.playbackRate = 16;
              if (isFinite(video.duration)) video.currentTime = video.duration - 0.1;
              if (skip) skip.click();
            } else if (!ad && adActive) {
              adActive = false;
              if (video) { video.muted = false; video.playbackRate = 1; }
            }
            if (skip) skip.click();
            const confirm = document.querySelector('#confirm-button button, .ytd-popup-container button');
            if (confirm) confirm.click();
          });
          observer.observe(document.body, { childList: true, subtree: true });
        })();
      `).catch(() => {})
    }

    // Error detection + retry on ERR_FAILED (-2/-3)
    const handleFailLoad = (event, errorCode, errorDesc) => {
      const errMsg = `Error ${errorCode}: ${errorDesc}`
      console.error('[YT Webview] Load failed:', errMsg)
      if ((errorCode === -2 || errorCode === -3) && lastLoadedUrlRef.current) {
        retryCountRef.current++
        if (retryCountRef.current <= 2) {
          const delay = 2000 * retryCountRef.current
          console.warn(`[YT] ERR_FAILED (${errorCode}), retry ${retryCountRef.current}/2 in ${delay}ms...`)
          retryTimerRef.current = setTimeout(() => {
            if (webviewRef.current && lastLoadedUrlRef.current) {
              webviewRef.current.loadURL(lastLoadedUrlRef.current)
            }
          }, delay)
          return
        }
      }
      setPlaybackError(errMsg)
    }

    const handleNewWindow = (e) => {
      if (e.url.startsWith('https://www.youtube.com/watch?v=')) {
        e.preventDefault()
        webview.loadURL(e.url)
      }
    }

    webview.addEventListener('dom-ready', handleDomReady)
    webview.addEventListener('did-fail-load', handleFailLoad)
    webview.addEventListener('new-window', handleNewWindow)

    return () => {
      webview.removeEventListener('dom-ready', handleDomReady)
      webview.removeEventListener('did-fail-load', handleFailLoad)
      webview.removeEventListener('new-window', handleNewWindow)
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [])

  // Navigate to YT watch page when music changes
  useEffect(() => {
    if (isReady && webviewRef.current && musicUrl) {
      setPlaybackError(null)
      retryCountRef.current = 0
      const videoId = extractVideoId(musicUrl)
      const cleanUrl = videoId
        ? `https://music.youtube.com/watch?v=${videoId}`
        : musicUrl
      lastLoadedUrlRef.current = cleanUrl
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      webviewRef.current.loadURL(cleanUrl)
    }
  }, [musicUrl, playId, isReady])

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none max-w-[90vw]">
      {/* Player Panel */}
      <div
        className={`
          transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom-right w-full
          ${
            isPlayerOpen
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 translate-y-4 pointer-events-none'
          }
        `}
      >
        <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-white/10 bg-base-300 w-full max-w-[420px] min-w-0">
          {/* Header bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-base-200/80 backdrop-blur-sm border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
              <span className="text-xs font-medium text-white/60 select-none">YouTube Music</span>
            </div>
            <button
              onClick={() => setIsPlayerOpen(false)}
              className="btn btn-ghost btn-xs btn-circle text-white/40 hover:text-white/80"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </div>
          {/* Source: YouTube Music Merger */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-black/20">
            <span className="text-[10px] text-white/40 font-mono tracking-wider">ytmusic</span>
            <span className="text-[10px] text-white/20">MARK</span>
          </div>
          {/* Webview */}
          <webview
            ref={webviewRef}
            src="https://music.youtube.com/"
            style={{ width: '480px', height: '360px' }}
            className="no-scrollbar rounded-b-2xl"
            allowpopups="false"
            partition="persist:youtube"
            webpreferences="contextIsolation=yes"
            useragent={navigator.userAgent}
          />
        </div>
      </div>
      {/* Floating Action Button */}
      <button
        onClick={togglePlayer}
        className={`
          group relative w-14 h-14 rounded-full flex items-center justify-center pointer-events-auto
          shadow-lg shadow-black/30 border border-white/10
          transition-all duration-300 ease-out
          hover:scale-110 hover:shadow-xl hover:shadow-red-500/20
          active:scale-95
          ${
            isPlayerOpen
              ? 'bg-red-600 hover:bg-red-700 rotate-0'
              : 'bg-linear-to-br from-red-600 to-red-800 hover:from-red-500 hover:to-red-700'
          }
        `}
        title={isPlayerOpen ? 'Tutup Player' : 'Buka YouTube'}
      >
        {!isPlayerOpen && (
          <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping pointer-events-none" />
        )}
        {isPlayerOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
        )}
      </button>
    </div>
  )
}

function extractVideoId(url) {
  if (!url) return null
  const patterns = [
    /(?:youtube\.com\/watch\?v=|music\.youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m && m[1]) return m[1]
  }
  return null
}
