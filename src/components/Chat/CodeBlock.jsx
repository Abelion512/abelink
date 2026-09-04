import React, { useState } from 'react'
// PrismLight + registrasi bahasa eksplisit: menghindari bundel Prism penuh
// (semua bahasa, ratusan KB) yang ikut termuat di jalur chat utama.
// Tambahkan bahasa baru di sini bila suatu saat diperlukan.
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c'
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import toml from 'react-syntax-highlighter/dist/esm/languages/prism/toml'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('shell', bash)
SyntaxHighlighter.registerLanguage('sh', bash)
SyntaxHighlighter.registerLanguage('c', c)
SyntaxHighlighter.registerLanguage('cpp', cpp)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('diff', diff)
SyntaxHighlighter.registerLanguage('go', go)
SyntaxHighlighter.registerLanguage('java', java)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('js', javascript)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('py', python)
SyntaxHighlighter.registerLanguage('rust', rust)
SyntaxHighlighter.registerLanguage('sql', sql)
SyntaxHighlighter.registerLanguage('toml', toml)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('ts', typescript)
SyntaxHighlighter.registerLanguage('tsx', typescript)
SyntaxHighlighter.registerLanguage('yaml', yaml)
SyntaxHighlighter.registerLanguage('yml', yaml)

export const CodeBlock = React.memo(({ node, inline, className, children, ...props }) => {
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
})
