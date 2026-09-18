import { describe, it, expect } from 'vitest'
import { pluginToDescriptors } from '../sidecar/main/plugins/plugin-loader.js'

describe('pluginToDescriptors', () => {
  it('projects parameters to inputSchema properties', () => {
    const out = pluginToDescriptors({
      name: 'My Plugin',
      description: 'does things',
      isEnabled: true,
      folderPath: '/plugins/my-plugin',
      actions: [
        { name: 'Do Thing', description: 'does it', parameters: { q: 'string', n: 'number', flag: 'boolean' } }
      ]
    })
    expect(out).toHaveLength(1)
    const [d] = out
    expect(d.id).toBe('plugin:my-plugin:do-thing')
    expect(d.kind).toBe('plugin')
    expect(d.inputSchema).toEqual({
      type: 'object',
      properties: { q: { type: 'string' }, n: { type: 'number' }, flag: { type: 'boolean' } }
    })
    expect(d.scopes).toEqual([])
    expect(d.guide).toEqual({ steps: ['does it'], examples: [] })
    expect(d.enabled).toBe(true)
    expect(d.source).toEqual({ type: 'plugin', dir: '/plugins/my-plugin' })
  })

  it('defaults schema to {query} when parameters absent', () => {
    const out = pluginToDescriptors({
      name: 'p',
      description: 'd',
      actions: [{ name: 'a', description: 'run it' }]
    })
    expect(out).toHaveLength(1)
    expect(out[0].inputSchema).toEqual({ type: 'object', properties: { query: { type: 'string' } } })
    expect(out[0].enabled).toBe(true)
    expect(out[0].source).toEqual({ type: 'plugin', dir: null })
  })

  it('disabled plugin -> enabled false', () => {
    const out = pluginToDescriptors({
      name: 'p',
      isEnabled: false,
      actions: [{ name: 'a', description: 'x' }]
    })
    expect(out).toHaveLength(1)
    expect(out[0].enabled).toBe(false)
  })

  it('manifest without name -> []', () => {
    expect(pluginToDescriptors({ actions: [{ name: 'a' }] })).toEqual([])
    expect(pluginToDescriptors({ name: 'p' })).toEqual([])
    expect(pluginToDescriptors(null)).toEqual([])
  })
})
