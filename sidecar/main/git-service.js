import { execFile } from 'child_process'
import util from 'util'

const execFilePromise = util.promisify(execFile)

// Semua perintah git wajib lewat array argv tanpa shell agar string dari LLM
// (nama file, pesan commit) tidak bisa dieksekusi sebagai perintah shell.
// Timeout 30 detik mencegah git menggantung selamanya saat menunggu input.
const runGit = (args, cwd) =>
  execFilePromise('git', args, {
    cwd: cwd || process.cwd(),
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024
  })

/**
 * Mendapatkan status berkas repositori git (git status --short)
 */
export async function getGitStatus(cwd) {
  try {
    const { stdout } = await runGit(['status', '--short'], cwd)
    return {
      success: true,
      status: stdout.trim() || 'Working tree clean (tidak ada perubahan berkas).'
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Mendapatkan perubahan baris kode (git diff)
 */
export async function getGitDiff(cwd, filePath = '') {
  try {
    const args = ['diff', ...(filePath ? ['--', filePath.trim()] : [])]
    const { stdout } = await runGit(args, cwd)
    return {
      success: true,
      diff: stdout.trim() || 'Tidak ada perbedaan baris kode yang belum di-commit.'
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Membuat checkpoint commit git otomatis
 */
export async function gitCommit(cwd, message = 'Mark Agent Checkpoint') {
  try {
    await runGit(['add', '-A'], cwd)
    // Pesan commit dikirim sebagai satu elemen argv, tidak perlu escaping shell.
    const { stdout } = await runGit(['commit', '-m', message], cwd)
    return { success: true, message: stdout.trim() }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/**
 * Me-rollback perubahan file ke HEAD
 */
export async function gitRevert(cwd, filePath = '') {
  try {
    if (filePath && filePath.trim()) {
      await runGit(['checkout', '--', filePath.trim()], cwd)
      return { success: true, message: `Berhasil me-rollback perubahan pada berkas ${filePath}.` }
    } else {
      await runGit(['reset', '--hard', 'HEAD'], cwd)
      return { success: true, message: 'Berhasil me-rollback seluruh repositori ke HEAD.' }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
