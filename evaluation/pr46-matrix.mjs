// evaluation/pr46-matrix.mjs - PR46 30-fixture measurement matrix.
//
// New measurement set for PR46. It does NOT replace or duplicate the existing
// registries (terminal-bench TASKS, CORP tasks, LIMIT rungs, arch bench probes):
// every fixture below is a distinct lane/variant with a deterministic
// world-state oracle. Fixtures follow the existing runner contract
// (prompt + maxTurns + effort + requiredTools + verifier(output, ctx)) so the
// existing orchestrator can run them unchanged.
//
// Anti-cheat rules enforced by construction:
//   - the oracle reads world state (artifacts, stepLog evidence), never the
//     model's final answer text alone;
//   - every fixture injects a per-run sentinel so memorized answers fail;
//   - genuine negative evidence (missing source) is a distinct required outcome
//     from tool execution failure.
//
// This module is pure registry + seeding helpers. It performs no I/O until a
// fixture's seed() is called by the runner.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { hasToolEvidence } from './tasks-student-corporate.mjs'

export const PR46_LANES = Object.freeze({
  RESEARCH: 'research',
  BROWSER: 'browser',
  OS: 'os',
  STUDY: 'study',
  RECOVERY: 'recovery',
  REUSE: 'reuse',
})

// Documented lane sizes (docs/PLANNED/2026-09-21_agent-benchmark-matrix.md).
export const PR46_LANE_COUNTS = Object.freeze({
  [PR46_LANES.RESEARCH]: 6,
  [PR46_LANES.BROWSER]: 5,
  [PR46_LANES.OS]: 5,
  [PR46_LANES.STUDY]: 5,
  [PR46_LANES.RECOVERY]: 5,
  [PR46_LANES.REUSE]: 4,
})

export const PR46_TOTAL_FIXTURES = Object.freeze(
  Object.values(PR46_LANE_COUNTS).reduce((a, b) => a + b, 0)
)

