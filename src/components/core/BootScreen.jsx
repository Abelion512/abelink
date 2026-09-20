import { AppleHello } from './AppleHello.jsx'

export default function BootScreen({ showRecovery, onClearCache }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5">
      {/* Keputusan eksplisit: hello boot SELALU animasi walau OS reduced-motion. */}
      <AppleHello className="w-64 max-w-[70vw] text-white" />
      {showRecovery && (
        <div className="absolute bottom-10 flex flex-col items-center">
          <p className="text-xs text-white/60 mb-3 text-center max-w-xs">
            Proses pemuatan memakan waktu lebih lama dari biasanya. Jika terjebak, bersihkan cache
            model.
          </p>
          <button
            onClick={onClearCache}
            className="px-4 py-2 rounded-full border border-[#ff453a]/40 text-[#ff453a] hover:bg-[#ff453a] hover:text-white transition-all text-xs font-medium"
          >
            Hapus Cache Model &amp; Muat Ulang
          </button>
        </div>
      )}
    </div>
  )
}
