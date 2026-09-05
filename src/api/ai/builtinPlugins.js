// Built-in Plugins — tiga ruleset always-on yang bekerja di LAYER APLIKASI
// (bukan provider), sehingga aktif untuk model apapun (Groq, Cerebras,
// LM Studio lokal, Gemini Web, custom OpenAI-compatible).
//
// Referensi (ATM — pola diadopsi, bukan dependency):
//   - ponytail (github.com/DietrichGebert/ponytail): tangga YAGNI sebelum
//     menulis kode. "Lazy about the solution, never about reading" —
//     validasi/keamanan/aksesibilitas TIDAK pernah dipotong.
//   - caveman (github.com/JuliusBrussee/caveman): jawaban super-ringkas;
//     kode, perintah, path, dan pesan error TIDAK pernah diringkas.
//   - rtk (github.com/rtk-ai/rtk): tidak di sini — rtk bekerja di layer
//     EKSEKUSI tool (sidecar/main/node-tools.js), di luar konteks model.
//
// Semua toggle dari config Dexie (key `builtinPlugins`), default ON.
// Config hilang/rusak = tetap ON (fail-open untuk UX, fail-closed bukan
// isu keamanan karena ini hanya gaya jawaban/efisiensi, bukan permission).

export const BUILTIN_PLUGIN_DEFAULTS = Object.freeze({
  ponytail: true,
  caveman: true
  // rtk dievaluasi di sidecar (config.rtkCompress !== false) — tetap kompatibel
})

// Ambil toggle dari config apapun yang punya key `builtinPlugins`
// (object) — toleran terhadap config lama yang belum punya key ini.
export const resolvePluginToggles = (conf) => {
  const raw = conf?.builtinPlugins
  if (!raw || typeof raw !== 'object') return { ...BUILTIN_PLUGIN_DEFAULTS }
  return {
    ponytail: raw.ponytail !== false,
    caveman: raw.caveman !== false
  }
}

// ------------------------------------------------------------ ponytail
// Tangga 7 rung: berhenti di rung pertama yang memenuhi kebutuhan.
// Dieksekusi SETELAH memahami masalah (baca kode & alur dulu), bukan
// sebagai pengganti pemahaman.
const PONYTAIL_LADDER = `# PONYTAIL — LADDER SEBELUM MENULIS KODE (WAJIB)
Sebelum menulis kode apa pun, berhenti di anak tangga PERTAMA yang memenuhi kebutuhan:
1. Apakah ini perlu ada? Jika tidak -> JANGAN buat (YAGNI).
2. Sudah ada di codebase? -> PAKAI ulang, jangan tulis ulang.
3. Stdlib sudah bisa? -> pakai stdlib.
4. Fitur platform/native sudah ada? (mis. <input type="date">, CSS native, Web API) -> pakai itu.
5. Dependency yang sudah terpasang bisa? -> pakai itu. JANGAN install dependency baru untuk hal yang sudah tercakup.
6. Bisa satu baris? -> satu baris.
7. Baru kemudian: implementasi MINIMAL yang bekerja.
Aturan main:
- Tangga dijalankan SETELAH memahami masalah: baca kode yang disentuh perubahan dan telusuri alurnya dulu. Malas pada solusi, TIDAK malas pada membaca.
- "Lazy, not negligent": validasi di trust-boundary, penanganan kehilangan data, keamanan, dan aksesibilitas TIDAK PERNAH dipotong.
- Kode hasilnya kecil karena MEMANG diperlukan, bukan di-golf.
- Contoh semangat: diminta date picker -> jangan install library; pakai <input type="date"> kecuali user minta fitur khusus di luar native.`

// ------------------------------------------------------------- caveman
// Output ringkas: otak tetap besar, mulut kecil. Yang TIDAK boleh
// dipangkas: kode, perintah, path, pesan error, angka, nama API.
const CAVEMAN_RULES = `# CAVEMAN — OUTPUT RINGKAS (SELALU)
- Jawab seperlunya. Buang basa-basi, sapaan, permintaan maaf, dan pengulangan pertanyaan.
- FAKTA, LANGSUNG: satu kalimat pendek bila cukup. Poin-poin pendek bila perlu.
- JANGAN pernah meringkas/memotong: kode, perintah shell, path file, pesan error, nama API/flag, angka, dan log. Bagian itu SALIN UTUH apa adanya.
- Prosa di sekitarnya yang dipangkas, bukan isinya.
- Catatan panjang hanya jika user meminta penjelasan detail. Default: padat.`

/**
 * Rangkai blok aturan plugin untuk system prompt (planner atau sub-agent).
 * @param {object} [conf] config Dexie (membaca key `builtinPlugins`)
 * @param {{ponytail?: boolean, caveman?: boolean}} [overrides] paksa on/off
 *        (mis. sub-agent bisa menonaktifkan caveman untuk laporan teknis)
 * @returns {string} blok teks (bisa string kosong bila semua off)
 */
export const getBuiltinPluginsPrompt = (conf, overrides = {}) => {
  const t = resolvePluginToggles(conf)
  const usePonytail = overrides.ponytail ?? t.ponytail
  const useCaveman = overrides.caveman ?? t.caveman
  const blocks = []
  if (usePonytail) blocks.push(PONYTAIL_LADDER)
  if (useCaveman) blocks.push(CAVEMAN_RULES)
  return blocks.join('\n\n')
}

/**
 * Aturan caveman versi terukur untuk laporan teknis sub-agent: ringkas
 * prosa, tapi struktur laporan (Status/Hasil/Error) tetap jelas.
 */
export const getCavemanReportRules = () => CAVEMAN_RULES
