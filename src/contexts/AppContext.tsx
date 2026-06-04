'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface AppContextValue {
  // Filtri professionisti
  camillaSelezionata: boolean
  giacomoSelezionato: boolean
  toggleCamilla: () => void
  toggleGiacomo: () => void
  // Sidebar mobile
  sidebarMobileAperta: boolean
  apriSidebar: () => void
  chiudiSidebar: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [camillaSelezionata, setCamilla] = useState(true)
  const [giacomoSelezionato, setGiacomo] = useState(true)
  const [sidebarMobileAperta, setSidebarOpen] = useState(false)

  return (
    <AppContext.Provider
      value={{
        camillaSelezionata,
        giacomoSelezionato,
        toggleCamilla: () => setCamilla((v) => !v),
        toggleGiacomo: () => setGiacomo((v) => !v),
        sidebarMobileAperta,
        apriSidebar: () => setSidebarOpen(true),
        chiudiSidebar: () => setSidebarOpen(false),
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp deve essere usato dentro AppProvider')
  return ctx
}
