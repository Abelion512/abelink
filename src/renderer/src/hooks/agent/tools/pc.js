// Tool: os-* / pc-* — Linux desktop automation
export function isPcTool(tool) {
  return tool.startsWith('os-') || tool.startsWith('pc-')
}

export async function executePcTool(ctx) {
  const { tool, query } = ctx
  let pcResult = null
  try {
    switch (tool) {
      case 'os-read':
      case 'pc-control-read':
        pcResult = await window.api.osRead(); break
      case 'os-click':
      case 'pc-control-click':
        pcResult = await window.api.osClick(query); break
      case 'os-type':
      case 'pc-control-type':
        pcResult = await window.api.osType(query); break
      case 'os-key':
      case 'pc-control-key':
        pcResult = await window.api.osKey(query); break
      case 'os-scroll':
      case 'pc-control-scroll':
        pcResult = await window.api.osScroll(query); break
      case 'os-open':
      case 'pc-control-open':
        pcResult = await window.api.osOpen(query); break
      case 'os-list-windows':
      case 'pc-control-list-windows':
        pcResult = await window.api.osListWindows(); break
      case 'os-focus-window':
      case 'pc-control-focus-window':
        pcResult = await window.api.osFocusWindow(query); break
      case 'os-screenshot':
      case 'pc-screenshot':
        pcResult = await window.api.osScreenshot(); break
      case 'os-ask-user':
      case 'os-ask':
      case 'pc-control-ask':
        pcResult = await window.api.osAskUser(query); break
      case 'os-emergency-stop':
        pcResult = await window.api.osEmergencyStop(); break
      default:
        pcResult = { error: `Unknown PC tool: ${tool}` }
    }
  } catch (e) {
    pcResult = { error: e.message }
  }
  return typeof pcResult === 'string' ? pcResult : JSON.stringify(pcResult)
}
