import { bulkInsertDocuments, deleteDocumentByName, getAllDocuments } from './db'
import { insertDocumentChunksToOrama, deleteDocumentFromOrama } from './oramaStore'
// ponytail: generateStorableVector (bukan generateVector) — Lite Mode return
// null agar hash embedding tak mengotori korpus; chunk tanpa vektor tetap
// disimpan fulltext-only (vectorModel 'none'), bukan di-drop.

// ---- Kontrak tipe (W2-7b) ----
interface IngestFile {
  name: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
  text: () => Promise<string>
}

type ProgressCb = (pct: number) => void

interface DocumentRecord {
  docName: string
  chunkIndex: number
  content: string
  timestamp: number
  vectorModel: string
  vector?: number[]
  [key: string]: unknown
}

function splitTextIntoChunks(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    start += chunkSize - overlap
  }
  return chunks
}

export async function ingestDocument(
  file: IngestFile,
  onProgress?: ProgressCb
): Promise<{ fileName: string; totalChunks: number; totalCharacters: number; storableCount: number; degraded: boolean }> {
  // 0. Validasi ukuran (Max 50MB)
  const MAX_SIZE = 50 * 1024 * 1024
  if (file.size > MAX_SIZE) {
    throw new Error('Ukuran file terlalu besar. Maksimal 50MB.')
  }

  // 0.5. Handling duplikat
  const existingDocs = await getAllDocuments()
  const isDuplicate = (existingDocs as Array<{ docName?: string }>).some(d => d.docName === file.name)
  
  if (isDuplicate) {
    // Hapus dokumen lama dulu
    await deleteDocumentByName(file.name)
    await deleteDocumentFromOrama(file.name)
  }

  // 1. Ekstrak teks
  let rawText = ''
  
  if (file.name.endsWith('.pdf')) {
    const buf = await file.arrayBuffer()
    rawText = await (window as unknown as { api: { parseDocument: (b: ArrayBuffer, isDocx: boolean) => Promise<string> } }).api.parseDocument(buf, false)
  } else if (file.name.endsWith('.docx')) {
    const buf = await file.arrayBuffer()
    rawText = await (window as unknown as { api: { parseDocument: (b: ArrayBuffer, isDocx: boolean) => Promise<string> } }).api.parseDocument(buf, true)
  } else {
    rawText = await file.text()
  }

  if (!rawText || !rawText.trim()) {
    throw new Error('Dokumen kosong atau tidak terbaca.')
  }

  // 2. Chunking
  const chunks = splitTextIntoChunks(rawText, 500, 50)

  // 3. Embed + Simpan (Dexie & Orama). Lazy import agar bundle transformers
  // tetap ter-split (vectorMemory, bukan vectorLoader langsung).
  const { generateStorableVector, getVectorModel } = await import('./vectorMemory')
  const vectorModel = getVectorModel()
  const dexieRecords: DocumentRecord[] = []
  let storableCount = 0

  for (let i = 0; i < chunks.length; i++) {
    const vector = await generateStorableVector(chunks[i])

    const record: DocumentRecord = {
      docName: file.name,
      chunkIndex: i,
      content: chunks[i],
      timestamp: Date.now(),
      vectorModel: vector ? vectorModel : 'none'
    }
    if (vector) {
      record.vector = vector as number[]
      storableCount++
    }
    dexieRecords.push(record)

    if (onProgress) {
      onProgress(Math.round(((i + 1) / chunks.length) * 100))
    }
  }

  if (dexieRecords.length === 0) {
    throw new Error('Gagal mengekstrak vektor dari dokumen.')
  }

  // Bulk insert ke Dexie
  const ids = (await bulkInsertDocuments(dexieRecords)) as number[]

  // Bulk insert ke Orama (dengan dexieId; baris 'none' tersimpan fulltext saja)
  const oramaData = dexieRecords.map((r, i) => ({ ...r, dexieId: ids[i] }))
  await insertDocumentChunksToOrama(oramaData)

  return { fileName: file.name, totalChunks: chunks.length, totalCharacters: rawText.length, storableCount, degraded: storableCount === 0 }
}
