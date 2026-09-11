// MarkBench real-activity tasks (Fase 2): mahasiswa + pekerja korporat.
// Verifier memeriksa DUNIA (artefak di workdir + tool evidence di stepLog),
// bukan teks chat. Tanpa LLM, tanpa network — predikat kecil deterministik.
//
// Kontrak verifier: (output, { sentinel, workdir, stepLog }) -> boolean.
// Prompt memakai placeholder {{SENTINEL}} / {{WORKDIR}} yang di-resolve
// orchestrator (evaluation/run.mjs) per-run ke dir fixture unik.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// Cek dunia nyata: repo <repoDir> punya commit (5 teratas) yang pesannya
// memuat `message` (biasanya sentinel per-run). False bila repo hilang/git gagal.
// Tinggal di sini (bukan terminal-bench.mjs) agar dependensi satu arah:
// terminal-bench -> modul ini, bukan sebaliknya (bebas circular import).
export function hasGitCommitWithMessage(repoDir, message) {
  if (!repoDir || !message) return false
  try {
    const r = spawnSync('git', ['-C', repoDir, 'log', '--oneline', '-5'], {
      encoding: 'utf8',
      timeout: 15000,
    })
    if (r.status !== 0) return false
    return String(r.stdout || '').includes(message)
  } catch {
    return false
  }
}

// True bila setiap tool di `tools` punya >=1 pemanggilan sukses di stepLog.
// Bentuk step yang didukung: { toolCalls: [{ tool, success }] } atau { tool, success } datar.
// Catatan adapter nyata (mark-adapter.mjs): entry tool datar TIDAK punya field
// success — kegagalan dikodekan sebagai result berawalan "ERROR: ". Entry tanpa
// success dihitung sukses kecuali result-nya jelas ERROR.
const isErrorResult = (c) => typeof c?.result === 'string' && c.result.startsWith('ERROR:')
const isSuccessCall = (c) =>
  c && typeof c.tool === 'string' && (c.success === true || (c.success === undefined && !isErrorResult(c)))

export function hasToolEvidence(stepLog, tools) {
  const calls = []
  for (const step of stepLog || []) {
    if (Array.isArray(step?.toolCalls)) calls.push(...step.toolCalls)
    else if (step && typeof step.tool === 'string') calls.push(step)
  }
  return (tools || []).every((t) => calls.some((c) => isSuccessCall(c) && c.tool === t))
}

