import { createContext, useContext, useEffect, useState } from 'react'

const LiteModeContext = createContext({ isLite: false, totalRAMGB: null, loading: true })

export function LiteModeProvider({ children }) {
  const [state, setState] = useState({ isLite: false, totalRAMGB: null, loading: true })

  useEffect(() => {
    let mounted = true
    window.api.getLiteMode?.()
      .then((info) => mounted && setState({ ...info, loading: false }))
      .catch(() => mounted && setState({ isLite: false, totalRAMGB: null, loading: false }))
    const cleanup = window.api.onLiteModeChanged?.((info) =>
      mounted && setState({ ...info, loading: false })
    )
    return () => { mounted = false; cleanup?.() }
  }, [])

  return <LiteModeContext.Provider value={state}>{children}</LiteModeContext.Provider>
}

export function useLiteMode() {
  return useContext(LiteModeContext)
}
