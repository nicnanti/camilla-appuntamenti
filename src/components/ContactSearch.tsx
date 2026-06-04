'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Contatto } from '@/types'

interface Props {
  value: string
  onChange: (nome: string, telefono: string, dettagli: string, indirizzo: string) => void
}

function componiIndirizzo(c: Contatto): string {
  const via      = (c.indirizzo  ?? '').trim()
  const comune   = (c.comune     ?? '').trim()
  const prov     = (c.provincia  ?? '').trim()

  const parti: string[] = []
  if (via) parti.push(via)
  if (comune) {
    parti.push(prov ? `${comune} (${prov})` : comune)
  } else if (prov) {
    parti.push(`(${prov})`)
  }
  return parti.join(', ')
}

export default function ContactSearch({ value, onChange }: Props) {
  const [query, setQuery] = useState(value)
  const [risultati, setRisultati] = useState<Contatto[]>([])
  const [aperto, setAperto] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selezionato, setSelezionato] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Chiudi dropdown se click fuori
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAperto(false)
      }
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
    if (selezionato) return
    const timer = setTimeout(() => cerca(query), 300)
    return () => clearTimeout(timer)
  }, [query, cerca, selezionato])

  const formattaNome = (contatto: Contatto): string => {
    if (contatto.nome_completo) return contatto.nome_completo.toUpperCase()
    const base = `${contatto.cognome.toUpperCase()} ${contatto.nome.toUpperCase()}`
    return contatto.dettagli ? `${base} — ${contatto.dettagli}` : base
  }

  const seleziona = (contatto: Contatto) => {
    const nomeFormattato = formattaNome(contatto)
    const indirizzo = componiIndirizzo(contatto)
    setQuery(nomeFormattato)
    setSelezionato(true)
    setAperto(false)
    onChange(nomeFormattato, contatto.telefono, contatto.dettagli ?? '', indirizzo)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setSelezionato(false)
    if (!e.target.value) onChange('', '', '', '')
    else onChange(e.target.value, '', '', '')
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          className="input-field pr-10"
          placeholder="Cerca per nome, cognome o dettagli..."
          value={query}
          onChange={handleChange}
          onFocus={() => {
            if (risultati.length > 0) setAperto(true)
          }}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-[#3B82F6]/30 border-t-[#3B82F6] rounded-full animate-spin" />
          </div>
        )}
        {!loading && selezionato && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        )}
      </div>

      {/* Dropdown risultati */}
      {aperto && risultati.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-card z-20 overflow-hidden max-h-[280px] overflow-y-auto">
          {risultati.map((contatto) => (
            <button
              key={contatto.id}
              type="button"
              onClick={() => seleziona(contatto)}
              className="w-full px-4 py-3 hover:bg-[#FAFAFA] transition-colors text-left border-b border-[#F3F4F6] last:border-b-0"
            >
              <p className="text-sm font-medium text-[#1A1A1A]">
                {contatto.cognome.toUpperCase()} {contatto.nome.toUpperCase()}
                {contatto.dettagli && (
                  <span className="font-normal text-gray-400"> — {contatto.dettagli}</span>
                )}
              </p>
              {contatto.telefono && (
                <p className="text-xs text-gray-400 mt-0.5">{contatto.telefono}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Nessun risultato */}
      {aperto && !loading && risultati.length === 0 && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-card z-20 p-4 text-center">
          <p className="text-sm text-gray-400">Nessun contatto trovato per "{query}"</p>
        </div>
      )}
    </div>
  )
}
