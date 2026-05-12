'use client'

import { useState } from 'react'

const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]
const GIORNI_HEADER = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

interface Props {
  value: string        // YYYY-MM-DD
  min?: string         // YYYY-MM-DD
  onChange: (data: string) => void
  errore?: boolean
}

function parseData(s: string): { anno: number; mese: number; giorno: number } | null {
  if (!s) return null
  const [a, m, g] = s.split('-').map(Number)
  return { anno: a, mese: m, giorno: g }
}

function formatData(anno: number, mese: number, giorno: number): string {
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`
}

export default function DatePicker({ value, min, onChange, errore }: Props) {
  const oggi = new Date()
  const parsed = parseData(value)

  const [viewAnno, setViewAnno] = useState(parsed?.anno ?? oggi.getFullYear())
  const [viewMese, setViewMese] = useState(parsed?.mese ?? oggi.getMonth() + 1)

  const minParsed = parseData(min ?? '')

  function isDisabled(anno: number, mese: number, giorno: number): boolean {
    if (!minParsed) return false
    const s = formatData(anno, mese, giorno)
    return s < formatData(minParsed.anno, minParsed.mese, minParsed.giorno)
  }

  function isOggi(anno: number, mese: number, giorno: number): boolean {
    return anno === oggi.getFullYear() && mese === oggi.getMonth() + 1 && giorno === oggi.getDate()
  }

  function isSelezionato(anno: number, mese: number, giorno: number): boolean {
    return !!parsed && parsed.anno === anno && parsed.mese === mese && parsed.giorno === giorno
  }

  // Primo giorno del mese: 0=Dom … 6=Sab → converti a lunedì=0
  const primoGiorno = new Date(viewAnno, viewMese - 1, 1).getDay()
  const offsetLunedi = (primoGiorno + 6) % 7 // Mon=0 … Sun=6
  const giorniNelMese = new Date(viewAnno, viewMese, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(offsetLunedi).fill(null),
    ...Array.from({ length: giorniNelMese }, (_, i) => i + 1),
  ]
  // Completa l'ultima settimana
  while (cells.length % 7 !== 0) cells.push(null)

  function mesePrecedente() {
    if (viewMese === 1) { setViewMese(12); setViewAnno(viewAnno - 1) }
    else setViewMese(viewMese - 1)
  }

  function meseSeguente() {
    if (viewMese === 12) { setViewMese(1); setViewAnno(viewAnno + 1) }
    else setViewMese(viewMese + 1)
  }

  function seleziona(giorno: number) {
    const s = formatData(viewAnno, viewMese, giorno)
    if (isDisabled(viewAnno, viewMese, giorno)) return
    onChange(s)
  }

  return (
    <div className={`select-none ${errore ? 'ring-1 ring-red-300 rounded-xl' : ''}`}>
      {/* Navigazione mese */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={mesePrecedente}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F0F4F8] text-gray-400 hover:text-[#1E3A5F] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <span className="font-serif text-base text-[#1A1A1A]">
          {MESI[viewMese - 1]} {viewAnno}
        </span>

        <button
          type="button"
          onClick={meseSeguente}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F0F4F8] text-gray-400 hover:text-[#1E3A5F] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      {/* Header giorni */}
      <div className="grid grid-cols-7 mb-1">
        {GIORNI_HEADER.map((g, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider py-0.5">
            {g}
          </div>
        ))}
      </div>

      {/* Griglia giorni */}
      <div className="grid grid-cols-7">
        {cells.map((giorno, i) => {
          if (!giorno) return <div key={i} />

          const sel = isSelezionato(viewAnno, viewMese, giorno)
          const dis = isDisabled(viewAnno, viewMese, giorno)
          const oggi_ = isOggi(viewAnno, viewMese, giorno)

          return (
            <button
              key={i}
              type="button"
              disabled={dis}
              onClick={() => seleziona(giorno)}
              className={[
                'mx-auto flex items-center justify-center w-8 h-8 rounded-lg text-sm font-medium transition-all duration-150',
                sel
                  ? 'bg-[#1E3A5F] text-white'
                  : dis
                  ? 'text-gray-300 cursor-not-allowed'
                  : oggi_
                  ? 'border border-[#1E3A5F] text-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white'
                  : 'text-[#1A1A1A] hover:bg-[#F0F4F8]',
              ].join(' ')}
            >
              {giorno}
            </button>
          )
        })}
      </div>
    </div>
  )
}
