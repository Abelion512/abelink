// Bentuk MINIMAL Bun global yang dipakai serve.ts — bukan peta API penuh.
// Tanpa dep baru (bun-types dilarang constraint plan); naikkan bila pemakaian bertambah.
// DEBT: pola ambient-minimal — wajib perpanjang deklarasi ini setiap pemakaian Bun baru.
declare const Bun: {
  serve(opts: {
    hostname: string
    port: number
    fetch(req: Request): Promise<Response> | Response
  }): { port: number; stop(): void }
  connect(opts: { hostname: string; port: number }): Promise<{ close(): void }>
  spawn(cmd: string[], opts?: Record<string, string>): unknown
}