const ARTIFACT_MARK = 'write-file'
const readWorld = (workdir, rel) => {
  try {
    const p = join(workdir, rel)
    return existsSync(p) ? readFileSync(p, 'utf8') : null
  } catch {
    return null
  }
}
const worldHas = (workdir, rel) => {
  try {
    return existsSync(join(workdir, rel))
  } catch {
    return false
  }
}
const isDir = (workdir, rel) => {
  try {
    const p = join(workdir, rel)
    return existsSync(p) && statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Flatten any supported stepLog shape into tool calls. */
export function flattenCalls(stepLog = []) {
  const calls = []
  for (const step of Array.isArray(stepLog) ? stepLog : []) {
    if (Array.isArray(step?.toolCalls)) calls.push(...step.toolCalls)
    else if (step && typeof step.tool === 'string') calls.push(step)
  }
  return calls
}

const isFail = (c) => c?.success === false || (typeof c?.result === 'string' && c.result.startsWith('ERROR:'))

/** True when some failed call is followed by a successful, different-tool call. */
export function failureThenSuccess(stepLog = []) {
  const calls = flattenCalls(stepLog)
  for (let i = 0; i < calls.length; i++) {
    if (!isFail(calls[i])) continue
    for (let j = i + 1; j < calls.length; j++) {
      if (!isFail(calls[j]) && calls[j].tool !== calls[i].tool) return true
    }
  }
  return false
}

/** Longest run of identical (tool + query) calls; a bounded-loop probe. */
export function maxAdjacentRepeats(stepLog = []) {
  const calls = flattenCalls(stepLog)
  let best = 0
  let run = 0
  for (let i = 0; i < calls.length; i++) {
    if (i > 0 && calls[i].tool === calls[i - 1].tool && String(calls[i].query ?? '') === String(calls[i - 1].query ?? '')) {
      run += 1
    } else {
      run = 1
    }
    best = Math.max(best, run)
  }
  return best
}

const hasAnyTool = (stepLog, tools) => flattenCalls(stepLog).some((c) => !isFail(c) && tools.includes(c.tool))
const containsAll = (text, tokens) => typeof text === 'string' && tokens.every((t) => text.includes(t))
const containsNone = (text, tokens) => typeof text === 'string' && tokens.every((t) => !text.includes(t))

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')

/**
 * True when `a` and `b` occur within `maxGap` characters of each other (either
 * order). Used so a provenance oracle checks a claim is actually tied to its
 * source, instead of both strings merely appearing somewhere in the document.
 */
export function pairedWithin(text, a, b, maxGap = 40) {
  if (typeof text !== 'string' || !text) return false
  const A = escapeRe(a)
  const B = escapeRe(b)
  return new RegExp(`(${A}[\\s\\S]{0,${maxGap}}${B}|${B}[\\s\\S]{0,${maxGap}}${A})`).test(text)
}

function writeWorld(workdir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(workdir, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  }
}

// ------------------------------------------------------------------ research
// Source/evidence lane. Oracles require grounded citation of seeded sources,
// not answer text alone. Genuine negative evidence is a required outcome.
const RESEARCH = [
  {
    taskId: 'pr46-research-01',
    lane: PR46_LANES.RESEARCH,
    long: false,
    variant: 'single-source-grounded',
    prompt:
      'Baca {{WORKDIR}}/sumber-a.txt lalu tulis {{WORKDIR}}/laporan.md yang memuat fakta FAKTA-A1 dan kode {{SENTINEL}} tepat apa adanya. Jangan menyentuh berkas lain. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 8,
    effort: 'low',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'sumber-a.txt': `sumber:A1\nfakta:FAKTA-A1\nkode:${sentinel}\n`,
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'laporan.md')
      return containsAll(md, ['FAKTA-A1', sentinel])
    },
  },
  {
    taskId: 'pr46-research-02',
    lane: PR46_LANES.RESEARCH,
    long: false,
    variant: 'two-source-corroboration',
    prompt:
      'Baca {{WORKDIR}}/sumber-a.txt dan {{WORKDIR}}/sumber-b.txt, lalu tulis {{WORKDIR}}/laporan.md yang mengutip kedua fakta (FAKTA-A1 dan FAKTA-B2) beserta kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 10,
    effort: 'low',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'sumber-a.txt': `fakta:FAKTA-A1\nkode:${sentinel}\n`,
        'sumber-b.txt': `fakta:FAKTA-B2\nkode:${sentinel}\n`,
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'laporan.md')
      return containsAll(md, ['FAKTA-A1', 'FAKTA-B2', sentinel])
    },
  },
  {
    taskId: 'pr46-research-03',
    lane: PR46_LANES.RESEARCH,
    long: false,
    variant: 'negative-evidence',
    prompt:
      'Teliti topik "kuark eksotis" memakai hanya berkas sumber di {{WORKDIR}} (sumber-a.txt, decoy.txt). Bila topik tidak didukung sumber mana pun, tulis {{WORKDIR}}/temuan.md yang menyatakan secara eksplisit bahwa bukti tidak ditemukan, dan JANGAN mengutip berkas decoy. Sertakan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 10,
    effort: 'medium',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'sumber-a.txt': `topik:energi surya\nfakta:FAKTA-A1\nkode:${sentinel}\n`,
        'decoy.txt': `topik:lain\nfakta:FAKTA-X9\nkode:${sentinel}\n`,
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      // A "negative evidence" research verdict must be grounded in an actual
      // attempt to read the sources: without read-file the agent could skip
      // inspection entirely and still write "not found".
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'temuan.md')
      if (!containsAll(md, [sentinel]) || !containsNone(md, ['FAKTA-X9'])) return false
      return /(tidak ditemukan|tidak ada bukti|not found|no evidence)/i.test(md || '')
    },
  },
  {
    taskId: 'pr46-research-04',
    lane: PR46_LANES.RESEARCH,
    long: false,
    variant: 'conflict-resolution',
    prompt:
      'Dua sumber di {{WORKDIR}} saling bertentangan soal VERSI: sumber-a.txt (otoritatif=false) dan sumber-b.txt (otoritatif=true). Tulis {{WORKDIR}}/putusan.md yang memakai nilai dari sumber otoritatif, menyebut adanya konflik, dan memuat kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 10,
    effort: 'medium',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'sumber-a.txt': `VERSI: 1.0\notoritatif:false\nkode:${sentinel}\n`,
        'sumber-b.txt': `VERSI: 2.0\notoritatif:true\nkode:${sentinel}\n`,
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'putusan.md')
      if (!containsAll(md, ['VERSI: 2.0', sentinel])) return false
      return /(konflik|conflict|bertentangan)/i.test(md || '') && !md.includes('VERSI: 1.0')
    },
  },
  {
    taskId: 'pr46-research-05',
    lane: PR46_LANES.RESEARCH,
    long: true,
    variant: 'multi-hop-derivation',
    prompt:
      'Baca tiga sumber di {{WORKDIR}} (sumber-a.txt, sumber-b.txt, sumber-c.txt). Setiap sumber memuat satu NILAI. Tulis {{WORKDIR}}/hasil.md yang memuat baris "TOTAL=<jumlah ketiga nilai>", mengutip ketiga id sumber, dan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 16,
    effort: 'high',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'sumber-a.txt': `sumber:A\nNILAI: 12\nkode:${sentinel}\n`,
        'sumber-b.txt': `sumber:B\nNILAI: 30\nkode:${sentinel}\n`,
        'sumber-c.txt': `sumber:C\nNILAI: 45\nkode:${sentinel}\n`,
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'hasil.md')
      if (!containsAll(md, ['TOTAL=87', sentinel])) return false
      return ['sumber:A', 'sumber:B', 'sumber:C'].every((id) => md.includes(id))
    },
  },
  {
    taskId: 'pr46-research-06',
    lane: PR46_LANES.RESEARCH,
    long: true,
    variant: 'provenance-table',
    prompt:
      'Baca tiga sumber di {{WORKDIR}} (sumber-a.txt, sumber-b.txt, sumber-c.txt). Tulis {{WORKDIR}}/provenance.md berisi tabel yang memetakan tiap klaim ke id sumbernya, satu baris per pasangan (misaL: KLM-A1 -> SRC-A). Wajib memuat ketiga klaim (KLM-A1, KLM-B2, KLM-C3), ketiga id (SRC-A, SRC-B, SRC-C), dan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 16,
    effort: 'high',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'sumber-a.txt': `id:SRC-A\nklaim:KLM-A1\nkode:${sentinel}\n`,
        'sumber-b.txt': `id:SRC-B\nklaim:KLM-B2\nkode:${sentinel}\n`,
        'sumber-c.txt': `id:SRC-C\nklaim:KLM-C3\nkode:${sentinel}\n`,
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'provenance.md')
      if (!containsAll(md, ['KLM-A1', 'KLM-B2', 'KLM-C3', 'SRC-A', 'SRC-B', 'SRC-C', sentinel])) return false
      // Every claim must be tied to its own source, not just to one of them.
      return [
        ['KLM-A1', 'SRC-A'],
        ['KLM-B2', 'SRC-B'],
        ['KLM-C3', 'SRC-C'],
      ].every(([claim, src]) => pairedWithin(md, claim, src))
    },
  },
]

