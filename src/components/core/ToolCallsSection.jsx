import { useState } from 'react'
import {
  Search,
  Mail,
  Calendar,
  GitBranch,
  Brain,
  Code2,
  Globe,
  Users,
  Wrench,
  ChevronRight,
} from 'lucide-react'

const ACCENT = '#0a84ff'

// Gaia pattern: keyword rules mapping tool names/categories to Lucide icons.
// `Github` brand icon was removed from lucide-react — GitBranch covers git tools.
const CATEGORY_RULES = [
  [/gmail|mail|email/, Mail],
  [/calendar/, Calendar],
  [/git(hub)?/, GitBranch],
  [/memory|remember|vector|rag|document/, Brain],
  [/code|shell|bash|run-|file|fs_/, Code2],
  [/search|scrape/, Search],
  [/browser|web|fetch|youtube|music/, Globe],
  [/handoff|subagent|spawn|delegate/, Users],
]

function iconComponentFor(call) {
  const src = `${call.tool_category || ''} ${call.tool_name || ''}`.toLowerCase()
  for (const [re, Icon] of CATEGORY_RULES) {
    if (re.test(src)) return Icon
  }
  return Wrench
}

// Static wrapper: Icon arrives via props (never created in render scope),
// satisfying react-hooks/static-components.
function ToolCallIcon({ Icon, className }) {
  return <Icon className={className} style={{ color: ACCENT }} />
}

function formatValue(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function ToolCallRow({ call }) {
  const [open, setOpen] = useState(false)
  const Icon = iconComponentFor(call)
  const inputsText = formatValue(call.inputs)
  const outputText = formatValue(call.output)
  const expandable = inputsText !== null || outputText !== null

  return (
    <div className="rounded-lg border border-white/5 bg-black/20 overflow-hidden">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={expandable ? open : undefined}
        aria-label={`Tool ${call.tool_name || 'tool'}${expandable ? '' : ' (no details)'}`}
        className={`w-full flex items-center gap-2 px-2 py-1.5 text-left ${expandable ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'}`}
      >
        <ToolCallIcon Icon={Icon} className="w-3.5 h-3.5 shrink-0" />
        <span className="font-mono text-[11px] font-bold text-white/80 truncate">
          {call.tool_name || 'tool'}
        </span>
        {call.message && (
          <span className="font-mono text-[10px] text-white/60 truncate flex-1">
            {call.message}
          </span>
        )}
        {expandable && (
          <ChevronRight
            className={`w-3 h-3 shrink-0 text-white/60 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          />
        )}
      </button>
      {expandable && (
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <div className="px-2 pb-2 space-y-1.5">
              {inputsText !== null && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: ACCENT }}>
                    Inputs
                  </div>
                  <pre className="font-mono text-[10px] text-white/80 whitespace-pre-wrap break-all bg-black/40 rounded p-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                    {inputsText}
                  </pre>
                </div>
              )}
              {outputText !== null && (
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: ACCENT }}>
                    Output
                  </div>
                  <div className="font-mono text-[10px] text-white/80 whitespace-pre-wrap break-all bg-black/40 rounded p-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {outputText}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ToolCallsSection({
  toolCalls = [],
  defaultExpanded = false,
  className = '',
  maxIconsToShow = 10,
  title,
}) {
  const [open, setOpen] = useState(defaultExpanded)

  if (!toolCalls || toolCalls.length === 0) return null

  const seen = new Set()
  const stackIcons = []
  for (const call of toolCalls) {
    const Icon = iconComponentFor(call)
    if (!seen.has(Icon)) {
      seen.add(Icon)
      stackIcons.push(Icon)
    }
    if (stackIcons.length >= maxIconsToShow) break
  }

  const heading = title || `Used ${toolCalls.length} tool${toolCalls.length === 1 ? '' : 's'}`

  return (
    <div className={`rounded-xl border border-white/10 bg-black/30 overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${heading} — ${open ? 'collapse' : 'expand'}`}
        className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 text-left"
      >
        <span className="flex -space-x-1.5">
          {stackIcons.map((Icon, idx) => (
            <span key={idx} className="rounded-full bg-black/60 border border-white/15 p-1">
              <ToolCallIcon Icon={Icon} className="w-3 h-3" />
            </span>
          ))}
        </span>
        <span className="text-[11px] font-bold text-white/80 flex-1">
          {heading}
        </span>
        <ChevronRight
          className={`w-3.5 h-3.5 text-white/60 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="px-2 pb-2 space-y-1.5">
            {toolCalls.map((call, idx) => (
              <ToolCallRow key={idx} call={call} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
