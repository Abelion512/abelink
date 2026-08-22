import { exec } from 'child_process'
import util from 'util'
import path from 'path'
import fs from 'fs'

const execPromise = util.promisify(exec)

/**
 * Memvalidasi sintaks file berdasarkan ekstensi secara lokal
 * @param {string} filePath Path absolut ke berkas
 * @param {string} content Konten berkas
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
export async function validateFileSyntax(filePath, content) {
  if (!filePath || !content) return { valid: true }
  const ext = path.extname(filePath).toLowerCase()

  try {
    // 1. Validasi JSON
    if (ext === '.json') {
      try {
        JSON.parse(content)
        return { valid: true }
      } catch (jsonErr) {
        return { valid: false, error: `JSON Parse Error: ${jsonErr.message}` }
      }
    }

    // 2. Validasi JavaScript (.js, .mjs, .cjs)
    if (['.js', '.mjs', '.cjs'].includes(ext)) {
      try {
        // Tulis ke temporary check file jika perlu, atau jalankan node -c pada file target
        if (fs.existsSync(filePath)) {
          await execPromise(`node -c "${filePath}"`)
        }
        return { valid: true }
      } catch (nodeErr) {
        const cleanErr = (nodeErr.stderr || nodeErr.message || '').trim()
        return { valid: false, error: `JavaScript SyntaxError:\n${cleanErr}` }
      }
    }

    // 3. Validasi Python (.py)
    if (ext === '.py') {
      try {
        if (fs.existsSync(filePath)) {
          await execPromise(`python -m py_compile "${filePath}"`)
        }
        return { valid: true }
      } catch (pyErr) {
        const cleanErr = (pyErr.stderr || pyErr.message || '').trim()
        return { valid: false, error: `Python SyntaxError:\n${cleanErr}` }
      }
    }

    // 4. Validasi Tag HTML / Script Tag Dasar
    if (['.html', '.htm'].includes(ext)) {
      const openScripts = (content.match(/<script\b[^>]*>/gi) || []).length
      const closeScripts = (content.match(/<\/script>/gi) || []).length
      if (openScripts !== closeScripts) {
        return {
          valid: false,
          error: `HTML Tag Mismatch: Tag <script> berjumlah ${openScripts} tetapi </script> berjumlah ${closeScripts}.`
        }
      }
    }

    // Format lainnya lolos secara default
    return { valid: true }
  } catch (err) {
    return { valid: true } // Jangan halangi jika runner sistem tidak tersedia
  }
}
