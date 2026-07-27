/**
 * MARK Agent Tool Registry v2
 * 
 * Defines tools the agent can call, similar to Hermes agent tools.
 * Each tool has: name, description, parameters (JSON Schema), handler.
 */

// ============================================================
// Built-in Tools
// ============================================================

const builtInTools = [
  {
    name: 'web-search',
    description: 'Search the web. Returns title, URL, and snippet for each result.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'number', description: 'Max results (1-15)', default: 5 }
      },
      required: ['query']
    },
    handler: async ({ query, max_results = 5 }, ctx) => {
      try {
        const results = await ctx.api.webSearch(query, max_results)
        return JSON.stringify(results.slice(0, max_results))
      } catch (e) {
        return `web-search failed: ${e.message}`
      }
    }
  },
  {
    name: 'web-extract',
    description: 'Extract readable content from a URL. Returns markdown text.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to extract' },
        max_chars: { type: 'number', description: 'Max chars to return', default: 5000 }
      },
      required: ['url']
    },
    handler: async ({ url, max_chars = 5000 }, ctx) => {
      try {
        const content = await ctx.api.webExtract(url, max_chars)
        return content?.slice(0, max_chars) || '(no content)'
      } catch (e) {
        return `web-extract failed: ${e.message}`
      }
    }
  },
  {
    name: 'execute-command',
    description: 'Run a shell command on the Linux system.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command' },
        timeout: { type: 'number', description: 'Timeout in seconds', default: 10 }
      },
      required: ['command']
    },
    handler: async ({ command, timeout = 10 }, ctx) => {
      try {
        return await ctx.api.executeCommand(command, timeout)
      } catch (e) {
        return `execute-command failed: ${e.message}`
      }
    }
  },
  {
    name: 'read-file',
    description: 'Read a file. Returns content with line numbers.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        offset: { type: 'number', description: 'Start line (1-indexed)', default: 1 },
        limit: { type: 'number', description: 'Max lines', default: 50 }
      },
      required: ['path']
    },
    handler: async ({ path, offset = 1, limit = 50 }, ctx) => {
      try {
        const content = await ctx.api.readFile(path, offset, limit)
        return typeof content === 'string' ? content : JSON.stringify(content)
      } catch (e) {
        return `read-file failed: ${e.message}`
      }
    }
  },
  {
    name: 'write-file',
    description: 'Write content to a file. OVERWRITES entire file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        content: { type: 'string', description: 'File content' }
      },
      required: ['path', 'content']
    },
    handler: async ({ path, content }, ctx) => {
      try {
        await ctx.api.writeFile(path, content)
        return `File written: ${path} (${content.length} chars)`
      } catch (e) {
        return `write-file failed: ${e.message}`
      }
    }
  },
  {
    name: 'search-files',
    description: 'Search file contents by regex, or find files by glob.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex (content) or glob (name)' },
        target: { type: 'string', enum: ['content', 'files'], default: 'content' },
        path: { type: 'string', default: '.' }
      },
      required: ['pattern']
    },
    handler: async ({ pattern, target = 'content', path = '.' }, ctx) => {
      try {
        return JSON.stringify(await ctx.api.searchFiles(pattern, target, path))
      } catch (e) {
        return `search-files failed: ${e.message}`
      }
    }
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the desktop.',
    parameters: {
      type: 'object',
      properties: {
        window: { type: 'string', description: 'Optional window title', default: '' }
      }
    },
    handler: async ({ window = '' }, ctx) => {
      try {
        const img = await ctx.api.takeScreenshot(window)
        return `Screenshot taken (${img?.data?.length || 0} bytes)`
      } catch (e) {
        return `screenshot failed: ${e.message}`
      }
    }
  },
  {
    name: 'mouse-click',
    description: 'Click at screen coordinates using xdotool.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
        button: { type: 'string', enum: ['left', 'middle', 'right'], default: 'left' }
      },
      required: ['x', 'y']
    },
    handler: async ({ x, y, button = 'left' }, ctx) => {
      try {
        await ctx.api.mouseClick(x, y, button)
        return `Clicked (${x}, ${y})`
      } catch (e) {
        return `mouse-click failed: ${e.message}`
      }
    }
  },
  {
    name: 'type-text',
    description: 'Type text at focused window using xdotool.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type' },
        delay: { type: 'number', description: 'ms between keys', default: 12 }
      },
      required: ['text']
    },
    handler: async ({ text, delay = 12 }, ctx) => {
      try {
        await ctx.api.typeText(text, delay)
        return `Typed: ${text.slice(0, 50)}${text.length > 50 ? '...' : ''}`
      } catch (e) {
        return `type-text failed: ${e.message}`
      }
    }
  },
  {
    name: 'key-press',
    description: 'Press a keyboard key or combo (e.g. Return, Ctrl+C).',
    parameters: {
      type: 'object',
      properties: {
        keys: { type: 'string', description: 'Key combo' }
      },
      required: ['keys']
    },
    handler: async ({ keys }, ctx) => {
      try {
        await ctx.api.keyPress(keys)
        return `Pressed: ${keys}`
      } catch (e) {
        return `key-press failed: ${e.message}`
      }
    }
  },
  {
    name: 'window-list',
    description: 'List open windows with ID, title, geometry.',
    parameters: { type: 'object', properties: {} },
    handler: async (_, ctx) => {
      try {
        return JSON.stringify(await ctx.api.listWindows())
      } catch (e) {
        return `window-list failed: ${e.message}`
      }
    }
  },
  {
    name: 'window-focus',
    description: 'Focus a window by title or ID.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Window title substring or hex ID' }
      },
      required: ['target']
    },
    handler: async ({ target }, ctx) => {
      try {
        await ctx.api.windowFocus(target)
        return `Focused: ${target}`
      } catch (e) {
        return `window-focus failed: ${e.message}`
      }
    }
  },
  {
    name: 'memory-save',
    description: 'Save a fact to persistent memory.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Fact to remember' }
      },
      required: ['content']
    },
    handler: async ({ content }, ctx) => {
      try {
        await ctx.api.saveMemory(content, 'memory')
        return `Saved: ${content.slice(0, 80)}...`
      } catch (e) {
        return `memory-save failed: ${e.message}`
      }
    }
  },
  {
    name: 'finish',
    description: 'Call when task is complete.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Summary of work done' },
        result: { type: 'string', description: 'Final output (optional)' }
      },
      required: ['summary']
    },
    handler: async ({ summary, result = '' }, ctx) => {
      return `[DONE] ${summary}${result ? '\n' + result : ''}`
    }
  }
]

