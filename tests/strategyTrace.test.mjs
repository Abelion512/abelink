// tests/strategyTrace.test.mjs
// Trace test: proves nextStrategy dynamically directs and alters the agent's next action
// upon stagnation (stagnation -> directive -> system observation -> diverged action).
import { describe, it, expect } from 'vitest'
import { createTrajectorySupervisor, normalizeAttemptKey } from '../src/api/ai/trajectorySupervisor.js'
import { getNextStrategy } from '../src/api/ai/strategyLib.js'

describe('strategy injection trace — proving nextStrategy changes subsequent actions', () => {
  /**
   * Deterministic ReAct action selector simulating LLM decision making.
   * Reads conversation loop messages (including injected supervisor hints).
   */
  function simulateAgentDecision(loopMessages) {
    const lastUserMsg = [...loopMessages].reverse().find((m) => m.role === 'user')?.content || ''

    if (lastUserMsg.includes('[TRAJECTORY HINT]')) {
      // Check for explicit strategy tag: [STRATEGI: <NAME>]
      const stratMatch = lastUserMsg.match(/\[STRATEGI:\s*([A-Z_]+)\]/)
      const strat = stratMatch ? stratMatch[1] : null
      if (strat === 'RETRIEVE') {
        const match = lastUserMsg.match(/pola\s+\S+\s+"([^"]+)"/i)
        const target = match ? match[1] : 'src/config.json'
        return {
          thought: 'Supervisor menyarankan RETRIEVE ke pola yang pernah sukses. Membaca kembali target terbukti.',
          strategy: 'RETRIEVE',
          action: { tool: 'read-file', query: target }
        }
      }
      if (strat === 'EXPLORE' || lastUserMsg.includes('EXPLORE')) {
        return {
          thought: 'Supervisor mendeteksi repetisi dan menyarankan EXPLORE. Beralih ke eksplorasi struktur direktori.',
          strategy: 'EXPLORE',
          action: { tool: 'list-dir', query: 'src/modules' }
        }
      }
      if (strat === 'VERIFY') {
        return {
          thought: 'Supervisor menyarankan VERIFY. Mengonfirmasi file via read-file.',
          strategy: 'VERIFY',
          action: { tool: 'read-file', query: 'src/verified.js' }
        }
      }
      // General divergence: switch away from the stalled tool/target
      return {
        thought: 'Supervisor menginstruksikan perubahan strategi. Menggunakan tool alternatif.',
        strategy: 'MODIFY',
        action: { tool: 'find-files', query: 'auth' }
      }
    }

    // Default stuck behavior: agent persistently tries the same dead-end query
    return {
      thought: 'Mencoba mencari fungsi autentikasi dengan grep-search.',
      strategy: 'DIRECT',
      action: { tool: 'grep-search', query: 'authHandler' }
    }
  }

  it('proves stagnation triggers directive which alters the next action from repeated grep to EXPLORE list-dir', () => {
    const supervisor = createTrajectorySupervisor()
    const loopMessages = [
      { role: 'system', content: 'You are Abelink OS Companion.' },
      { role: 'user', content: 'Temukan handler autentikasi di codebase.' }
    ]

    const actionTrace = []
    const directiveTrace = []

    // Simulate 4 ReAct turns
    for (let turn = 1; turn <= 4; turn++) {
      // 1. Agent chooses action based on current loopMessages
      const decision = simulateAgentDecision(loopMessages)
      const currentTargetKey = normalizeAttemptKey(decision.action.tool, decision.action.query)
      actionTrace.push({ turn, ...decision.action, key: currentTargetKey })

      // 2. Simulated environment execution (turns 1-3 fail to find authHandler)
      const toolSuccess = turn === 4 // turn 4 with list-dir succeeds
      const execResult = toolSuccess ? 'Found src/modules/auth.js' : 'No matches found.'

      // 3. Trajectory supervisor accounting
      const supResult = supervisor.update({
        tool: decision.action.tool,
        query: decision.action.query,
        success: toolSuccess,
        verificationState: 'not_run',
        stepsLeft: 20 - turn,
        verifyGateActive: false
      })

      directiveTrace.push({ turn, directive: supResult.directive, nextStrategy: supResult.nextStrategy, hint: supResult.hintText })

      // 4. Observation fed back to loop messages
      loopMessages.push({ role: 'assistant', content: JSON.stringify(decision) })
      let obs = `[OBSERVATION] ${execResult}`
      if (supResult.hintText) {
        // Staged supervisor hint injection
        obs += `\n${supResult.hintText}`
      }
      loopMessages.push({ role: 'user', content: obs })
    }

    // VERIFICATION OF ACTION DIVERGENCE:
    // Turns 1, 2, 3 were repeating the exact same failed action
    expect(actionTrace[0].key).toBe('grep-search:authhandler')
    expect(actionTrace[1].key).toBe('grep-search:authhandler')
    expect(actionTrace[2].key).toBe('grep-search:authhandler')

    // On Turn 3: Supervisor fired MODIFY directive with an EXPLORE nextStrategy
    expect(directiveTrace[2].directive).toBe('modify_strategy')
    expect(directiveTrace[2].nextStrategy).toBe('EXPLORE')
    expect(typeof directiveTrace[2].hint).toBe('string')
    expect(directiveTrace[2].hint).toContain('[TRAJECTORY HINT]')

    // On Turn 4: The agent's action DIVERGED completely in response to the injected strategy
    expect(actionTrace[3].key).not.toBe('grep-search:authhandler')
    expect(actionTrace[3].tool).toBe('list-dir')
    expect(actionTrace[3].query).toBe('src/modules')
  })

  it('proves stagnation with prior success triggers RETRIEVE to restore the best known state', () => {
    const supervisor = createTrajectorySupervisor()

    // Step 1 was successful on a valid anchor
    supervisor.update({
      tool: 'read-file',
      query: 'src/config.json',
      success: true,
      verificationState: 'partially_verified',
      stepsLeft: 18,
      verifyGateActive: false
    })

    // Now agent goes down a rabbit hole repeating a failing edit 3 times
    let third = null
    for (let i = 0; i < 3; i++) {
      third = supervisor.update({
        tool: 'run-shell',
        query: 'bad-command',
        success: false,
        verificationState: 'not_run',
        stepsLeft: 16 - i,
        verifyGateActive: false
      })
    }

    // 3rd failure with a prior success elsewhere => RETRIEVE naming the anchor
    expect(third.directive).toBe('retrieve_pattern')
    expect(third.nextStrategy).toBe('RETRIEVE')
    expect(third.hintText).toContain('config.json')

    // Ladder agrees: verification blocked + prior success => RETRIEVE
    expect(
      getNextStrategy(null, { repeat: 3, verificationBlocked: true, hasPriorSuccess: true }).strategy
    ).toBe('RETRIEVE')

    // Next action generated from this directive restores the anchor, not the bad shell command
    const loopMessages = [{ role: 'user', content: `[OBSERVATION] Shell error\n${third.hintText}` }]
    const nextDecision = simulateAgentDecision(loopMessages)
    expect(nextDecision.strategy).toBe('RETRIEVE')
    expect(nextDecision.action.tool).toBe('read-file')
    expect(nextDecision.action.query).toContain('src/config.json')
  })
})
