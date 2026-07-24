import { useEffect, useState, useRef } from 'react'
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
    playPause
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
              // Tambahkan query parameter acak biar URL selalu dianggap baru oleh React dan Router SPA
              const url = `https://www.youtube.com/watch?v=${music[0].id}`
              playUrlRef.current(url)
            }
          })
        } else if (command === 'next') nextTrackRef.current()
        else if (command === 'prev') prevTrackRef.current()
        else if (command === 'toggle') playPauseRef.current()
      })
    }
  }, []) // Register sekali saja, tidak perlu re-register

  // Inject adblock CSS + JS into webview on dom-ready
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleDomReady = () => {
      setIsReady(true)
      webview.insertCSS(`
        /* Hide scrollbar */
        ::-webkit-scrollbar { display: none !important; width: 0 !important; }
        html, body { overflow-y: hidden !important; scrollbar-width: none !important; }

        /* Hide masthead/header */
        ytd-masthead, #masthead-container, ytd-topbar-menu-button-renderer,
        ytd-searchbox, #search-container {
          display: none !important;
        }

        /* Hide sidebar */
        ytd-guide-renderer, #guide, ytd-browse-renderer, ytd-thumbnail-overlay-time-status-renderer {
          display: none !important;
        }

        /* Hide video info section below player */
        #above-the-fold, #title, #meta, #info, #info-contents,
        ytd-video-primary-info-renderer, ytd-video-secondary-info-renderer,
        #description, #description-inline-expander, #expand,
        ytd-reel-video-renderer, #below-the-fold,
        ytd-watch-metadata, ytd-watch-flexy {
          display: none !important;
        }

        /* Hide comments, related videos, suggestions */
        ytd-comments, ytd-item-section-renderer, ytd-continuation-item-renderer,
        ytd-watch-next-tabbed-results-renderer, ytd-structured-description-content-renderer,
        ytd-video-description-transcript-section-renderer {
          display: none !important;
        }

        /* Hide subscribe, like, share buttons */
        #subscribe-button, #like-button, #segmented-dislike-button,
        ytd-menu-renderer, ytd-button-renderer, #primary-button,
        ytd-subscribe-button-renderer, ytd-toggle-button-renderer {
          display: none !important;
        }

        /* Hide ad containers */
        .ad-showing, .ad-interrupting, .ytp-ad-overlay-container, .ytp-ad-message-container,
        #premium-ytd, ytd-mealbar-promo-renderer, ytd-banner-promo-renderer,
        ytd-banner-promo-renderer-background, ytd-popup-container {
          display: none !important;
        }

        ytd-guide-entry-renderer[icon*='premium'],
        ytd-pivot-bar-item-renderer[tab-id*='premium'] {
          display: none !important;
        }

        /* Make video player full width */
        #movie_player, .html5-video-player {
          width: 100% !important;
          height: auto !important;
        }

        video {
          width: 100% !important;
          height: auto !important;
        }
      `)

      webview.executeJavaScript(`
        (function() {
          setInterval(() => {
            const video = document.querySelector('video');
            const ad = document.querySelector('.ad-showing, .ad-interrupting');
            const skip = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
            const confirm = document.querySelector('.ytd-popup-container button, .ytd-button-renderer button, #confirm-button button');

            if (ad && video) {
              video.muted = true;
              video.playbackRate = 16;
              if (isFinite(video.duration)) video.currentTime = video.duration - 0.1;
              if (skip) skip.click();
            } else if (video && video.muted) {
              video.muted = false;
              video.playbackRate = 1;
            }
            if (confirm) confirm.click();

            // Force-hide page clutter dynamically
            const hideSelectors = [
              'ytd-masthead', '#masthead-container', 'ytd-guide-renderer', '#guide',
              '#above-the-fold', '#title', '#meta', '#info', '#info-contents',
              'ytd-video-primary-info-renderer', 'ytd-video-secondary-info-renderer',
              '#description', '#description-inline-expander',
              'ytd-comments', 'ytd-item-section-renderer',
              'ytd-watch-next-tabbed-results-renderer',
              '#subscribe-button', '#like-button', 'ytd-menu-renderer',
              'ytd-reel-video-renderer', '#below-the-fold'
            ];
            hideSelectors.forEach(sel => {
              document.querySelectorAll(sel).forEach(el => {
                el.style.display = 'none';
              });
            });
          }, 500);
        })();
      `)
    }

    const handleNewWindow = (e) => {
      // Intercept YouTube links that try to open new window — load in same webview
      if (e.url.startsWith('https://www.youtube.com/watch?v=')) {
        e.preventDefault()
        webview.loadURL(e.url)
      }
    }

    webview.addEventListener('dom-ready', handleDomReady)
    webview.addEventListener('new-window', handleNewWindow)
    return () => {
      webview.removeEventListener('dom-ready', handleDomReady)
      webview.removeEventListener('new-window', handleNewWindow)
    }
  }, [])

  // Default URL — load YouTube so user can search manually
  const DEFAULT_URL = 'https://www.youtube.com/'

  useEffect(() => {
    if (isReady && webviewRef.current && musicUrl && musicUrl !== DEFAULT_URL) {
      try {
        // Navigate directly to video URL
        webviewRef.current.executeJavaScript(`
          window.location.href = "${musicUrl}";
        `)
      } catch (e) {
        console.error('Gagal navigate:', e)
      }
    }
  }, [musicUrl, playId, isReady])

  // Inject adblock CSS + JS into webview on dom-ready
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const handleDomReady = () => {
      setIsReady(true)
      webview.insertCSS(`
        /* Hide scrollbar */
        ::-webkit-scrollbar { display: none !important; width: 0 !important; }
        html, body { overflow-y: hidden !important; scrollbar-width: none !important; }

        /* Hide masthead/header */
        ytd-masthead, #masthead-container, ytd-topbar-menu-button-renderer,
        ytd-searchbox, #search-container {
          display: none !important;
        }

        /* Hide sidebar */
        ytd-guide-renderer, #guide, ytd-browse-renderer, ytd-thumbnail-overlay-time-status-renderer {
          display: none !important;
        }

        /* Hide video info section below player */
        #above-the-fold, #title, #meta, #info, #info-contents,
        ytd-video-primary-info-renderer, ytd-video-secondary-info-renderer,
        #description, #description-inline-expander, #expand,
        ytd-reel-video-renderer, #below-the-fold,
        ytd-watch-metadata, ytd-watch-flexy {
          display: none !important;
        }

        /* Hide comments, related videos, suggestions */
        ytd-comments, ytd-item-section-renderer, ytd-continuation-item-renderer,
        ytd-watch-next-tabbed-results-renderer, ytd-structured-description-content-renderer,
        ytd-video-description-transcript-section-renderer {
          display: none !important;
        }

        /* Hide subscribe, like, share buttons */
        #subscribe-button, #like-button, #segmented-dislike-button,
        ytd-menu-renderer, ytd-button-renderer, #primary-button,
        ytd-subscribe-button-renderer, ytd-toggle-button-renderer {
          display: none !important;
        }

        /* Hide ad containers */
        .ad-showing, .ad-interrupting, .ytp-ad-overlay-container, .ytp-ad-message-container,
        #premium-ytd, ytd-mealbar-promo-renderer, ytd-banner-promo-renderer,
        ytd-banner-promo-renderer-background, ytd-popup-container {
          display: none !important;
        }

        ytd-guide-entry-renderer[icon*='premium'],
        ytd-pivot-bar-item-renderer[tab-id*='premium'] {
          display: none !important;
        }

        /* Make video player full width */
        #movie_player, .html5-video-player {
          width: 100% !important;
          height: auto !important;
        }

        video {
          width: 100% !important;
          height: auto !important;
        }
      `)

      webview.executeJavaScript(`
        (function() {
          setInterval(() => {
            const video = document.querySelector('video');
            const ad = document.querySelector('.ad-showing, .ad-interrupting');
            const skip = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
            const confirm = document.querySelector('.ytd-popup-container button, .ytd-button-renderer button, #confirm-button button');

            if (ad && video) {
              video.muted = true;
              video.playbackRate = 16;
              if (isFinite(video.duration)) video.currentTime = video.duration - 0.1;
              if (skip) skip.click();
            } else if (video && video.muted) {
              video.muted = false;
              video.playbackRate = 1;
            }
            if (confirm) confirm.click();

            // Force-hide page clutter dynamically
            const hideSelectors = [
              'ytd-masthead', '#masthead-container', 'ytd-guide-renderer', '#guide',
              '#above-the-fold', '#title', '#meta', '#info', '#info-contents',
              'ytd-video-primary-info-renderer', 'ytd-video-secondary-info-renderer',
              '#description', '#description-inline-expander',
              'ytd-comments', 'ytd-item-section-renderer',
              'ytd-watch-next-tabbed-results-renderer',
              '#subscribe-button', '#like-button', 'ytd-menu-renderer',
              'ytd-reel-video-renderer', '#below-the-fold'
            ];
            hideSelectors.forEach(sel => {
              document.querySelectorAll(sel).forEach(el => {
                el.style.display = 'none';
              });
            });
          }, 500);
        })();
      `)
    }

    webview.addEventListener('dom-ready', handleDomReady)
    return () => webview.removeEventListener('dom-ready', handleDomReady)
  }, [])

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
        <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-white/10 bg-base-300 w-full max-w-[520px] min-w-0">
          {/* Header bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-base-200/80 backdrop-blur-sm border-b border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
              <span className="text-xs font-medium text-white/60 select-none">YouTube</span>
            </div>
            <button
              onClick={() => setIsPlayerOpen(false)}
              className="btn btn-ghost btn-xs btn-circle text-white/40 hover:text-white/80"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>

          {/* Webview — responsive, no zoom, fit container */}
          <webview
            ref={webviewRef}
            src="https://www.youtube.com/"
            style={{ width: '100%', height: '380px', overflow: 'hidden' }}
            className="no-scrollbar"
            allowpopups="false"
            partition="persist:youtube"
            webpreferences="enableRemoteModule, contextIsolation=no, zoomFactor=1.0"
            useragent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
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
        {/* Pulse ring saat tertutup */}
        {!isPlayerOpen && (
          <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping pointer-events-none" />
        )}

        {isPlayerOpen ? (
          // Icon X (close)
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-300"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        ) : (
          // Icon Music Note
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="white"
            className="transition-transform duration-300 group-hover:scale-110"
          >
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        )}
      </button>
    </div>
  )
}
