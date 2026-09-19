import { MotionConfig } from 'motion/react'
import { AppleHello } from './AppleHello.jsx'

export default function BootScreen({ showRecovery, onClearCache }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5">
      {/* Keputusan eksplisit: hello boot SELALU animasi walau OS reduced-motion. */}
      <MotionConfig reducedMotion="never">
        <AppleHello className="w-64 max-w-[70vw] text-white" />
      </MotionConfig>
      {showRecovery && (
        <div className="absolute bottom-10 flex flex-col items-center">
          <p className="text-xs text-white/60 mb-3 text-center max-w-xs">
            Proses pemuatan memakan waktu lebih lama dari biasanya. Jika terjebak, bersihkan cache
            model.
          </p>
          <button onClick={onClearCache} className="btn btn-outline btn-error btn-sm">
            Hapus Cache Model & Muat Ulang
          </button>
        </div>
      )}
    </div>
  )
}
