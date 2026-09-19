import { describe, it, expect, beforeEach } from 'vitest'
import {
  MEMORY_TOOL_SPEC,
  validateMemoryOp,
  parseMemoryQuery,
  findMemoryTarget,
  executeMemoryOp,
  executeMemoryTool,
  recordMemoryFailure,
  resetMemoryFailureCount,
  isMemoryFailureCapped
} from '../src/api/ai/memoryTool.js'

describe('MEMORY_TOOL_SPEC', () => {
  it('punya shape kanonis', () => {
    expect(MEMORY_TOOL_SPEC.name).toBe('memory')
    expect(MEMORY_TOOL_SPEC.actions).toEqual(['add', 'replace', 'remove', 'batch'])
    expect(MEMORY_TOOL_SPEC.perTurnFailureCap).toBe(3)
    expect(MEMORY_TOOL_SPEC.terminalSuccess).toBe(true)
  })
})

describe('validateMemoryOp', () => {
  it('add valid', () => {
    expect(validateMemoryOp({ action: 'add', target: 'memory', new_text: 'x' }).ok).toBe(true)
  })

  it('replace butuh old_text + new_text', () => {
    expect(validateMemoryOp({ action: 'replace', target: 'user', new_text: 'x' }).ok).toBe(false)
    expect(validateMemoryOp({ action: 'replace', target: 'user', old_text: 'a', new_text: 'x' }).ok).toBe(true)
  })

  it('remove butuh old_text', () => {
    expect(validateMemoryOp({ action: 'remove', target: 'memory' }).ok).toBe(false)
    expect(validateMemoryOp({ action: 'remove', target: 'memory', old_text: 'a' }).ok).toBe(true)
  })

  it('batch butuh operations non-kosong yang valid', () => {
    const good = validateMemoryOp({
      action: 'batch',
      target: 'memory',
      operations: [{ action: 'add', target: 'memory', new_text: 'x' }]
    })
    expect(good.ok).toBe(true)
    expect(validateMemoryOp({ action: 'batch', target: 'memory', operations: [] }).ok).toBe(false)
    expect(validateMemoryOp({ action: 'batch', target: 'memory' }).ok).toBe(false)
  })

  it('menolak action/target tak dikenal', () => {
    expect(validateMemoryOp({ action: 'nope', target: 'memory' }).ok).toBe(false)
    expect(validateMemoryOp({ action: 'add', target: 'nope', new_text: 'x' }).ok).toBe(false)
  })
})

describe('parseMemoryQuery', () => {
  it('mem-parse JSON object dan array batch', () => {
    const jsonStr = JSON.stringify({ action: 'add', target: 'user', new_text: 'Suka Tailwind' })
    expect(parseMemoryQuery(jsonStr)).toEqual({
      action: 'add',
      target: 'user',
      new_text: 'Suka Tailwind'
    })

    const arrStr = JSON.stringify([{ action: 'add', target: 'user', new_text: 'A' }])
    expect(parseMemoryQuery(arrStr)).toEqual({
      action: 'batch',
      target: 'memory',
      operations: [{ action: 'add', target: 'user', new_text: 'A' }]
    })
  })

  it('mem-parse query format pipa (add, replace, remove)', () => {
    expect(parseMemoryQuery('add||user||User suka dark mode')).toEqual({
      action: 'add',
      target: 'user',
      new_text: 'User suka dark mode'
    })

    expect(parseMemoryQuery('replace||memory||kunci lama||kunci baru')).toEqual({
      action: 'replace',
      target: 'memory',
      old_text: 'kunci lama',
      new_text: 'kunci baru'
    })

    expect(parseMemoryQuery('remove||memory||catatan lawas')).toEqual({
      action: 'remove',
      target: 'memory',
      old_text: 'catatan lawas'
    })
  })

  it('mengembalikan null untuk input kosong', () => {
    expect(parseMemoryQuery('')).toBeNull()
    expect(parseMemoryQuery(null)).toBeNull()
  })
})

describe('findMemoryTarget', () => {
  const sample = [
    { id: 1, memory: 'User prefers dark mode theme' },
    { id: 2, memory: 'Project port is 3000' }
  ]

  it('mencocokkan via ID, exact, atau substring', () => {
    expect(findMemoryTarget(sample, '1')).toEqual(sample[0])
    expect(findMemoryTarget(sample, 'user prefers dark mode theme')).toEqual(sample[0])
    expect(findMemoryTarget(sample, 'port is 3000')).toEqual(sample[1])
    expect(findMemoryTarget(sample, 'tidak ada')).toBeNull()
  })
})

