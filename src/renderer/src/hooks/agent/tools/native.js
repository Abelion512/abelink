// Tool: read-file, write-file, replace-lines, delete-file, list-dir, grep-search,
// run-shell, run-cli, browser-*, native-notify
import { sanitizeToolOutput } from '../../../api/ai/output-sanitizer'
import { checkApprovalByMode } from '../../../api/ai/approval-modes'

const NATIVE_TOOLS = [
  'read-file', 'write-file', 'replace-lines', 'delete-file', 'list-dir', 'grep-search',
  'run-shell', 'run-cli', 'browser-navigate', 'browser-read', 'browser-click',
  'browser-type', 'browser-scroll', 'browser-ask-user', 'browser-close', 'native-notify'
]

export function isNativeTool(tool) {
  return NATIVE_TOOLS.includes(tool)
}

export async function executeNativeTool(ctx) {
  const { tool, query, guard, options, loopMessages, decision, failureCounters, requestApproval, config, isAutonomous, abortControllerRef } = ctx

  // --- GUARD: pre-flight check ---
  const preFlight = guard.preFlightCheck(tool, query)
  if (!preFlight.allowed) {
    if (preFlight.degrade) {
      options.disableTools = true
      return { status: 'observation', value: `[DEGRADED] ${preFlight.reason}` }
    } else {
      return { status: 'observation', value: `[ERROR] Guard rejected: ${preFlight.reason}` }
    }
  }

  // --- NATIVE TOOLS (Built-in) ---
  const toolStartTime = Date.now()
  const approvalCheck = await window.api.checkToolApproval(tool, query)

  // Approval modes check (Claude Code-inspired)
  // Source: https://code.claude.com/docs/en/agent-sdk/permissions
  const approvalMode = (config[0]?.approvalMode || 'selective')
  const modeResult = checkApprovalByMode(approvalMode, tool, !!isAutonomous)

  // Plan mode: block write tools outright
  if (modeResult.blocked) {
    const blockedResult = sanitizeToolOutput(tool, `[DITOLAK] Plan mode: "${tool}" tidak diizinkan. Hanya tool read-only.`)
    loopMessages.push(
      { role: 'assistant', content: JSON.stringify({ thought: decision?.thought, action: decision?.action }) },
      { role: 'user', content: `[OBSERVATION] ${blockedResult}` }
    )
    return { status: 'observation', value: `[DITOLAK] Plan mode: "${tool}" tidak diizinkan. Hanya tool read-only.` }
  }

  // Bypass or low-risk: skip approval modal
  if (!modeResult.needsApproval || approvalMode === 'bypass') {
    // Still do existing IPC check for tool-level blocked commands (e.g. dangerous keywords)
    if (approvalCheck.needsApproval && approvalCheck.needsApproval === 'hard_block') {
      const blockedResult = sanitizeToolOutput(tool, `[ERROR] Tool "${tool}" diblokir oleh sistem.`)
      guard.postFlightCheck(tool, `[ERROR] Tool "${tool}" diblokir oleh sistem.`, Date.now() - toolStartTime)
      loopMessages.push(
        { role: 'assistant', content: JSON.stringify({ thought: decision?.thought, action: decision?.action }) },
        { role: 'user', content: `[OBSERVATION] ${blockedResult}` }
      )
      return { status: 'observation', value: `[ERROR] Tool "${tool}" diblokir oleh sistem.` }
    }
    // Skip modal, execute directly
  } else if (approvalCheck.needsApproval && requestApproval) {
    const userApproved = await requestApproval(approvalCheck.message, tool, query)
    if (!userApproved) {
      const deniedResult = sanitizeToolOutput(tool, `[DITOLAK] User menolak eksekusi "${tool}". Cari cara lain atau tanyakan user.`)
      guard.postFlightCheck(tool, `[DITOLAK] User menolak eksekusi "${tool}". Cari cara lain atau tanyakan user.`, Date.now() - toolStartTime)

      // Granular failure tracking (Hermes-style)
      failureCounters.exact_failure++
      failureCounters.same_tool_failure[tool] = (failureCounters.same_tool_failure[tool] || 0) + 1
      failureCounters.idempotent_no_progress++

      loopMessages.push(
        {
          role: 'assistant',
          content: JSON.stringify({
            thought: decision.thought,
            action: decision.action
          })
        },
        {
          role: 'user',
          content: `[OBSERVATION] Hasil eksekusi tool "${tool}": ${deniedResult}`
        }
      )
      return { status: 'observation', value: `[DITOLAK] User menolak eksekusi "${tool}". Cari cara lain atau tanyakan user.` }
    }
  }

  const nativePromise = window.api.executeNativeTool(tool, query)
  const abortPromise = new Promise((_, reject) => {
    const onAbort = () => reject(new Error('AbortError'))
    if (abortControllerRef.current.signal.aborted) return onAbort()
    abortControllerRef.current.signal.addEventListener('abort', onAbort, { once: true })
  })

  const res = await Promise.race([nativePromise, abortPromise])
  const toolDuration = Date.now() - toolStartTime
  let resultString = ''
  if (res.success) {
    resultString = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
  } else {
    resultString = `[ERROR] ${tool} gagal: ${res.error}`
  }
  guard.postFlightCheck(tool, resultString, toolDuration)

  // Granular failure tracking (Hermes-style)
  const isError = resultString && (resultString.startsWith('[ERROR]') || resultString.startsWith('[DITOLAK]'))
  if (isError) {
    failureCounters.exact_failure++
    failureCounters.same_tool_failure[tool] = (failureCounters.same_tool_failure[tool] || 0) + 1
    failureCounters.idempotent_no_progress++
  } else {
    failureCounters.same_tool_failure[tool] = 0
    failureCounters.idempotent_no_progress = 0
  }

  return { status: 'value', value: resultString }
}
