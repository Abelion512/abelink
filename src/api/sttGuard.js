// sttGuard.js — pure anti-halusinasi VAD/STT (tanpa I/O, unit-testable).
//
// Standar: OpenAI Whisper (no_speech_threshold, compression_ratio_threshold,
// logprob_threshold, condition_on_previous_text=false) + faster-whisper VAD
// (min_speech_duration, min_silence_duration) + OpenAI verbose_json metrics
// (no_speech_prob, avg_logprob, compression_ratio).

// Model STT default: routing 9router namespaced ke Groq turbo.
// Placeholder lama 'selfhosted-stt/whisper-1' tidak ada di sisi server —
// hanya ditulis ulang oleh migrasi v28 bila nilainya persis placeholder
// (pilihan manual user tak tersentuh).
export const DEFAULT_STT_MODEL = 'groq/whisper-large-v3-turbo'
export const PLACEHOLDER_STT_MODELS = ['selfhosted-stt/whisper-1']

// Ambang batas verbose_json (lihat OpenAI API ref: avg_logprob <-1.5 gagal,
// compression_ratio >2.4 gagal; faster-whisper default no_speech 0.6).
export const NO_SPEECH_PROB_DROP = 0.6
export const AVG_LOGPROB_DROP = -1.5
export const COMPRESSION_RATIO_DROP = 2.4

// Gate pra-STT: energi puncak minimum + rasio frame vokal + durasi vokal.
// RMS_THRESHOLD VAD (0.003) sengaja sensitif agar suku kata awal tak terpotong;
// SPEECH_RATIO_MIN 0.15 mengantisipasi window trailing silence (8 frame ~2 detik).
export const PEAK_RMS_MIN = 0.008
export const SPEECH_RATIO_MIN = 0.15
export const VOCAL_SEC_MIN = 0.35

// Kecepatan wicara manusia wajar <40 char/detik; di atas itu = halusinasi
// Whisper pada noise/sunyi (kasus nyata: 4.096s -> 400+ char intro asisten).
export const CPS_DROP = 40

// Denylist halusinasi Whisper umum (id/en/zh + template subtitle).
const HALLUCINATION_PATTERNS = [
  /saya adalah asisten/i,
  /asisten (virtual|ai|linux)/i,
  /dilatih oleh google/i,
  /terima kasih (telah |sudah )?(menonton|menyaksikan)/i,
  /thank (you|u) for watching/i,
  /thanks for watching/i,
  /jangan lupa (like|subscribe)/i,
  /subscribe (dan|and)/i,
  /amara\.org/i,
  /subtitle(d|d by)?/i,
  /\[musik\]/i,
  /\[music\]/i,
  /\[tepuk tangan\]/i,
  /\[applause\]/i,
  /谢谢(观看|大家)/,
  /请订阅/,
]

/**
 * Gate pra-STT atas buffer tervalidasi.
 * stats: { peakRms, speechFrames, totalFrames, durationSec }
 * return { ok: true } atau { ok: false, reason }.
 */
export function isSpeechValid({ peakRms = 0, speechFrames = 0, totalFrames = 0, durationSec = 0 } = {}) {
  if (durationSec < VOCAL_SEC_MIN) {
    return { ok: false, reason: `durasi vokal ${durationSec.toFixed(2)}s < ${VOCAL_SEC_MIN}s` }
  }
  if (peakRms < PEAK_RMS_MIN) {
    return { ok: false, reason: `peak RMS ${peakRms.toFixed(4)} < ${PEAK_RMS_MIN}` }
  }
  const ratio = totalFrames > 0 ? speechFrames / totalFrames : 0
  if (ratio < SPEECH_RATIO_MIN) {
    return { ok: false, reason: `rasio speech-frame ${ratio.toFixed(2)} < ${SPEECH_RATIO_MIN}` }
  }
  return { ok: true }
}

/**
 * Filter pasca-STT atas teks polos (fallback saat endpoint tak kembalikan segmen).
 * return { drop: true, reason } atau { drop: false }.
 */
export function isHallucinationText(text, durationSec = 0) {
  const t = String(text || '').trim()
  if (!t) return { drop: true, reason: 'teks kosong' }
  if (t.length <= 1) return { drop: true, reason: 'teks 1 char' }
  for (const re of HALLUCINATION_PATTERNS) {
    if (re.test(t)) return { drop: true, reason: `denylist: ${re.source.slice(0, 40)}` }
  }
  if (durationSec > 0) {
    const cps = t.length / durationSec
    if (cps > CPS_DROP) {
      return { drop: true, reason: `cps ${cps.toFixed(1)} > ${CPS_DROP} (${t.length} char / ${durationSec.toFixed(2)}s)` }
    }
  }
  return { drop: false }
}

/**
 * Filter segmen verbose_json: buang segmen sunyi / tak percaya diri / repetitif,
 * gabung sisanya. return string ('' bila semua segmen dibuang).
 */
export function filterSegments(segments) {
  if (!Array.isArray(segments)) return null
  const kept = []
  for (const s of segments) {
    if (!s || typeof s.text !== 'string' || !s.text.trim()) continue
    if (typeof s.no_speech_prob === 'number' && s.no_speech_prob > NO_SPEECH_PROB_DROP) continue
    if (typeof s.avg_logprob === 'number' && s.avg_logprob < AVG_LOGPROB_DROP) continue
    if (typeof s.compression_ratio === 'number' && s.compression_ratio > COMPRESSION_RATIO_DROP) continue
    kept.push(s.text.trim())
  }
  return kept.join(' ').trim()
}
