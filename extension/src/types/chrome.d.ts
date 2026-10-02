// Ambient subset API chrome untuk source extension (W8).
//
// Kenapa tidak @types/chrome: repo ini sengaja tidak menambah dependensi hanya
// untuk typing, dan permukaan yang dipakai service worker + popup kita kecil
// serta stabil. Deklarasi di bawah mencakup persis API yang dipanggil di
// `extension/src/**`; kalau dipanggil API baru, tsc akan protes dengan pesan
// "Property does not exist on type" — itu memang yang kita mau (kegagalan
// ketahuan saat typecheck, bukan saat runtime di Chrome).
//
// CATATAN KONTRAK: ini tipe untuk SUMBER. Artifact yang dimuat Chrome adalah
// hasil `bun run build:extension` (bundle IIFE untuk service worker klasik).
// Semua member di sini opsional kecuali yang ditandai, supaya TS tidak memaksa
// narrowing yang tidak perlu di kode warisan.
//
// PENTING: berkas ini TIDAK boleh punya `import`/`export` di level atas —
// sekali punya, TypeScript memperlakukannya sebagai module dan `declare const
// chrome` jadi scope module (bukan global), sehingga `chrome` jadi "Cannot find
// name" di seluruh `extension/src/**`. Kalau nanti butuh import, bungkus
// seluruh isi dalam `declare global { ... }`.

interface ChromeEvent<T extends (...args: any[]) => any> {
  addListener(cb: T): void
  removeListener(cb: T): void
  hasListener?(cb: T): boolean
}

interface ChromeStorageArea {
  get(keys: string | string[] | Record<string, any> | null): Promise<Record<string, any>>
  set(items: Record<string, any>): Promise<void>
  remove(keys: string | string[]): Promise<void>
  clear(): Promise<void>
}

interface ChromeStorage {
  local: ChromeStorageArea
  // WAJIB (bukan opsional): manifest.json mendeklarasikan permission "storage",
  // dan seluruh state pairing/token bridge di `background.ts` memakai
  // `chrome.storage.session`. Menandainya opsional hanya menghasilkan 28 error
  // `possibly undefined` yang tidak mencerminkan kenyataan runtime.
  session: ChromeStorageArea
  sync?: ChromeStorageArea
}

interface ChromeTab {
  id?: number
  index?: number
  windowId?: number
  groupId?: number
  url?: string
  pendingUrl?: string
  title?: string
  active?: boolean
  status?: string
  [key: string]: any
}

interface ChromeTabsApi {
  query(info: Record<string, any>): Promise<ChromeTab[]>
  get(tabId: number): Promise<ChromeTab>
  update(tabId: number | number[], props: Record<string, any>): Promise<ChromeTab>
  create(props: Record<string, any>): Promise<ChromeTab>
  remove(tabIds: number | number[]): Promise<void>
  sendMessage(tabId: number, message: any): Promise<any>
  reload(tabId?: number): Promise<void>
  goBack(tabId?: number): Promise<void>
  goForward(tabId?: number): Promise<void>
  captureVisibleTab(windowId?: number, opts?: Record<string, any>): Promise<string>
  group(opts: Record<string, any>): Promise<number>
  onUpdated: ChromeEvent<(tabId: number, changeInfo: Record<string, any>, tab: ChromeTab) => void>
  onRemoved: ChromeEvent<(tabId: number, info: Record<string, any>) => void>
  onCreated: ChromeEvent<(tab: ChromeTab) => void>
}

interface ChromeAlarmsApi {
  create(name: string, info: Record<string, any>): void
  clear(name: string): Promise<boolean>
  get(name: string): Promise<Record<string, any> | undefined>
  onAlarm: ChromeEvent<(alarm: Record<string, any>) => void>
}

interface ChromeScriptingApi {
  executeScript(injection: Record<string, any>): Promise<any[]>
  insertCSS?(injection: Record<string, any>): Promise<void>
  removeCSS?(injection: Record<string, any>): Promise<void>
}

interface ChromeTabGroupsApi {
  TAB_GROUP_ID_NONE: number
  update(groupId: number, props: Record<string, any>): Promise<Record<string, any>>
  get(groupId: number): Promise<Record<string, any>>
  query(info: Record<string, any>): Promise<Record<string, any>[]>
  onUpdated: ChromeEvent<(groupId: number, changeInfo: Record<string, any>, group: Record<string, any>) => void>
  onRemoved: ChromeEvent<(groupId: number) => void>
}

interface ChromeRuntimeApi {
  id: string
  lastError?: { message?: string }
  getURL(path: string): string
  getManifest(): Record<string, any>
  sendMessage(message: any, callback?: (response: any) => void): Promise<any>
  sendNativeMessage(hostName: string, message: any): Promise<any>
  connect?(info?: Record<string, any>): any
  onMessage: ChromeEvent<
    (
      message: any,
      sender: Record<string, any>,
      sendResponse: (response?: any) => void
    ) => boolean | void | Promise<any>
  >
  onInstalled: ChromeEvent<(details: Record<string, any>) => void>
  onStartup: ChromeEvent<() => void>
  onConnect?: ChromeEvent<(port: any) => void>
}

interface ChromeWindowsApi {
  create(props: Record<string, any>): Promise<Record<string, any>>
  update(windowId: number, props: Record<string, any>): Promise<Record<string, any>>
  getCurrent(): Promise<Record<string, any>>
  onFocusChanged?: ChromeEvent<(windowId: number) => void>
}

interface ChromeActionApi {
  setBadgeText?(details: Record<string, any>): Promise<void>
  setBadgeBackgroundColor?(details: Record<string, any>): Promise<void>
  onClicked?: ChromeEvent<(tab: ChromeTab) => void>
}

declare const chrome: {
  runtime: ChromeRuntimeApi
  tabs: ChromeTabsApi
  alarms: ChromeAlarmsApi
  scripting: ChromeScriptingApi
  storage: ChromeStorage
  // WAJIB (bukan opsional): permission "tabGroups" ada di manifest.json dan
  // `background.ts` memakai chrome.tabGroups tanpa guard. Sama untuk
  // chrome.windows (dipakai untuk fokus tab sesi).
  tabGroups: ChromeTabGroupsApi
  windows: ChromeWindowsApi
  action?: ChromeActionApi
  i18n?: {
    getMessage(key: string, substitutions?: any): string
  }
}
