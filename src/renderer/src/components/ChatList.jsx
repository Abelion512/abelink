import { useState, useRef, useEffect, memo } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import { scrapeGoogle } from '../api/scraping'
import { deepSearch } from '../api/scraping'
import { useYoutubeMusic } from '../contexts/YoutubeMusicContext'

const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '')
  const [isCopied, setIsCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''))
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  if (!inline && match) {
    return (
      <div className="relative group my-4 rounded-xl overflow-hidden border border-base-300 shadow-sm bg-base-200/50">
        <div className="flex items-center justify-between px-4 py-1.5 bg-base-300/50 text-[10px] uppercase tracking-wider font-bold text-white/50 border-b border-base-300">
          <span>{match[1]}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
          >
            {isCopied ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-success"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span className="text-success">Copied!</span>
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
        <SyntaxHighlighter
          {...props}
          style={oneDark}
          language={match[1]}
          PreTag="div"
          className="!m-0 !bg-transparent text-[12px] no-scrollbar"
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    )
  }
  return (
    <code
      {...props}
      className={`${className} bg-white/10 px-1.5 py-0.5 rounded-md text-[12px] font-mono`}
    >
      {children}
    </code>
  )
}

const ChatList = ({
  role = 'user',
  content = '',
  reasoning = null,
  isThinking = false,
  isSearching = false,
  query = null,
  isMemorySaved = false,
  isMemoryUpdated = false,
  isMemoryDeleted = false,
  isSummarizing = false,
  isYoutubeSummary = false,
  isYoutubeSearch = false,
  queryYoutube = '',
  youtubeLink = '',
  isSearchingMusic = false,
  isMusic = false,
  isMusicAutoplay = false,
  musicList = [],
  musicQuery = '',
  risk = 'safe',
  sources = [],
  isPlanSteps = false,
  plan = [],
  currentStep,
  sendDataWebSearch,
  onRun
}) => {
  // Default currentStep to plan.length for old history messages that don't have it
  const resolvedCurrentStep = currentStep !== undefined ? currentStep : plan.length

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
  ]
  const randomUA = useRef(userAgents[Math.floor(Math.random() * userAgents.length)])
  const { playUrl } = useYoutubeMusic()

  const isUser = role === 'user'
  const isCommand = role === 'command'
  const [executed, setExecuted] = useState(risk === 'safe' ? true : false)
  const [url, setUrl] = useState(
    `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id`
  )

  useEffect(() => {
    if (isSearching && query) {
      setUrl(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id`)
    }
  }, [query, isSearching])

  const webRef = useRef(null)
  const scrapingActive = useRef(false)
  const initialLoadHandled = useRef(false)
  const [isCaptcha, setIsCaptcha] = useState(false)

  useEffect(() => {
    const webview = webRef.current
    if (!webview || !isSearching) return
    const handleInitialLoad = () => {
      if (!initialLoadHandled.current) {
        initialLoadHandled.current = true
        onScrape(webview)
      }
    }
    webview.addEventListener('did-stop-loading', handleInitialLoad)
    return () => {
      webview.removeEventListener('did-stop-loading', handleInitialLoad)
    }
  }, [isSearching])

  const getYouTubeID = (text) => {
    const ytRegex =
      /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
    const match = text.match(ytRegex)
    return match ? match[1] : null
  }

  const youtubeVideoId = getYouTubeID(youtubeLink)
  const youtubeEmbedUrl = youtubeVideoId
    ? `https://www.youtube.com/embed/${youtubeVideoId}?rel=0`
    : null

  // Determine style and metadata
  let containerClass = isUser
    ? 'chat-bubble-primary chat-bubble'
    : 'bg-neutral text-white chat-bubble overflow-x-auto w-full border border-base-300 p-3 rounded-xl'

  if (isCommand) {
    containerClass = 'bg-base-200 p-3 rounded-xl w-full text-base-content border border-base-300'
  }

  if (isSearching) {
    containerClass = 'bg-success relative p-3 rounded-xl text-base-content border border-base-300'
  }
  if (isMusic) {
    containerClass =
      'bg-red-600 relative p-1 rounded-2xl ml-10 text-base-content border border-base-300'
  }

  const waitForLoad = (webview) => {
    return new Promise((resolve) => {
      let timeoutId
      const onDone = () => {
        clearTimeout(timeoutId)
        webview.removeEventListener('did-stop-loading', onDone)
        resolve()
      }
      timeoutId = setTimeout(onDone, 10000) // 10 second timeout for each page load
      webview.addEventListener('did-stop-loading', onDone)
    })
  }
  const onScrape = async (webview) => {
    if (scrapingActive.current) return
    scrapingActive.current = true
    const source = await scrapeGoogle(webview, url, setIsCaptcha)
    const links = []
    for (const url of source) {
      let link = null
      if (url.title === 'AI Google Summary') {
        link = { source: url.title, url: url.link, text: url.snippet }
      } else {
        setUrl(url.link)
        await waitForLoad(webview)
        link = await deepSearch(webview, url.link)
      }
      links.push(link)
    }
    sendDataWebSearch(source, links)
    scrapingActive.current = false
  }

  if (isPlanSteps && plan.length > 0) {
    return (
      <div className="chat chat-start mb-1 mt-2 opacity-70 ml-10">
        <div className="chat-bubble bg-transparent text-white p-0 shadow-none flex flex-col gap-1">
          {reasoning && (
            <details className="group">
              <summary className="text-xs cursor-pointer select-none flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="1em"
                  height="1em"
                  viewBox="0 0 1024 1024"
                  className="group-open:rotate-90 transition-transform text-[11px]"
                >
                  <path d="M0 0h1024v1024H0z" fill="none" />
                  <path
                    fill="currentColor"
                    d="M340.9 149.3a30.6 30.6 0 0 0 0 42.8L652.7 512L341 831.9a30.6 30.6 0 0 0 0 42.7a29 29 0 0 0 41.7 0l331.6-340.3a32 32 0 0 0 0-44.6L382.6 149.4a29 29 0 0 0-41.7 0z"
                  />
                </svg>
                Proses pemikiran Mark
              </summary>
              <div className="pl-4 pt-1 pb-1 text-[11px] opacity-60 border-l border-white/20 ml-1.5 mt-1.5 mb-2 whitespace-pre-wrap font-mono leading-relaxed">
                {reasoning}
              </div>
            </details>
          )}
          <details className="group">
            <summary className="text-xs cursor-pointer select-none flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="1em"
                height="1em"
                viewBox="0 0 1024 1024"
                className="group-open:rotate-90 transition-transform text-[11px]"
              >
                <path d="M0 0h1024v1024H0z" fill="none" />
                <path
                  fill="currentColor"
                  d="M340.9 149.3a30.6 30.6 0 0 0 0 42.8L652.7 512L341 831.9a30.6 30.6 0 0 0 0 42.7a29 29 0 0 0 41.7 0l331.6-340.3a32 32 0 0 0 0-44.6L382.6 149.4a29 29 0 0 0-41.7 0z"
                />
              </svg>
              Planning ({plan.length} steps)
            </summary>
            <div className="pl-4 pt-1 flex flex-col gap-1 border-l border-white/20 ml-1.5 mt-1.5 mb-2">
              {plan.map((step, idx) => {
                let prefix = idx + 1 + '.'
                let opacity = 'opacity-50'
                let suffix = ''

                if (idx < resolvedCurrentStep) {
                  prefix = '✓'
                  opacity = 'opacity-100 text-success'
                } else if (idx === resolvedCurrentStep) {
                  opacity = 'opacity-100 text-white'
                  suffix = '...'
                } else {
                  opacity = 'opacity-50 text-white'
                }

                return (
                  <div
                    key={idx}
                    className={`text-[11px] font-mono transition-opacity ${idx === resolvedCurrentStep ? 'animate-pulse text-white' : 'text-white/70'}`}
                  >
                    <span className={`${opacity} mr-1 font-bold inline-block w-3 text-center`}>
                      {prefix}
                    </span>
                    {typeof step === 'object' ? step.task : step}
                    {suffix}
                  </div>
                )
              })}
            </div>
          </details>
        </div>
      </div>
    )
  }

  // For commands, use a different layout without DaisyUI chat grid
  if (isCommand) {
    return (
      <div className="mb-4 ml-12 w-1/2">
        <div
          className={`${containerClass} shadow-md transition-all duration-300 flex flex-col gap-2`}
        >
          <SyntaxHighlighter
            language="powershell"
            style={oneDark}
            customStyle={{
              margin: 0,
              padding: '0.5rem',
              borderRadius: '0.5rem',
              fontSize: '0.75rem',
              background: '#282c34'
            }}
          >
            {content}
          </SyntaxHighlighter>
          <div className="flex items-center gap-2 mt-1">
            {risk === 'confirm' ? (
              <>
                {executed ? (
                  <span className="text-[10px] opacity-70 flex items-center gap-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-3 h-3"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Executed
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      onRun()
                      setExecuted(true)
                    }}
                    className="btn btn-xs ml-auto btn-primary border-none text-[10px]"
                  >
                    Run
                  </button>
                )}
              </>
            ) : risk === 'safe' ? (
              <span className="text-[10px] opacity-70 flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-3 h-3"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                    clipRule="evenodd"
                  />
                </svg>
                Executed
              </span>
            ) : (
              <span className="text-[10px] opacity-70 flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-3 h-3"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
                Blocked
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`chat ${isUser ? 'chat-end' : 'chat-start'} ${isSearching && 'flex flex-col'} mb-4 `}
    >
      {!isSearching && !isMusic && (
        <>
          <div className="chat-image avatar">
            <div className="w-10 rounded-full bg-neutral text-white flex items-center justify-center border border-primary/20">
              <span className="text-xs font-bold uppercase">{isUser ? 'U' : 'M'}</span>
            </div>
          </div>
          <div className="chat-header opacity-50 text-[10px] uppercase font-bold mb-1 px-1">
            {isUser ? 'You' : 'Mark AI'}
          </div>
        </>
      )}
      <div className={`${containerClass} shadow-md min-h-0 transition-all duration-300`}>
        {isThinking || isSummarizing || isSearchingMusic ? (
          <div className="flex items-center gap-2 py-1 animate-pulse">
            <span className="loading loading-dots loading-xs"></span>
            <span className="text-xs italic opacity-70">
              {isThinking && 'Mark is thinking...'}
              {isSummarizing && 'Mark is summarizing...'}
              {isSearchingMusic && 'Mark is searching music...'}
            </span>
          </div>
        ) : isSearching ? (
          <div className="aspect-video h-50 rounded-xl overflow-hidden no-scrollbar">
            {!isCaptcha && (
              <div className="flex gap-2 items-center justify-center py-1 text-lg text-white animate-pulse absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2  w-full h-full z-20">
                <svg
                  ariaHidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  width="1em"
                  height="1em"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2"
                    d="m21 21-3.5-3.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                  />
                </svg>
                <span className="italic">Mark is searching...</span>
              </div>
            )}
            <webview
              src={url}
              ref={webRef}
              style={{ zoom: '0.5' }}
              className={`w-full h-full overflow-hidden no-scrollbar zoom ${isCaptcha ? '' : 'brightness-70 blur-[2px] pointer-events-none'}`}
              useragent={randomUA.current}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {isYoutubeSummary && (
              <div className="p-3 bg-base-300 rounded-2xl my-2 space-y-3">
                {youtubeEmbedUrl ? (
                  <iframe
                    className="w-full aspect-video rounded-xl"
                    src={youtubeEmbedUrl}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  ></iframe>
                ) : (
                  <div className="aspect-video rounded-xl bg-base-200 flex items-center justify-center text-sm text-base-content/70 text-center px-4">
                    Tidak bisa memuat pemutar YouTube untuk tautan ini.
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => window.api.openExternal(youtubeLink)}
                  className="btn btn-sm btn-neutral w-full normal-case"
                >
                  Watch on YouTube
                </button>
              </div>
            )}
            {!isMusic && (
              <div className="text-sm leading-relaxed custom-markdown flex flex-col gap-1">
                {reasoning && (
                  <details className="group mb-2">
                    <summary className="list-none flex items-center gap-1.5 cursor-pointer text-[12px] font-semibold opacity-70 hover:opacity-100 transition-opacity">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="1em"
                        height="1em"
                        viewBox="0 0 1024 1024"
                        className="group-open:rotate-90 transition-transform text-[11px]"
                      >
                        <path d="M0 0h1024v1024H0z" fill="none" />
                        <path
                          fill="currentColor"
                          d="M340.9 149.3a30.6 30.6 0 0 0 0 42.8L652.7 512L341 831.9a30.6 30.6 0 0 0 0 42.7a29 29 0 0 0 41.7 0l331.6-340.3a32 32 0 0 0 0-44.6L382.6 149.4a29 29 0 0 0-41.7 0z"
                        />
                      </svg>
                      Proses pemikiran Mark
                    </summary>
                    <div className="pl-4 pt-1 pb-1 text-[11px] opacity-60 border-l border-white/20 ml-1.5 mt-1.5 mb-2 whitespace-pre-wrap font-mono leading-relaxed">
                      {reasoning}
                    </div>
                  </details>
                )}
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[
                    [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]
                  ]}
                  components={{
                    code: CodeBlock
                  }}
                >
                  {content}
                </Markdown>
              </div>
            )}
            {isYoutubeSearch && (
              <h1 className="text-xs font-bold mt-2 flex items-center gap-1 uppercase tracking-wider">
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  width="1em"
                  height="1em"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    fillRule="evenodd"
                    d="M21.7 8.037a4.26 4.26 0 0 0-.789-1.964 2.84 2.84 0 0 0-1.984-.839c-2.767-.2-6.926-.2-6.926-.2s-4.157 0-6.928.2a2.836 2.836 0 0 0-1.983.839 4.225 4.225 0 0 0-.79 1.965 30.146 30.146 0 0 0-.2 3.206v1.5a30.12 30.12 0 0 0 .2 3.206c.094.712.364 1.39.784 1.972.604.536 1.38.837 2.187.848 1.583.151 6.731.2 6.731.2s4.161 0 6.928-.2a2.844 2.844 0 0 0 1.985-.84 4.27 4.27 0 0 0 .787-1.965 30.12 30.12 0 0 0 .2-3.206v-1.516a30.672 30.672 0 0 0-.202-3.206Zm-11.692 6.554v-5.62l5.4 2.819-5.4 2.801Z"
                    clipRule="evenodd"
                  />
                </svg>
                {`Pencarian: ${queryYoutube.slice(0, 40)}`}
                {queryYoutube.length > 40 ? '...' : ''}
              </h1>
            )}
            {isYoutubeSearch && (
              <div className="p-3 bg-base-300 flex flex-wrap rounded-2xl">
                {youtubeLink.map((item, idx) => {
                  const id = typeof item === 'object' ? item.videoId : item
                  return (
                    <iframe
                      key={idx}
                      className="w-1/2 aspect-video rounded-lg"
                      src={`https://www.youtube.com/embed/${id}`}
                      title="YouTube video player"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    ></iframe>
                  )
                })}
              </div>
            )}
            {isMusic && (
              <div className="bg-base-100 rounded-2xl shadow-lg overflow-hidden border border-white/5">
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3 to-transparent border-b border-white/5">
                  <div className="p-1.5 bg-red-600 rounded-lg">
                    <svg
                      className="text-white"
                      aria-hidden="true"
                      xmlns="http://www.w3.org/2000/svg"
                      width="1em"
                      height="1em"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fillRule="evenodd"
                        d="M21.7 8.037a4.26 4.26 0 0 0-.789-1.964 2.84 2.84 0 0 0-1.984-.839c-2.767-.2-6.926-.2-6.926-.2s-4.157 0-6.928.2a2.836 2.836 0 0 0-1.983.839 4.225 4.225 0 0 0-.79 1.965 30.146 30.146 0 0 0-.2 3.206v1.5a30.12 30.12 0 0 0 .2 3.206c.094.712.364 1.39.784 1.972.604.536 1.38.837 2.187.848 1.583.151 6.731.2 6.731.2s4.161 0 6.928-.2a2.844 2.844 0 0 0 1.985-.84 4.27 4.27 0 0 0 .787-1.965 30.12 30.12 0 0 0 .2-3.206v-1.516a30.672 30.672 0 0 0-.202-3.206Zm-11.692 6.554v-5.62l5.4 2.819-5.4 2.801Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-white/80 select-none">
                      YT Music
                    </span>
                    <span className="text-[10px] text-white/40 truncate max-w-48">
                      {musicQuery}
                    </span>
                  </div>
                </div>

                {/* Track list */}
                {!musicList.length ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-white/30">
                    <svg
                      aria-hidden="true"
                      xmlns="http://www.w3.org/2000/svg"
                      width="2em"
                      height="2em"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="2"
                        d="m21 21-3.5-3.5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                      />
                    </svg>
                    <span className="text-xs">
                      Tidak ada hasil untuk <strong className="text-white/50">{musicQuery}</strong>
                    </span>
                  </div>
                ) : (
                  <ul className="flex flex-col divide-y divide-white/5">
                    {musicList.map((music, index) => (
                      <li
                        key={index}
                        className={`flex items-center w-lg gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors duration-200 group ${isMusicAutoplay && index === 0 ? 'bg-white/5' : ''}`}
                      >
                        <img
                          className="size-10 rounded-lg object-cover shadow-sm ring-1 ring-white/10"
                          src={music.thumbnail}
                          alt={music.title}
                          referrerPolicy="no-referrer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{music.title}</div>
                          <div className="text-[11px] text-white/40 truncate">{music.artist}</div>
                        </div>
                        {!isMusicAutoplay && (
                          <button
                            className="btn btn-circle btn-sm btn-ghost opacity-50 group-hover:opacity-100 transition-opacity"
                            onClick={() => playUrl(`https://music.youtube.com/watch?v=${music.id}`)}
                          >
                            <svg
                              className="size-4"
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                            >
                              <g
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                strokeWidth="2"
                                fill="none"
                                stroke="currentColor"
                              >
                                <path d="M6 3L20 12 6 21 6 3z"></path>
                              </g>
                            </svg>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {sources && sources.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-primary/10">
                <span className="text-[10px] font-bold opacity-50 w-full mb-1 uppercase tracking-wider">
                  Sources:
                </span>
                {sources.map((source, i) => (
                  <button
                    key={i}
                    onClick={() => window.api.openExternal(source.link)}
                    className="btn btn-xs btn-neutral border border-primary/20 hover:border-primary/50 normal-case text-[10px] flex items-center gap-1 bg-base-300 transform transition hover:scale-105"
                    title={source.link}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-3 h-3 text-primary"
                    >
                      <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                      <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                    </svg>
                    <span className="truncate max-w-37.5">{source.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {(isMemorySaved || isMemoryUpdated || isMemoryDeleted) && (
        <div className="chat-footer text-[10px] text-white font-bold mt-2 px-1">
          {isMemorySaved ? 'Memory Saved' : isMemoryUpdated ? 'Memory Updated' : 'Memory Deleted'}{' '}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3 h-3"
          >
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
      {isCaptcha && (
        <div className="flex chat-footer pointer-events-none justify-center gap-2 text-sm mt-2 text-yellow-300 animate-pulse">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
              clipRule="evenodd"
            />
          </svg>
          <span>Selesaikan captcha untuk melanjutkan</span>
        </div>
      )}
    </div>
  )
}

export default memo(ChatList)
