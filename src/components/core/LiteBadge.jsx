import { useState } from 'react'
import { useLiteMode } from '../../contexts/LiteModeContext'
import { FaLeaf } from 'react-icons/fa'

export default function LiteBadge() {
  const { isLite, totalRAMGB } = useLiteMode()
  const [dismissed, setDismissed] = useState(false)
  if (!isLite || dismissed) return null
  return (
    <button
      onClick={() => setDismissed(true)}
      className="fixed top-8 left-20 z-40 flex items-center gap-1.5 rounded-full bg-emerald-900/80 px-2.5 py-1 text-xs text-emerald-300 backdrop-blur-sm hover:bg-emerald-800/80"
      title={`RAM ${totalRAMGB}GB — fitur berat dioptimalkan otomatis`}
    >
      <FaLeaf size={10} />
      <span>Lite</span>
    </button>
  )
}
