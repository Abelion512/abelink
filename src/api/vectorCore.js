// Chunk @huggingface/transformers (23MB ort-wasm) — di-split keluar entry bundle.
// Satu-satunya static importer: vectorLoader.js. Jangan import file ini langsung.
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true
env.useFSCache = false

// Deteksi dukungan WebAssembly SIMD sekali di module-level, sebelum pipeline
// pernah dipanggil. ONNX WASM backend membaca flag ini saat inisialisasi;
// mengubahnya setelah backend sudah ter-load tidak akan mengganti modul WASM
// yang sudah ter-cached, sehingga retry non-SIMD selalu gagal.
function isWasmSimdSupported() {
  try {
    const simdModule = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
      0x03, 0x02, 0x01, 0x00, 0x0a, 0x0e, 0x01, 0x0c, 0x01, 0x03, 0x00, 0x41, 0x00, 0xfd, 0x0c,
      0x00, 0xfd, 0x7d, 0x01, 0x0b
    ])
    return WebAssembly.validate(simdModule)
  } catch (_) {
    return false
  }
}

if (!isWasmSimdSupported()) {
  env.backends.onnx.wasm.simd = false
  env.backends.onnx.wasm.threads = false
}

let extractor = null
let isDownloading = false
let vectorDisabled = false // CSP block failover — skip vector ops permanently after first failure

// Main thread TIDAK PERNAH memuat model embedding (worker-only oleh desain).
// Lite Mode (hash embedding via vectorMemory) diaktifkan di boot sebelumnya:
// import vectorCore dari thread utama akan selalu memutar fallback ladder yang
// gagal dan menulis error merah was-simd/cpu di console. Lewati sejak awal.
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('mark:wasm-broken') === '1') {
    vectorDisabled = true
  }
} catch (_) {}

// We export this so we can manually trigger download from config page
export const getExtractor = async (onProgress) => {
  if (vectorDisabled) return null
  if (extractor) return extractor
  if (isDownloading) {
    // Tunggu download yang sedang berjalan dengan polling ringan
    while (isDownloading) {
      await new Promise((r) => setTimeout(r, 50))
    }
    return extractor
  }
  isDownloading = true
  try {
    // Fallback ladder REALISTIS: ort-wasm modern TIDAK lagi menyertakan binary
    // non-SIMD ("wasm-simd is not enabled" = modul scalar dihapus), dan device
    // "cpu" tidak ada di browser (transformers.js hanya punya "wasm"). Mencoba
    // keduanya hanya menghasilkan dua error merah tambahan yang pasti gagal.
    // Satu attempt: wasm dengan flag SIMD sesuai deteksi module-level.
    extractor = await pipeline(
      'feature-extraction',
      'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
      {
        device: 'wasm',
        progress_callback: onProgress
      }
    )
  } catch (e) {
    console.error('Failed to load transformer model', e)
    vectorDisabled = true
  } finally {
    isDownloading = false
  }
  return extractor
}

export const generateVector = async (text) => {
  if (vectorDisabled) return null
  try {
    const ext = await getExtractor()
    if (!ext) return null
    const output = await ext(text, {
      pooling: 'mean',
      normalize: true,
      truncation: true,
      max_length: 512
    })
    const result = Array.from(output.data)
    if (output.dispose) output.dispose()
    return result
  } catch (error) {
    console.error('Gagal generate vector:', error)
    vectorDisabled = true
    return null
  }
}
