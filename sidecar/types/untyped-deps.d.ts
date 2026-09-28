// Deklarasi ambient untuk deps tanpa .d.ts (cek package.json 2026-09-28).
// Bentuk MINIMAL yang dipakai repo — bukan peta API penuh. Naikkan bila
// pemakaian baru butuh shape lain.
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
