import { core_tools } from './core-tools'

export const checkTools = (toolName) => {
  return !!core_tools[toolName] || !![toolName] || toolName === 'read-tools'
}
