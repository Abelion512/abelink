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
    // Modul WASM SIMD satu instruksi: (v128.const)
    // WebKitGTK di Linux sering mengembalikan validate(true) tapi gagal saat
    // kompilasi modul (CompileError: wasm-simd is not enabled).
    // Oleh karena itu, kita uji langsung dengan new WebAssembly.Module().
    const simdModule = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
      0x03, 0x02, 0x01, 0x00, 0x0a, 0x0e, 0x01, 0x0c, 0x01, 0x03, 0x00, 0x41, 0x00, 0xfd, 0x0c,
      0x00, 0xfd, 0x7d, 0x01, 0x0b
    ])
    new WebAssembly.Module(simdModule)
    return true
  } catch (_) {
    return false
  }
}

const simdSupported = isWasmSimdSupported()
if (!simdSupported) {
  env.backends.onnx.wasm.simd = false
  env.backends.onnx.wasm.threads = false
}

let extractor = null
let extractorPromise = null
// Cache kegagalan init supaya worker tidak retry berulang kali — cukup sekali
// beri tahu main thread untuk beralih ke Lite Mode (hash embedding).
let initFailed = false

/**
 * Init sekali dan DIJAMIN tunggal: semua pemanggil concurrent berbagi promise
 * yang sama. Tanpa ini, embed yang datang saat init berjalan mendapat null
 * dan melempar "Extractor not ready" (race lama yang membanjiri console boot).
 */
function getExtractor(progressCallback) {
  if (extractorPromise) return extractorPromise
  if (initFailed) return Promise.reject(new Error('Extractor init gagal — gunakan Lite Mode'))

  // ONNX runtime web di WebKitGTK Linux mewajibkan wasm SIMD. Jika SIMD tidak didukung,
  // memanggil pipeline() akan memicu unduhan 23MB dan crash Emscripten abort().
  // Langsung tolak ke Lite Mode tanpa membebani thread dan membanjiri konsol.
  if (!simdSupported) {
    initFailed = true
    return Promise.reject(new Error('WebAssembly SIMD tidak didukung — beralih ke Lite Mode'))
  }

  extractorPromise = (async () => {
    const attempts = [{ device: 'wasm', simd: true }]

    let lastErr = null
    const failures = []
    for (const attempt of attempts) {
      try {
        if (attempt.simd === false) {
          env.backends.onnx.wasm.simd = false
          env.backends.onnx.wasm.threads = false
        }
        extractor = await pipeline(
          'feature-extraction',
          'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
          {
            device: attempt.device,
            progress_callback: progressCallback
          }
        )
        if (attempt.device !== 'wasm' || attempt.simd === false) {
          console.info(
            `[EmbeddingWorker] Init sukses via fallback device=${attempt.device} simd=${attempt.simd} — embedding nyata aktif (tanpa downgrade hash).`
          )
        }
        return extractor
      } catch (err) {
        lastErr = err
        // Kumpulkan diam-diam; satu ringkasan di bawah (bukan warn per attempt).
        failures.push(`${attempt.device}/simd=${attempt.simd}: ${err?.message || err}`)
      }
    }
    const isSimdIssue =
      /SIMD/i.test(lastErr?.message || '') || /no available backend/i.test(lastErr?.message || '')
    if (isSimdIssue) {
      console.warn(
        '[EmbeddingWorker] Semua attempt WASM/CPU gagal — beralih ke Lite Mode (hash embedding). ' +
          `Rincian: ${failures.join(' | ')}`
      )
    }
    initFailed = true
    extractorPromise = null
    throw lastErr || new Error('Extractor init gagal pada semua device')
  })()
  return extractorPromise
}

self.onmessage = async (event) => {
  const { id, type, text, payload } = event.data || {}

  if (type === 'init') {
    try {
      await getExtractor((progress) => {
        self.postMessage({ type: 'progress', data: progress })
      })
      self.postMessage({ id, type: 'init_done', success: true })
    } catch (err) {
      self.postMessage({ id, type: 'init_done', success: false, error: err.message })
    }
  } else if (type === 'embed') {
    try {
      const ext = await getExtractor()
      if (!ext) {
        throw new Error('Extractor not ready')
      }
      const output = await ext(text, {
        pooling: 'mean',
        normalize: true,
        truncation: true,
        max_length: 512
      })
      const vector = Array.from(output.data)
      if (output.dispose) output.dispose()
      self.postMessage({ id, type: 'embed_done', success: true, vector })
    } catch (err) {
      self.postMessage({ id, type: 'embed_done', success: false, error: err.message })
    }
  } else if (type === 'embed_batch') {
    try {
      const ext = await getExtractor()
      if (!ext) {
        throw new Error('Extractor not ready')
      }
      const results = []
      const items = Array.isArray(payload) ? payload : []

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const output = await ext(item.text, {
          pooling: 'mean',
          normalize: true,
          truncation: true,
          max_length: 512
        })
        const vector = Array.from(output.data)
        if (output.dispose) output.dispose()
        results.push({ id: item.id, vector })

        self.postMessage({
          type: 'batch_item_progress',
          batchId: id,
          current: i + 1,
          total: items.length,
          item: { id: item.id, vector }
        })
      }

      self.postMessage({ id, type: 'embed_batch_done', success: true, results })
    } catch (err) {
      self.postMessage({ id, type: 'embed_batch_done', success: false, error: err.message })
    }
  }
}
