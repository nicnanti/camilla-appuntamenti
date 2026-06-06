'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Contatto, Invitato } from '@/types'

interface Props {
  invitati: Invitato[]
  onAggiungi: (inv: Invitato) => void
  onRimuovi: (index: number) => void
}

export default function InvitatiPicker({ invitati, onAggiungi, onRimuovi }: Props) {
  const [query, setQuery] = useState('')
  const [risultati, setRisultati] = useState<Contatto[]>([])
  const [aperto, setAperto] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAperto(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const cerca = useCallback(async (q: string) => {
    if (q.length < 2) {
      setRisultati([])
      setAperto(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/contatti/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setRisultati(Array.isArray(data) ? data : [])
      setAperto(true)
    } catch {
      setRisultati([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => cerca(query), 300)
    return () => clearTimeout(timer)
  }, [query, cerca])

  const seleziona = (c: Contatto) => {
    const nome = (c.nome_completo && c.nome_completo.trim())
      || `${c.cognome.toUpperCase()} ${c.nome.toUpperCase()}`.trim()
    // Evita duplicati per telefono
    if (c.telefono && invitati.some((i) => i.telefono === c.telefono)) {
      setQuery('')
      setAperto(false)
      return
    }
    onAggiungi({ nome, telefono: c.telefono ?? '', email: c.email })
    setQuery('')
    setRisultati([])
    setAperto(false)
  }

  return (
    <div className="space-y-2">
      {/* Lista chip degli invitati già selezionati */}
      {invitati.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {invitati.map((inv, i) => (
            <span
              key={`${inv.telefono}-${i}`}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs text-blue-800 max-w-full"
            >
              <span className="truncate">{inv.nome}</span>
              <button
                type="button"
                onClick={() => onRimuovi(i)}
                className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-blue-100 text-blue-600 transition-colors flex-shrink-0"
                aria-label={`Rimuovi ${inv.nome}`}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Campo di ricerca */}
      <div ref={ref} className="relative">
        <div className="relative">
          <input
            type="text"
            className="w-full text-sm text-[#1A1A1A] placeholder-gray-400 bg-transparent focus:outline-none pr-7"
            placeholder="Aggiungi invitato..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (risultati.length > 0) setAperto(true) }}
          />
          {loading && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <div className="w-3.5 h-3.5 border-2 border-[#3B82F6]/30 border-t-[#3B82F6] rounded-full animate-spin" />
            </div>
          )}
        </div>

        {aperto && risultati.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-card z-30 overflow-hidden max-h-[280px] overflow-y-auto">
            {risultati.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => seleziona(c)}
                className="w-full px-4 py-3 hover:bg-[#FAFAFA] transition-colors text-left border-b border-[#F3F4F6] last:border-b-0"
              >
                <p className="text-sm font-medium text-[#1A1A1A]">
                  {c.cognome.toUpperCase()} {c.nome.toUpperCase()}
                </p>
                {c.telefono && (
                  <p className="text-xs text-gray-400 mt-0.5">{c.telefono}</p>
                )}
              </button>
            ))}
          </div>
        )}

        {aperto && !loading && risultati.length === 0 && query.length >= 2 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-card z-30 p-3 text-center">
            <p className="text-xs text-gray-400">Nessun contatto trovato</p>
          </div>
        )}
      </div>
    </div>
  )
}
