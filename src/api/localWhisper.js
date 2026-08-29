let worker = null;
let isDownloading = false;
let isLoaded = false;
let loadPromise = null;

const requestResolvers = new Map();
let requestIdCounter = 0;

let globalOnProgress = null;

const initWorker = () => {
  if (worker) return
  // Lazy: Worker obj dibuat saat pertama kali loadWhisper() dipanggil.
  // Static import ?worker membuat Worker object saat module load — ini menghabiskan RAM
  // walau user tidak pernah pakai voice. Lazy creation: 0 RAM until first use.
  worker = new Worker(new URL('./whisperWorker.js', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    const { type, data, error, id, text } = e.data

    if (type === 'progress') {
      if (globalOnProgress) globalOnProgress(data)
    } else if (type === 'loaded') {
      isLoaded = true
      isDownloading = false
      if (loadPromise) loadPromise.resolve()
    } else if (type === 'error' && !id) {
      isDownloading = false
      if (loadPromise) loadPromise.reject(new Error(error))
    } else if (type === 'result') {
      if (requestResolvers.has(id)) {
        requestResolvers.get(id).resolve(text)
        requestResolvers.delete(id)
      }
    } else if (type === 'error' && id) {
      if (requestResolvers.has(id)) {
        requestResolvers.get(id).reject(new Error(error))
        requestResolvers.delete(id)
      }
    }
  }
}

export const loadWhisper = async (onProgress) => {
  globalOnProgress = onProgress;
  
  if (isLoaded) return true;
  
  if (isDownloading && loadPromise) {
    return loadPromise.promise;
  }
  
  initWorker();
  isDownloading = true;
  
  const promise = new Promise((resolve, reject) => {
    loadPromise = { resolve, reject };
  });
  loadPromise.promise = promise;
  
  worker.postMessage({ type: 'load' });
  
  return promise;
};

export const transcribeAudioLocal = async (pcmBuffer, onProgress) => {
  if (!isLoaded) {
    await loadWhisper(onProgress);
  }

  initWorker();

  const id = ++requestIdCounter;
  const promise = new Promise((resolve, reject) => {
    requestResolvers.set(id, { resolve, reject });
  });

  worker.postMessage(
    { type: 'transcribe', data: { id, pcmBuffer } },
    [pcmBuffer.buffer] // Transferable object for zero-copy
  );

  return promise;
};

// Memory pressure cleanup — terminate worker để hemat RAM
// Trigger via window 'mark:cleanup-heavy' event (dari App.jsx memoryPressure)
if (typeof window !== 'undefined') {
  window.addEventListener('mark:cleanup-heavy', () => {
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
