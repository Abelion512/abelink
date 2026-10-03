import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Home } from './Home'
import { fetchSnapshot, type Snapshot } from './api'

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  useEffect(() => {
    fetchSnapshot().then(setSnapshot).catch(() => setSnapshot(null))
  }, [])
  return <Home snapshot={snapshot} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
