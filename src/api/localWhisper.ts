// ---- Kontrak tipe (W2-8a) ----
type WhisperProgress = (p: unknown) => void;

type LoadDeferred = {
  resolve: () => void;
  reject: (e: Error) => void;
  promise?: Promise<boolean>;
};

let worker: Worker | null = null;
let isDownloading = false;
let isLoaded = false;
let loadPromise: LoadDeferred | null = null;
// Gagal load sekali = jangan coba lagi sesi ini (fail-fast). Mencegah error
// merah berulang tiap toggle mic; fallback Groq/manual yang mengambil alih.
let loadFailed = false;

const requestResolvers = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>();
let requestIdCounter = 0;

let globalOnProgress: WhisperProgress | null = null;

const initWorker = () => {
  if (worker) return
  // Lazy: Worker obj dibuat saat pertama kali loadWhisper() dipanggil.
  // Static import ?worker membuat Worker object saat module load — ini menghabiskan RAM
  // walau user tidak pernah pakai voice. Lazy creation: 0 RAM until first use.
  worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent) => {
    const { type, data, error, id, text } = e.data as {
      type?: string; data?: unknown; error?: string; id?: number; text?: string
    }

    if (type === 'progress') {
      if (globalOnProgress) globalOnProgress(data)
    } else if (type === 'loaded') {
      isLoaded = true
      isDownloading = false
      if (loadPromise) loadPromise.resolve()
    } else if (type === 'error' && !id) {
      isDownloading = false
      loadFailed = true
      if (loadPromise) loadPromise.reject(new Error(error))
    } else if (type === 'result' && id !== undefined) {
      if (requestResolvers.has(id)) {
        requestResolvers.get(id)!.resolve(text as string)
        requestResolvers.delete(id)
      }
    } else if (type === 'error' && id !== undefined) {
      if (requestResolvers.has(id)) {
        requestResolvers.get(id)!.reject(new Error(error))
        requestResolvers.delete(id)
      }
    }
  }
}

export const loadWhisper = async (onProgress?: WhisperProgress, modelId?: string): Promise<boolean> => {
  globalOnProgress = onProgress ?? null;

  if (isLoaded) return true;
  if (loadFailed) throw new Error('Whisper lokal nonaktif sesi ini (gagal load sebelumnya).');
  
  if (isDownloading && loadPromise) {
    return loadPromise.promise as Promise<boolean>;
  }
  
  initWorker();
  isDownloading = true;
  
  const promise = new Promise<boolean>((resolve, reject) => {
    loadPromise = { resolve: () => resolve(true), reject };
  });
  loadPromise!.promise = promise;
  
  worker!.postMessage({ type: 'load', model: modelId || 'whisper-small' });
  
  return promise;
};

export const transcribeAudioLocal = async (pcmBuffer: ArrayBuffer, onProgress?: WhisperProgress): Promise<string> => {
  if (!isLoaded) {
    await loadWhisper(onProgress);
  }

  initWorker();

  const id = ++requestIdCounter;
  const promise = new Promise<string>((resolve, reject) => {
    requestResolvers.set(id, { resolve, reject });
  });

  worker!.postMessage(
    { type: 'transcribe', data: { id, pcmBuffer } },
    [pcmBuffer] // Transferable object for zero-copy
  );

  return promise;
};

// Memory pressure cleanup — terminate worker để hemat RAM
// Trigger via window 'abelink:cleanup-heavy' event (dari App.jsx memoryPressure)
if (typeof window !== 'undefined') {
  window.addEventListener('abelink:cleanup-heavy', () => {
    if (worker) {
      worker.terminate()
      worker = null
      isLoaded = false
      isDownloading = false
      loadPromise = null
      console.log('[Whisper] Worker terminated (memory pressure)')
    }
  })
}
