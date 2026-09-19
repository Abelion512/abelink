import { describe, it, expect } from 'vitest'
import {
  MANDATORY_HANDOFF_FIELDS,
  validateHandoffContract,
  buildHandoffContract,
  formatHandoffContractPrompt
} from '../src/api/ai/handoffContract.js'

describe('validateHandoffContract (Contract Invariants)', () => {
  it('7 field wajib terdefinisi pada MANDATORY_HANDOFF_FIELDS', () => {
    expect(MANDATORY_HANDOFF_FIELDS).toEqual([
      'objective',
      'done',
      'remaining',
      'blocked',
      'artifacts',
      'verified',
      'next_action'
    ])
  })

  it('validasi lolos jika semua 7 field valid', () => {
    const sample = {
      objective: 'Implementasi auth backend',
      done: ['[Step 1] Inisialisasi token auth'],
      remaining: ['[Step 2] Integrasi refresh token'],
      blocked: null,
      artifacts: [{ path: 'src/auth.js', contentHash: 'abc12345', summary: 'Modul auth' }],
      verified: { isVerified: true },
      next_action: 'Jalankan pengujian endpoint auth'
    }

    const res = validateHandoffContract(sample)
    expect(res.valid).toBe(true)
    expect(res.missing).toEqual([])
    expect(res.errors).toEqual([])
  })

  it('validasi gagal jika ada field yang hilang atau salah tipe', () => {
    const invalidSample = {
      objective: 'Tugas parsial',
      done: 'Bukan array', // salah tipe
      // remaining hilang
      blocked: 'Bukan array atau null', // salah tipe
      artifacts: [],
      verified: false
      // next_action hilang
    }

    const res = validateHandoffContract(invalidSample)
    expect(res.valid).toBe(false)
    expect(res.missing).toContain('remaining')
    expect(res.missing).toContain('next_action')
    expect(res.errors.length).toBeGreaterThan(0)
  })
})

describe('buildHandoffContract', () => {
  const mockTask = {
    id: 'task-101',
    title: 'Migrasi database',
    objective: 'Migrasi schema database ke v30',
    status: 'running',
    currentStepIndex: 1,
    activeStepId: 'task-101-step-2',
    steps: [
      {
        id: 'task-101-step-1',
        index: 0,
        title: 'Step 1: Backup DB',
        objective: 'Buat snapshot DB',
        status: 'completed',
        outputSummary: 'Backup sukses dibuat ke backup.json',
        artifactPath: 'backup.json',
        contentHash: 'hash-001',
        verification: { state: 'pass' }
      },
      {
        id: 'task-101-step-2',
        index: 1,
        title: 'Step 2: Jalankan Migrasi',
        objective: 'Terapkan migrasi tabel baru',
        status: 'running',
        acceptanceCriteria: ['Tabel baru terdaftar']
      },
      {
        id: 'task-101-step-3',
        index: 2,
        title: 'Step 3: Verifikasi Konsistensi',
        objective: 'Cek foreign key dan relasi',
        status: 'pending'
      }
    ]
  }

  it('membangun kontrak handoff lengkap dari task dan steps aktif', () => {
    const contract = buildHandoffContract(mockTask)

    expect(contract.taskId).toBe('task-101')
    expect(contract.objective).toBe('Migrasi schema database ke v30')
    expect(contract.done.length).toBe(1)
    expect(contract.done[0]).toContain('[Step 1: Backup DB]')

    expect(contract.remaining.length).toBe(2)
    expect(contract.remaining[0]).toContain('Step 2: Jalankan Migrasi')

    expect(contract.artifacts.length).toBe(1)
    expect(contract.artifacts[0].path).toBe('backup.json')

    expect(contract.blocked).toBeNull()
    expect(contract.verified.isVerified).toBe(true)
    expect(contract.next_action).toContain('Step 2: Jalankan Migrasi')

    const validation = validateHandoffContract(contract)
    expect(validation.valid).toBe(true)
  })

  it('membangun kontrak saat seluruh step selesai', () => {
    const completedTask = {
      ...mockTask,
      status: 'completed',
      steps: mockTask.steps.map((s) => ({ ...s, status: 'completed' }))
    }

    const contract = buildHandoffContract(completedTask)
    expect(contract.remaining).toEqual([])
    expect(contract.done.length).toBe(3)
    expect(contract.next_action).toContain('Seluruh langkah selesai')

    const validation = validateHandoffContract(contract)
    expect(validation.valid).toBe(true)
  })

  it('membangun kontrak saat task terhambat atau gagal', () => {
    const failedTask = {
      ...mockTask,
      status: 'failed',
      error: 'Disk I/O error pada partisi /data'
    }

    const contract = buildHandoffContract(failedTask)
    expect(contract.blocked).toEqual(['Disk I/O error pada partisi /data'])

    const validation = validateHandoffContract(contract)
    expect(validation.valid).toBe(true)
  })
})

describe('formatHandoffContractPrompt', () => {
  it('memformat kontrak handoff ke teks observasi/prompt terstruktur', () => {
    const contract = {
      taskId: 'task-abc',
      taskStatus: 'running',
      objective: 'Refactor engine',
      done: ['[Step 1] Inisialisasi arsitektur'],
      remaining: ['[Step 2] Pindahkan channel'],
      blocked: null,
      artifacts: [{ path: 'src/engine.js', summary: 'File engine baru' }],
      verified: { isVerified: true },
      next_action: 'Mulai pindahkan channel os.mjs'
    }

    const text = formatHandoffContractPrompt(contract)
    expect(text).toContain('# RESUMED DURABLE TASK HANDOFF CONTRACT')
    expect(text).toContain('Refactor engine')
    expect(text).toContain('## 1. SUDAH SELESAI (DONE):')
    expect(text).toContain('[Step 1] Inisialisasi arsitektur')
    expect(text).toContain('## 2. LANGKAH TERSISA (REMAINING):')
    expect(text).toContain('[Step 2] Pindahkan channel')
    expect(text).toContain('## 4. ARTIFACTS YANG DIHASILKAN:')
    expect(text).toContain('src/engine.js')
    expect(text).toContain('## 6. LANGKAH KERJA BERIKUTNYA (NEXT ACTION):')
    expect(text).toContain('Mulai pindahkan channel os.mjs')
  })
})
