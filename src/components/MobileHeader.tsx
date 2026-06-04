'use client'

import { useApp } from '@/contexts/AppContext'

export default function MobileHeader() {
  const { apriSidebar } = useApp()

  return (
    <header className="md:hidden flex items-center justify-between px-4 h-14 bg-white border-b border-[#E5E7EB] flex-shrink-0">
      <button
        onClick={apriSidebar}
        aria-label="Apri menu"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2 text-[#1A1A1A]"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <span className="font-serif text-base text-[#1A1A1A]">Studio Ghisleni</span>
      <div className="w-[44px]" />
    </header>
  )
}