// ------------------------------------------------------------------- browser
// Page/world-state lane. Oracles require browser tool evidence AND page-derived
// content. Fixtures 04/05 are the representation ablation pair: identical
// prompt/oracle, different observation representation.
const BROWSER_PAGE = {
  seed: (workdir, sentinel) =>
    writeWorld(workdir, {
      'pages/beranda.html':
        `<!doctype html><html><head><title>Beranda-UTAMA</title></head>` +
        `<body><main>TEKS-UTAMA halaman beranda kode ${sentinel}</main>` +
        `<nav><a href="#a">TAUTAN-1</a><a href="#b">TAUTAN-2</a></nav></body></html>\n`,
      'pages/daftar.html':
        `<!doctype html><html><head><title>Daftar</title></head><body>` +
        `<ul><li>TAUTAN-1</li><li>TAUTAN-2</li><li>TAUTAN-3</li><li>TAUTAN-4</li></ul>` +
        `<footer>kode ${sentinel}</footer></body></html>\n`,
      'pages/form.html':
        `<!doctype html><html><head><title>Form</title></head><body>` +
        `<form><label for="nama-kampus">Nama Kampus</label>` +
        `<input id="nama-kampus" value="KAMPUS-UTAMA" /></form>` +
        `<p>kode ${sentinel}</p></body></html>\n`,
    }),
}

function pageArtifactOracle(rel, tokens) {
  return (_output, { sentinel, workdir, stepLog }) => {
    const browserEvidence = hasAnyTool(stepLog, ['browser-navigate', 'browser-read', 'read-dom'])
    if (!browserEvidence) return false
    if (!hasToolEvidence(stepLog, [ARTIFACT_MARK])) return false
    const md = readWorld(workdir, rel)
    return containsAll(md, [...tokens, sentinel])
  }
}

