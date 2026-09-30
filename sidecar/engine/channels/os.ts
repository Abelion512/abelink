// Channel: OS automation namespace colon (Fase B6) — ALIAS ke implementasi
// dash yang sudah LIVE di NATIVE_TOOLS (node-tools.ts -> pc-agent.ts +
// primitif Linux). Satu sumber kebenaran, tanpa duplikasi handler.
//
// Sebelumnya stub `unsupported` sukses-semu; kini eksekusi nyata dan
// fail-fast (throw) bila gagal. Approval tetap di lapisan tool (needsApproval)
// + gate Rust untuk aksi destruktif.
//
// W1-2 (js-to-ts-spec.md): rename + tipe; semantik emergency-stop & alias
// tidak berubah.
import { on } from '../registry.ts'

// Lazy agar startup sidecar tetap instan (node-tools + pc-agent hanya
// di-load saat channel os:* pertama dipakai — pola sama seperti ai.mjs).
type NativeTool = { handler: (query: string) => Promise<{ success?: boolean; error?: string; data?: unknown }> }
type NativeTools = Record<string, NativeTool>
let ntPromise: Promise<NativeTools> | null = null
const getTools = (): Promise<NativeTools> =>
  (ntPromise ??= import('../../main/node-tools.ts').then(
    (m) => m.NATIVE_TOOLS as unknown as NativeTools
  ))

// os:X -> os-Y (os:ask-user -> os-ask)
const COLON_TO_DASH: Record<string, string> = {
  'os:read': 'os-read',
  'os:click': 'os-click',
  'os:type': 'os-type',
  'os:key': 'os-key',
  'os:scroll': 'os-scroll',
  'os:open': 'os-open',
  'os:list-windows': 'os-list-windows',
  'os:focus-window': 'os-focus-window',
  'os:ask-user': 'os-ask'
}

async function runDash(dash: string, query: unknown): Promise<unknown> {
  const tools = await getTools()
  const tool = tools[dash]
  if (!tool) throw new Error(`Tool tidak ditemukan: ${dash}`)
  const res = await tool.handler((query as string) ?? '')
  if (res && res.success === false) throw new Error(res.error || `Tool ${dash} gagal`)
  return res?.data ?? res
}

for (const [colon, dash] of Object.entries(COLON_TO_DASH)) {
  on(colon, async (query: unknown) => runDash(dash, query))
}
