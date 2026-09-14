// Regression tests: objective-aware termination semantics (PR #22 audit).
// Target: src/api/ai/agentDecision.js — pure classification shared by the main
// ReAct loop (useAbelinkPlan) and the sub-agent executor.
//
// These tests pin the NON-NEGOTIABLE agentic contract:
//   - `answer` alone is NOT a termination signal.
//   - A mission ends only via an explicit completion claim, a real block, or a
//     genuine request for a user decision.
//   - A recoverable tool error must NOT turn into "error -> answer -> terminate".

import { describe, it, expect } from 'vitest'
import {
  classifyMainDecision,
  classifySubagentAnswer,
  INTENT,
  isBlockedText,
  isQuestionText
} from '../src/api/ai/agentDecision.js'

const action = { tool: 'run-shell', arguments: { query: 'ls' } }

describe('classifyMainDecision — premature termination regression', () => {
  it('answer WITHOUT completion while mission active => CONTINUE, never FINAL', () => {
    const r = classifyMainDecision(
      { thought: 'belum selesai', action: null, answer: 'Masih saya kerjakan.' },
      { hasExecutedTools: true, missionActive: true }
    )
    expect(r.intent).toBe(INTENT.CONTINUE)
    expect(r.terminal).toBe(false)
  })

  it('answer WITHOUT completion after tools ran => CONTINUE (chatbot trap)', () => {
    const r = classifyMainDecision(
      { thought: 'hmm', answer: 'Saya perlu memeriksa satu file lagi.' },
      { hasExecutedTools: true }
    )
    expect(r.intent).toBe(INTENT.CONTINUE)
    expect(r.terminal).toBe(false)
  })

  it('action always wins => ACT (observe then decide again)', () => {
    const r = classifyMainDecision({ thought: 'x', action, answer: null }, {})
    expect(r.intent).toBe(INTENT.ACT)
    expect(r.terminal).toBe(false)
  })
})

describe('classifyMainDecision — completed task terminates', () => {
  it('explicit is_done: true => FINAL', () => {
    const r = classifyMainDecision(
      { thought: 'selesai', action: null, answer: 'File dibuat.', is_done: true },
      { hasExecutedTools: true, missionActive: true }
    )
    expect(r.intent).toBe(INTENT.FINAL)
    expect(r.terminal).toBe(true)
  })

  it('task_status done after tools => FINAL', () => {
    const r = classifyMainDecision(
      { thought: 'ok', action: null, answer: 'Selesai.', task_status: 'done' },
      { hasExecutedTools: true, missionActive: true }
    )
    expect(r.intent).toBe(INTENT.FINAL)
  })

  it('plain conversational answer with no mission in flight stays backward compatible => FINAL', () => {
    const r = classifyMainDecision({ thought: '', action: null, answer: 'Siap!' }, {})
    expect(r.intent).toBe(INTENT.FINAL)
    expect(r.reason).toBe('conversational-answer')
  })

  it('conversational objectiveKind delivers final answer directly without loop', () => {
    const r = classifyMainDecision(
      { thought: 'ide', action: null, answer: 'Ini hasil brainstorming.', objective: 'Brainstorm ide' },
      { objectiveKind: 'conversational' }
    )
    expect(r.intent).toBe(INTENT.FINAL)
    expect(r.terminal).toBe(true)
    expect(r.reason).toBe('conversational-answer')
  })

  it('answer with objective string but no active mission and no executed tools => FINAL', () => {
    const r = classifyMainDecision(
      { thought: '', action: null, answer: 'Tentu!', objective: 'Bantu user' },
      { hasExecutedTools: false, missionActive: false }
    )
    expect(r.intent).toBe(INTENT.FINAL)
    expect(r.terminal).toBe(true)
  })

  it('tools-disabled mode (greeting) => FINAL', () => {
    const r = classifyMainDecision({ action: null, answer: 'Halo' }, { disableTools: true })
    expect(r.intent).toBe(INTENT.FINAL)
  })
})

