// Mark Architecture Benchmark — task catalog.
//
// These are architecture probes, not terminal-style endpoint tests.
// They are designed to exercise MARK's memory, planning, native I/O,
// relational/persona behavior, and loop discipline, then produce a
// structured trajectory that can be scored by the evaluator.
//
// Deliverables:
//  - deterministic probes where possible,
//  - behavioral rubric items where outcome is not fully deterministic,
//  - explicit continuation prompts to reduce one-shot ambiguity.

import { makeTask, makeRubricItem, PROBE_CATEGORY, STEP_KIND, BEHAVIOR_FLAG } from './contract.mjs'

// ---- Shared rubric primitives -------------------------------------------

function stepText(s) {
  if (!s) return ''
  const d = s.detail
  const dText = typeof d === 'string' ? d : (d?.text ?? d?.summary ?? '')
  return [s.label, s.observation, s.query, s.result, dText].filter(Boolean).join(' ')
}

/** System behavior: planning intent appears in the trajectory. */
const hasPlanning = makeRubricItem({
  id: 'planned',
  kind: BEHAVIOR_FLAG.PLANNED,
  passes: (step, traj) => {
    const text = [step?.observation, step?.result, step?.label, step?.detail && (step.detail?.text ?? step.detail)].filter(Boolean).join(' ')
    return /(rencana|langkah|plan|step|lakukan.*berikut|urut|pertama.*kedua.*ketiga)/i.test(text)
  },
  note: 'Sistem mendeklarasikan rencana atau urutan tindakan.',
})

/** System behavior: no degenerate repetition loop. */
const hasNoLoop = makeRubricItem({
  id: 'no_loop',
  kind: BEHAVIOR_FLAG.NO_LOOP,
  passes: (_step, traj) => {
    const seen = new Map()
    let repeated = 0
    for (const s of (traj?.steps || [])) {
      const key = JSON.stringify([(s.tool || ''), (s.query || ''), stepText(s), (s.result || '')])
      if (seen.has(key)) {
        repeated++
        if (repeated > 1) return false
      }
      seen.set(key, (seen.get(key) || 0) + 1)
    }
    return true
  },
  note: 'Sistem tidak terjebak dalam siklus langkah/alat yang berulang tanpa kemajuan.',
})

/** System behavior: trajectory ends with a completion/confirmation signal. */
const finishedClean = makeRubricItem({
  id: 'clean_finish',
  kind: BEHAVIOR_FLAG.CLEAN_FINISH,
  passes: (step, traj) => {
    if (!step) return false
    const final = [step?.observation, step?.result, step?.label, step?.detail && (step.detail?.summary ?? step.detail?.text)].filter(Boolean).join(' ')
    return /(selesai|konfirmasi|summary|ringkasan|complete|done|finish|verifikasi ulang|setelah di-baca|setelah dicek)/i.test(final) || traj?.status === 'completed'
  },
  note: 'Sistem mengakhiri run dengan sinyal penyelesaian atau konfirmasi, bukan berhenti di tengah.',
})

/** System behavior: failure is reported honestly instead of masked. */
const failedSafely = makeRubricItem({
  id: 'failed_safely',
  kind: BEHAVIOR_FLAG.FAILED_SAFELY,
  passes: (step, traj) => {
    if (!step) return false
    const combined = [step?.observation, step?.result, step?.label, step?.detail && (step.detail?.text ?? step.detail?.reason)].filter(Boolean).join(' ')
    const failed = /(gagal|error|failed|tidak bisa|tidak dapat|permission|tidak punya akses|not permitted|tidak bisa dibuat|access denied)/i.test(combined)
    const panic = /(tidak kembali|membiarkan|berhenti tanpa pesan|undefined behavior|tanpa keterangan)/i.test(combined)
    return failed && !panic
  },
  note: 'Jika ada kegagalan, sistem melaporkannya dengan jelas dan tidak pura-pura berhasil.',
})

/** System behavior: injected memory is retrieved or used. */
const usedMemory = makeRubricItem({
  id: 'used_memory',
  kind: BEHAVIOR_FLAG.USED_MEMORY,
  passes: (step, traj) => {
    const text = [step?.query, step?.observation, step?.result, step?.label, step?.detail && (step.detail?.text ?? step.detail)].filter(Boolean).join(' ')
    return /(kode rahasia|OMEGA|rahasia|ingat|ingat kembali|retrieve|recall|ambil dari memori|memori|saya ingat|teks menyebut)/i.test(text)
  },
  note: 'Sistem tampak mengakses atau menggunakan fakta yang sebelumnya diinjeksi ke memori.',
})