const BROWSER = [
  {
    taskId: 'pr46-browser-01',
    lane: PR46_LANES.BROWSER,
    long: false,
    variant: 'page-identity-and-main-text',
    representation: 'semantic-first',
    prompt:
      'Buka halaman lokal {{WORKDIR}}/pages/beranda.html, lalu tulis {{WORKDIR}}/halaman.md memuat judul halaman (Beranda-UTAMA), teks utama (TEKS-UTAMA), dan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['browser-navigate', 'browser-read', 'write-file'],
    maxTurns: 12,
    effort: 'medium',
    seed: BROWSER_PAGE.seed,
    verify: pageArtifactOracle('halaman.md', ['Beranda-UTAMA', 'TEKS-UTAMA']),
  },
  {
    taskId: 'pr46-browser-02',
    lane: PR46_LANES.BROWSER,
    long: false,
    variant: 'structured-link-extraction',
    prompt:
      'Buka {{WORKDIR}}/pages/daftar.html, ekstrak semua label tautan yang tampak, lalu tulis {{WORKDIR}}/tautan.md yang memuat keempat label (TAUTAN-1 sampai TAUTAN-4) dan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['browser-navigate', 'browser-read', 'write-file'],
    maxTurns: 12,
    effort: 'medium',
    seed: BROWSER_PAGE.seed,
    verify: pageArtifactOracle('tautan.md', ['TAUTAN-1', 'TAUTAN-2', 'TAUTAN-3', 'TAUTAN-4']),
  },
  {
    taskId: 'pr46-browser-03',
    lane: PR46_LANES.BROWSER,
    long: false,
    variant: 'form-field-read',
    prompt:
      'Buka {{WORKDIR}}/pages/form.html, baca field form yang ada, lalu tulis {{WORKDIR}}/form.md memuat nama field (nama-kampus) dan nilainya (KAMPUS-UTAMA) serta kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['browser-navigate', 'browser-read', 'write-file'],
    maxTurns: 12,
    effort: 'medium',
    seed: BROWSER_PAGE.seed,
    verify: pageArtifactOracle('form.md', ['nama-kampus', 'KAMPUS-UTAMA']),
  },
  {
    taskId: 'pr46-browser-04',
    lane: PR46_LANES.BROWSER,
    long: true,
    variant: 'representation-ablation',
    representation: 'raw',
    prompt:
      'Buka {{WORKDIR}}/pages/beranda.html, lalu tulis {{WORKDIR}}/ablation.md memuat teks utama (TEKS-UTAMA) dan kode {{SENTINEL}}. Fokus pada konten semantik halaman, bukan daftar kontrol UI. Jawab singkat setelah selesai.',
    requiredTools: ['browser-navigate', 'browser-read', 'write-file'],
    maxTurns: 14,
    effort: 'high',
    seed: BROWSER_PAGE.seed,
    verify: pageArtifactOracle('ablation.md', ['TEKS-UTAMA']),
  },
  {
    taskId: 'pr46-browser-05',
    lane: PR46_LANES.BROWSER,
    long: true,
    variant: 'representation-ablation',
    representation: 'semantic-first',
    prompt:
      'Buka {{WORKDIR}}/pages/beranda.html, lalu tulis {{WORKDIR}}/ablation.md memuat teks utama (TEKS-UTAMA) dan kode {{SENTINEL}}. Fokus pada konten semantik halaman, bukan daftar kontrol UI. Jawab singkat setelah selesai.',
    requiredTools: ['browser-navigate', 'browser-read', 'write-file'],
    maxTurns: 14,
    effort: 'high',
    seed: BROWSER_PAGE.seed,
    verify: pageArtifactOracle('ablation.md', ['TEKS-UTAMA']),
  },
]

// ------------------------------------------------------------------------ os
// Filesystem/world-state lane. Oracles read the resulting filesystem directly.
const OS = [
  {
    taskId: 'pr46-os-01',
    lane: PR46_LANES.OS,
    long: false,
    variant: 'nested-create',
    prompt:
      'Buat berkas {{WORKDIR}}/arsip/2026/catatan.txt yang memuat kode {{SENTINEL}} tepat apa adanya. Jawab singkat setelah selesai.',
    requiredTools: ['write-file'],
    maxTurns: 8,
    effort: 'low',
    seed: () => {},
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['write-file'])) return false
      return containsAll(readWorld(workdir, 'arsip/2026/catatan.txt'), [sentinel])
    },
  },
  {
    taskId: 'pr46-os-02',
    lane: PR46_LANES.OS,
    long: false,
    variant: 'rename-preserve-content',
    prompt:
      'Pindahkan berkas {{WORKDIR}}/berkas/lama.txt menjadi {{WORKDIR}}/berkas/baru.txt tanpa mengubah isinya, lalu tambahkan kode {{SENTINEL}} di dalamnya. Pastikan lama.txt tidak ada lagi. Jawab singkat setelah selesai.',
    requiredTools: ['run-shell', 'write-file'],
    maxTurns: 12,
    effort: 'medium',
    seed: (workdir) => writeWorld(workdir, { 'berkas/lama.txt': 'ISI-LAMA\n' }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasAnyTool(stepLog, ['run-shell', 'write-file', 'move-file'])) return false
      if (worldHas(workdir, 'berkas/lama.txt')) return false
      return containsAll(readWorld(workdir, 'berkas/baru.txt'), ['ISI-LAMA', sentinel])
    },
  },
  {
    taskId: 'pr46-os-03',
    lane: PR46_LANES.OS,
    long: false,
    variant: 'append-preserve',
    prompt:
      'Tambahkan (append) baris baru "BARIS-2" dan kode {{SENTINEL}} ke berkas {{WORKDIR}}/log.txt tanpa menghapus baris lama. Jawab singkat setelah selesai.',
    requiredTools: ['run-shell', 'write-file'],
    maxTurns: 10,
    effort: 'low',
    seed: (workdir) => writeWorld(workdir, { 'log.txt': 'BARIS-1\n' }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasAnyTool(stepLog, ['run-shell', 'write-file'])) return false
      return containsAll(readWorld(workdir, 'log.txt'), ['BARIS-1', 'BARIS-2', sentinel])
    },
  },
  {
    taskId: 'pr46-os-04',
    lane: PR46_LANES.OS,
    long: true,
    variant: 'dependent-batch-write',
    prompt:
      'Buat 5 berkas di {{WORKDIR}}/out/: f1.txt sampai f5.txt. Berkas fn.txt wajib memuat baris "IDX-n" (contoh f3.txt memuat "IDX-3") dan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['write-file'],
    maxTurns: 20,
    effort: 'high',
    seed: () => {},
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['write-file'])) return false
      for (let n = 1; n <= 5; n++) {
        if (!containsAll(readWorld(workdir, `out/f${n}.txt`), [`IDX-${n}`, sentinel])) return false
      }
      return true
    },
  },
  {
    taskId: 'pr46-os-05',
    lane: PR46_LANES.OS,
    long: true,
    variant: 'window-state-report',
    prompt:
      'Baca {{WORKDIR}}/windows.txt (daftar jendela; baris dengan penanda [FOKUS] adalah jendela aktif). Tulis {{WORKDIR}}/fokus.md yang menyebut nama jendela aktif dan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['run-shell', 'read-file', 'write-file'],
    maxTurns: 14,
    effort: 'high',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'windows.txt': `JENDELA-EDITOR\nJENDELA-BROWSER\nJENDELA-TERMINAL [FOKUS]\nkode:${sentinel}\n`,
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'fokus.md')
      if (!containsAll(md, ['JENDELA-TERMINAL', sentinel])) return false
      return containsNone(md, ['JENDELA-EDITOR', 'JENDELA-BROWSER'])
    },
  },
]

