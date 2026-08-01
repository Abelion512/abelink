// Chunk @huggingface/transformers (23MB ort-wasm) — di-split keluar entry bundle.
// Satu-satunya static importer: vectorLoader.js. Jangan import file ini langsung.
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.useFSCache = false;

let extractor = null;
let isDownloading = false;
let vectorDisabled = false; // CSP block failover — skip vector ops permanently after first failure

// We export this so we can manually trigger download from config page
export const getExtractor = async (onProgress) => {
  if (vectorDisabled) return null;
  if (!extractor && !isDownloading) {
    isDownloading = true;
    try {
      extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
        device: 'wasm',
        progress_callback: onProgress
      });
    } catch (e) {
      console.error("Failed to load transformer model", e);
      vectorDisabled = true; // CSP block — skip forever
    } finally {
      isDownloading = false;
    }
  }
  return extractor;
};

export const generateVector = async (text) => {
  if (vectorDisabled) return null;
  try {
    const ext = await getExtractor();
    if (!ext) return null;
    const output = await ext(text, { pooling: 'mean', normalize: true, truncation: true, max_length: 512 });
    const result = Array.from(output.data);
    if (output.dispose) output.dispose();
    return result;
  } catch (error) {
    console.error("Gagal generate vector:", error);
    vectorDisabled = true;
    return null;
  }
}