// ============================================================
// Tool Registry Class
// ============================================================

class ToolRegistry {
  constructor () {
    this._tools = new Map()
    builtInTools.forEach(t => this._tools.set(t.name, t))
  }

  register (toolDef) {
    if (!toolDef.name || !toolDef.handler) throw new Error('Tool must have name and handler')
    this._tools.set(toolDef.name, {
      name: toolDef.name,
      description: toolDef.description || '',
      parameters: toolDef.parameters || { type: 'object', properties: {} },
      handler: toolDef.handler
    })
  }

  get (name) { return this._tools.get(name) }

  getAll () { return Array.from(this._tools.values()) }

  toToolCallSystemPrompt () {
    const tools = this.getAll()
    return `## Autonomous Tools
You have these tools. To call one, respond only with a JSON block:
\`\`\`json
{"tool": "<name>", "params": { ... }}
\`\`\`

${tools.map(t => {
  const props = t.parameters?.properties
    ? Object.entries(t.parameters.properties).map(([k, v]) =>
        `  - ${k}: ${v.description || ''}${t.parameters.required?.includes(k) ? ' [required]' : ''}`
      ).join('\n')
    : '  (no params)'
  return `### ${t.name}\n${t.description}\nParams:\n${props}`
}).join('\n\n')}

Wait for the result of each tool call before deciding the next step.`
  }

  async execute (toolCall, context) {
    const { tool, params } = typeof toolCall === 'string' ? JSON.parse(toolCall) : toolCall
    const def = this._tools.get(tool)
    if (!def) return { success: false, error: `Unknown tool: ${tool}` }
    try {
      const result = await def.handler(params || {}, context)
      return { success: true, data: result }
    } catch (e) {
      return { success: false, error: `${tool} error: ${e.message}` }
    }
  }
}

let _instance = null
export const getToolRegistry = () => {
  if (!_instance) _instance = new ToolRegistry()
  return _instance
}
export const registerTool = (toolDef) => getToolRegistry().register(toolDef)
export const getTools = () => getToolRegistry().getAll()

export default ToolRegistry
