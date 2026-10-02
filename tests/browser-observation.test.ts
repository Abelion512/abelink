import { describe, expect, it } from 'vitest'
import {
  formatBrowserObservation,
  parseBrowserObservation,
  renderBrowserObservation,
  resolveObservationRepresentation,
  OBSERVATION_REPRESENTATIONS,
} from '../extension/browser-observation.mjs'

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

// The PR46 browser-representation ablation is only meaningful if the two
// representations actually render differently on the execution path.
describe('observation representation switch', () => {
  const payload = {
    title: 'Beranda',
    url: 'https://example.test/',
    text: 'TEKS-UTAMA',
    elements: [{ abelinkId: 'ak1', tag: 'a', text: 'TAUTAN-1', inViewport: true }],
  }

  it('defaults to semantic-first so app behavior is unchanged', () => {
    expect(resolveObservationRepresentation()).toBe('semantic-first')
    expect(resolveObservationRepresentation('')).toBe('semantic-first')
    expect(renderBrowserObservation(payload)).toBe(formatBrowserObservation(payload))
  })

  it('raw returns the payload as received, not the semantic-first text', () => {
    const raw = renderBrowserObservation(payload, { representation: 'raw' })
    expect(raw).not.toBe(formatBrowserObservation(payload))
    expect(raw).not.toContain('[MAIN SEMANTIC TEXT]')
    expect(JSON.parse(raw).title).toBe('Beranda')
  })

  it('rejects an unknown representation instead of silently defaulting', () => {
    expect(() => resolveObservationRepresentation('nope')).toThrow(/tidak dikenal/)
    expect(() => renderBrowserObservation(payload, { representation: 'nope' })).toThrow()
    expect([...OBSERVATION_REPRESENTATIONS]).toEqual(['semantic-first', 'raw'])
  })
})
