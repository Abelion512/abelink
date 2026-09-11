// codingAgentBridge.js
// Universal CLI Coding Agent Dispatcher untuk Abelink (Linux Mint)
// Menjembatani tugas coding berat ke CLI agent lokal yang sudah terpasang:
// 1. Claude Code (/home/abelion/.npm-global/bin/claude)
// 2. Hermes Agent (/home/abelion/.local/bin/hermes)
// 3. Codex CLI (/home/abelion/.nvm/versions/node/v24.18.0/bin/codex)
// 4. OpenCode (/home/abelion/.opencode/bin/opencode)

export const AGENT_CANDIDATES = [
  {
    id: 'claude',
    name: 'Claude Code',
    binaries: [
      '/home/abelion/.npm-global/bin/claude',
      'claude'
    ],
    makeArgs: ({ prompt }) => [
      '-p',
      `"${prompt.replace(/"/g, '\\"')}"`,
      '--dangerously-skip-permissions'
    ],
    supportsSession: true
  },
  {
    id: 'hermes',
    name: 'Hermes Agent',
    binaries: [
      '/home/abelion/.local/bin/hermes',
      'hermes'
    ],
    makeArgs: ({ prompt }) => [
      'run',
      `"${prompt.replace(/"/g, '\\"')}"`
    ],
    supportsSession: true
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    binaries: [
      '/home/abelion/.nvm/versions/node/v24.18.0/bin/codex',
      'codex'
    ],
    makeArgs: ({ prompt }) => [
      'exec',
      `"${prompt.replace(/"/g, '\\"')}"`
    ],
    supportsSession: false
  },
  {
    id: 'opencode',
    name: 'OpenCode CLI',
    binaries: [
      '/home/abelion/.opencode/bin/opencode',
      'opencode'
    ],
    makeArgs: ({ prompt }) => [
      'run',
      `"${prompt.replace(/"/g, '\\"')}"`
    ],
    supportsSession: false
  }
]

/**
 * Mendeteksi agent coding CLI mana saja yang tersedia di laptop.
 * @param {Object} [options]
 * @param {Function} [options.fileChecker] - Optional mock checker untuk unit test
 * @returns {Promise<Array<{id: string, name: string, binaryPath: string, supportsSession: boolean}>>}
 */
export async function detectInstalledAgents(options = {}) {
  const checkExists = options.fileChecker || (async (bin) => {
    if (typeof window !== 'undefined' && window.api?.executeNativeTool) {
      try {
        const res = await window.api.executeNativeTool('run-bash', `which ${bin}`)
        if (!res || res.error) return false
        const text = typeof res === 'string' ? res : (res.output || res.stdout || '')
        return text.trim().length > 0
      } catch {
        return false
      }
    }
    // Fallback Node/Bun/Sidecar/Testing environment
    try {
      const fs = await import('fs')
      if (bin.startsWith('/') && fs.existsSync(bin)) {
        return true
      }
      const cp = await import('child_process')
      const out = cp.execSync(`which ${bin} 2>/dev/null || true`, { encoding: 'utf8' })
      return Boolean(out && out.trim().length > 0)
    } catch {
      return false
    }
  })

  const available = []
  for (const candidate of AGENT_CANDIDATES) {
    for (const bin of candidate.binaries) {
      const exists = await checkExists(bin)
      if (exists) {
        available.push({
          id: candidate.id,
          name: candidate.name,
          binaryPath: bin,
          supportsSession: candidate.supportsSession
        })
        break
      }
    }
  }
  return available
}

/**
 * Menyusun perintah eksekusi CLI agent dalam sandbox branch terisolasi.
 * @param {Object} params
 * @param {string} [params.agentId] - 'claude' | 'hermes' | 'codex' | 'opencode'
 * @param {string} params.prompt - Instruksi tugas coding
 * @param {string} [params.workdir] - Direktori repo kerja
 * @param {string} [params.branch] - Nama branch sandbox (misal 'auto/fix-xxx')
 * @returns {{ command: string, agent: Object }}
 */
export function buildCodingCommand({ agentId = 'claude', prompt, workdir, branch }) {
  const candidate = AGENT_CANDIDATES.find((a) => a.id === agentId) || AGENT_CANDIDATES[0]
  const bin = candidate.binaries[0]
  
  let branchSetup = ''
  if (branch) {
    branchSetup = `git checkout -B ${branch} && `
  }

  const baseArgs = candidate.makeArgs({ prompt }).join(' ')
  const cdPrefix = workdir ? `cd '${workdir}' && ` : ''
  const command = `${cdPrefix}${branchSetup}nice -n 10 ${bin} ${baseArgs}`

  return {
    command,
    agent: candidate
  }
}
