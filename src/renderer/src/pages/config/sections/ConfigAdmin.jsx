// Section: WhatsApp Bot admin settings (pending requests, approved admins)
import { saveConfiguration } from '../../../api/db'

export default function ConfigAdmin({ config, setConfig }) {
  const handleApproveAdmin = async (admin) => {
    const currentAdmins = config.waAdminNumber ? config.waAdminNumber.split(',').map((n) => n.trim()) : []
    if (!currentAdmins.includes(admin.id)) currentAdmins.push(admin.id)
    const newPending = config.waPendingAdmins.filter((p) => p.id !== admin.id)
    const newApproved = [...(config.waApprovedAdmins || []), admin]
    const newConfig = { ...config, waAdminNumber: currentAdmins.join(', '), waPendingAdmins: newPending, waApprovedAdmins: newApproved }
    setConfig(newConfig)
    await saveConfiguration(newConfig)
    if (window.api && window.api.syncConfig) window.api.syncConfig(newConfig)
    if (window.api && window.api.sendWaMessage) {
      window.api.sendWaMessage(admin.jid, `🎉 Selamat *${admin.name}*! Akses Admin kamu telah disetujui. Sekarang kamu bisa memiliki akses pada fitur khusus tertentu.`)
    }
  }

  const handleRejectAdmin = async (admin) => {
    const newPending = config.waPendingAdmins.filter((p) => p.id !== admin.id)
    const newConfig = { ...config, waPendingAdmins: newPending }
    setConfig(newConfig)
    await saveConfiguration(newConfig)
    if (window.api && window.api.sendWaMessage) {
      window.api.sendWaMessage(admin.jid, `Maaf *${admin.name}*, permintaan akses Admin kamu ditolak oleh Owner.`)
    }
  }

  const handleRemoveApprovedAdmin = async (admin) => {
    const currentAdmins = config.waAdminNumber ? config.waAdminNumber.split(',').map((n) => n.trim()).filter(Boolean) : []
    const newAdmins = currentAdmins.filter((a) => a !== admin.id)
    const newApproved = (config.waApprovedAdmins || []).filter((a) => a.id !== admin.id)
    const newConfig = { ...config, waAdminNumber: newAdmins.join(', '), waApprovedAdmins: newApproved }
    setConfig(newConfig)
    await saveConfiguration(newConfig)
    if (window.api && window.api.syncConfig) window.api.syncConfig(newConfig)
    if (window.api && window.api.sendWaMessage && admin.jid) {
      window.api.sendWaMessage(admin.jid, `⚠️ *Pemberitahuan:* Akses Admin kamu telah dicabut oleh Owner.`)
    }
  }

  const handleRemoveLegacyAdmin = async (cleanId) => {
    const currentAdmins = config.waAdminNumber.split(',').map((n) => n.trim()).filter(Boolean)
    const newAdmins = currentAdmins.filter((a) => a !== cleanId)
    const newConfig = { ...config, waAdminNumber: newAdmins.join(', ') }
    setConfig(newConfig)
    await saveConfiguration(newConfig)
    if (window.api && window.api.syncConfig) window.api.syncConfig(newConfig)
    if (window.api && window.api.sendWaMessage) {
      const guessedJid = cleanId.length > 14 ? `${cleanId}@lid` : `${cleanId}@s.whatsapp.net`
      window.api.sendWaMessage(guessedJid, `⚠️ *Pemberitahuan:* Akses Admin kamu telah dicabut oleh Owner.`)
    }
  }

  return (
    <section id="tour-wa-admin" className="space-y-5 p-2 -mx-2 glass glass-hover">
      <h2 className="text-base font-bold uppercase tracking-wider opacity-70">
        WhatsApp Bot Settings
      </h2>

      {/* Pending Admin Requests */}
      {config.waPendingAdmins && config.waPendingAdmins.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-warning">Permintaan Akses Admin Baru</p>
          <div className="space-y-2">
            {config.waPendingAdmins.map((admin, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-lg border border-warning/30"
                style={{background: 'var(--glass-bg)'}}
              >
                <div>
                  <p className="font-bold text-sm">{admin.name}</p>
                  <p className="text-xs opacity-50">{admin.id}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-xs btn-success text-white"
                    onClick={() => handleApproveAdmin(admin)}
                  >
                    Setujui
                  </button>
                  <button
                    className="btn btn-xs btn-error text-white"
                    onClick={() => handleRejectAdmin(admin)}
                  >
                    Tolak
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 mt-4">
        <p className="text-sm font-semibold">Daftar Admin Aktif</p>
        {(!config.waAdminNumber || config.waAdminNumber.trim() === '') &&
        (!config.waApprovedAdmins || config.waApprovedAdmins.length === 0) ? (
          <div className="text-xs opacity-50 italic">
            Belum ada admin yang terdaftar. Ketik /register di WA.
          </div>
        ) : (
          <div className="space-y-2">
            {/* Tampilkan data dari waApprovedAdmins (yang ada nama kontaknya) */}
            {(config.waApprovedAdmins || []).map((admin, idx) => (
              <div
                key={`appr-${idx}`}
                className="flex items-center justify-between p-3 rounded-lg border border-success/30"
                style={{background: 'var(--glass-bg)'}}
              >
                <div>
                  <p className="font-bold text-sm text-success">{admin.name}</p>
                  <p className="text-xs opacity-50">{admin.id}</p>
                </div>
                <button
                  onClick={() => handleRemoveApprovedAdmin(admin)}
                  className="btn btn-xs btn-error text-white"
                >
                  Hapus
                </button>
              </div>
            ))}

            {/* Tampilkan data legacy dari waAdminNumber yang gak ada di waApprovedAdmins */}
            {config.waAdminNumber &&
              config.waAdminNumber.split(',').map((id, idx) => {
                const cleanId = id.trim()
                if (!cleanId) return null
                const isAlreadyShown = (config.waApprovedAdmins || []).find(
                  (a) => a.id === cleanId
                )
                if (isAlreadyShown) return null

                return (
                  <div
                    key={`leg-${idx}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-success/30"
                    style={{background: 'var(--glass-bg)'}}
                  >
                    <div>
                      <p className="font-bold text-sm text-success">Admin (Manual)</p>
                      <p className="text-xs opacity-50">{cleanId}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveLegacyAdmin(cleanId)}
                      className="btn btn-xs btn-error text-white"
                    >
                      Hapus
                    </button>
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </section>
  )
}
