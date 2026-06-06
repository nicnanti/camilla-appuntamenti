'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface PhotonFeature {
  properties: {
    name?: string
    street?: string
    housenumber?: string
    city?: string
    postcode?: string
    state?: string
    country?: string
    countrycode?: string
  }
}

function formatAddress(p: PhotonFeature['properties']): string {
  const parts: string[] = []
  const via = [p.street ?? p.name, p.housenumber].filter(Boolean).join(' ').trim()
  if (via) parts.push(via)
  if (p.city) parts.push(p.city)
  if (p.postcode) parts.push(p.postcode)
  if (p.state) parts.push(p.state)
  return parts.join(', ')
}

interface Props {
  value: string
  onChange: (val: string) => void
  placeholder?: string
}

export default function AddressAutocomplete({ value, onChange, placeholder }: Props) {
  const [risultati, setRisultati] = useState<PhotonFeature[]>([])
  const [aperto, setAperto] = useState(false)
  const [loading, setLoading] = useState(false)
  const refContainer = useRef<HTMLDivElement>(null)
  const sopprimiSearch = useRef(false)

  // Chiudi dropdown su click esterno
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (refContainer.current && !refContainer.current.contains(e.target as Node)) {
        setAperto(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const cerca = useCallback(async (q: string) => {
    if (q.length < 3) {
      setRisultati([])
      setAperto(false)
      return
    }
    setLoading(true)
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=it&limit=5&bbox=6.6,35.5,18.5,47.1`
      const res = await fetch(url)
      const data = await res.json()
      const features = (data.features ?? []) as PhotonFeature[]
      // Priorità ai risultati italiani
      const italiani = features.filter((f) => f.properties.countrycode === 'IT')
      const altri    = features.filter((f) => f.properties.countrycode !== 'IT')
      const ordinati = [...italiani, ...altri]
      setRisultati(ordinati)
      setAperto(ordinati.length > 0)
    } catch {
      setRisultati([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce 300ms
  useEffect(() => {
    if (sopprimiSearch.current) {
      sopprimiSearch.current = false
      return
    }
    const timer = setTimeout(() => cerca(value), 300)
    return () => clearTimeout(timer)
  }, [value, cerca])

  const seleziona = (f: PhotonFeature) => {
    const addr = formatAddress(f.properties)
    sopprimiSearch.current = true // evita che il debounce ri-cerchi sul nuovo valore
    onChange(addr)
    setAperto(false)
    setRisultati([])
  }

  return (
    <div ref={refContainer} className="relative">
      <div className="relative">
        <input
          type="text"
          className="w-full text-sm text-[#1A1A1A] placeholder-gray-400 bg-transparent focus:outline-none pr-7"
          placeholder={placeholder ?? 'Indirizzo (opzionale)'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
          {risultati.map((f, i) => {
            const testo = formatAddress(f.properties)
            return (
              <button
                key={i}
                type="button"
                onClick={() => seleziona(f)}
                className="w-full px-4 py-2.5 hover:bg-[#FAFAFA] transition-colors text-left border-b border-[#F3F4F6] last:border-b-0"
              >
                <p className="text-sm text-[#1A1A1A]">{testo}</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
