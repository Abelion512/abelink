import { useState } from 'react'
import { useLiteMode } from '../../contexts/LiteModeContext'
import { Leaf } from 'lucide-react'

export default function LiteBadge() {
  const { isLite, totalRAMGB } = useLiteMode()
  const [dismissed, setDismissed] = useState(false)
  if (!isLite || dismissed) return null
  return (
    <button
      onClick={() => setDismissed(true)}
      className="fixed top-8 left-20 z-40 flex items-center gap-1.5 rounded-full bg-primary/20 px-2.5 py-1 text-xs text-primary backdrop-blur-sm hover:bg-primary/30 border border-primary/30"
      title={`RAM ${totalRAMGB}GB — fitur berat dioptimalkan otomatis`}
    >
      <Leaf size={10} />
      <span>Lite</span>
    </button>
  )
}
