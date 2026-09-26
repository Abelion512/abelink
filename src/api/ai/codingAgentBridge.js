// codingAgentBridge.js
// Universal CLI Coding Agent Dispatcher untuk Abelink (Linux Mint)
// Menjembatani tugas coding berat ke CLI agent lokal yang sudah terpasang:
// 1. Claude Code   2. Hermes Agent   3. Codex CLI   4. OpenCode
//
// 2026-09-26 (M0/B-10): resolusi binary PATH-FIRST. Dulu tiap kandidat
// menaruh path absolut milik mesin maintainer (/home/abelion/...) sebagai
// prioritas PERTAMA, sehingga di laptop lain deteksi gagal walau binary-nya
// ada di PATH, dan perintah yang dihasilkan menunjuk path yang tak ada.
// Sekarang urutannya: nama polos (diselesaikan PATH) dulu, path absolut hanya
// sebagai fallback terakhir. `binaries[0]` (dipakai buildCodingCommand) jadi
// nama polos -> perintah portable.

// Sumber tunggal daftar agen coding yang DIDUKUNG delegate_coding.
// Keputusan owner (2026-09-26, dikunci ulang): hanya opencode + hermes.
// codex/claude TETAP terdaftar di AGENT_CANDIDATES sebagai referensi kandidat
// (makeArgs/inspeksi), tapi TIDAK PERNAH dipilih runtime — freebuff/claude/codex
// hanya relevan bila user mengarahkan lewat VPN (mis. Proton US), di luar
// cakupan default.
export const PREFERRED_CODING_AGENTS = ['opencode', 'hermes']

export const AGENT_CANDIDATES = [
  {
    id: 'claude',
    name: 'Claude Code',
    binaries: [
      'claude',
      '/home/abelion/.npm-global/bin/claude'
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
      'hermes',
      '/home/abelion/.local/bin/hermes'
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
      'codex',
      '/home/abelion/.nvm/versions/node/v24.18.0/bin/codex'
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
      'opencode',
      '/home/abelion/.opencode/bin/opencode'
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
    // Renderer tidak boleh menyentuh Node API (fs/child_process) langsung —
    // semua akses OS lewat window.api (Tauri IPC). Tanpa bridge = tidak ada agent.
    return false
  })

  const available = []
  for (const candidate of AGENT_CANDIDATES) {
    // Hanya agen yang di-whitelist yang boleh dideteksi/dipilih (keputusan
    // owner: opencode + hermes). Kandidat lain tetap terdaftar sebagai referensi.
    if (!PREFERRED_CODING_AGENTS.includes(candidate.id)) continue
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
export function buildCodingCommand({ agentId = 'opencode', prompt, workdir, branch }) {
  const candidate = AGENT_CANDIDATES.find((a) => a.id === agentId) || AGENT_CANDIDATES.find((a) => a.id === PREFERRED_CODING_AGENTS[0])
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
