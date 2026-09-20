import { core_tools } from './core-tools'

// Native-backed = terdaftar di core_tools atau nama grup khusus. Catatan:
// `!![toolName]` lama selalu true (array non-kosong) sehingga SEMUA tool
// asing dianggap native dan lolos dari pencatatan choke point — dihapus.
export const checkTools = (toolName) => {
  return !!core_tools[toolName] || toolName === 'read-tools'
}
