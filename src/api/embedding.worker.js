import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true
env.useFSCache = false

let extractor = null
let isInitializing = false

async function getExtractor(progressCallback) {
  if (!extractor && !isInitializing) {
    isInitializing = true
    try {
      // Coba backend WASM normal; bila lingkungan tidak punya WebAssembly SIMD
      // (mis. WebKitGTK tertentu), turun ke jalur non-SIMD sebelum menyerah.
      try {
        extractor = await pipeline(
          'feature-extraction',
          'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
          {
            device: 'wasm',
            progress_callback: progressCallback
          }
        )
      } catch (err) {
        const isSimdIssue =
          /SIMD/i.test(err?.message || '') || /no available backend/i.test(err?.message || '')
        if (!isSimdIssue) throw err
        console.warn(
          '[EmbeddingWorker] WASM SIMD tidak tersedia, mencoba backend non-SIMD...'
        )
        env.backends.onnx.wasm.simd = false
        extractor = await pipeline(
          'feature-extraction',
          'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
          {
            device: 'wasm',
            progress_callback: progressCallback
          }
        )
      }
    } finally {
      isInitializing = false
    }
  }
  return extractor
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
