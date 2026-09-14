// Dedupe predicate untuk cakupan forensik tool-calls JSONL:
// hanya tool yang TIDAK lewat executeNativeTool (sudah dicatat bridge)
// yang boleh dicatat choke point di useAbelinkPlan.
import { describe, it, expect } from 'vitest'
import { isBridgeLoggedTool } from '../src/hooks/agent/useAbelinkPlan.js'

describe('isBridgeLoggedTool', () => {
  it('native-backed (read-file/run-shell) -> true (bridge sudah mencatat)', () => {
    expect(isBridgeLoggedTool('read-file', 'a.txt')).toBe(true)
    expect(isBridgeLoggedTool('run-shell', 'ls -la')).toBe(true)
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
      expect(isBridgeLoggedTool(t, 'q')).toBe(false)
    }
  })

  it('run-shell skema-URL (fallback osOpen) -> false', () => {
    expect(isBridgeLoggedTool('run-shell', 'xdg-open "https://x.test"')).toBe(false)
    expect(isBridgeLoggedTool('run-shell', 'open https://x.test')).toBe(false)
  })

  it('unknown tool -> true (checkTools lolos -> jatuh ke executeNativeTool -> bridge mencatat)', () => {
    expect(isBridgeLoggedTool('some-unknown-plugin', 'q')).toBe(true)
  })
})