describe('executeMemoryOp with mock DB & Atomicity', () => {
  let mockStore = []
  let nextId = 1
  const mockDb = {
    getAllMemory: async () => [...mockStore],
    insertMemory: async (item) => {
      const row = { id: nextId++, ...item }
      mockStore.push(row)
      return row.id
    },
    updateMemory: async (data) => {
      const idx = mockStore.findIndex((m) => m.id === data.id)
      if (idx !== -1) {
        mockStore[idx] = { ...mockStore[idx], ...data }
      }
    },
    deleteMemory: async (id) => {
      mockStore = mockStore.filter((m) => m.id !== id)
    }
  }

  beforeEach(() => {
    mockStore = [
      { id: 1, type: 'profile', memory: 'User prefers dark mode' },
      { id: 2, type: 'notes', memory: 'API endpoint staging' }
    ]
    nextId = 3
    resetMemoryFailureCount('turn-test')
  })

  it('add berhasil menambah data ke DB', async () => {
    const res = await executeMemoryOp(
      { action: 'add', target: 'user', new_text: 'User speaks Indonesian' },
      { dbProvider: mockDb, turnId: 'turn-test' }
    )
    expect(res.success).toBe(true)
    expect(mockStore).toHaveLength(3)
    expect(mockStore[2].memory).toBe('User speaks Indonesian')
  })

  it('replace berhasil memperbarui data yang cocok', async () => {
    const res = await executeMemoryOp(
      { action: 'replace', target: 'user', old_text: 'dark mode', new_text: 'User prefers high contrast' },
      { dbProvider: mockDb, turnId: 'turn-test' }
    )
    expect(res.success).toBe(true)
    expect(mockStore[0].memory).toBe('User prefers high contrast')
  })

  it('replace gagal jika teks lama tidak ditemukan', async () => {
    const res = await executeMemoryOp(
      { action: 'replace', target: 'user', old_text: 'non-existent-text', new_text: 'new text' },
      { dbProvider: mockDb, turnId: 'turn-test' }
    )
    expect(res.success).toBe(false)
    expect(res.error).toContain('tidak ditemukan')
  })

  it('remove berhasil menghapus data yang cocok', async () => {
    const res = await executeMemoryOp(
      { action: 'remove', target: 'memory', old_text: 'staging' },
      { dbProvider: mockDb, turnId: 'turn-test' }
    )
    expect(res.success).toBe(true)
    expect(mockStore).toHaveLength(1)
  })

  it('batch atomik: jika satu gagal, tidak ada operasi yang diterapkan', async () => {
    const initialCount = mockStore.length
    const batchOp = {
      action: 'batch',
      target: 'memory',
      operations: [
        { action: 'add', target: 'user', new_text: 'Akan dibatalkan' },
        { action: 'replace', target: 'user', old_text: 'TEKS_TIDAK_ADA_SAMA_SEKALI', new_text: 'Batal' }
      ]
    }
    const res = await executeMemoryOp(batchOp, { dbProvider: mockDb, turnId: 'turn-test' })
    expect(res.success).toBe(false)
    expect(res.error).toContain('dibatalkan')
    expect(mockStore).toHaveLength(initialCount) // tidak ada penambahan
  })

  it('batch atomik: jika semua valid, semua diterapkan', async () => {
    const batchOp = {
      action: 'batch',
      target: 'memory',
      operations: [
        { action: 'add', target: 'user', new_text: 'Preferensi Baru' },
        { action: 'remove', target: 'memory', old_text: 'staging' }
      ]
    }
    const res = await executeMemoryOp(batchOp, { dbProvider: mockDb, turnId: 'turn-test' })
    expect(res.success).toBe(true)
    expect(mockStore.some((m) => m.memory === 'Preferensi Baru')).toBe(true)
    expect(mockStore.some((m) => m.memory.includes('staging'))).toBe(false)
  })
})

describe('perTurnFailureCap tracking', () => {
  beforeEach(() => {
    resetMemoryFailureCount('turn-cap')
  })

  it('mencapai failure cap setelah 3 kali gagal dan menolak pemanggilan ke-4', async () => {
    expect(isMemoryFailureCapped('turn-cap')).toBe(false)
    recordMemoryFailure('turn-cap') // 1
    recordMemoryFailure('turn-cap') // 2
    expect(isMemoryFailureCapped('turn-cap')).toBe(false)
    recordMemoryFailure('turn-cap') // 3
    expect(isMemoryFailureCapped('turn-cap')).toBe(true)

    const res = await executeMemoryTool('add||user||halo', { turnId: 'turn-cap' })
    expect(res).toContain('[MEMORY-FAILURE-CAP]')
  })

  it('executeMemoryTool mengembalikan [MEMORY-SUCCESS] saat berhasil', async () => {
    const mockDb = {
      getAllMemory: async () => [],
      insertMemory: async () => 10,
      updateMemory: async () => {},
      deleteMemory: async () => {}
    }
    const res = await executeMemoryTool('add||user||User suka dark mode', {
      turnId: 'turn-cap-success',
      dbProvider: mockDb
    })
    expect(res).toContain('[MEMORY-SUCCESS]')
  })
})
