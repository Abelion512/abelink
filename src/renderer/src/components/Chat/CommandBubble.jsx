import React, { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

export const CommandBubble = ({ content, risk, onRun }) => {
  const [executed, setExecuted] = useState(risk === 'safe' ? true : false)
  const containerClass = 'bg-base-200 p-3 rounded-xl w-full text-base-content border border-base-300'

  return (
    <div className="mb-4 ml-12 w-1/2">
      <div className={`${containerClass} shadow-md transition-all duration-300 flex flex-col gap-2`}>
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
                    onRun && onRun()
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
