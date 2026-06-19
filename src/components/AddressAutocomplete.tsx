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

export interface AddressParts {
  via: string         // street + housenumber, es. "Via Roma 1"
  comune: string      // città
  provincia: string   // sigla provincia (es. "MI") quando estraibile, altrimenti vuota
  cap: string
  stato: string
}

interface Props {
  value: string
  onChange: (val: string) => void
  onSelectStructured?: (parts: AddressParts) => void
  placeholder?: string
}

// Tabella ricerca sigla provincia (Italia) a partire dal nome del capoluogo o area.
// Lista parziale ma copre i casi più frequenti — utenti possono editare a mano per gli altri.
const SIGLA_PROVINCIA: Record<string, string> = {
  agrigento: 'AG', alessandria: 'AL', ancona: 'AN', aosta: 'AO', arezzo: 'AR', ascoli: 'AP', asti: 'AT', avellino: 'AV',
  bari: 'BA', 'barletta-andria-trani': 'BT', belluno: 'BL', benevento: 'BN', bergamo: 'BG', biella: 'BI', bologna: 'BO',
  bolzano: 'BZ', brescia: 'BS', brindisi: 'BR', cagliari: 'CA', caltanissetta: 'CL', campobasso: 'CB', caserta: 'CE',
  catania: 'CT', catanzaro: 'CZ', chieti: 'CH', como: 'CO', cosenza: 'CS', cremona: 'CR', crotone: 'KR', cuneo: 'CN',
  enna: 'EN', fermo: 'FM', ferrara: 'FE', firenze: 'FI', foggia: 'FG', forlì: 'FC', 'forlì-cesena': 'FC', frosinone: 'FR',
  genova: 'GE', gorizia: 'GO', grosseto: 'GR', imperia: 'IM', isernia: 'IS', laquila: 'AQ', "l'aquila": 'AQ',
  laspezia: 'SP', "la spezia": 'SP', latina: 'LT', lecce: 'LE', lecco: 'LC', livorno: 'LI', lodi: 'LO', lucca: 'LU',
  macerata: 'MC', mantova: 'MN', massa: 'MS', 'massa-carrara': 'MS', matera: 'MT', messina: 'ME', milano: 'MI',
  modena: 'MO', 'monza e brianza': 'MB', 'monza-brianza': 'MB', napoli: 'NA', novara: 'NO', nuoro: 'NU',
  oristano: 'OR', padova: 'PD', palermo: 'PA', parma: 'PR', pavia: 'PV', perugia: 'PG', pesaro: 'PU', 'pesaro e urbino': 'PU',
  pescara: 'PE', piacenza: 'PC', pisa: 'PI', pistoia: 'PT', pordenone: 'PN', potenza: 'PZ', prato: 'PO',
  ragusa: 'RG', ravenna: 'RA', 'reggio calabria': 'RC', 'reggio emilia': 'RE', rieti: 'RI', rimini: 'RN', roma: 'RM',
  rovigo: 'RO', salerno: 'SA', sassari: 'SS', savona: 'SV', siena: 'SI', siracusa: 'SR', sondrio: 'SO',
  taranto: 'TA', teramo: 'TE', terni: 'TR', torino: 'TO', trapani: 'TP', trento: 'TN', treviso: 'TV', trieste: 'TS',
  udine: 'UD', varese: 'VA', venezia: 'VE', verbania: 'VB', 'verbano-cusio-ossola': 'VB', vercelli: 'VC',
  verona: 'VR', 'vibo valentia': 'VV', vicenza: 'VI', viterbo: 'VT',
}

function inferisciSiglaProvincia(stateOrCounty: string): string {
  const key = stateOrCounty.toLowerCase().trim()
  if (SIGLA_PROVINCIA[key]) return SIGLA_PROVINCIA[key]
  // Prova a pulire prefissi tipo "città metropolitana di"
  const clean = key.replace(/^(città metropolitana di|provincia di|provincia)\s+/i, '').trim()
  return SIGLA_PROVINCIA[clean] ?? ''
}

export default function AddressAutocomplete({ value, onChange, onSelectStructured, placeholder }: Props) {
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
    console.log('[AddressAutocomplete] cerca query:', q)
    try {
      const res = await fetch(`/api/address-search?q=${encodeURIComponent(q)}`)
      console.log('[AddressAutocomplete] response status:', res.status)
      const data = await res.json()
      console.log('[AddressAutocomplete] data:', data)
      const features = (data.features ?? []) as PhotonFeature[]
      const italiani = features.filter((f) => f.properties.countrycode === 'IT')
      const altri    = features.filter((f) => f.properties.countrycode !== 'IT')
      const ordinati = [...italiani, ...altri]
      console.log('[AddressAutocomplete] risultati ordinati:', ordinati.length)
      setRisultati(ordinati)
      setAperto(ordinati.length > 0)
    } catch (err) {
      console.error('[AddressAutocomplete] errore fetch:', err)
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
    if (onSelectStructured) {
      const p = f.properties
      const via = [p.street ?? p.name, p.housenumber].filter(Boolean).join(' ').trim()
      const comune = p.city ?? ''
      // Photon a volte mette il nome provincia in `state` o nella `name` quando l'address è generico.
      // Proviamo prima state, poi name come fallback.
      const provincia = inferisciSiglaProvincia(p.state ?? '') || inferisciSiglaProvincia(comune)
      onSelectStructured({
        via,
        comune,
        provincia,
        cap: p.postcode ?? '',
        stato: p.state ?? '',
      })
    }
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
