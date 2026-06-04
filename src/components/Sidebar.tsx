'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { useApp } from '@/contexts/AppContext'

const navigazione = [
  {
    href: '/',
    label: 'Calendario',
    icona: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    href: '/nuovo',
    label: 'Nuovo Appuntamento',
    icona: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="16"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
    ),
  },
  {
    href: '/contatti',
    label: 'Contatti',
    icona: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
]

function CheckboxCalendario({
  attivo,
  colore,
  label,
  onChange,
}: {
  attivo: boolean
  colore: string
  label: string
  onChange: () => void
}) {
  return (
    <button
      onClick={onChange}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-white/10 transition-colors w-full text-left min-h-[44px]"
    >
      <span
        className={clsx(
          'w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors',
          attivo ? 'bg-white border-white' : 'border-white/40',
        )}
      >
        {attivo && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={colore} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>
      <span className={clsx('w-2 h-2 rounded-full', colore === '#3B82F6' ? 'bg-blue-400' : 'bg-emerald-400')} />
      <span>{label}</span>
    </button>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const {
    camillaSelezionata,
    giacomoSelezionato,
    toggleCamilla,
    toggleGiacomo,
    sidebarMobileAperta,
    chiudiSidebar,
  } = useApp()

  return (
    <aside
      className={clsx(
        'bg-[#1E3A5F] flex flex-col h-full flex-shrink-0',
        // Desktop: sidebar sempre visibile, 240px
        'md:flex md:w-60 md:static',
        // Mobile: hidden di default, full-screen overlay quando aperta
        sidebarMobileAperta
          ? 'fixed inset-0 z-50 w-full flex'
          : 'hidden',
      )}
    >
      {/* Header */}
      <div className="px-6 py-7 border-b border-white/10 flex items-center justify-between">
        <div>
          <p className="text-white/50 text-xs font-medium uppercase tracking-widest mb-1">Studio</p>
          <h1 className="text-white font-serif text-xl leading-tight">
            Camilla<br />Appuntamenti
          </h1>
        </div>
        {/* Close button — solo mobile */}
        <button
          onClick={chiudiSidebar}
          aria-label="Chiudi menu"
          className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center text-white/70 hover:text-white"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Navigazione principale */}
      <nav className="px-3 py-4 space-y-1">
        {navigazione.map((item) => {
          const attivo =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={chiudiSidebar}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 min-h-[44px]',
                attivo
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              )}
            >
              <span className={clsx(attivo ? 'text-white' : 'text-white/50')}>
                {item.icona}
              </span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Filtri calendari */}
      <div className="px-3 py-4 border-t border-white/10">
        <p className="px-3 text-white/40 text-xs font-medium uppercase tracking-wider mb-2">Calendari</p>
        <div className="space-y-0.5">
          <CheckboxCalendario
            attivo={camillaSelezionata}
            colore="#3B82F6"
            label="Camilla"
            onChange={toggleCamilla}
          />
          <CheckboxCalendario
            attivo={giacomoSelezionato}
            colore="#10B981"
            label="Giacomo"
            onChange={toggleGiacomo}
          />
        </div>
      </div>

      {/* Impostazioni in basso */}
      <div className="mt-auto px-3 py-4 border-t border-white/10">
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:text-white hover:bg-white/10 transition-all duration-150 w-full min-h-[44px]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
          </svg>
          Impostazioni
        </button>
      </div>
    </aside>
  )
}
