import React from 'react'

export const MusicBubble = ({ musicList, musicQuery, isMusicAutoplay, playUrl }) => {
  return (
    <div className="chat chat-start mb-4">
      <div className="bg-red-600 relative p-1 rounded-2xl ml-10 text-base-content border border-base-300 shadow-md min-h-0 transition-all duration-300">
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
          {!musicList?.length ? (
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
      </div>
    </div>
  )
}