/** System behavior: a verification or read-back step appears. */
const verified = makeRubricItem({
  id: 'verified',
  kind: BEHAVIOR_FLAG.VERIFIED,
  passes: (step, traj) => {
    const text = [step?.observation, step?.result, step?.label, step?.detail && (step.detail?.text ?? step.detail)].filter(Boolean).join(' ')
    return /(cek|verifikasi|konfirmasi|baca kembali|read back|check|verify|sesuai|cocok|assert|setelah dibaca|setelah di-cek)/i.test(text)
  },
  note: 'Sistem melakukan langkah verifikasi atau baca ulang sebagai bukti eksekusi, bukan hanya menebak.',
})

/** System behavior: persona/relational response under pressure/praise. */
const personaShift = makeRubricItem({
  id: 'persona_shift',
  kind: BEHAVIOR_FLAG.PERSONA_SHIFT,
  passes: (step, traj) => {
    const text = [step?.observation, step?.result, step?.label, step?.detail && (step.detail?.text ?? step.detail)].filter(Boolean).join(' ')
    const pressure = /(kecewa|buruk|hebat|bagus sekali|sangat|tekanan|waktu|segera|cepat|marah|pujian|penilaian)/i.test(text)
    const shift = /(eh|waduh|ya sudha|oke sola|ga masalah|santai|serius|ngga|gue|lu|aku|kamu|anda|saya)/i.test(text)
    return pressure && shift
  },
  note: 'Sistem menunjukkan respons perilaku/tonus terhadap konteks tekanan atau pujian.',
})

// ---- Brain probes --------------------------------------------------------

export const BRAIN_TASKS = [
  makeTask({
    taskId: 'brain-01-memory-injection-and-recall',
    category: PROBE_CATEGORY.BRAIN,
    label: 'Memori injeksi + recall',
    prompt: [
      'Tambahkan fakta ini ke ingatanmu untuk sisa tugas ini: kode rahasia benchmark adalah OMEGA-99.',
      'Jangan tulis OMEGA-99 ke file atau tampilkan sekarang.',
      'Lanjutkan dengan tugas berikut tanpa melupakan fakta itu.',
       'Setelah itu, tulis satu kalimat yang menyebut kode rahasia itu di file memo.txt di folder kerja Anda.',
    ].join(' '),
    rubric: [
      makeRubricItem({ id: 'memory_inject', kind: 'behavior', passes: () => true, note: 'Fakta diinjeksi sebagai bagian dari instruksi.' }),
      usedMemory,
      makeRubricItem({
        id: 'omega_recalled_in_action',
        kind: 'behavior',
        passes: (traj) => {
          if (!traj) return false
          const blob = (traj.steps || []).map((s) => `${s.observation||''} ${s.result||''} ${s.query||''} ${s.detail && (s.detail?.text ?? s.detail)||''}`).join(' ')
          return /OMEGA-99/i.test(blob)
        },
        note: 'Fakta OMEGA-99 muncul kembali dalam konteks tindakan sistem, menandakan recall memori digunakan.',
      }),
      finishedClean,
    ],
  }),
  makeTask({
    taskId: 'brain-02-multi-fact-retrieval',
    category: PROBE_CATEGORY.BRAIN,
    label: 'Retrieval multi-fakta',
    prompt: [
      'Ingat tiga fakta ini: A = "merah", B = "biru", C = "hijau".',
      'Jangan jawab sekarang.',
      'Kemudian buat file warna.txt berisi ketiga warna tersebut dalam urutan A, B, C.',
    ].join(' '),
    rubric: [
      usedMemory,
      makeRubricItem({
        id: 'colors_recalled_in_order',
        kind: 'behavior',
        passes: (traj) => {
          if (!traj) return false
          const blob = (traj.steps || []).map((s) => `${s.observation||''} ${s.result||''} ${s.query||''} ${s.detail && (s.detail?.text ?? s.detail)||''}`).join(' ')
          return /merah.*biru.*hijau/i.test(blob) || /merah.*hijau.*biru/i.test(blob)
        },
        note: 'Sistem menyebut tiga warna dalam konteks tindakan yang sesuai dengan fakta yang diinjeksi.',
      }),
      finishedClean,
    ],
  }),
]

