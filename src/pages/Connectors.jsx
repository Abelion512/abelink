import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaArrowLeft,
  FaPlug,
  FaKey,
  FaShieldAlt,
  FaHistory,
  FaCheckCircle,
  FaExclamationTriangle,
  FaSearch,
  FaPlay,
  FaLock,
  FaUnlock,
  FaClipboardList,
  FaChevronDown,
  FaSyncAlt
} from 'react-icons/fa'
import { useConfirm } from '../hooks/useConfirm'

// Connectors — UI Capability Manager (general-pluggable, ala Claude connectors).
// Katalog/policy/audit hidup di sidecar (main/capabilities); halaman ini hanya
// membaca metadata + memicu authorize/revoke/execute. Keputusan approval destr
// uktif tetap NATIVE (rfd di Rust main thread), bukan di sini.

const APPROVAL_CODE = 'CAPABILITY_APPROVAL_REQUIRED'

const statusBadge = (entry) => {
  switch (entry.status) {
    case 'ok':
      return <span className="badge badge-success badge-sm font-semibold">OK</span>
    case 'error':
      return <span className="badge badge-error badge-sm font-semibold">ERROR</span>
    case 'policy-denied':
      return <span className="badge badge-warning badge-sm font-semibold">POLICY DENIED</span>
    case 'approval-required':
      return <span className="badge badge-info badge-sm font-semibold">NEEDS APPROVAL</span>
    case 'connectionless':
      return <span className="badge badge-ghost badge-sm font-semibold">CONNECTION-LESS</span>
    default:
      return (
        <span className="badge badge-ghost badge-sm font-semibold">{entry.status || entry.op}</span>
      )
  }
}

const fmtTime = (ts) => {
  if (!ts) return '-'
  try {
    return new Date(ts).toLocaleTimeString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minimumFractionDigits: 0
    })
  } catch {
    return ts
  }
}

const fmtTimeShort = (ts) => {
  if (!ts) return '-'
  try {
    return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ts
  }
}