// --------------------------------------------------------------------- study
// Study/learning lane. Artifact/answer oracles grounded in seeded material.
const STUDY = [
  {
    taskId: 'pr46-study-01',
    lane: PR46_LANES.STUDY,
    long: false,
    variant: 'structured-notes',
    prompt:
      'Baca {{WORKDIR}}/kuliah.txt lalu tulis {{WORKDIR}}/catatan.md dengan tepat dua bagian: "## Konsep" dan "## Contoh". Cantumkan istilah ENERGIK dan FOTOVOLT serta kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 12,
    effort: 'medium',
    seed: (workdir) =>
      writeWorld(workdir, {
        'kuliah.txt': 'ENERGIK surya diubah oleh panel FOTOVOLT menjadi listrik.\n',
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'catatan.md')
      return containsAll(md, ['## Konsep', '## Contoh', 'ENERGIK', 'FOTOVOLT', sentinel])
    },
  },
  {
    taskId: 'pr46-study-02',
    lane: PR46_LANES.STUDY,
    long: false,
    variant: 'grounded-quiz-answers',
    prompt:
      'Baca {{WORKDIR}}/materi.txt lalu jawab pertanyaan di {{WORKDIR}}/soal.txt. Tulis jawaban ke {{WORKDIR}}/jawaban.md dengan format "1: <jawaban>" sampai "3: <jawaban>", memakai fakta dari materi, dan sertakan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 14,
    effort: 'medium',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'materi.txt':
          'Bumi mengorbit Matahari dalam 365 hari.\nFotosintesis menghasilkan oksigen.\nPelangi memiliki 7 warna.\n' +
          `kode:${sentinel}\n`,
        'soal.txt': '1: Berapa hari Bumi mengorbit Matahari?\n2: Apa yang dihasilkan fotosintesis?\n3: Berapa warna pelangi?\n',
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'jawaban.md')
      if (!containsAll(md, ['365', 'oksigen', '7', sentinel])) return false
      return /1:/.test(md) && /2:/.test(md) && /3:/.test(md)
    },
  },
  {
    taskId: 'pr46-study-03',
    lane: PR46_LANES.STUDY,
    long: false,
    variant: 'bounded-summary',
    prompt:
      'Baca {{WORKDIR}}/materi.txt dan ringkas menjadi maksimal 3 kalimat di {{WORKDIR}}/ringkasan.md. Ringkasan wajib menyebut istilah FOTOSINTESIS dan kode {{SENTINEL}}. Jangan menambah fakta di luar materi. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 12,
    effort: 'medium',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'materi.txt': `FOTOSINTESIS mengubah cahaya menjadi energi kimia. Proses ini menghasilkan oksigen.\nkode:${sentinel}\n`,
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'ringkasan.md')
      if (!containsAll(md, ['FOTOSINTESIS', sentinel])) return false
      const sentences = (md.match(/[.!?]/g) || []).length
      return sentences >= 1 && sentences <= 3
    },
  },
  {
    taskId: 'pr46-study-04',
    lane: PR46_LANES.STUDY,
    long: true,
    variant: 'flashcard-set',
    prompt:
      'Baca {{WORKDIR}}/materi.txt lalu buat 4 kartu belajar di {{WORKDIR}}/kartu.md, satu kartu per baris dengan format "KARTU n: <istilah> = <definisi>". Wajib memuat istilah SEL, MITOSIS, RIBOSOM, KLOROPLAS, dan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 18,
    effort: 'high',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'materi.txt':
          'SEL unit terkecil kehidupan.\nMITOSIS pembelahan sel menjadi dua identik.\n' +
          `RIBOSOM tempat sintesis protein.\nKLOROPLAS tempat fotosintesis.\nkode:${sentinel}\n`,
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'kartu.md')
      if (!containsAll(md, ['SEL', 'MITOSIS', 'RIBOSOM', 'KLOROPLAS', sentinel])) return false
      return (md.match(/KARTU \d+:/g) || []).length === 4
    },
  },
  {
    taskId: 'pr46-study-05',
    lane: PR46_LANES.STUDY,
    long: true,
    variant: 'cross-source-concept-map',
    prompt:
      'Baca {{WORKDIR}}/materi-a.txt dan {{WORKDIR}}/materi-b.txt lalu tulis {{WORKDIR}}/peta.md yang menghubungkan istilah lintas sumber: SEL terkait MITOKONDRIA dan ENERGI terkait RESPIRASI. Sertakan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 18,
    effort: 'high',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'materi-a.txt': `SEL memiliki MITOKONDRIA sebagai penghasil energi.\nkode:${sentinel}\n`,
        'materi-b.txt': `RESPIRASI mengubah ENERGI kimia menjadi ATP.\nkode:${sentinel}\n`,
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'peta.md')
      if (!containsAll(md, ['SEL', 'MITOKONDRIA', 'ENERGI', 'RESPIRASI', sentinel])) return false
      return /(SEL[\s\S]{0,40}MITOKONDRIA|MITOKONDRIA[\s\S]{0,40}SEL)/.test(md) &&
        /(ENERGI[\s\S]{0,40}RESPIRASI|RESPIRASI[\s\S]{0,40}ENERGI)/.test(md)
    },
  },
]