describe('classifyMainDecision — blocked / needs-user states are distinct', () => {
  it('task_status blocked => BLOCKED, not FINAL', () => {
    const r = classifyMainDecision(
      { action: null, answer: 'tidak bisa lanjut', task_status: 'blocked' },
      { hasExecutedTools: true, missionActive: true }
    )
    expect(r.intent).toBe(INTENT.BLOCKED)
    expect(r.terminal).toBe(true)
  })

  it('permission-denied answer text => BLOCKED', () => {
    const r = classifyMainDecision(
      { action: null, answer: 'Tidak diizinkan: butuh persetujuan untuk menulis file.' },
      { hasExecutedTools: true, missionActive: true }
    )
    expect(r.intent).toBe(INTENT.BLOCKED)
    expect(isBlockedText('DITOLAK: membutuhkan izin admin')).toBe(true)
  })

  it('question to the user while a mission is open => NEEDS_USER (request decision)', () => {
    const r = classifyMainDecision(
      { thought: 'perlu keputusan', action: null, answer: 'Boleh saya menghapus file itu?' },
      { hasExecutedTools: false, missionActive: true }
    )
    expect(r.intent).toBe(INTENT.NEEDS_USER)
    expect(isQuestionText('Apakah kamu yakin?')).toBe(true)
  })

  it('question in a plain chat (no mission) stays final — backward compatible', () => {
    const r = classifyMainDecision({ action: null, answer: 'Boleh saya bantu hal lain?' }, {})
    expect(r.intent).toBe(INTENT.FINAL)
  })

  it('objective still open (in_progress) keeps loop going', () => {
    const r = classifyMainDecision(
      { action: null, answer: 'jalan terus', task_status: 'in_progress' },
      { hasExecutedTools: true }
    )
    expect(r.intent).toBe(INTENT.CONTINUE)
  })
})

describe('classifySubagentAnswer — recoverable tool failure must not terminate', () => {
  it('answer right after a tool ERROR => continue (recover-after-error)', () => {
    const r = classifySubagentAnswer(
      { thought: 'gagal', action: null, answer: 'File tidak ada, coba cari lokasi lain.' },
      {
        hasExecutedTools: true,
        lastObservation: '[ERROR] File tidak ditemukan',
        autoRecoverUsed: 0
      }
    )
    expect(r.type).toBe('continue')
    expect(r.reason).toBe('recover-after-error')
  })

  it('answer after error, recovery budget exhausted => blocked, NOT silent final', () => {
    const r = classifySubagentAnswer(
      { thought: 'x', action: null, answer: 'Masih gagal setelah dicoba.' },
      {
        hasExecutedTools: true,
        lastObservation: '[ERROR] timeout',
        autoRecoverUsed: 2,
        maxAutoRecover: 2
      }
    )
    expect(r.type).toBe('blocked')
  })

  it('completed mission with explicit completion => final', () => {
    const r = classifySubagentAnswer(
      { thought: 'x', action: null, answer: 'Beres.', completion: 'done' },
      { hasExecutedTools: true }
    )
    expect(r.type).toBe('final')
  })

  it('sub-agent asks for info it could gather itself => needs_input, never silent final', () => {
    const r = classifySubagentAnswer(
      { thought: 'x', action: null, answer: 'Apa URL repo yang harus saya buka?' },
      { hasExecutedTools: false }
    )
    expect(r.type).toBe('needs_input')
  })

  it('empty decision keeps the executor looping', () => {
    const r = classifySubagentAnswer({ thought: 'x' }, { hasExecutedTools: true })
    expect(r.type).toBe('continue')
  })
})

