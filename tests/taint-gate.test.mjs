import { describe, it, expect, beforeEach } from 'vitest'
import {
  isTurnTainted,
  markTurnTainted,
  resetTurnTaint,
  setTurnId,
  isTaintingTool,
  isStateChangingTool,
  checkTaintGate
} from '../sidecar/main/taint-gate.mjs'

describe('Taint Gate Security (Jarvis Pattern)', () => {
  beforeEach(() => {
    resetTurnTaint()
  })

  it('default state adalah bersih (untainted)', () => {
    expect(isTurnTainted()).toBe(false)
  })

  it('mengenali daftar TAINTING_TOOLS secara tepat', () => {
    expect(isTaintingTool('browser-navigate')).toBe(true)
    expect(isTaintingTool('browser-read')).toBe(true)
    expect(isTaintingTool('browser-extract')).toBe(true)
    expect(isTaintingTool('browser-click')).toBe(true)
    expect(isTaintingTool('read-file')).toBe(false)
    expect(isTaintingTool('run-shell')).toBe(false)
  })

  it('mengenali daftar STATE_CHANGING_TOOLS secara tepat', () => {
    expect(isStateChangingTool('run-shell')).toBe(true)
    expect(isStateChangingTool('run-bash')).toBe(true)
    expect(isStateChangingTool('run-powershell')).toBe(true)
    expect(isStateChangingTool('write-file')).toBe(true)
    expect(isStateChangingTool('replace-content')).toBe(true)
    expect(isStateChangingTool('delete-file')).toBe(true)
    expect(isStateChangingTool('os-open')).toBe(true)
    expect(isStateChangingTool('git-commit')).toBe(true)
    expect(isStateChangingTool('git-revert')).toBe(true)
    expect(isStateChangingTool('browser-read')).toBe(false)
    expect(isStateChangingTool('read-file')).toBe(false)
  })

  it('eksekusi tainting tool mengubah status sesi menjadi tainted', () => {
    expect(isTurnTainted()).toBe(false)
    markTurnTainted('browser-navigate')
    expect(isTurnTainted()).toBe(true)
  })

  it('checkTaintGate menolak state-changing tools bila sesi berstatus tainted', () => {
    markTurnTainted('browser-navigate')
    const check = checkTaintGate('run-shell')
    expect(check.blocked).toBe(true)
    expect(check.error).toContain('[TAINT GATE BLOCKED]')
    expect(check.is_tainted).toBe(true)
  })

  it('checkTaintGate mengizinkan read-only tools meskipun sesi berstatus tainted', () => {
    markTurnTainted('browser-navigate')
    const checkReadFile = checkTaintGate('read-file')
    expect(checkReadFile.blocked).toBe(false)
    const checkBrowserRead = checkTaintGate('browser-read')
    expect(checkBrowserRead.blocked).toBe(false)
  })

  it('checkTaintGate mengizinkan state-changing tools jika sesi bersih (untainted)', () => {
    const check = checkTaintGate('run-shell')
    expect(check.blocked).toBe(false)
    expect(check.error).toBeUndefined()
  })

  it('pergantian turnId mereset status taint menjadi bersih kembali', () => {
    setTurnId('turn-1')
    markTurnTainted('browser-navigate')
    expect(isTurnTainted()).toBe(true)

    // Giliran baru dimulai dari user
    setTurnId('turn-2')
    expect(isTurnTainted()).toBe(false)
    const check = checkTaintGate('run-shell')
    expect(check.blocked).toBe(false)
  })
})