// ------------------------------------------------------------------ recovery
// Injected-failure + recovery lane. Oracles compare the seeded (broken) world
// against the recovered world and require honest handling, never fake success.
const RECOVERY = [
  {
    taskId: 'pr46-recovery-01',
    lane: PR46_LANES.RECOVERY,
    long: false,
    variant: 'blocked-target-fallback',
    prompt:
      'Tulis laporan ke {{WORKDIR}}/hasil/laporan.md. Bila path itu terhalang dan tidak bisa ditulis, jangan mengaku berhasil: tulis laporan yang sama ke {{WORKDIR}}/hasil/laporan-cadangan.md dan sebutkan alasannya. Sertakan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['write-file'],
    maxTurns: 14,
    effort: 'medium',
    seed: (workdir, sentinel) => {
      // A directory named laporan.md makes the naive write target unusable.
      writeWorld(workdir, { 'hasil/laporan.md/penghalang.txt': `blokir ${sentinel}\n` })
    },
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['write-file'])) return false
      if (!isDir(workdir, 'hasil/laporan.md')) return false // target must remain a directory
      const md = readWorld(workdir, 'hasil/laporan-cadangan.md')
      if (!containsAll(md, [sentinel])) return false
      return /(terhalang|tidak bisa|blocked|fallback|cadangan)/i.test(md || '')
    },
  },
  {
    taskId: 'pr46-recovery-02',
    lane: PR46_LANES.RECOVERY,
    long: false,
    variant: 'missing-source-fallback',
    prompt:
      'Susun laporan dari {{WORKDIR}}/sumber-utama.txt. Bila berkas itu tidak ada, laporkan bahwa sumber utama hilang dan pakai {{WORKDIR}}/sumber-cadangan.txt sebagai gantinya. Tulis ke {{WORKDIR}}/laporan.md dan sertakan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 14,
    effort: 'medium',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, { 'sumber-cadangan.txt': `fakta:FAKTA-CADANGAN\nkode:${sentinel}\n` }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'laporan.md')
      if (!containsAll(md, ['FAKTA-CADANGAN', sentinel])) return false
      return /(hilang|tidak ada|missing|cadangan|fallback)/i.test(md || '')
    },
  },
  {
    taskId: 'pr46-recovery-03',
    lane: PR46_LANES.RECOVERY,
    long: false,
    variant: 'empty-source-honesty',
    prompt:
      'Ringkas {{WORKDIR}}/materi-kosong.txt ke {{WORKDIR}}/ringkasan.md. Bila berkas kosong atau tanpa isi bermakna, tulis secara eksplisit bahwa tidak ada isi yang bisa diringkas. JANGAN mengarang fakta. Sertakan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 12,
    effort: 'medium',
    seed: (workdir) => writeWorld(workdir, { 'materi-kosong.txt': '' }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'ringkasan.md')
      if (!containsAll(md, [sentinel])) return false
      if (!/(kosong|tidak ada isi|empty|no content)/i.test(md || '')) return false
      return containsNone(md, ['FAKTA-REKAAN'])
    },
  },
  {
    taskId: 'pr46-recovery-04',
    lane: PR46_LANES.RECOVERY,
    long: true,
    variant: 'failure-then-different-tool',
    prompt:
      'Ada berkas rusak di {{WORKDIR}}/rusak.txt. Coba baca berkas itu dulu. Bila gagal, jangan mengulang cara yang sama: gunakan alat berbeda untuk membuat {{WORKDIR}}/perbaikan.md yang menyebut kegagalan awal dan memuat kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'run-shell', 'write-file'],
    maxTurns: 18,
    effort: 'high',
    seed: (workdir, sentinel) => writeWorld(workdir, { 'rusak.txt': `RUSAK:${sentinel}\x00\n` }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['write-file'])) return false
      if (!failureThenSuccess(stepLog)) return false
      const md = readWorld(workdir, 'perbaikan.md')
      if (!containsAll(md, [sentinel])) return false
      return /(gagal|error|rusak|failed)/i.test(md || '')
    },
  },
  {
    taskId: 'pr46-recovery-05',
    lane: PR46_LANES.RECOVERY,
    long: true,
    variant: 'bounded-repeat-no-loop',
    prompt:
      'Verifikasi isi {{WORKDIR}}/status.txt dan tulis {{WORKDIR}}/verifikasi.md memuat isinya dan kode {{SENTINEL}}. Jangan mengulang tool call yang identik lebih dari dua kali; bila hasil tak berubah, hentikan pengulangan dan lanjutkan. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 16,
    effort: 'high',
    seed: (workdir, sentinel) => writeWorld(workdir, { 'status.txt': `STATUS-OK\nkode:${sentinel}\n` }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      if (maxAdjacentRepeats(stepLog) > 2) return false
      return containsAll(readWorld(workdir, 'verifikasi.md'), ['STATUS-OK', sentinel])
    },
  },
]