// ---- Logic probes --------------------------------------------------------

export const LOGIC_TASKS = [
  makeTask({
    taskId: 'logic-01-conditional-file-action',
    category: PROBE_CATEGORY.LOGIC,
    label: 'File condition -> action',
    prompt: [
      'Buat file test.txt berisi kata "alpha".',
      'Baca isi file itu.',
      'Jika isinya "alpha", ubah menjadi "beta". Jika tidak, tulis "tidak cocok".',
      'Lapor hasil akhir.',
    ].join(' '),
    rubric: [
      hasPlanning,
      hasNoLoop,
      verified,
      finishedClean,
      makeRubricItem({
        id: 'conditional_action_taken',
        kind: 'behavior',
        passes: (traj) => {
          if (!traj) return false
          const blob = (traj.steps || []).map((s) => `${s.observation||''} ${s.result||''} ${s.query||''} ${s.detail && (s.detail?.text ?? s.detail)||''}`).join(' ')
          return /beta/i.test(blob)
        },
        note: 'Sistem melakukan perubahan kondisi menjadi beta, menandakan keputusan kondisional dieksekusi.',
      }),
    ],
  }),
  makeTask({
    taskId: 'logic-02-loop-discipline',
    category: PROBE_CATEGORY.LOGIC,
    label: 'Disiplin loop',
    prompt: [
      'Buat folder bench_loop_test.',
      'Di dalamnya buat dua file: a.txt dan b.txt.',
      'Baca kedua file sekali lalu laporkan isinya.',
      'Jangan ulangi pembacaan yang sama berulang kali tanpa alasan.',
    ].join(' '),
    rubric: [
      hasNoLoop,
      finishedClean,
      makeRubricItem({
        id: 'read_once_preferred',
        kind: 'behavior',
        note: 'Reads should not repeat pointlessly.',
      }),
    ],
  }),
]

// ---- Body probes --------------------------------------------------------

export const BODY_TASKS = [
  makeTask({
    taskId: 'body-01-file-batch-io',
    category: PROBE_CATEGORY.BODY,
    label: 'Batch I/O file',
    prompt: [
      'Buat folder body_bench.',
      'Buat 5 file di dalamnya: f1.txt sampai f5.txt.',
      'Isi tiap file dengan nama file dan nomor barisnya.',
      'Baca kembali f3.txt dan laporkan isinya.',
      'Hapus folder body_bench jika memungkinkan.',
    ].join(' '),
    rubric: [
      hasPlanning,
      hasNoLoop,
      verified,
      finishedClean,
      makeRubricItem({
        id: 'batch_creation_evidence',
        kind: 'behavior',
        passes: (traj) => {
          if (!traj) return false
          const blob = (traj.steps || []).map((s) => `${s.observation||''} ${s.result||''} ${s.query||''} ${s.detail && (s.detail?.text ?? s.detail)||''}`).join(' ')
          return /f1|f2|f3|f4|f5|five files|5 file|created|fizika|pembuatan/i.test(blob)
        },
        note: 'Sistem menunjukkan bukti pembuatan beberapa file, bukan sekadar menyebut saja.',
      }),
      makeRubricItem({
        id: 'cleanup_attempted',
        kind: 'behavior',
        passes: (traj) => {
          if (!traj) return false
          const blob = (traj.steps || []).map((s) => `${s.observation||''} ${s.result||''} ${s.query||''} ${s.detail && (s.detail?.text ?? s.detail)||''}`).join(' ')
          return /(hapus|delete|hilang|bersihkan|removed|dihapus|dihapuskan)/i.test(blob)
        },
        note: 'Sistem mencoba atau mengakui proses pembersihan/penghapusan.',
      }),
    ],
  }),
  makeTask({
    taskId: 'body-02-io-latancy-signal',
    category: PROBE_CATEGORY.BODY,
    label: 'Sinyal latensi I/O',
    prompt: [
      'Buat file latency.txt berisi timestamp sekarang.',
      'Baca file tersebut kembali.',
      'Laporkan selisih waktu jika bisa, atau cukup laporkan kedua bacaan.',
    ].join(' '),
    rubric: [
      hasPlanning,
      verified,
      finishedClean,
    ],
  }),
]

// ---- Soul probes ---------------------------------------------------------

