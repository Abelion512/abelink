import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface LiteModeState {
  isLite: boolean
  totalRAMGB: number | null
  loading: boolean
}

const LiteModeContext = createContext<LiteModeState>({ isLite: false, totalRAMGB: null, loading: true })

export function LiteModeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LiteModeState>({ isLite: false, totalRAMGB: null, loading: true })

  useEffect(() => {
    let mounted = true
    type LiteInfo = { isLite?: boolean; totalRAMGB?: number | null }
    const bridge = (window as unknown as {
      api?: {
        getLiteMode?: () => Promise<LiteInfo>
        onLiteModeChanged?: (cb: (info: LiteInfo) => void) => (() => void) | undefined
      }
    }).api
    bridge?.getLiteMode?.()
      .then((info) => mounted && setState({ isLite: !!info.isLite, totalRAMGB: info.totalRAMGB ?? null, loading: false }))
      .catch(() => mounted && setState({ isLite: false, totalRAMGB: null, loading: false }))
    const cleanup = bridge?.onLiteModeChanged?.((info) =>
      mounted && setState({ isLite: !!info.isLite, totalRAMGB: info.totalRAMGB ?? null, loading: false })
    )
    return () => { mounted = false; cleanup?.() }
  }, [])

  return <LiteModeContext.Provider value={state}>{children}</LiteModeContext.Provider>
}

export function useLiteMode() {
  return useContext(LiteModeContext)
}
