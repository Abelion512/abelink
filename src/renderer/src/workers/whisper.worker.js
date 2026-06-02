import { pipeline, env } from '@xenova/transformers';

// Matikan fetching model dari file system lokal (akan mendownload dari HF Hub CDN)
env.allowLocalModels = false;

let transcriber = null;

self.onmessage = async (event) => {
  const { type, audio, id } = event.data;

  if (type === 'init') {
    try {
      // Menggunakan whisper-small untuk akurasi yang lebih baik (sekitar 400MB)
      transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
        progress_callback: (data) => {
          self.postMessage({ type: 'progress', data });
        },
      });
      self.postMessage({ type: 'ready' });
    } catch (e) {
      self.postMessage({ type: 'error', error: e.message });
    }
  }

  if (type === 'transcribe') {
    if (!transcriber) return;
    try {
      const output = await transcriber(audio, {
        language: 'indonesian',
        task: 'transcribe',
      });
      self.postMessage({ type: 'result', text: output.text, id });
    } catch (e) {
      self.postMessage({ type: 'error', error: e.message, id });
    }
  }
};