// --------------------------------------------------------------------- reuse
// Cross-session reuse lane. Oracles require a verified outcome plus provenance,
// and reuse is never treated as proof that the reused procedure is correct.
const REUSE = [
  {
    taskId: 'pr46-reuse-01',
    lane: PR46_LANES.REUSE,
    long: false,
    variant: 'verified-procedure-reuse',
    prompt:
      'Baca {{WORKDIR}}/sesi-lama.json yang berisi prosedur terverifikasi dari sesi sebelumnya. Terapkan prosedurnya untuk menyelesaikan pekerjaan yang sama, lalu tulis {{WORKDIR}}/reuse.md yang memuat id sesi lama, hasil (HASIL-UTAMA), dan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 12,
    effort: 'medium',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'sesi-lama.json': JSON.stringify(
          { runId: 'sesi-2026-A', verified: true, procedure: ['baca', 'hitung', 'tulis'], hasil: 'HASIL-UTAMA', kode: sentinel },
          null,
          2
        ) + '\n',
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      return containsAll(readWorld(workdir, 'reuse.md'), ['sesi-2026-A', 'HASIL-UTAMA', sentinel])
    },
  },
  {
    taskId: 'pr46-reuse-02',
    lane: PR46_LANES.REUSE,
    long: false,
    variant: 'reuse-must-be-revalidated',
    prompt:
      'Baca {{WORKDIR}}/sesi-lama.json (prosedur lama) dan {{WORKDIR}}/materi.txt (kebenaran terkini). Bila hasil prosedur lama bertentangan dengan materi, jangan menyalinnya: pakai nilai materi dan sebutkan koreksinya. Tulis {{WORKDIR}}/reuse.md memuat nilai yang benar (HASIL-BENAR) dan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 14,
    effort: 'medium',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'sesi-lama.json': JSON.stringify({ runId: 'sesi-2026-B', verified: true, hasil: 'HASIL-SALAH', kode: sentinel }) + '\n',
        'materi.txt': `hasil:HASIL-BENAR\nkode:${sentinel}\n`,
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'reuse.md')
      if (!containsAll(md, ['HASIL-BENAR', sentinel])) return false
      if (!containsNone(md, ['HASIL-SALAH'])) return false
      return /(koreksi|salah|bertentangan|revisi)/i.test(md || '')
    },
  },
  {
    taskId: 'pr46-reuse-03',
    lane: PR46_LANES.REUSE,
    long: true,
    variant: 'chained-procedure-composition',
    prompt:
      'Baca {{WORKDIR}}/sesi-a.json dan {{WORKDIR}}/sesi-b.json. Terapkan prosedur A lalu prosedur B secara berurutan, dan tulis {{WORKDIR}}/rantai.md memuat id kedua sesi dan hasil gabungan (GABUNG-AB) beserta kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 18,
    effort: 'high',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'sesi-a.json': JSON.stringify({ runId: 'sesi-a-1', hasil: 'A', kode: sentinel }) + '\n',
        'sesi-b.json': JSON.stringify({ runId: 'sesi-b-2', hasil: 'B', kode: sentinel }) + '\n',
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      return containsAll(readWorld(workdir, 'rantai.md'), ['sesi-a-1', 'sesi-b-2', 'GABUNG-AB', sentinel])
    },
  },
  {
    taskId: 'pr46-reuse-04',
    lane: PR46_LANES.REUSE,
    long: true,
    variant: 'reuse-provenance-block',
    prompt:
      'Terapkan prosedur dari {{WORKDIR}}/sesi-a.json dan tulis {{WORKDIR}}/reuse.md dengan blok provenance berisi "prosedur: <id sesi>" dan "verifikasi: <status verifikasi sesi itu>", dan kode {{SENTINEL}}. Jawab singkat setelah selesai.',
    requiredTools: ['read-file', 'write-file'],
    maxTurns: 16,
    effort: 'high',
    seed: (workdir, sentinel) =>
      writeWorld(workdir, {
        'sesi-a.json': JSON.stringify({ runId: 'sesi-a-1', verified: true, verificationState: 'verified', kode: sentinel }) + '\n',
      }),
    verify: (_output, { sentinel, workdir, stepLog }) => {
      if (!hasToolEvidence(stepLog, ['read-file', 'write-file'])) return false
      const md = readWorld(workdir, 'reuse.md')
      if (!containsAll(md, [sentinel])) return false
      return /prosedur:\s*sesi-a-1/.test(md) && /verifikasi:\s*verified/.test(md)
    },
  },
]

