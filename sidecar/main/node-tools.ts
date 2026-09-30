// NATIVE_TOOLS registry — INDEX tipis (Fase F4/M3).
// Definisi tool hidup per-domain di main/tools/* (fs/shell/browser/os/google/
// comms); helper bersama di main/tools/_shared.ts. Tambah tool baru =
// tambah entri di modul domainnya, tanpa menyentuh file ini (kecuali merge di
// bawah bila domain baru). Pola seam ala deepseek-harness: definisi +
// provider + konsumen terpisah; NATIVE_TOOLS hanya komposisi.
import { fsTools } from './tools/fsTools.ts'
import { shellTools } from './tools/shellTools.ts'
import { browserTools } from './tools/browserTools.ts'
import { osTools } from './tools/osTools.ts'
import { googleTools } from './tools/googleTools.ts'
import { commsTools } from './tools/commsTools.ts'

export const NATIVE_TOOLS: Record<string, any> = {
  ...fsTools,
  ...shellTools,
  ...browserTools,
  ...osTools,
  ...googleTools,
  ...commsTools
}

// Alias kompatibilitas: nama Windows warisan upstream -> run-shell (bash Linux).
// Model lama kadang masih menyebut run-powershell; jangan biarkan tool hilang.
NATIVE_TOOLS['run-powershell'] = NATIVE_TOOLS['run-shell']
// run-bash: nama kanonik untuk Linux (Debian/Ubuntu); alias lama di atas hanya
// untuk kompatibilitas perintah warisan upstream.
NATIVE_TOOLS['run-bash'] = NATIVE_TOOLS['run-shell']

export const getNativeToolsDefinition = () => NATIVE_TOOLS

// Re-ekspor helper yang dipakai konsumen luar (tes + tool lain).
export {
  isDangerousKeyCombo,
  isDangerousCommand,
  isHardlineCommand,
  classifyCommand,
  hasSensitiveWriteTarget,
  SENSITIVE_TARGET_MARKERS
} from './tools/_shared.ts'
