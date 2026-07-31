// Tool dispatch map — single entry point for the agent loop
import { executeYoutubeTool } from './youtube'
import { executeMusicTool } from './music'
import { executeVisionTool } from './vision'
import { executeWaTool } from './wa'
import { executeNativeTool, isNativeTool } from './native'
import { executePcTool, isPcTool } from './pc'
import { executePluginTool } from './plugin'
import { executeMiscTool } from './misc'

// Returns { status: 'observation'|'value', value: string }
// - 'observation': result already fed into loopMessages (guard/approval rejections) — caller must NOT feed again
// - 'value': caller feeds observation into loopMessages
// Throws AbortError upward; converts other errors to '[ERROR] Tool ... crash: ...' string.
export async function dispatchTool(tool, query, ctx) {
  if (tool === 'yt-search' || tool === 'yt-summary') {
    return { status: 'value', value: await executeYoutubeTool({ ...ctx, tool, query }) }
  }
  if (tool.startsWith('music')) {
    return { status: 'value', value: await executeMusicTool({ ...ctx, tool, query }) }
  }
  if (tool === 'tool-info' || tool === 'memory-search' || tool === 'speak') {
    return { status: 'value', value: await executeMiscTool({ ...ctx, tool, query }) }
  }
  if (tool === 'analyze-screen' || tool === 'camera-look') {
    return { status: 'value', value: await executeVisionTool({ ...ctx, tool, query }) }
  }
  if (tool === 'wa-send' || tool === 'screenshot-to-wa') {
    return { status: 'value', value: await executeWaTool({ ...ctx, tool, query }) }
  }
  if (isNativeTool(tool)) {
    return executeNativeTool({ ...ctx, tool, query })
  }
  if (isPcTool(tool)) {
    return { status: 'value', value: await executePcTool({ ...ctx, tool, query }) }
  }
  return { status: 'value', value: await executePluginTool({ ...ctx, tool, query }) }
}
