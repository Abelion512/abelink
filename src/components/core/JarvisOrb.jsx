// ponytail: wrapper tipis ke OrbVisualizer CSS (three.js dep dihapus).
// API kompatibel: { status, intensity, size } — size piksel diskala ke hero/normal.

import OrbVisualizer from './OrbVisualizer'

export default function JarvisOrb({ status = 'idle', intensity = 0, size = 540 }) {
  const px = typeof size === 'number' ? size : 540
  return (
    <div style={{ width: px, height: px, maxWidth: '100%', maxHeight: '100%' }} className="flex items-center justify-center">
      <OrbVisualizer status={status} intensity={intensity} size={px >= 400 ? 'hero' : 'normal'} />
    </div>
  )
}
