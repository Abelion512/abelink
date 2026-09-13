import { useState, useEffect, useRef } from 'react'
import { FaEye, FaVolumeUp } from 'react-icons/fa'
import SttRouterConfig from './SttRouterConfig'

export const ConfigCameraPreview = ({ deviceId, enabled }) => {
  const videoRef = useRef(null)
  const [camError, setCamError] = useState('')

  useEffect(() => {
    if (!enabled) return
    let stream = null
    let isMounted = true
    setCamError('')
    const startCamera = async () => {
      try {
        const constraints = {
          video: deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : true
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (videoRef.current && isMounted) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch((e) => console.error(e))
        } else {
          stream.getTracks().forEach((t) => t.stop())
        }
      } catch (err) {
        if (isMounted) {
          setCamError(
            'Preview kamera tidak tersedia: izin ditolak atau lingkungan webview tidak mengizinkan akses kamera.'
          )
        }
      }
    }
    startCamera()
    return () => {
      isMounted = false
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [deviceId, enabled])

  if (!enabled) return null

  return (
    <div className="mt-4 rounded-xl overflow-hidden border border-white/10 bg-black/50 aspect-video relative flex items-center justify-center shadow-inner">
      {camError ? (
        <p className="text-xs opacity-60 text-center px-4">{camError}</p>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          <div className="absolute top-2 left-2 flex items-center gap-2 px-2 py-1 bg-black/60 rounded text-xs font-mono text-white backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            Live Preview
          </div>
        </>
      )}
    </div>
  )
}

export default function VoiceVideoSection({
  config,
  setConfig,
  activeSection,
  videoDevices = [],
  audioDevices = [],
  hardwareSupport = null,
  whisperLoading = false,
  whisperLoaded = false,
  whisperProgress = 0,
  onDownloadWhisper,
  testingConnId = null,
  connTestResults = {},
  onTestConnection
}) {
  const testAudioRef = useRef(null)
  const [playingTest, setPlayingTest] = useState(false)

  const handleCameraEnabledChange = (e) =>
    setConfig((prev) => ({ ...prev, cameraEnabled: e.target.checked }))
  const handleCameraDeviceIdChange = (e) =>
    setConfig((prev) => ({ ...prev, cameraDeviceId: e.target.value }))
  const handleMicDeviceIdChange = (e) =>
    setConfig((prev) => ({ ...prev, micDeviceId: e.target.value }))
  const handleTtsRateChange = (e) =>
    setConfig((prev) => ({ ...prev, ttsRate: e.target.value }))
  const handleTtsPitchChange = (e) =>
    setConfig((prev) => ({ ...prev, ttsPitch: e.target.value }))

  const handleTestVoice = async () => {
    if (playingTest) return
    setPlayingTest(true)
    try {
      if (testAudioRef.current) {
        testAudioRef.current.pause()
        testAudioRef.current = null
      }
      const response = await window.api?.speakTTS({
        text: 'Halo bro, gue Abelink. Ada yang bisa dibantu?',
        rate: config.ttsRate || 0,
        pitch: config.ttsPitch || 0,
        returnAudio: true
      })
      if (response && response.audioBase64) {
        const byteCharacters = atob(response.audioBase64)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: 'audio/mp3' })
        const url = URL.createObjectURL(blob)

        const audio = new Audio(url)
        testAudioRef.current = audio
        audio.onended = () => {
          URL.revokeObjectURL(url)
          setPlayingTest(false)
          testAudioRef.current = null
        }
        audio.onerror = (e) => {
          console.error('[Config] Audio test playback error:', e)
          URL.revokeObjectURL(url)
          setPlayingTest(false)
          testAudioRef.current = null
        }
        await audio.play()
      } else {
        setPlayingTest(false)
      }
    } catch (err) {
      console.error('[Config] speakTTS test error:', err)
      setPlayingTest(false)
    }
  }

  const isVisible =
    activeSection === 'cfg-voice-video' ||
    activeSection === 'cfg-camera' ||
    activeSection === 'cfg-audio-voice'

  return (
    <section
      id="cfg-voice-video"
      className={`${!isVisible ? 'hidden' : ''} space-y-6 scroll-mt-4`}
    >
      <div>
        <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
          Voice &amp; Video
        </h2>
      </div>

      {/* Camera Settings */}
      <article
        id="cfg-camera"
        className={`space-y-4 p-5 rounded-2xl bg-base-200/40 backdrop-blur-md border border-white/5 scroll-mt-4 ${
          activeSection === 'cfg-audio-voice' ? 'hidden' : ''
        }`}
      >
        <header className="flex items-center justify-between pb-3 border-b border-white/5">
          <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
            <FaEye className="text-primary" />
            <span>Kamera &amp; Vision</span>
          </h3>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs text-white/70 font-medium">Akses Kamera</span>
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={config.cameraEnabled !== false}
              onChange={handleCameraEnabledChange}
            />
          </label>
        </header>

        {config.cameraEnabled !== false && (
          <fieldset className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-white/70">Perangkat Kamera</label>
              <select
                className="select select-bordered select-sm w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
                value={config.cameraDeviceId || 'default'}
                onChange={handleCameraDeviceIdChange}
              >
                <option value="default">Default System Camera</option>
                {videoDevices.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `Camera ${cam.deviceId.substring(0, 5)}...`}
                  </option>
                ))}
              </select>
            </div>

            <ConfigCameraPreview
              deviceId={config.cameraDeviceId}
              enabled={config.cameraEnabled !== false}
            />
          </fieldset>
        )}
      </article>

      {/* STT & Audio Settings */}
      <div
        id="cfg-audio-voice"
        className={`space-y-6 scroll-mt-4 ${activeSection === 'cfg-camera' ? 'hidden' : ''}`}
      >
        {/* Speech-to-Text Multi-Provider Router */}
        <SttRouterConfig
          config={config}
          setConfig={setConfig}
          hardwareSupport={hardwareSupport}
          whisperLoading={whisperLoading}
          whisperLoaded={whisperLoaded}
          whisperProgress={whisperProgress}
          onDownloadWhisper={onDownloadWhisper}
          testingConnId={testingConnId}
          connTestResults={connTestResults}
          onTestConnection={onTestConnection}
        />

        {/* Audio In/Out (Microphone & TTS) */}
        <article className="rounded-2xl border border-white/5 bg-base-200/40 backdrop-blur-md p-5 space-y-4">
          <header className="pb-3 border-b border-white/5">
            <h3 className="text-sm font-semibold text-white/90 flex items-center gap-2">
              <FaVolumeUp className="text-primary" />
              <span>Audio &amp; Suara</span>
              <span className="text-[10px] font-normal text-white/40">(TTS Edge — butuh internet)</span>
            </h3>
          </header>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-white/70">Mikrofon</label>
            <select
              className="select select-bordered select-sm w-full rounded-xl bg-base-100/60 border-white/10 text-xs"
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

          {/* TTS Rate & Pitch Slider */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white/70">Kecepatan Bicara</label>
                <span className="font-mono text-xs text-primary font-semibold">
                  {config.ttsRate || 0}%
                </span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                step="1"
                value={config.ttsRate || 0}
                className="range range-primary range-xs w-full"
                onChange={handleTtsRateChange}
              />
              <div className="flex justify-between text-[11px] text-white/30">
                <span>-50%</span>
                <span>0%</span>
                <span>+50%</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white/70">Nada Suara</label>
                <span className="font-mono text-xs text-primary font-semibold">
                  {config.ttsPitch || 0}hz
                </span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                step="1"
                value={config.ttsPitch || 0}
                className="range range-primary range-xs w-full"
                onChange={handleTtsPitchChange}
              />
              <div className="flex justify-between text-[11px] text-white/30">
                <span>-50hz</span>
                <span>0hz</span>
                <span>+50hz</span>
              </div>
            </div>
          </div>

          {/* Test Voice Button */}
          <div className="pt-2 flex items-center justify-between border-t border-white/5">
            <button
              type="button"
              className={`btn btn-sm btn-outline btn-primary rounded-xl gap-2 font-medium text-xs cursor-pointer ${
                playingTest ? 'btn-disabled' : ''
              }`}
              onClick={handleTestVoice}
              disabled={playingTest}
            >
              {playingTest ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <FaVolumeUp size={12} />
              )}
              <span>Uji Suara</span>
            </button>
          </div>
        </article>
      </div>
    </section>
  )
}
