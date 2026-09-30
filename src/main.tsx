import './api/tauri-bridge'
import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { LiteModeProvider } from './contexts/LiteModeContext'

const rootEl = document.getElementById('root')
createRoot(rootEl as HTMLElement).render(
  <StrictMode>
    <LiteModeProvider>
      <App />
    </LiteModeProvider>
  </StrictMode>
)
