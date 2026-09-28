// Deklarasi ambient untuk deps/modul tanpa .d.ts (cek 2026-09-28).
// Bentuk MINIMAL yang dipakai repo — bukan peta API penuh. Naikkan bila
// pemakaian baru butuh shape lain.
declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string, opts?: { readonly?: boolean; create?: boolean })
    query(sql: string): { get: (...params: unknown[]) => Record<string, unknown> | null; all: (...params: unknown[]) => Array<Record<string, unknown>>; run: (...params: unknown[]) => void }
    close(): void
  }
}
declare module 'mammoth' {
  const mammoth: {
    extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }>
  }
  export default mammoth
}

declare module 'msedge-tts' {
  export class MsEdgeTTS {
    setMetadata(voice: string, format: string): Promise<void>
    toFile(
      dir: string,
      text: string,
      opts: { rate: string; pitch: string }
    ): Promise<{ audioFilePath: string }>
  }
  export const OUTPUT_FORMAT: Record<string, string>
  const _default: { MsEdgeTTS?: typeof MsEdgeTTS; OUTPUT_FORMAT?: Record<string, string> }
  export default _default
}

declare module 'adm-zip' {
  export class AdmZipEntry {
    entryName: string
  }
  export class AdmZip {
    constructor(pathOrBuffer?: string | Buffer)
    getEntries(): AdmZipEntry[]
    extractAllTo(targetDir: string, overwrite: boolean): void
  }
  const _default: typeof AdmZip
  export default _default
}

declare module 'yt-search' {
  export type YtsVideo = {
    videoId: string
    title: string
    thumbnail: string
    duration: string
    author?: { name?: string }
  }
  export type YtsResult = { videos: YtsVideo[] }
  function yts(query: string): Promise<YtsResult>
  export default yts
}
