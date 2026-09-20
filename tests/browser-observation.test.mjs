import { describe, expect, it } from 'vitest'
import { formatBrowserObservation, parseBrowserObservation } from '../extension/browser-observation.mjs'

describe('browser observation formatter', () => {
  it('puts semantic page text before interactive controls', () => {
    const output = formatBrowserObservation({
      title: 'Research page',
      url: 'https://example.test',
      text: 'Important article body and problem statement.',
      elements: [
        { abelinkId: 'ak1', tag: 'button', text: 'Submit', inViewport: true },
        { abelinkId: 'ak2', tag: 'a', text: 'Menu', inViewport: true }
      ]
    })
    expect(output.indexOf('[MAIN SEMANTIC TEXT]')).toBeLessThan(output.indexOf('[INTERACTIVE ELEMENTS FOR NEXT ACTION]'))
    expect(output).toContain('Important article body and problem statement.')
  })

  it('bounds controls without deleting the page identity', () => {
    const elements = Array.from({ length: 120 }, (_, i) => ({ abelinkId: `ak${i + 1}`, tag: 'button', text: `B${i + 1}` }))
    const output = formatBrowserObservation({ title: 'Dense UI', url: 'https://example.test', text: 'Main content', elements }, { maxElements: 80 })
    expect(output).toContain('Title: Dense UI')
    expect(output).toContain('Main content')
    expect(output).toContain('80 additional interactive elements omitted'.replace('80', '40'))
  })

  it('parses JSON payloads and does not crash on malformed input', () => {
    expect(parseBrowserObservation('{"title":"x"}')?.title).toBe('x')
    expect(parseBrowserObservation('{bad')).toBeNull()
    expect(formatBrowserObservation('{bad')).toBe('{bad')
  })
})
