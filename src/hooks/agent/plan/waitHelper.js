// Timer penunggu cerdas: poll check() sampai done/failed/timeout/aborted.
// Tidak pernah throw: check() yang melempar diperlakukan sebagai { done: false }
// dan polling berlanjut sampai timeout; error terakhir dicatat di lastError.
//
// Kontrak:
//   waitWithTimeout({ check, timeoutMs, intervalMs = 1500, signal, onTick })
//     -> { status: 'done' | 'timeout' | 'aborted' | 'failed',
//          value, elapsedMs, checks, lastError }
//   check: async () => { done: boolean, failed?: boolean, value?: any }
export const waitWithTimeout = async ({
  check,
  timeoutMs,
  intervalMs = 1500,
  signal,
  onTick
}) => {
  const start = Date.now()
  let checks = 0
  let lastError
  for (;;) {
    if (signal?.aborted) {
      return { status: 'aborted', value: undefined, elapsedMs: Date.now() - start, checks, lastError }
    }
    checks += 1
    let res
    try {
      res = await check()
    } catch (err) {
      lastError = err
      res = { done: false }
    }
    const elapsedMs = Date.now() - start
    if (res?.failed) {
      return { status: 'failed', value: res.value, elapsedMs, checks, lastError }
    }
    if (res?.done) {
      return { status: 'done', value: res.value, elapsedMs, checks, lastError }
    }
    if (elapsedMs >= timeoutMs) {
      return { status: 'timeout', value: res?.value, elapsedMs, checks, lastError }
    }
    onTick?.(elapsedMs)
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
