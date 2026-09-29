// cli/core/clipboard.mjs — tulis clipboard sistem.
// Port opencode packages/tui/src/clipboard.ts: OSC52 selalu (tembus tmux/SSH),
// fallback native (wl-copy/xclip/xsel/macOS). Best-effort: gagal = diam.
import { spawn } from 'node:child_process'
import os from 'node:os'

function writeOsc52(text) {
  try {
    if (!process.stdout.isTTY) return
    const seq = `\x1b]52;c;${Buffer.from(text).toString('base64')}\x07`
    const pass = `\x1bPtmux;\x1b${seq}\x1b\\`
    process.stdout.write(process.env.TMUX ? seq + pass : seq)
  } catch {}
}

function run(cmd, args, input) {
  return new Promise((resolve) => {
    try {
      const c = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] })
      c.on('error', () => resolve(false))
      c.on('close', (code) => resolve(code === 0))
      c.stdin?.end(input)
    } catch { resolve(false) }
  })
}

export async function writeClipboard(text) {
  const t = String(text ?? '')
  if (!t) return
  writeOsc52(t)
  const plat = os.platform()
  if (plat === 'darwin') {
    const esc = t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    await run('osascript', ['-e', `set the clipboard to "${esc}"`], undefined)
    return
  }
  if (process.env.WAYLAND_DISPLAY) {
    if (await run('wl-copy', [], t)) return
  }
  if (await run('xclip', ['-selection', 'clipboard'], t)) return
  await run('xsel', ['--clipboard', '--input'], t)
}
