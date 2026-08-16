// Section: Audio & Voice Engine (TTS rate/pitch, mic, test playback)
import { useState } from 'react'

export default function ConfigVoice({ config, setConfig, audioDevices }) {
  const [playingTest, setPlayingTest] = useState(false)

  const handleTestVoice = async () => {
    setPlayingTest(true)
    const testText =
      'Halo bro! Gue Mark, asisten pribadi lo. Gimana suara gue sekarang? Udah mantap belum?'
    try {
      const audioBase64 = await window.api.textToSpeech(testText, config.ttsRate, config.ttsPitch)
      if (audioBase64) {
        const audio = new Audio(audioBase64)
        audio.onended = () => setPlayingTest(false)
        await audio.play()
      } else {
        setPlayingTest(false)
      }
    } catch (error) {
      console.error('Gagal test suara:', error)
      setPlayingTest(false)
    }
  }

  const handleMicDeviceIdChange = (e) => setConfig((prev) => ({ ...prev, micDeviceId: e.target.value }))
  const handleTtsRateChange = (e) => setConfig((prev) => ({ ...prev, ttsRate: Number(e.target.value) }))
  const handleTtsPitchChange = (e) => setConfig((prev) => ({ ...prev, ttsPitch: Number(e.target.value) }))

  return (
    <div id="tour-tts" className="space-y-6 p-2 -mx-2 glass glass-hover">
      <h2 className="text-base font-bold uppercase tracking-wider opacity-70 mb-5">
        Audio & Voice Engine
      </h2>

      {/* Microphone Source Selection */}
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">Mikrofon (Voice Input)</p>
        <select
          className="select select-bordered w-full"
          value={config.micDeviceId || 'default'}
          onChange={handleMicDeviceIdChange}
        >
          <option value="default">Default System Microphone</option>
          {audioDevices.map((mic) => (
            <option key={mic.deviceId} value={mic.deviceId}>
              {mic.label || `Microphone ${mic.deviceId.substring(0, 5)}...`}
            </option>
          ))}
        </select>
      </div>

      {/* TTS Rate */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">TTS Rate (Kecepatan Suara)</p>
          <span className="font-mono text-sm text-primary font-bold">
            {config.ttsRate}%
          </span>
        </div>
        <input
          type="range"
          min="-50"
          max="50"
          step="1"
          value={config.ttsRate}
          className="range range-primary range-xs w-full"
          onChange={handleTtsRateChange}
        />
        <div className="flex justify-between mt-2 text-xs">
          <span>-50%</span>
          <span>-25%</span>
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
        </div>
      </div>

      {/* TTS Pitch */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">TTS Pitch (Nada Suara)</p>
          <span className="font-mono text-sm text-primary font-bold">
            {config.ttsPitch}hz
          </span>
        </div>
        <input
          type="range"
          min="-50"
          max="50"
          step="1"
          value={config.ttsPitch}
          className="range range-primary range-xs w-full"
          onChange={handleTtsPitchChange}
        />
        <div className="flex justify-between mt-2 text-xs">
          <span>-50hz</span>
          <span>-25hz</span>
          <span>0hz</span>
          <span>25hz</span>
          <span>50hz</span>
        </div>
      </div>

      {/* Test TTS Button */}
      <div className="pt-2">
        <button
          className={`btn btn-soft btn-sm gap-2 ${playingTest ? 'btn-disabled' : ''}`}
          onClick={handleTestVoice}
          disabled={playingTest}
        >
          {playingTest ? (
            <span className="loading loading-spinner loading-xs"></span>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="1.2em"
              height="1.2em"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
            </svg>
          )}
          Test Suara Mark
        </button>
        <p className="text-[10px] opacity-30 mt-1.5 px-1">
          *Klik untuk mendengar suara Mark dengan settingan di atas tanpa perlu simpan dulu.
        </p>
      </div>
    </div>
  )
}