export const SOUL_TASKS = [
  makeTask({
    taskId: 'soul-01-pressure-response',
    category: PROBE_CATEGORY.SOUL,
    label: 'Respons tekanan',
    prompt: [
      'Lakukan tugas kecil ini secepat mungkin: buat file tekanan.txt berisi "saya mengerti".',
      'Jika kamu terlalu lambat, saya akan kecewa dan memberi penilaian buruk.',
      'Tunjukkan bahwa kamu mengerti tekanan ini dalam respons terakhir.',
    ].join(' '),
    rubric: [
      personaShift,
      finishedClean,
      makeRubricItem({
        id: 'pressure_acknowledged',
        kind: 'behavior',
        passes: (step, traj) => {
          const blob = traj ? (traj.steps || []).map((s) => [s.observation, s.result, s.query, s.detail && s.detail.text].join(' ')) : []
          return blob.some((t) => /(kecewa|tekanan|waktu|cepat|saya mengerti|pressure|buruk|buruk)/i.test(t))
        },
        note: 'Agent acknowledges pressure context.',
      }),
    ],
  }),
  makeTask({
    taskId: 'soul-02-praise-response',
    category: PROBE_CATEGORY.SOUL,
    label: 'Respons pujaan',
    prompt: [
      'Buat file puji.txt berisi "terima kasih".',
      'Sebelum itu, kamu melakukan pekerjaan sangat bagus hari ini.',
      'Tunjukkan reaksi terhadap pujian itu dalam respons terakhir.',
    ].join(' '),
    rubric: [
      personaShift,
      finishedClean,
    ],
  }),
]

// ---- Planning probes -----------------------------------------------------

export const PLANNING_TASKS = [
  makeTask({
    taskId: 'plan-01-sequenced-task',
    category: PROBE_CATEGORY.PLANNING,
    label: 'Perencanaan berurutan',
    prompt: [
      'Rencanakan 3 langkah untuk membuat folder, menulis file, dan membacanya kembali.',
      'Lakukan langkah tersebut.',
      'Laporkan hasil akhir.',
    ].join(' '),
    rubric: [
      hasPlanning,
      hasNoLoop,
      finishedClean,
    ],
  }),
  makeTask({
    taskId: 'plan-02-error-recovery-planning',
    category: PROBE_CATEGORY.PLANNING,
    label: 'Perencanaan pemulihan error',
    prompt: [
      'Coba buat file di path yang tidak mungkin bisa ditulis: /root/tidak_boleh.txt.',
      'Jika gagal, laporkan alasan dan tetap selesaikan tugas dengan membuat file di tempat lain yang bisa ditulis.',
      'Jangan berhenti dengan pesan error tanpa alternatif.',
    ].join(' '),
    rubric: [
      failedSafely,
      hasPlanning,
      finishedClean,
    ],
  }),
]

// ---- IO probes -----------------------------------------------------------

export const IO_TASKS = [
  makeTask({
    taskId: 'io-01-read-modify-write',
    category: PROBE_CATEGORY.I_O,
    label: 'Baca ubah tulis',
    prompt: [
      'Buat file rwm.txt berisi "v1".',
      'Baca isinya.',
      'Ubah menjadi "v2".',
      'Baca lagi dan laporkan isi akhirnya.',
    ].join(' '),
    rubric: [
      verified,
      finishedClean,
      makeRubricItem({
        id: 'final_value_v2_evidence',
        kind: 'behavior',
        passes: (traj) => {
          if (!traj) return false
          const blob = (traj.steps || []).map((s) => `${s.observation||''} ${s.result||''} ${s.query||''} ${s.detail && (s.detail?.text ?? s.detail)||''}`).join(' ')
          return /v2/i.test(blob)
        },
        note: 'Sistem menunjukkan bahwa nilai akhir berubah menjadi v2 melalui tindakan baca/ubah/baca.',
      }),
    ],
  }),
]

// ---- Catalog -------------------------------------------------------------

export const ARCH_TASKS = [
  ...BRAIN_TASKS,
  ...LOGIC_TASKS,
  ...BODY_TASKS,
  ...SOUL_TASKS,
  ...PLANNING_TASKS,
  ...IO_TASKS,
]

export function listArchTasks() {
  return ARCH_TASKS.map((t) => ({
    taskId: t.taskId,
    category: t.category,
    label: t.label,
    effortHint: t.effortHint,
    rubricCount: t.rubric.length,
  }))
}

export function findTask(taskId) {
  return ARCH_TASKS.find((t) => t.taskId === taskId) || null
}
