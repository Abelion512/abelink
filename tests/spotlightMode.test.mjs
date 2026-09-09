import { describe, it, expect, vi } from 'vitest'

describe('Spotlight Mode Logic & Typing Interruption', () => {
  it('cancels active mic recording when user types', () => {
    let isRecording = true
    const cancelRecording = vi.fn(() => {
      isRecording = false
    })

    const handleInputChange = (newText) => {
      if (isRecording) {
        cancelRecording()
      }
      return newText
    }

    // Simulasi mengetik huruf pertama
    const text = handleInputChange('a')
    expect(text).toBe('a')
    expect(cancelRecording).toHaveBeenCalledTimes(1)
    expect(isRecording).toBe(false)
  })

  it('submits prompt directly when speech transcript finishes', async () => {
    const handlePlanningCommand = vi.fn().mockResolvedValue({ success: true })
    let promptSent = ''

    const onTranscript = async (transcript) => {
      if (transcript && transcript.trim()) {
        promptSent = transcript.trim()
        await handlePlanningCommand(promptSent)
      }
    }

    await onTranscript('buka terminal dan cek disk')
    expect(promptSent).toBe('buka terminal dan cek disk')
    expect(handlePlanningCommand).toHaveBeenCalledWith('buka terminal dan cek disk')
  })

  it('validates window mode parameters', () => {
    const validModes = ['spotlight', 'dashboard']
    const normalizeMode = (m) => (validModes.includes(m) ? m : 'dashboard')

    expect(normalizeMode('spotlight')).toBe('spotlight')
    expect(normalizeMode('dashboard')).toBe('dashboard')
    expect(normalizeMode('unknown')).toBe('dashboard')
  })
})
