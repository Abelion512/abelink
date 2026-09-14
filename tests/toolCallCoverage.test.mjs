// Dedupe predicate untuk cakupan forensik tool-calls JSONL:
// hanya tool yang TIDAK lewat executeNativeTool (sudah dicatat bridge)
// yang boleh dicatat choke point di useAbelinkPlan. Definisi hidup di
// toolDispatcher (isNativeBacked) agar tidak drift dari routing aktual.
import { describe, it, expect } from 'vitest'
import { isNativeBacked } from '../src/hooks/agent/plan/toolDispatcher.js'

describe('isNativeBacked', () => {
  it('native-backed (read-file/run-shell) -> true (bridge sudah mencatat)', () => {
    expect(isNativeBacked('read-file', 'a.txt')).toBe(true)
    expect(isNativeBacked('run-shell', 'ls -la')).toBe(true)
  })

  it('domain media/vision/knowledge/agent -> false (bypass bridge)', () => {
    for (const t of [
      'yt-search', 'yt-summary', 'music-play', 'speak', 'screenshot-to-tg',
      'analyze-screen', 'camera-look', 'memory-search',
      'connector-list', 'connector-run', 'trading-status',
      'spawn_subagent', 'wait_subagents', 'send_message',
      'list_subagents', 'kill_subagent', 'read-tools', 'read-skill',
      'delegate_coding', 'ask-user', 'browser-ask-user', 'ask-choice'
    ]) {
      expect(isNativeBacked(t, 'q')).toBe(false)
    }
  })

  it('run-shell skema-URL (fallback osOpen) -> false', () => {
    expect(isNativeBacked('run-shell', 'xdg-open "https://x.test"')).toBe(false)
    expect(isNativeBacked('run-shell', 'open https://x.test')).toBe(false)
  })

  it('unknown tool -> true (checkTools lolos -> jatuh ke executeNativeTool -> bridge mencatat)', () => {
    expect(isNativeBacked('some-unknown-plugin', 'q')).toBe(true)
  })
})