export default function Connectors() {
  const navigate = useNavigate()
  const { confirm, ModalComponent } = useConfirm()

  const [connectors, setConnectors] = useState([])
  const [connections, setConnections] = useState({})
  const [audit, setAudit] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [toastMessage, setToastMessage] = useState(null)
  const [busyKey, setBusyKey] = useState(null) // `${connectorId}:${op}`

  // Detail modal state
  const [detail, setDetail] = useState(null) // { connector, inspect, guide }
  const [guideActionId, setGuideActionId] = useState(null)
  const [testArgs, setTestArgs] = useState('{}')
  const [testResult, setTestResult] = useState(null) // { ok, text }

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3200)
  }

  const loadData = useCallback(async (withSpinner = false) => {
    if (withSpinner) setIsLoading(true)
    let list = []
    let conns = {}
    let auditEntries = []
    let bridgeError = null
    if (!window.api?.listCapabilities) {
      bridgeError = new Error('Bridge capability belum tersedia (sidecar tidak aktif?)')
    } else {
      try {
        ;[list, conns, auditEntries] = await Promise.all([
          window.api.listCapabilities(),
          window.api.listCapabilityConnections(),
          window.api.readCapabilityAudit(100)
        ])
      } catch (err) {
        bridgeError = err
      }
    }
    setConnectors(list || [])
    setConnections(conns || {})
    setAudit(auditEntries || [])
    if (bridgeError) showToast(`Gagal memuat connector: ${bridgeError.message}`)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      // Yield microtask dulu: tidak ada setState sinkron di body effect
      // (mencegah cascading render di React 19).
      await Promise.resolve()
      if (!cancelled) await loadData(false)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [loadData])

  const refreshAudit = useCallback(async () => {
    try {
      const entries = await window.api.readCapabilityAudit(100)
      setAudit(entries || [])
    } catch {
      /* audit best-effort */
    }
  }, [])

  // ---------------------------------------------------------- authorize/revoke
  const handleAuthorize = async (connector) => {
    if (!connector.scopes?.length) {
      // connection-less: authorize tetap valid untuk jejak audit
      try {
        setBusyKey(`${connector.id}:auth`)
        await window.api.authorizeCapability(connector.id, [])
        showToast(`${connector.name} tidak butuh koneksi (connection-less).`)
        await refreshAudit()
      } catch (err) {
        showToast(`Gagal: ${err.message}`)
      } finally {
        setBusyKey(null)
      }
      return
    }
    const granted = [...connector.scopes] // default: semua scope terdaftar
    const res = await confirm({
      title: `Izinkan connector "${connector.name}"?`,
      message: `Mark akan diberi izin: ${(granted.length ? granted : ['(tanpa scope)']).join(', ')}. Kredensial koneksi disimpan lokal (mode 0600), tanpa telemetri.`,
      confirmText: 'Izinkan',
      cancelText: 'Batal'
    })
    if (!res.isConfirmed) return
    setBusyKey(`${connector.id}:auth`)
    try {
      await window.api.authorizeCapability(connector.id, granted)
      showToast(`${connector.name} terotorisasi.`)
      const conns = await window.api.listCapabilityConnections()
      setConnections(conns || {})
      await refreshAudit()
    } catch (err) {
      showToast(`Gagal otorisasi: ${err.message}`)
    } finally {
      setBusyKey(null)
    }
  }

  const handleRevoke = async (connector) => {
    const res = await confirm({
      title: `Cabut koneksi "${connector.name}"?`,
      message: 'Mark tidak lagi punya akses koneksi pada connector ini sampai diotorisasi ulang.',
      isError: true,
      confirmText: 'Cabut',
      cancelText: 'Batal'
    })
    if (!res.isConfirmed) return
    setBusyKey(`${connector.id}:revoke`)
    try {
      await window.api.revokeCapability(connector.id)
      showToast(`Koneksi ${connector.name} dicabut.`)
      const conns = await window.api.listCapabilityConnections()
      setConnections(conns || {})
      await refreshAudit()
    } catch (err) {
      showToast(`Gagal revoke: ${err.message}`)
    } finally {
      setBusyKey(null)
    }
  }

  // ---------------------------------------------------------- detail & test run
  const openDetail = async (connector) => {
    setBusyKey(`${connector.id}:detail`)
    try {
      const inspect = await window.api.inspectCapability(connector.id)
      setDetail({ connector, inspect })
      setGuideActionId(null)
      setTestArgs('{}')
      setTestResult(null)
    } catch (err) {
      showToast(`Gagal membuka detail: ${err.message}`)
    } finally {
      setBusyKey(null)
    }
  }

  const toggleGuide = async (actionId) => {
    if (guideActionId === actionId) {
      setGuideActionId(null)
      return
    }
    try {
      const guide = await window.api.capabilityGuide(detail.connector.id, actionId)
      setDetail((d) => ({
        ...d,
        guide: { ...d.guide, [actionId]: guide }
      }))
      setGuideActionId(actionId)
    } catch (err) {
      showToast(`Gagal memuat panduan: ${err.message}`)
    }
  }

  const runTestAction = async (actionId) => {
    let parsed
    try {
      parsed = JSON.parse(testArgs || '{}')
    } catch (e) {
      setTestResult({ ok: false, text: `JSON args tidak valid: ${e.message}` })
      return
    }
    setTestResult(null)
    setBusyKey(`${detail.connector.id}:run`)
    try {
      const out = await window.api.executeCapability(detail.connector.id, actionId, parsed, {
        sessionId: 'connectors_page'
      })
      setTestResult({ ok: true, text: JSON.stringify(out, null, 2) })
    } catch (err) {
      if (err.message.includes(APPROVAL_CODE) || err.message.includes('approval')) {
        setTestResult({
          ok: false,
          text: 'Aksi ini memerlukan persetujuan khusus. Gunakan Mark (agent) untuk mengeksekusinya — dialog persetujuan NATIVE akan muncul di layar.'
        })
      } else {
        setTestResult({ ok: false, text: err.message })
      }
    } finally {
      setBusyKey(null)
      await refreshAudit()
    }
  }

  const filtered = connectors.filter(
    (c) =>
      !search ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.id?.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-base-300 text-base-content flex items-center justify-center">
        <span className="loading loading-spinner text-primary w-12 h-12"></span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base-300 text-base-content relative flex flex-col p-6 h-screen animate-[holo-enter_0.3s_ease-out_forwards]">
      <ModalComponent />
      {/* Decorative Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-6 max-w-5xl mx-auto w-full shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="btn btn-circle btn-ghost">
            <FaArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <FaPlug className="text-primary" /> Connectors
            </h1>
            <p className="text-white/50 text-sm mt-1">
              Katalog kemampuan pluggable Mark — otorisasi scope, tes aksi, jejak audit.
            </p>
          </div>
        </div>
        <button
          onClick={() => loadData(true)}
          className="btn btn-ghost btn-circle"
          title="Muat ulang"
        >
          <FaSyncAlt size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto pr-2 pb-32 max-w-5xl mx-auto w-full space-y-6 custom-scrollbar">
        {/* Search */}
        <div className="relative">
          <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" size={14} />
          <input
            type="text"
            placeholder="Cari connector (nama, id, deskripsi)..."
            className="input input-bordered w-full pl-11 bg-base-100/60"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Catalog Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((connector) => {
            const conn = connections[connector.id]
            const connected = !!conn
            const connectionless = !connector.scopes?.length
            return (
              <div
                key={connector.id}
                className="card bg-base-100 border border-white/5 shadow-lg hover:border-primary/30 transition-colors"
              >
                <div className="card-body p-5 gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <FaPlug className="text-primary" size={16} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-white truncate">{connector.name}</h3>
                        <code className="text-[10px] text-white/40 font-mono">{connector.id}</code>
                      </div>
                    </div>
                    <span
                      className={`badge badge-sm shrink-0 font-semibold ${
                        connectionless
                          ? 'badge-ghost'
                          : connected
                            ? 'badge-success'
                            : 'badge-warning'
                      }`}
                    >
                      {connectionless ? 'BUILT-IN' : connected ? 'TERHUBUNG' : 'BELUM OTORISASI'}
                    </span>
                  </div>

                  <p className="text-sm opacity-70 line-clamp-2">{connector.description}</p>

                  {/* Scopes */}
                  {connector.scopes?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {connector.scopes.map((s) => (
                        <span
                          key={s}
                          className={`badge badge-outline badge-xs font-mono ${
                            connected ? 'badge-success/70' : 'badge-warning/70'
                          }`}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions count + connection info */}
                  <div className="text-xs opacity-60 flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <FaClipboardList size={11} /> {connector.actions?.length || 0} aksi
                    </span>
                    {connected && (
                      <span className="flex items-center gap-1.5">
                        <FaKey size={11} /> sejak {fmtTimeShort(conn.authorizedAt)}
                      </span>
                    )}
                  </div>

                  <div className="card-actions justify-end gap-2 mt-1">
                    <button
                      onClick={() => openDetail(connector)}
                      disabled={busyKey === `${connector.id}:detail`}
                      className="btn btn-sm btn-outline"
                    >
                      {busyKey === `${connector.id}:detail` ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        'Detail & Tes'
                      )}
                    </button>
                    {connectionless ? (
                      <button
                        onClick={() => handleAuthorize(connector)}
                        className="btn btn-sm btn-ghost"
                        title="Connection-less: tidak butuh koneksi"
                      >
                        <FaShieldAlt size={12} /> Connection-less
                      </button>
                    ) : connected ? (
                      <button
                        onClick={() => handleRevoke(connector)}
                        disabled={busyKey === `${connector.id}:revoke`}
                        className="btn btn-sm btn-error btn-outline"
                      >
                        <FaUnlock size={12} /> Cabut
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAuthorize(connector)}
                        disabled={busyKey === `${connector.id}:auth`}
                        className="btn btn-sm btn-primary"
                      >
                        {busyKey === `${connector.id}:auth` ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          <>
                            <FaLock size={12} /> Otorisasi
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center opacity-50 py-12">
            <FaPlug size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Tidak ada connector yang cocok dengan pencarian.</p>
          </div>
        )}

        {/* Audit Trail */}
        <div className="card bg-base-100 border border-white/5 shadow-lg">
          <div className="card-body p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="card-title text-lg flex items-center gap-2">
                <FaHistory className="text-info" /> Audit Trail
              </h2>
              <button
                onClick={refreshAudit}
                className="btn btn-ghost btn-sm btn-circle"
                title="Refresh audit"
              >
                <FaSyncAlt size={13} />
              </button>
            </div>
            {audit.length === 0 ? (
              <p className="text-sm opacity-50 py-4 text-center">
                Belum ada aktivitas connector. Setiap eksekusi/otorisasi akan tercatat di sini.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-xs">
                  <thead>
                    <tr className="text-xs text-white/50">
                      <th>Waktu</th>
                      <th>Operasi</th>
                      <th>Connector</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit
                      .slice()
                      .reverse()
                      .map((entry, i) => (
                        <tr key={i} className="hover:bg-white/5">
                          <td className="font-mono text-xs whitespace-nowrap opacity-70">
                            {fmtTime(entry.ts)}
                          </td>
                          <td className="font-mono text-xs">{entry.op}</td>
                          <td className="font-mono text-xs">{entry.connector || '-'}</td>
                          <td>{statusBadge(entry)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[10px] opacity-40 mt-3">
              Audit append-only JSONL di XDG data dir (maks 1MB, mode 0600). Tanpa telemetri — tidak
              ada data yang keluar dari mesin ini.
            </p>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl bg-base-100 border border-white/10">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="font-bold text-xl text-white flex items-center gap-2">
                  <FaPlug className="text-primary" /> {detail.connector.name}
                </h3>
                <p className="text-sm opacity-60 mt-1">{detail.inspect.description}</p>
              </div>
              <button onClick={() => setDetail(null)} className="btn btn-sm btn-circle btn-ghost">
                ✕
              </button>
            </div>

            {/* Actions + guides */}
            <div className="space-y-3">
              {detail.inspect.actions.map((action) => (
                <div key={action.id} className="border border-white/10 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between p-3 bg-base-200/50">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-white flex items-center gap-2">
                        <code className="text-primary font-mono text-xs">{action.id}</code>
                        <span className="opacity-70 font-normal truncate">{action.summary}</span>
                      </p>
                      {action.scopes?.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {action.scopes.map((s) => (
                            <span key={s} className="badge badge-outline badge-xs font-mono">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleGuide(action.id)}
                        className="btn btn-xs btn-ghost"
                        title="Panduan & schema"
                      >
                        <FaChevronDown
                          size={11}
                          className={`transition-transform ${guideActionId === action.id ? 'rotate-180' : ''}`}
                        />{' '}
                        Guide
                      </button>
                      <button
                        onClick={() => runTestAction(action.id)}
                        disabled={busyKey === `${detail.connector.id}:run`}
                        className="btn btn-xs btn-primary"
                      >
                        {busyKey === `${detail.connector.id}:run` ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          <>
                            <FaPlay size={9} /> Tes
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Guide (progressive disclosure) */}
                  {guideActionId === action.id && detail.guide?.[action.id] && (
                    <div className="p-3 border-t border-white/10 bg-base-200/30 space-y-2">
                      <p className="text-xs font-semibold opacity-70">Langkah:</p>
                      <ol className="list-decimal list-inside text-xs opacity-80 space-y-0.5">
                        {detail.guide[action.id].guide?.steps?.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                      {detail.guide[action.id].guide?.examples?.length > 0 && (
                        <>
                          <p className="text-xs font-semibold opacity-70 pt-1">Contoh args:</p>
                          <pre className="text-xs bg-base-300 rounded-lg p-2 overflow-x-auto font-mono">
                            {JSON.stringify(
                              detail.guide[action.id].guide.examples[0].args,
                              null,
                              2
                            )}
                          </pre>
                        </>
                      )}
                      <button
                        onClick={() =>
                          setTestArgs(
                            JSON.stringify(detail.guide[action.id].guide.examples[0].args, null, 0)
                          )
                        }
                        className="btn btn-xs btn-outline mt-1"
                      >
                        Pakai contoh ini
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Test args + result */}
            <div className="mt-4 space-y-2">
              <label className="label p-0">
                <span className="label-text font-bold text-sm">Test args (JSON)</span>
              </label>
              <textarea
                className="textarea textarea-bordered w-full font-mono text-xs h-20"
                value={testArgs}
                onChange={(e) => setTestArgs(e.target.value)}
                placeholder='{"command": "uname -a"}'
              />
              {testResult && (
                <div
                  className={`rounded-xl p-3 text-xs font-mono overflow-x-auto max-h-48 ${
                    testResult.ok
                      ? 'bg-success/10 border border-success/30'
                      : 'bg-error/10 border border-error/30'
                  }`}
                >
                  <p className="font-bold mb-1 flex items-center gap-1.5">
                    {testResult.ok ? (
                      <FaCheckCircle className="text-success" size={12} />
                    ) : (
                      <FaExclamationTriangle className="text-error" size={12} />
                    )}
                    {testResult.ok ? 'Hasil' : 'Gagal'}
                  </p>
                  <pre className="whitespace-pre-wrap">{testResult.text}</pre>
                </div>
              )}
            </div>

            <div className="modal-action">
              <button onClick={() => setDetail(null)} className="btn">
                Tutup
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setDetail(null)} />
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div className="toast toast-top toast-center z-[100]">
          <div className="alert alert-success shadow-lg">
            <FaCheckCircle className="text-xl" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}
