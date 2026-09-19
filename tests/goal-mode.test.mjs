// L1: /goal sebagai kontrak misi long-horizon.
// - Skill goal terdaftar dengan konten kontrak (DONE + snapshot-first + stop-loop).
// - Floor budget 48 untuk mode goal (logika murni, cermin useAbelinkPlan).
// - Stop-loop: 3x baca kosong beruntun -> berhenti.
import { describe, it, expect } from 'vitest'
import { NATIVE_SKILLS } from '../src/components/core/native-skills.js'

const GOAL_MODE_FLOOR = 48

// Cermin logika floor di useAbelinkPlan (murni, tanpa hook).
const goalBudgetFloor = (resolved, { goalMode = false, userInput = '', maxSteps, maxPlanSteps } = {}) => {
  const isGoal = goalMode === true || /^\/goal(\s|$)/i.test(String(userInput || ''))
  if (isGoal && !Number.isFinite(maxSteps) && !Number.isFinite(maxPlanSteps)) {
    if (resolved < GOAL_MODE_FLOOR) return GOAL_MODE_FLOOR
  }
  return resolved
}

// Cermin aturan stop-loop B2: 3x observasi kosong beruntun -> stop.
const EMPTY_READ_RE = /tidak ditemukan|kosong|no results?|tidak terbaca|gagal membaca/i
const shouldStopEmptyLoop = (observations = []) => {
  const tail = observations.slice(-3)
  return tail.length === 3 && tail.every((o) => EMPTY_READ_RE.test(String(o || '')))
}

describe('skill /goal terdaftar', () => {
  it('NATIVE_SKILLS memuat goal dengan kontrak DONE + snapshot + stop-loop', () => {
    const g = NATIVE_SKILLS.find((s) => s.name === 'goal')
    expect(g).toBeTruthy()
    expect(g.content).toMatch(/KRITERIA DONE/i)
    expect(g.content).toMatch(/snapshot/i)
    expect(g.content).toMatch(/STOP-LOOP/i)
  })
})

describe('goalBudgetFloor', () => {
  it('/goal menaikkan budget kecil ke 48', () => {
    expect(goalBudgetFloor(16, { userInput: '/goal kerjakan soal' })).toBe(48)
    expect(goalBudgetFloor(24, { goalMode: true })).toBe(48)
  })
  it('budget besar tidak diturunkan; override eksplisit dihormati', () => {
    expect(goalBudgetFloor(64, { userInput: '/goal x' })).toBe(64)
    expect(goalBudgetFloor(16, { userInput: '/goal x', maxSteps: 20 })).toBe(16)
  })
  it('non-goal tidak berubah', () => {
    expect(goalBudgetFloor(16, { userInput: 'halo' })).toBe(16)
  })
})

describe('shouldStopEmptyLoop', () => {
  it('3x kosong beruntun -> stop', () => {
    expect(shouldStopEmptyLoop(['kosong', 'tidak ditemukan hasil', 'gagal membaca'])).toBe(true)
  })
  it('ada isi di 3 terakhir -> lanjut', () => {
    expect(shouldStopEmptyLoop(['kosong', 'kosong', 'soal: 2+2=?'])).toBe(false)
  })
  it('kurang dari 3 -> lanjut', () => {
    expect(shouldStopEmptyLoop(['kosong', 'kosong'])).toBe(false)
  })
})
