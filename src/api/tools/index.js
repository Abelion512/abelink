import { core_tools } from './core-tools'
import { GROUP_TOOLS_DEFINITION } from './group-tools'

const groupToolsMap = {}
for (const group of Object.values(GROUP_TOOLS_DEFINITION || {})) {
  if (group && typeof group.tools === 'object') {
    for (const toolName of Object.keys(group.tools)) {
      groupToolsMap[toolName] = true
    }
  }
}

// Native-backed = terdaftar di core_tools, GROUP_TOOLS_DEFINITION, atau nama grup khusus.
export const checkTools = (toolName) => {
  return !!core_tools[toolName] || !!groupToolsMap[toolName] || toolName === 'read-tools'
}

