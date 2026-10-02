// Global Window augmentation untuk konsumen yang TIDAK mengimpor
// src/api/tauri-bridge.ts (test .ts, modul node-zone yang menyentuh window).
//
// Latar W7: tests/ direname .mjs -> .ts dan kini dicek tsc (tsconfig.tests.json).
// Modul src yang mengakses `window.api` tanpa mengimpor tauri-bridge kehilangan
// augmentation yang sebelumnya "menular" lewat graf import test .mjs yang tidak
// dicek. Deklarasi ambient ini menjaga gate typecheck:tests tetap merah-hijau
// pada ISU nyata, bukan kegagalan augmentasi. Tipe method sengaja longgar
// (Record<string, any>) — kontrak tetap di `typeof api` pada tauri-bridge.ts.
//
// PENTING (TS2687): modifier tiap member HARUS identik dengan deklarasi di
// tauri-bridge.ts (interface merging), jadi `electron` TANPA `?` di sini.
// Konflik tipe `api` (Record<string,any> vs typeof api) tertelan oleh
// skipLibCheck karena deklarasi berikutnya ada di berkas .d.ts — jangan
// pindahkan deklarasi ini ke berkas .ts.
export {}

declare global {
  interface Window {
    api: Record<string, any>
    electron: unknown
  }
}
