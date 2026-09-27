// tests/loopParity.test.mjs — paritas kontrak loop (DoD M3, ADR-001).
// Keputusan D1: GUI mempertahankan loop sendiri; headless memakai
// runAgentLoop. Pengunci: KEDUA loop wajib memanggil modul governance yang
// SAMA. Test ini gagal (a) bila modul berubah kontrak, (b) bila salah satu
// loop berhenti memanggil gerbang yang wajib.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import 'fake-indexeddb/auto'

import { runAgentLoop } from '../src/api/ai/agentRunner.js'
import {
  evaluateEvidence,
  gateCompletion,
  VERIFICATION_STATE,
} from '../src/api/ai/objectiveVerifier.js'
import { createTrajectorySupervisor, MODIFY_REPEAT, ABANDON_REPEAT } from '../src/api/ai/trajectorySupervisor.js'
import { resolvePlanStepBudget } from '../src/api/ai/planStepBudget.js'
import { classifyObjectiveKind } from '../src/api/ai/objectiveVerifier.js'

const GUI_LOOP = 'src/hooks/agent/useAbelinkPlan.js'
const HEADLESS_LOOP = 'src/api/ai/agentRunner.js'

// Skema kontrak (tunggal untuk kedua loop) — kalau tabel ini berubah tanpa
// ADR, test paritas harus ikut berubah (sinyal, bukan hambatan diam-diam).
const REQUIRED_GATES = [
  'evaluateEvidence',
  'gateCompletion',
  'buildReplanObservation',
  'createTrajectorySupervisor',
  'resolvePlanStepBudget',
  'classifyObjectiveKind',
]

const src = (p) => readFileSync(p, 'utf8')

describe('loop parity — kedua loop memanggil gerbang kontrak yang sama (ADR-001)', () => {
  it('setiap gerbang wajib ada di GUI loop DAN headless loop', () => {
    const gui = src(GUI_LOOP)
    const headless = src(HEADLESS_LOOP)
    const missing = []
    for (const gate of REQUIRED_GATES) {
      if (!gui.includes(gate)) missing.push(`GUI missing: ${gate}`)
      if (!headless.includes(gate)) missing.push(`headless missing: ${gate}`)
    }
    expect(missing).toEqual([])
  })

  it('klaim selesai TANPA bukti tool (kind non-konversasional) -> REJECTED di kontrak bersama', () => {
    // (a) Kontrak murni — yang GUI petakan manual dan headless panggil langsung.
    const evidence = evaluateEvidence({ kind: 'file', objectiveText: 'tulis laporan', answer: 'selesai', tools: [] })
    const gate = gateCompletion({ modelClaimDone: true, verification: evidence.state, kind: 'file' })
    expect(gate.complete).toBe(false)
    expect(gate.replan).toBe(true)
    // (b) Buktikan headless loop benar-benar menegakkan lewat jalur penuh.
    const runner = new Function(
      'runAgentLoop',
      `return runAgentLoop({
        prompt: 'tulis laporan',
        options: { maxTurns: 4 },
        environment: {
          fetchAI: async () => ({ content: JSON.stringify({ thought: 'ok', answer: 'selesai', is_done: true, action: null }) }),
          executeTool: async () => ({ ok: true, result: 'x' })
        }
      })`
    )
    return runner(runAgentLoop).then((r) => {
      expect(r.outcome).toBe('failed')
      expect(String(r.terminalReason)).toContain('verify-')
    })
  })

  it('klaim selesai DENGAN bukti tool sukses -> COMPLETE (bukti diterima verifier)', () => {
    const evidence = evaluateEvidence({
      kind: 'file',
      objectiveText: 'tulis laporan',
      answer: 'selesai',
      tools: [{ tool: 'write-file', fullResult: 'ok, file tersimpan' }],
    })
    expect(evidence.state).toBe(VERIFICATION_STATE.VERIFIED)
    const gate = gateCompletion({ modelClaimDone: true, verification: evidence.state, kind: 'file' })
    expect(gate.complete).toBe(true)
  })

  it('supervisor: hint keluar pada ambang sama di kontrak bersama (MODIFY_REPEAT)', () => {
    const sup = createTrajectorySupervisor()
    let hint = null
    for (let i = 0; i < MODIFY_REPEAT - 1; i++) {
      const r = sup.update({ tool: 'read-file', query: 'a.md', success: true, verificationState: VERIFICATION_STATE.NOT_RUN })
      if (r?.hintText) hint = r.hintText
    }
    expect(hint).toBe(null) // di bawah ambang: belum mengganggu
    const r = sup.update({ tool: 'read-file', query: 'a.md', success: true, verificationState: VERIFICATION_STATE.NOT_RUN })
    expect(r?.hintText).toBeTruthy() // tepat di ambang: hint keluar
  })

  it('budget: resolvePlanStepBudget dipakai kedua loop; GOAL_MODE_FLOOR hanya GUI (divergensi diakui)', () => {
    // Kontrak bersama: fungsi budget yang sama.
    const b = resolvePlanStepBudget({ config: {}, userInput: 'tugas panjang', options: {} })
    expect(Number.isFinite(b)).toBe(true)
    expect(b).toBeGreaterThanOrEqual(1)
    // Divergensi diakui ADR-001: floor 48 hanya di GUI. Pin di sini agar
    // perubahan senyap tidak lewat — ubah angka = ubah ADR juga.
    const gui = src(GUI_LOOP)
    expect(gui).toContain('GOAL_MODE_FLOOR = 48')
    expect(src(HEADLESS_LOOP)).not.toContain('GOAL_MODE_FLOOR')
  })

  it('classifier: klasifikasi objektif deterministik di kontrak bersama', () => {
    // Pola tanya (akhir '?' atau awal kata tanya) -> conversational; sapaan
    // polos -> general (perilaku nyata objectiveVerifier).
    expect(classifyObjectiveKind('apa itu langit?')).toBe('conversational')
    expect(classifyObjectiveKind('halo')).toBe('general')
    expect(classifyObjectiveKind('tulis file laporan.md')).toBe('file')
  })
})
