import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { LiteModeProvider } from './contexts/LiteModeContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LiteModeProvider>
      <App />
    </LiteModeProvider>
  </StrictMode>
)
