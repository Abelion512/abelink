import { pipeline, env } from '@xenova/transformers';

// Matikan fetching model dari file system lokal (akan mendownload dari HF Hub CDN)
env.allowLocalModels = false;

let transcriber = null;

self.onmessage = async (event) => {
  const { type, audio, id } = event.data;

  if (type === 'init') {
    try {
      // Kita gunakan model Xenova/whisper-tiny yang sangat cepat dan ringan (sekitar 75MB)
      // Bisa diganti ke whisper-small jika butuh akurasi lebih tinggi, tapi memakan waktu lebih lama
      transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
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