describe('classifySubagentAnswer: truncated output never becomes a silent final', () => {
  it('marker SISA DATA DIPOTONG in answer => continue (truncated-subagent-output)', () => {
    const r = classifySubagentAnswer(
      { thought: 'x', action: null, answer: 'Parsial... [SISA DATA DIPOTONG (Total: 5 karakter)]' },
      { hasExecutedTools: true }
    )
    expect(r.type).toBe('continue')
    expect(r.reason).toBe('truncated-subagent-output')
  })

  it('marker SISA OUTPUT DIPOTONG in lastObservation => continue (truncated-subagent-output)', () => {
    const r = classifySubagentAnswer(
      { thought: 'x', action: null, answer: 'Laporan lengkap.' },
      {
        hasExecutedTools: true,
        lastObservation: '[run-shell] ok\n\n[SISA OUTPUT DIPOTONG (Total: 9 karakter)]'
      }
    )
    expect(r.type).toBe('continue')
    expect(r.reason).toBe('truncated-subagent-output')
  })

  it('truncation marker beats an explicit done claim (is_done)', () => {
    const r = classifySubagentAnswer(
      {
        thought: 'x',
        action: null,
        answer: 'Parsial... [SISA OUTPUT DIPOTONG (Total: 9 karakter)]',
        is_done: true
      },
      { hasExecutedTools: true }
    )
    expect(r.type).toBe('continue')
    expect(r.reason).toBe('truncated-subagent-output')
  })

  it('clean answer with no marker still resolves FINAL', () => {
    const r = classifySubagentAnswer(
      { thought: 'x', action: null, answer: 'Laporan lengkap tanpa potongan.' },
      { hasExecutedTools: true }
    )
    expect(r.type).toBe('final')
  })

  it("unrelated prose with 'dipotong' but no SISA marker is not flagged", () => {
    const r = classifySubagentAnswer(
      { thought: 'x', action: null, answer: 'Anggaran dipotong tahun ini, laporan tetap lengkap.' },
      { hasExecutedTools: true }
    )
    expect(r.type).toBe('final')
    expect(r.reason).not.toBe('truncated-subagent-output')
  })
})

describe('classifySubagentAnswer: explicit done never beats truncation', () => {
  it("completion done + truncated answer => continue (truncated-subagent-output)", () => {
    const r = classifySubagentAnswer(
      {
        thought: 'x',
        action: null,
        answer: 'Parsial... [SISA OUTPUT DIPOTONG (Total: 9 karakter)]',
        completion: 'done'
      },
      { hasExecutedTools: true }
    )
    expect(r.type).toBe('continue')
    expect(r.reason).toBe('truncated-subagent-output')
  })

  it('completion done + clean answer + truncated observation => continue (truncated-subagent-output)', () => {
    const r = classifySubagentAnswer(
      { thought: 'x', action: null, answer: 'Laporan lengkap.', completion: 'done' },
      {
        hasExecutedTools: true,
        lastObservation: '[run-shell] ok\n\n[SISA DATA DIPOTONG (Total: 5 karakter)]'
      }
    )
    expect(r.type).toBe('continue')
    expect(r.reason).toBe('truncated-subagent-output')
  })

  it('self-terminate still beats truncation (explicit marker and text)', () => {
    const viaMarker = classifySubagentAnswer(
      {
        thought: 'x',
        action: null,
        answer: 'Parsial... [SISA OUTPUT DIPOTONG (Total: 9 karakter)]',
        completion: 'self_terminate'
      },
      { hasExecutedTools: true }
    )
    expect(viaMarker.type).toBe('self_terminated')

    const viaText = classifySubagentAnswer(
      {
        thought: 'x',
        action: null,
        answer: 'Saya menghentikan diri karena di luar scope. [SISA DATA DIPOTONG (Total: 5 karakter)]'
      },
      { hasExecutedTools: true }
    )
    expect(viaText.type).toBe('self_terminated')
  })

  it('emitted action still beats truncation => continue (action)', () => {
    const r = classifySubagentAnswer(
      {
        thought: 'x',
        action,
        answer: 'Parsial... [SISA OUTPUT DIPOTONG (Total: 9 karakter)]'
      },
      { hasExecutedTools: true }
    )
    expect(r.type).toBe('continue')
    expect(r.reason).toBe('action')
  })
})
