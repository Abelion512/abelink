// Section: Camera settings (enable toggle, device select, live preview)
import { useEffect, useRef } from 'react'

const ConfigCameraPreview = ({ deviceId, enabled }) => {
  const videoRef = useRef(null)

  useEffect(() => {
    if (!enabled) return
    let stream = null
    let isMounted = true
    const startCamera = async () => {
      try {
        const constraints = { video: deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : true }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (videoRef.current && isMounted) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(e => console.error(e))
        } else {
          stream.getTracks().forEach(t => t.stop())
        }
      } catch (err) {
        console.error('Preview camera error:', err)
      }
    }
    startCamera()
    return () => {
      isMounted = false
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [deviceId, enabled])

  if (!enabled) return null

  return (
    <div className="mt-4 rounded-xl overflow-hidden border border-white/10 bg-black/50 aspect-video relative flex items-center justify-center shadow-inner">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      <div className="absolute top-2 left-2 flex items-center gap-2 px-2 py-1 bg-black/60 rounded text-xs font-mono text-white backdrop-blur-md">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
        Live Preview
      </div>
    </div>
  )
}

export default function ConfigCamera({ config, setConfig, videoDevices }) {
  const handleCameraDeviceIdChange = (e) => {
    console.log('[Config] Camera device changed to:', e.target.value, '| label:', e.target.options[e.target.selectedIndex]?.text)
    setConfig((prev) => ({ ...prev, cameraDeviceId: e.target.value }))
  }
  const handleCameraEnabledChange = (e) => setConfig((prev) => ({ ...prev, cameraEnabled: e.target.checked }))

  return (
    <div className="space-y-6 p-2 -mx-2 glass glass-hover">
      <h2 className="text-base font-bold uppercase tracking-wider opacity-70 mb-5 flex items-center gap-2">
        Kamera
      </h2>

      <div className="form-control">
        <label className="label cursor-pointer p-0">
          <span className="label-text text-sm font-semibold">Aktifkan Kamera AI</span>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={config.cameraEnabled !== false}
            onChange={handleCameraEnabledChange}
          />
        </label>
        <span className="text-xs opacity-50 mt-2 block">
          Mengizinkan Mark menggunakan kamera (jika diminta) untuk melihat dunia fisik.
        </span>
      </div>

      {config.cameraEnabled !== false && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Perangkat Kamera</p>
          <select
            className="select select-bordered w-full"
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
      )}

      {config.cameraEnabled !== false && (
        <ConfigCameraPreview deviceId={config.cameraDeviceId} enabled={config.cameraEnabled !== false} />
      )}
    </div>
  )
}
