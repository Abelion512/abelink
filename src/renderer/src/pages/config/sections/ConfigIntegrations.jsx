// Section: Integrations (awareness engine, Last.fm)
import { useState } from 'react'
import { FaEye, FaEyeSlash } from 'react-icons/fa'

export default function ConfigIntegrations({ config, setConfig }) {
  const [showLastfmKey, setShowLastfmKey] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)

  const handleLogin = async () => {
    if (!config.lastfmApiKey || !config.lastfmSharedSecret || !config._lastfmUsername || !config._lastfmPassword) {
      alert('Isi semua field dulu: API Key, Shared Secret, Username, Password')
      return
    }
    setLoggingIn(true)
    try {
      const result = await window.api.lastfmGetSessionKey(
        config._lastfmUsername, config._lastfmPassword,
        config.lastfmApiKey, config.lastfmSharedSecret
      )
      if (result?.key) {
        setConfig((prev) => ({ ...prev, lastfmSessionKey: result.key, _lastfmPassword: '' }))
        alert()
      } else {
        alert('❌ Login gagal. Cek username/password.')
      }
    } catch (e) {
      console.error(e)
      alert('❌ Login gagal. Cek username/password.')
    }
    setLoggingIn(false)
  }

  return (
    <section className="space-y-5">
      {/* Awareness Engine Toggle */}
      <div className="space-y-1.5 p-2 -mx-2 rounded-lg bg-base-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Awareness Engine</p>
            <p className="text-xs opacity-50 mt-1">Mengizinkan Mark membaca log sistem/aktivitas dan memulai obrolan secara proaktif di latar belakang.</p>
          </div>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={config.awarenessEnabled !== false}
            onChange={(e) => setConfig((prev) => ({ ...prev, awarenessEnabled: e.target.checked }))}
          />
        </div>
      </div>

      {/* Last.fm Integration — Collapsible */}
      <div className="collapse collapse-arrow bg-base-200 -mx-2">
        <input type="checkbox" defaultChecked={false} />
        <div className="collapse-title text-sm font-semibold flex items-center gap-2">
          <span>🎵 Last.fm</span>
          <span className="text-xs opacity-50 font-normal">(opsional — scrobbling & riwayat musik)</span>
        </div>
        <div className="collapse-content space-y-3">
          <p className="text-xs opacity-60">
            Untuk scrobbling otomatis dan rekomendasi musik.{' '}
            <a href="https://www.last.fm/api/account/create" target="_blank" rel="noreferrer" className="link link-primary">
              Dapatkan API Key
            </a>
          </p>

          {/* API Key */}
          <div className="relative">
            <label className="text-xs opacity-70">API Key</label>
            <input
              type={showLastfmKey ? 'text' : 'password'}
              placeholder="Last.fm API Key"
              className="input input-bordered input-sm w-full pr-10"
              value={config.lastfmApiKey || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, lastfmApiKey: e.target.value }))}
            />
            <button type="button" className="absolute right-3 bottom-2 opacity-50 hover:opacity-100" onClick={() => setShowLastfmKey(!showLastfmKey)}>
              {showLastfmKey ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
            </button>
          </div>

          {/* Shared Secret */}
          <div className="relative">
            <label className="text-xs opacity-70">Shared Secret</label>
            <input
              type={showLastfmKey ? 'text' : 'password'}
              placeholder="Shared Secret (dari halaman API account)"
              className="input input-bordered input-sm w-full pr-10"
              value={config.lastfmSharedSecret || ''}
              onChange={(e) => setConfig((prev) => ({ ...prev, lastfmSharedSecret: e.target.value }))}
            />
          </div>

          {/* Auto-login: username + password → session key */}
          <div className="bg-base-300 rounded p-2 space-y-2">
            <p className="text-xs opacity-70">Login untuk dapat session key (scrobbling):</p>
            <div className="flex gap-2">
              <input type="text" placeholder="Username" className="input input-bordered input-sm flex-1"
                value={config._lastfmUsername || ''} onChange={(e) => setConfig((prev) => ({ ...prev, _lastfmUsername: e.target.value }))} />
              <div className="relative flex-1">
                <input type={showPassword ? 'text' : 'password'} placeholder="Password" className="input input-bordered input-sm w-full pr-8"
                  value={config._lastfmPassword || ''} onChange={(e) => setConfig((prev) => ({ ...prev, _lastfmPassword: e.target.value }))} />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                </button>
              </div>
              <button className="btn btn-sm btn-primary" onClick={handleLogin} disabled={loggingIn}>
                {loggingIn ? '...' : 'Login'}
              </button>
            </div>
          </div>

          {/* Session Key status */}
          {config.lastfmSessionKey && (
            <p className="text-xs text-success">✅ Session key tersimpan — scrobbling aktif</p>
          )}
        </div>
      </div>
    </section>
  )
}