function readArtifact(workdir, rel) {
  try {
    const p = join(workdir, rel)
    if (!existsSync(p)) return null
    return readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

function countHeaders(md) {
  return md.split('\n').filter((l) => /^#{1,3}\s+\S/.test(l.trim())).length
}

// Lolos hanya bila ada bukti tulis DAN sentinel hadir di output atau artefak.
// Teks tanpa tool evidence = curang = FAIL.
function corpReportTextOnly(output, ctx = {}) {
  const { sentinel, workdir, stepLog } = ctx
  if (!sentinel || typeof output !== 'string') return false
  if (!hasToolEvidence(stepLog, ['write-file'])) return false
  if (output.includes(sentinel)) return true
  const artifact = workdir ? readArtifact(workdir, 'report.md') : null
  return Boolean(artifact && artifact.includes(sentinel))
}

// Helper verifikasi dunia untuk smoke test (kontrak anti-cheat).
export const VERIFY_WORLD = { corpReportTextOnly }

export const CORP_TASKS = {
  'corp-report-01': {
    prompt:
      'Susun laporan ringkas 3 bagian (Ringkasan, Temuan, Rekomendasi) dan simpan sebagai {{WORKDIR}}/report.md. Setiap bagian diawali heading markdown. Cantumkan kode referensi {{SENTINEL}} di dalam laporan. Jawab singkat setelah selesai.',
    requiredTools: ['write-file'],
    maxTurns: 15,
    effort: 'medium',
    verifier: (output, { sentinel, workdir, stepLog } = {}) => {
      if (!hasToolEvidence(stepLog, ['write-file'])) return false
      const md = readArtifact(workdir, 'report.md')
      if (!md || !sentinel || !md.includes(sentinel)) return false
      return countHeaders(md) >= 3
    },
  },

  'corp-sheet-01': {
    prompt:
      'Buat file CSV {{WORKDIR}}/data.csv: baris pertama komentar `# sentinel: {{SENTINEL}}`, baris kedua header `nama,nilai,keterangan`, lalu minimal 4 baris data (nama produk, angka, keterangan singkat). Jawab singkat setelah selesai.',
    requiredTools: ['write-file'],
    maxTurns: 12,
    effort: 'medium',
    verifier: (output, { sentinel, workdir, stepLog } = {}) => {
      if (!hasToolEvidence(stepLog, ['write-file'])) return false
      const csv = readArtifact(workdir, 'data.csv')
      if (!csv || !sentinel || !csv.includes(sentinel)) return false
      const lines = csv
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      return lines.length >= 6 && lines[1].includes(',')
    },
  },

  'corp-docx-01': {
    prompt:
      'Baca dokumen {{WORKDIR}}/sumber.docx, lalu tulis ringkasannya (minimal 200 karakter) ke {{WORKDIR}}/ringkasan.md. Ringkasan wajib mengutip kode referensi {{SENTINEL}} yang tertulis di dokumen sumber. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 12,
    effort: 'medium',
    verifier: (output, { sentinel, workdir, stepLog } = {}) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const summary = readArtifact(workdir, 'ringkasan.md')
      if (!summary || !sentinel || !summary.includes(sentinel)) return false
      return summary.length >= 200
    },
  },

  'student-research-01': {
    prompt:
      'Teliti topik "energi surya untuk sekolah pedesaan" dan tulis hasilnya ke {{WORKDIR}}/riset.md: minimal 2 bagian ber-heading, minimal 2 URL sumber (format http), dan cantumkan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['write-file'],
    maxTurns: 20,
    effort: 'high',
    verifier: (output, { sentinel, workdir, stepLog } = {}) => {
      if (!hasToolEvidence(stepLog, ['write-file'])) return false
      const md = readArtifact(workdir, 'riset.md')
      if (!md || !sentinel || !md.includes(sentinel)) return false
      const urls = md.match(/https?:\/\/\S+/g) || []
      return countHeaders(md) >= 2 && urls.length >= 2
    },
  },

  'student-notes-01': {
    prompt:
      'Baca {{WORKDIR}}/kuliah.txt lalu susun catatan terstruktur ke {{WORKDIR}}/catatan.md dengan tepat 3 bagian: `## Ringkasan`, `## Istilah Kunci`, `## Tindak Lanjut`. Cantumkan kode {{SENTINEL}} di catatan. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 12,
    effort: 'medium',
    verifier: (output, { sentinel, workdir, stepLog } = {}) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readArtifact(workdir, 'catatan.md')
      if (!md || !sentinel || !md.includes(sentinel)) return false
      return ['## Ringkasan', '## Istilah Kunci', '## Tindak Lanjut'].every((h) => md.includes(h))
    },
  },

  'code-fix-01': {
    prompt:
      'Perbaiki bug di {{WORKDIR}}/code-fix/ sehingga `bunx vitest run` lolos di direktori itu. Verifikasi via run-shell dengan perintah berawalan `cd {{WORKDIR}}/code-fix &&` (contoh: cd {{WORKDIR}}/code-fix && bunx vitest run) — jangan menjalankan vitest di direktori lain. Tulis penjelasan singkat + kode {{SENTINEL}} ke {{WORKDIR}}/code-fix/PERBAIKAN.md. Jangan mengubah test, hanya kode sumber. Jawab singkat setelah selesai.',
    // read-file agar model bisa membaca bug.js dulu; run-shell agar model bisa
    // MENJALANKAN vitest dan memverifikasi klaimnya (pilot vanilla: 0/3 karena
    // model menulis catatan tanpa pernah memperbaiki/menguji). Verifier tetap:
    // PERBAIKAN + vitest hijau.
    requiredTools: ['read-file', 'write-file', 'run-shell'],
    maxTurns: 20,
    effort: 'high',
    verifier: (output, { sentinel, workdir, stepLog } = {}) => {
      if (!hasToolEvidence(stepLog, ['write-file'])) return false
      const note = readArtifact(workdir, 'code-fix/PERBAIKAN.md')
      if (!note || !sentinel || !note.includes(sentinel)) return false
      try {
        const r = spawnSync('bunx', ['vitest', 'run'], { cwd: join(workdir, 'code-fix'), timeout: 120000 })
        return r.status === 0
      } catch {
        return false
      }
    },
  },

  'code-explain-01': {
    prompt:
      'Jelaskan fungsi berikut dalam Bahasa Indonesia (maksimal 150 kata), sebutkan nama parameter dan apa yang dikembalikan. Salinan fungsi tersimpan di {{WORKDIR}}/fungsi.js bila perlu dibaca ulang. Akhiri jawaban dengan kode {{SENTINEL}} tepat apa adanya.\n\n```js\nfunction total(harga, pajak) {\n  return harga + harga * pajak\n}\n```',
    requiredTools: [],
    maxTurns: 8,
    effort: 'low',
    verifier: (output, { sentinel } = {}) => {
      if (typeof output !== 'string' || !sentinel || !output.includes(sentinel)) return false
      const hasParam = /parameter|argumen|harga|pajak/i.test(output)
      const hasReturn = /kembali|return|mengembalikan/i.test(output)
      return output.length >= 100 && hasParam && hasReturn
    },
  },

  'tb-git-02': {
    prompt:
      'Di {{WORKDIR}}/git-repo sudah ada repo git terinisialisasi berisi satu file. Stage semua perubahan dan buat satu commit dengan pesan yang memuat kode {{SENTINEL}} tepat apa adanya. Jawab singkat setelah selesai.',
    requiredTools: ['run-shell'],
    maxTurns: 10,
    effort: 'low',
    verifier: (output, { sentinel, workdir, stepLog } = {}) => {
      if (!hasToolEvidence(stepLog, ['run-shell'])) return false
      if (!sentinel || !workdir) return false
      return hasGitCommitWithMessage(join(workdir, 'git-repo'), sentinel)
    },
  },
}
