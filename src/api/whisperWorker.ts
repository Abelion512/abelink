import { pipeline, env } from '@huggingface/transformers';

// ---- Kontrak tipe (W2-7a) ----
type Transcriber = (
  audio: unknown,
  opts: { language: string; task: string }
) => Promise<{ text: string }>

type ProgressCb = (p: unknown) => void

// cast onnx wasm flags: tipe library menyembunyikan properti runtime simd.
const onnxWasm = (env.backends as { onnx?: { wasm?: { simd?: boolean } } })?.onnx?.wasm

env.allowLocalModels = false;
env.useBrowserCache = true;
env.useFSCache = false;

// Intercept fetch to fix Vite SPA fallback bug where Transformers.js 
// incorrectly tries to fetch models locally and receives index.html
const originalFetch = env.fetch || fetch;
env.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
  let fetchUrl: RequestInfo | URL = typeof url === 'string' ? url : (url instanceof URL ? url.toString() : url);
  
  if (typeof fetchUrl === 'string' && (!fetchUrl.startsWith('http') || fetchUrl.includes('models/onnx-community'))) {
    const parts = fetchUrl.split('onnx-community/');
    if (parts.length > 1) {
      const modelAndFileName = parts[1];
      fetchUrl = `https://huggingface.co/onnx-community/${modelAndFileName.replace('resolve/main/', '')}`;
      if (!fetchUrl.includes('resolve/main/')) {
        const pathParts = modelAndFileName.split('/');
        const modelName = pathParts[0];
        const fileName = pathParts.slice(1).join('/');
        fetchUrl = `https://huggingface.co/onnx-community/${modelName}/resolve/main/${fileName}`;
      }
      console.log('[WhisperWorker] Rewrote local fetch to:', fetchUrl);
    }
  }

  const res = await originalFetch(fetchUrl as string, init);
  
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html') && typeof fetchUrl === 'string' && fetchUrl.includes('.json')) {
    throw new Error(`Gagal memuat model. Menerima HTML saat mengharapkan JSON dari: ${fetchUrl}`);
  }
  
  return res;
};

let transcriber: Transcriber | null = null;

const WHISPER_MODELS: Record<string, string> = {
  'whisper-tiny': 'onnx-community/whisper-tiny',
  'whisper-small': 'onnx-community/whisper-small'
};

async function createTranscriber(device: string, progress_callback: ProgressCb, modelId: string): Promise<Transcriber> {
  const model = WHISPER_MODELS[modelId] || WHISPER_MODELS['whisper-small'];
  return pipeline('automatic-speech-recognition', model, {
    device: device as 'webgpu' | 'wasm',
    dtype: 'fp32',
    progress_callback
  }) as unknown as Promise<Transcriber>;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data as { type?: string; data?: { id?: unknown; pcmBuffer?: unknown } };

  if (type === 'load') {
    const modelId = e.data?.model || 'whisper-small';
    if (!transcriber) {
      try {
        const hasWebGPU = typeof navigator !== 'undefined' && !!(navigator as Navigator & { gpu?: unknown }).gpu;
        const progress_callback: ProgressCb = (prog) => {
          self.postMessage({ type: 'progress', data: prog });
        };
        // Rantai fallback: webgpu -> wasm SIMD -> wasm non-SIMD.
        try {
          transcriber = await createTranscriber(hasWebGPU ? 'webgpu' : 'wasm', progress_callback, modelId);
        } catch (err) {
          const msg = (err as Error)?.message || String(err);
          if (hasWebGPU && !/SIMD|no available backend/i.test(msg)) throw err;
          if (/webgpu/i.test(msg)) {
            // WebGPU ada tapi gagal inisialisasi -> turun ke wasm biasa.
            transcriber = await createTranscriber('wasm', progress_callback, modelId);
          } else if (/SIMD|no available backend/i.test(msg)) {
            // Sekali info (bukan warn berulang): retry non-SIMD di bawah ini
            // yang menentukan; bila itu pun gagal, satu error ringkas saja.
            if (onnxWasm) onnxWasm.simd = false;
            transcriber = await createTranscriber('wasm', progress_callback, modelId);
          } else {
            throw err;
          }
        }
        self.postMessage({ type: 'loaded' });
      } catch (err) {
        // Satu baris ringkas; detail penuh ikut postMessage error ke main thread.
        console.warn('[WhisperWorker] Load gagal, whisper lokal nonaktif sesi ini:', (err as Error)?.message || err);
        if (err instanceof SyntaxError && err.message.includes('JSON')) {
          try {
            if (typeof caches !== 'undefined') {
              await caches.delete('transformers-cache');
              await caches.delete('experimental_transformers-hash-cache');
            }
          } catch {}
        }
        self.postMessage({ type: 'error', error: (err as Error).message || String(err) });
      }
    } else {
      self.postMessage({ type: 'loaded' });
    }
  } else if (type === 'transcribe') {
    try {
      if (!transcriber) throw new Error("Model belum di-load di Worker");
      const result = await transcriber(data!.pcmBuffer, {
        language: 'indonesian',
        task: 'transcribe'
      });
      self.postMessage({ type: 'result', id: data!.id, text: result.text });
    } catch (err) {
      console.error('[WhisperWorker] Transcribe error:', err);
      self.postMessage({ type: 'error', id: data?.id, error: (err as Error).message || String(err) });
    }
  }
};
