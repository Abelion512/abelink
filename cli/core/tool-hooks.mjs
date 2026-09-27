// cli/core/tool-hooks.mjs — H5 tool gateway hooks (pre/post tool).
// Hermes H5: registry tool ada, tapi TANPA pre/post hook (bukti: grep
// preTool|postTool|onToolCall di node-tools.js = kosong). Middleware ini
// choke point SATU untuk semua host headless (CLI + TUI v1 + TUI v2):
//
//   executeToolWithHooks(core, hooks, tool, query, ctx)
//     1. onBeforeTool({tool, query, ctx}) -> null = lanjut; {ok:false,...} = BLOCK
//     2. result = await core(tool, query, ctx)   (tool error -> shape [ERROR] standar)
//     3. onAfterTool({tool, query, ok, ms, result, error, ctx})
//       -> null = lanjut; {ok:false,...} = REDAKSI (ganti hasil)
//
// Hook error TIDAK PERNAH menggagalkan turn (diameter observability, bukan
// gerbang baru yang bisa macet). Audit JSONL (logger.logToolCall) bertambah di
// sini untuk SEMUA tool — acceptance H5: "hook after menerima {tool, ok, ms}"
// + "audit JSONL bertambah".
//
// Urutan audit: logToolCall dipanggil SEBELUM onAfterTool user-hook, jadi
// redaksi hasil oleh hook tidak mengubah jejak audit (jejak = kenyataan).

const errShape = (toolName, message, code = 'tool-error') => ({
  ok: false,
  result: `[ERROR] Tool ${toolName} gagal: ${message}`,
  error: { code, message }
})

const isHookBlock = (v) => Boolean(v && typeof v === 'object' && v.ok === false)

/**
 * Bungkus satu eksekusi tool dengan pre/post hooks + audit.
 * @param {(tool: string, query: string, ctx: object) => Promise<object>} core eksekutor asli host
 * @param {{ onBeforeTool?: Function, onAfterTool?: Function, audit?: { logToolCall: Function } | null }} hooks
 * @param {string} tool
 * @param {string} query
 * @param {object} [ctx]
 */
export async function executeToolWithHooks(core, hooks, tool, query, ctx = {}) {
  const h = hooks || {}
  const name = String(tool || '?')

  // 1. PRE — block jujur bila hook menolak (mis. policy tambahan host).
  if (typeof h.onBeforeTool === 'function') {
    try {
      const pre = await h.onBeforeTool({ tool: name, query, ctx })
      if (isHookBlock(pre)) {
        h.audit?.logToolCall?.({
          tool: name, query, ok: false, rejected: true,
          resultSummary: String(pre.result || pre.error?.message || 'blocked by onBeforeTool'),
          turn: ctx.step ?? null
        })
        return pre
      }
    } catch { /* hook rusak != turn rusak */ }
  }

  // 2. CORE — normalisasi error jadi shape standar (menghilangkan duplikasi
  // try/catch yang sama di tiga host; perilaku [ERROR] identik sebelumnya).
  const t0 = Date.now()
  let result
  try {
    result = await core(name, query, ctx)
  } catch (err) {
    result = errShape(name, String(err?.message || err), 'execution-exception')
  }
  const ms = Date.now() - t0
  const ok = result?.ok === true

  // 3. AUDIT — selalu (kesuksesan/gagal/blok), sebelum hook user.
  try {
    h.audit?.logToolCall?.({
      tool: name,
      query,
      ok,
      rejected: false,
      resultSummary: typeof result?.result === 'string' ? result.result : JSON.stringify(result?.result ?? ''),
      turn: ctx.step ?? null,
      durationMs: ms
    })
  } catch { /* audit tak pernah fatal */ }

  // 4. POST — boleh redaksi hasil (mis. host menyuntik catatan), tidak bisa
  // mengubah jejak audit yang sudah ditulis.
  if (typeof h.onAfterTool === 'function') {
    try {
      const post = await h.onAfterTool({ tool: name, query, ok, ms, result, error: result?.error || null, ctx })
      if (isHookBlock(post)) return post
    } catch { /* hook rusak != turn rusak */ }
  }

  return result
}

/**
 * Factory audit H5 untuk host headless: setiap tool call tercatat ke harness
 * JSONL (via logger = createHeadlessHarnessLogger) dan sesi CLI/TUI yang SAMA
 * dipatch outcome/terminalReason-nya di akhir turn — sehingga
 * `harness:diagnose --session <id>` dan `/usage` menemukan jejak sesi TUI.
 *
 * Patch sesi best-effort + injectable (loadFn/saveFn) supaya test hermetik;
 * gagal persist TIDAK pernah menggagalkan turn (audit != jalur kritis).
 *
 * @param {{ logger: object, sessionId: string, deps?: { loadFn?: Function, saveFn?: Function } }} opts
 */
export function createToolAuditLogger({ logger, sessionId, deps = {} } = {}) {
  let auditCount = 0
  // Semantik turn headless: SATU RUN PROMPT = SATU TURN harness (start/end
  // selalu berpasangan dengan nomor yang sama — bebas red-flag palsu di
  // harness:diagnose). Step INTERNAL loop ReAct disimpan di field `step`
  // record tool, bukan di nomor turn. runCount = akumulasi lintas run dalam
  // satu sesi (offset turn), direset saat audit dibuat ulang (/new, /continue).
  let runCount = 0
  let pendingStart = null
  return {
    // Kunci sesi: host membandingkan ini dengan sessionId aktif agar audit
    // di-recreate saat /new atau /continue (runCount turn harus reset).
    forSession: sessionId,
    auditCount: () => auditCount,
    // Panggil host tepat sebelum runAgentLoop: frame start turn berikutnya.
    // Meta (prompt efektif + provider/model/effort) = PLAN-T1 — inilah yang
    // dulu TIDAK pernah terekam sehingga bug "kadang input kosong" tak
    // bisa di-root-cause.
    beginTurn: ({ prompt = null, provider = null, model = null, effort = null } = {}) => {
      pendingStart = runCount + 1
      try {
        logger?.logTurnStart?.({
          turn: pendingStart,
          prompt: typeof prompt === 'string' ? prompt.slice(0, 2000) : prompt,
          provider,
          model,
          effort
        })
      } catch { }
    },
    logToolCall: (entry) => {
      auditCount += 1
      try {
        logger?.logToolCall?.({
          ...entry,
          // turn = nomor run (pasangan start/end); step = nomor iterasi loop
          // dalam run ini (detail internal, tidak dipakai pairing).
          turn: pendingStart ?? entry?.turn ?? null,
          step: entry?.turn ?? null
        })
      } catch { /* tak pernah fatal */ }
    },
    finalize: async ({ outcome = null, terminalReason = null } = {}) => {
      const turn = pendingStart ?? (runCount + 1)
      try { logger?.logTurnEnd?.({ turn, outcome, reason: terminalReason }) } catch { }
      runCount += 1
      pendingStart = null
      if (!sessionId) return
      try {
        const loadFn = deps.loadFn || null
        const saveFn = deps.saveFn || null
        if (typeof loadFn !== 'function' || typeof saveFn !== 'function') return
        const loaded = await loadFn(sessionId)
        const session = loaded?.session || loaded || null
        if (!session || typeof session !== 'object' || !session.id) return
        if (outcome != null) session.outcome = outcome
        if (terminalReason != null) session.terminalReason = terminalReason
        session.updatedAt = new Date().toISOString()
        await saveFn(session)
      } catch { /* persist audit tak pernah fatal */ }
    }
  }
}
