// Tool: plugin fallback — any tool not matched by built-ins
export async function executePluginTool(ctx) {
  const { tool, query, pushProcess, abortControllerRef } = ctx
  const pluginProcessId = `plugin-${Date.now()}`
  pushProcess({
    id: pluginProcessId,
    type: 'plugin-execution',
    status: 'active',
    data: { action: tool, query }
  })

  const pluginPromise = window.api.executePlugin(tool, query)
  const abortPromise = new Promise((_, reject) => {
    const onAbort = () => reject(new Error('AbortError'))
    if (abortControllerRef.current.signal.aborted) return onAbort()
    abortControllerRef.current.signal.addEventListener('abort', onAbort, { once: true })
  })
  const res = await Promise.race([pluginPromise, abortPromise])
  const result = res.success
    ? (typeof res.data === 'string' ? res.data : JSON.stringify(res.data))
    : `[ERROR] Plugin ${tool} gagal: ${res.error}`

  pushProcess({
    id: pluginProcessId,
    type: 'plugin-execution',
    status: 'done',
    data: { action: tool, query, result }
  })
  return result
}
