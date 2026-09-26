import React, { useState } from 'react'
// ponytail: <pre><code> + CSS (react-syntax-highlighter dep dihapus);
// highlight baris-per-baris tidak dibutuhkan di jalur chat.

export const CodeBlock = React.memo(function CodeBlock({ _node, inline, className, children, ...props }) {
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
        <div className="flex items-center justify-between px-4 py-1.5 bg-base-300/50 text-[10px] uppercase tracking-wider font-bold text-white/60 border-b border-base-300">
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
                  className="text-info"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span className="text-info">Copied!</span>
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
        <pre
          {...props}
          className="!m-0 bg-transparent text-[12px] no-scrollbar overflow-x-auto p-4 font-mono text-base-content/90"
        >
          <code>{String(children).replace(/\n$/, '')}</code>
        </pre>
      </div>
    )
  }
  return (
    <code
      {...props}
      className={`${className} bg-white/10 px-1.5 py-0.5 rounded-lg text-[12px] font-mono`}
    >
      {children}
    </code>
  )
})
