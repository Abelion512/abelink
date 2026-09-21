import { core_tools } from './core-tools'
import { UNIFIED_TOOL_CATALOG } from './toolCatalog'

// Native-backed = terdaftar di core_tools, UNIFIED_TOOL_CATALOG, atau nama grup khusus.
// Mencegah tool valid (mis. browser-click, browser-type) salah sasaran ke fallback Plugin Manager.
export const checkTools = (toolName) => {
  if (!toolName || typeof toolName !== 'string') return false
  return !!core_tools[toolName] || !!UNIFIED_TOOL_CATALOG[toolName] || toolName === 'read-tools'
}
