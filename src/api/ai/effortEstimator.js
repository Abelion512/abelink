// Effort estimator — otomatis menaikkan effort (low/medium/high) berdasarkan
// kompleksitas tugas, dengan keputusan yang TRANSPARAN (skor + alasan bisa
// di-log/eval), sesuai prinsip owner: automation tetap transparan dan
// input/proses/output bisa dievaluasi.
//
// Pola vendor 2026 (Fable 5.1, GPT-6 Astra, Gemini 3.8): effort adalah dail
// biaya-vs-kualitas. User tidak harus menebak — sistem menaikkan effort hanya
// saat kompleksitas membutuhkan, menjaga biaya marginal tetap rendah.
//
// Sengaja DETERMINISTIK dan murah (regex + heuristik bobot, tanpa LLM call):
// dipanggil di setiap turn planner, jadi harus O(panjang teks) tanpa network.

// Sinyal kompleksitas (bobot kasar, kalibrasi manual — bisa di-evolve via test)
const SIGNALS = [
  // Delegasi multi-agent = pekerjaan panjang, hasil harus koheren
  { re: /\bspawn_subagent\b/i, w: 3, why: 'delegasi sub-agent' },
  // Multi-langkah eksplisit
  {
    re: /\b(lalu|kemudian|setelah itu|lalu|then|step by step|bertahap|multi-step)\b/i,
    w: 1.5,
    why: ' instruksi multi-langkah'
  },
  // Pekerjaan berat yang dikenal mahal
  {
    re: /\b(migrasi|refactor menyeluruh|audit|investigasi mendalam|deep research|riset komprehensif|benchmark|implementasi|arsitektur)\b/i,
    w: 2,
    why: 'tugas berat'
  },
  // Kode & file
  {
    re: /\b(buatkan aplikasi|build|game|plot|dashboard|fitur|modul)\b/i,
    w: 1.5,
    why: 'pembuatan artefak'
  },
  // Analisis data/keuangan (mis. trading)
  {
    re: /\b(analisis|bandingkan|evaluasi|optimasi|prediksi|analisa)\b.*\b(data|harga|market|saham|crypto|token|portfolio)\b/i,
    w: 2,
    why: 'analisis data'
  },
  // Research multi-sumber
  {
    re: /\b(cari|riset|research|telusuri)\b.*\b(di internet|terbaru|2026|beberapa sumber|sumber)\b/i,
    w: 2,
    why: 'riset web multi-sumber'
  }
  // Panjang prompt = kompleksitas alami
]

const LENGTH_THRESHOLD = 320 // chars di atas ini mulai nambah skor
const LENGTH_SCORE_PER_400 = 0.5 // tiap 400 chars ekstra = +0.5 (maks +2)

export function estimateEffort(text = '') {
  const s = String(text || '')
  let score = 0
  const reasons = []
  for (const { re, w, why } of SIGNALS) {
    if (re.test(s)) {
      score += w
      reasons.push(why)
    }
  }
  const extra = Math.max(0, s.length - LENGTH_THRESHOLD)
  if (extra > 0) {
    const lenScore = Math.min(2, Math.floor(extra / 400) * LENGTH_SCORE_PER_400)
    score += lenScore
    if (lenScore > 0) reasons.push('prompt panjang')
  }

  // Threshold: >=3 high, >=1.5 medium, else low
  let effort = 'low'
  if (score >= 3) effort = 'high'
  else if (score >= 1.5) effort = 'medium'

  return {
    effort,
    score: +score.toFixed(1),
    reasons: [...new Set(reasons)],
    transparent: `effort=${effort} (skor ${score.toFixed(1)}: ${[...new Set(reasons)].join(', ') || 'sinyal minim'})`
  }
}

// Terapkan hasil estimasi ke conf — TIDAK menimpa pilihan eksplisit user.
// 'auto' = satu-satunya mode yang boleh menaikkan effort otomatis.
export function resolveEffortLevel(conf, taskText = '') {
  const configured = conf?.effortLevel || 'low'
  if (configured !== 'auto') {
    return { effort: configured, auto: false, transparent: `effort=${configured} (dipilih user)` }
  }
  const est = estimateEffort(taskText)
  return { effort: est.effort, auto: true, transparent: `[auto] ${est.transparent}` }
}
