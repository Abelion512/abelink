import React, { useEffect, useState } from 'react'
{/* ponytail: unused imports cleaned — FaLightbulb not used */}
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeExternalLinks from 'rehype-external-links'
import HoloCard from './HoloCard'
import { CodeBlock } from '../Chat/CodeBlock'
import PluginExecutionBubble from '../Chat/PluginExecutionBubble'

// Pure: splits a long answer into tldr (first line/first sentence) and the rest.
export function splitLongAnswer(text) {
  let tldr = ''
  let rest = ''
  const firstNewlineMatch = text.match(/\n/)
  if (firstNewlineMatch) {
    const index = firstNewlineMatch.index
    tldr = text.substring(0, index).trim()
    rest = text.substring(index).trim()
  } else {
    const firstPeriod = text.indexOf('. ')
    if (firstPeriod !== -1 && firstPeriod < 200) {
      tldr = text.substring(0, firstPeriod + 1).trim()
      rest = text.substring(firstPeriod + 1).trim()
    } else {
      tldr = text.substring(0, 150) + '...'
      rest = text
    }
  }
  return { tldr, rest }
}

// Hoisted pure renderers — reused by ResponseArea (TLDR) and ResponseDetails (rest).
export const markdownComponents = {
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    return !inline ? (
      <CodeBlock match={match} children={children} />
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
  a: ({ node, ...props }) => {
    let url = props.href || '#'
    if (url !== '#' && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }
    return (
      <a
        {...props}
        onClick={(e) => {
          e.preventDefault()
          if (window.api && window.api.openExternal && url !== '#') {
            window.api.openExternal(url)
          }
        }}
      />
    )
  }
}

const ResponseArea = ({ currentResponse }) => {
  const [animState, setAnimState] = useState('idle') // 'fade-out', 'fade-in', 'idle'
  const [displayResponse, setDisplayResponse] = useState(currentResponse)

  useEffect(() => {
    if (currentResponse !== displayResponse) {
      if (displayResponse) {
        setAnimState('fade-out')
        const timer = setTimeout(() => {
          setDisplayResponse(currentResponse)
          setAnimState('fade-in')
        }, 200) // 200ms for fade-out
        return () => clearTimeout(timer)
      } else {
        setDisplayResponse(currentResponse)
        setAnimState('fade-in')
      }
    }
  }, [currentResponse, displayResponse])

  if (!displayResponse) return null

  const { text, type, reasoning, sources, pluginResult, youtubeData, youtubeSummary, isProactive, mood } =
    displayResponse

  const animationClass =
    animState === 'fade-out'
      ? 'animate-[response-fade-out_0.2s_ease-out_forwards]'
      : animState === 'fade-in'
        ? 'animate-[response-fade-in_0.3s_ease-out_forwards]'
        : ''

  const markdownComponents = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '')
      return !inline ? (
        <CodeBlock match={match} children={children} />
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      )
    },
    a: ({ node, ...props }) => {
      let url = props.href || '#'
      if (url !== '#' && !url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url
      }
      return (
        <a
          {...props}
          onClick={(e) => {
            e.preventDefault()
            if (window.api && window.api.openExternal && url !== '#') {
              window.api.openExternal(url)
            }
          }}
        />
      )
    }
  }

  const renderContent = () => {
    if (type === 'long') {
      const { tldr } = splitLongAnswer(text)

      return (
        <div className="flex flex-col items-center gap-4 w-full relative">
          {/* TLDR Part */}
          {tldr && (
            <div className="text-center text-base md:text-lg font-light leading-relaxed custom-markdown opacity-90 px-4 max-w-2xl">
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {tldr}
              </Markdown>
            </div>
          )}
        </div>
      )
    }

    // Short type
    return (
      <div className="flex flex-col items-center relative gap-2 w-full">
        <div className="text-center text-lg md:text-xl font-light leading-relaxed custom-markdown opacity-90 px-4 max-w-2xl">
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {text}
          </Markdown>
        </div>
      </div>
    )
  }

  return (
    <div className={`w-full flex flex-col items-center gap-4 ${animationClass}`}>
      {renderContent()}

      {/* Reasoning / CoT Panel */}
      {displayResponse.reasoning && (
        <div className="w-full max-w-2xl">
          <HoloCard title="Proses Pemikiran" defaultExpanded={false}>
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
              components={markdownComponents}
            >
              {displayResponse.reasoning}
            </Markdown>
          </HoloCard>
        </div>
      )}

      {/* Plugin Execution Result Chip */}
      {pluginResult && (
        <div className="mt-2 w-full flex justify-center">
          <PluginExecutionBubble pluginExecution={pluginResult} />
        </div>
      )}
    </div>
  )
}

// Details column for long answers — rendered beside the orb+TLDR on lg+ (MarkHome).
export const ResponseDetails = ({ currentResponse }) => {
  if (!currentResponse || currentResponse.type !== 'long' || !currentResponse.text) return null
  const { rest } = splitLongAnswer(currentResponse.text)
  return (
    <HoloCard title="Detail Informasi" defaultExpanded={false}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
        components={markdownComponents}
      >
        {rest || currentResponse.text}
      </Markdown>
    </HoloCard>
  )
}

export default ResponseArea