// --------------------------------------------------------------- composition
function withDefaults(fixture) {
  return {
    requiredTools: [],
    maxTurns: 12,
    effort: 'medium',
    sentinel: true,
    long: false,
    representation: null,
    // PR46 oracles read world state, so their verdict is independent of the
    // model's final answer by construction.
    oracleIndependent: true,
    oracleKind: 'world-state',
    ...fixture,
  }
}

const ALL = [...RESEARCH, ...BROWSER, ...OS, ...STUDY, ...RECOVERY, ...REUSE]

// Lane meaning, recorded on every fixture so a report cannot overstate it. The
// reuse lane is ARTIFACT-MEDIATED: the fixture seeds a previous-session artifact
// and the agent reads it. It does not exercise the persistent memory/skill
// subsystem, so it must never be reported as cross-session memory reuse.
export const PR46_LANE_CLAIMS = Object.freeze({
  [PR46_LANES.REUSE]: Object.freeze({
    kind: 'artifact-mediated',
    measuredClaim: 'reuse of a prior-session artifact present in the fixture world',
    notMeasured: 'persistent memory/skill subsystem reuse across real sessions',
  }),
})

export const PR46_TASKS = Object.fromEntries(
  ALL.map((f) => {
    const task = withDefaults(f)
    if (task.lane === PR46_LANES.REUSE) {
      task.reuseKind = PR46_LANE_CLAIMS[PR46_LANES.REUSE].kind
      task.measuredClaim = PR46_LANE_CLAIMS[PR46_LANES.REUSE].measuredClaim
      task.notMeasured = PR46_LANE_CLAIMS[PR46_LANES.REUSE].notMeasured
    }
    return [task.taskId, task]
  })
)

// Browser representation ablation pair: same page, same task, same oracle;
// only the observation representation differs.
export const PR46_ABLATION_PAIRS = Object.freeze([
  Object.freeze({ id: 'browser-representation', raw: 'pr46-browser-04', semanticFirst: 'pr46-browser-05' }),
])

export function listPr46Tasks() {
  return Object.values(PR46_TASKS).map((t) => ({
    taskId: t.taskId,
    lane: t.lane,
    long: t.long,
    variant: t.variant,
    representation: t.representation,
    maxTurns: t.maxTurns,
    effort: t.effort,
    requiredTools: t.requiredTools,
  }))
}

export function laneCounts() {
  const counts = {}
  for (const lane of Object.values(PR46_LANES)) counts[lane] = 0
  for (const t of Object.values(PR46_TASKS)) counts[t.lane] += 1
  return counts
}

/**
 * Seed a fixture's deterministic world before the agent runs. Mirrors
 * run.mjs seedFixtures but per-lane, and performs no network access.
 */
export function seedPr46Fixture(task, workdir, sentinel) {
  mkdirSync(workdir, { recursive: true })
  if (typeof task?.seed === 'function') task.seed(workdir, sentinel)
  return workdir
}

export default {
  PR46_LANES,
  PR46_LANE_COUNTS,
  PR46_LANE_CLAIMS,
  PR46_TOTAL_FIXTURES,
  PR46_TASKS,
  PR46_ABLATION_PAIRS,
  listPr46Tasks,
  laneCounts,
  seedPr46Fixture,
  flattenCalls,
  failureThenSuccess,
  maxAdjacentRepeats,
  pairedWithin,
}
