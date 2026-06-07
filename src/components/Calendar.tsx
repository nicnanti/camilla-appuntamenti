'use client'

import { useState, useEffect, useCallback } from 'react'
import clsx from 'clsx'
import AppointmentModal from './AppointmentModal'
import { useApp } from '@/contexts/AppContext'
import type { Appuntamento } from '@/types'

const GIORNI_SETTIMANA = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

// Estrae i professionisti coinvolti (Camilla, Giacomo) sia dal campo professionista
// sia dalle chiavi del gcalId JSON sia dalle email nei guests.
const EMAIL_CAMILLA = 'camilla.ghisleni1@gmail.com'
const EMAIL_GIACOMO = 'giacomo.ghisleni1@gmail.com'

function profCoinvolti(app: Appuntamento): { camilla: boolean; giacomo: boolean } {
  const prof = (app.professionista ?? '').toLowerCase()
  let camilla = prof === 'camilla'
  let giacomo = prof === 'giacomo'

  // Chiavi del gcalId JSON
  try {
    const parsed = JSON.parse(app.google_calendar_event_id ?? '')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !parsed.eventId) {
      if (parsed.camilla) camilla = true
      if (parsed.giacomo) giacomo = true
    }
  } catch {}

  // Guests email
  const guests = (app.guests ?? '').toLowerCase()
  if (guests.includes(EMAIL_CAMILLA)) camilla = true
  if (guests.includes(EMAIL_GIACOMO)) giacomo = true

  return { camilla, giacomo }
}

// Ruolo del professionista in un appuntamento: 'host' (principale) | 'guest' | null
export type RuoloProf = 'host' | 'guest' | null

export function ruoloProf(app: Appuntamento, prof: 'camilla' | 'giacomo'): RuoloProf {
  const coinvolti = profCoinvolti(app)
  if (!coinvolti[prof]) return null
  const host = (app.professionista ?? '').toLowerCase()
  if (!host) return 'guest'
  return host === prof ? 'host' : 'guest'
}

// Colori chip/dot — quando il filtro è su un singolo prof, distingue host/guest;
// in vista "Entrambi" usa la palette completa (blu / verde / ambra).
function getColoriApp(
  app: Appuntamento,
  filtroSingolo: 'camilla' | 'giacomo' | null,
): { dot: string; chip: string; isGuest: boolean } {
  if (filtroSingolo) {
    const ruolo = ruoloProf(app, filtroSingolo)
    if (ruolo === 'guest') {
      if (filtroSingolo === 'camilla') {
        return {
          dot: 'bg-blue-300',
          chip: 'bg-blue-50/60 text-blue-700 border border-dashed border-blue-400',
          isGuest: true,
        }
      }
      return {
        dot: 'bg-emerald-300',
        chip: 'bg-emerald-50/60 text-emerald-700 border border-dashed border-emerald-400',
        isGuest: true,
      }
    }
    // host (o default)
    if (filtroSingolo === 'camilla') {
      return { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-800 border-blue-200', isGuest: false }
    }
    return { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-800 border-emerald-200', isGuest: false }
  }

  // Vista "Entrambi" — logica colori esistente
  const { camilla, giacomo } = profCoinvolti(app)
  if (camilla && giacomo) {
    return { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 border-amber-200', isGuest: false }
  }
  if (giacomo) {
    return { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-800 border-emerald-200', isGuest: false }
  }
  return { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-800 border-blue-200', isGuest: false }
}

const LEGENDA = [
  { label: 'Camilla', dot: 'bg-blue-500' },
  { label: 'Giacomo', dot: 'bg-emerald-500' },
  { label: 'Entrambi', dot: 'bg-amber-500' },
]

interface GiornataSidebarProps {
  data: Date
  appuntamenti: Appuntamento[]
  filtroSingolo: 'camilla' | 'giacomo' | null
  onSeleziona: (app: Appuntamento) => void
  onChiudi: () => void
}

function GiornataSidebar({ data, appuntamenti, filtroSingolo, onSeleziona, onChiudi }: GiornataSidebarProps) {
  const oreVisibili = Array.from({ length: 13 }, (_, i) => i + 8) // 8-20

  const formatOra = (h: number) => `${String(h).padStart(2, '0')}:00`

  const appPerOra = (ora: number) =>
    appuntamenti.filter((a) => {
      const [h] = a.ora_inizio.split(':').map(Number)
      return h === ora && a.stato !== 'Cancellato'
    })

  return (
    <div className="md:w-80 md:flex-shrink-0 md:relative md:border-l md:border-[#E5E7EB] md:inset-auto fixed inset-0 z-40 bg-white flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB]">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">
            {GIORNI_SETTIMANA[(data.getDay() + 6) % 7]}
          </p>
          <p className="font-serif text-2xl text-[#1A1A1A]">
            {data.getDate()} {MESI[data.getMonth()]}
          </p>
        </div>
        <button
          onClick={onChiudi}
          className="text-gray-400 hover:text-gray-600 p-1 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {oreVisibili.map((h) => {
          const apps = appPerOra(h)
          return (
            <div key={h} className="flex border-b border-[#F3F4F6] min-h-[56px]">
              <div className="w-14 flex-shrink-0 px-3 py-2">
                <span className="text-xs text-gray-300">{formatOra(h)}</span>
              </div>
              <div className="flex-1 p-1.5 space-y-1">
                {apps.map((app) => {
                  const colori = getColoriApp(app, filtroSingolo)
                  return (
                  <button
                    key={app.id}
                    onClick={() => onSeleziona(app)}
                    className={clsx(
                      'w-full text-left px-2.5 py-2 rounded-lg border text-xs font-medium transition-all hover:shadow-soft',
                      colori.chip
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold truncate">{app.cliente_nome}</p>
                      {colori.isGuest && (
                        <span className="text-[9px] uppercase tracking-wider opacity-80 px-1.5 py-0.5 rounded-full border border-current">
                          ospite
                        </span>
                      )}
                    </div>
                    <p className="opacity-70">{app.ora_inizio} – {app.ora_fine}</p>
                  </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {appuntamenti.filter(a => a.stato !== 'Cancellato').length === 0 && (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <p className="text-sm text-gray-400">Nessun appuntamento</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Calendar() {
  const oggi = new Date()
  const [meseCorrente, setMeseCorrente] = useState(new Date(oggi.getFullYear(), oggi.getMonth(), 1))
  const [appuntamenti, setAppuntamenti] = useState<Appuntamento[]>([])
  const [loading, setLoading] = useState(true)
  const [giornoSelezionato, setGiornoSelezionato] = useState<Date | null>(null)
  const [appSelezionato, setAppSelezionato] = useState<Appuntamento | null>(null)

  const { camillaSelezionata, giacomoSelezionato } = useApp()

  const meseStr = `${meseCorrente.getFullYear()}-${String(meseCorrente.getMonth() + 1).padStart(2, '0')}`

  // Costruisce il parametro professionista in base ai filtri
  const professionistaParam = (() => {
    if (camillaSelezionata && giacomoSelezionato) return undefined
    if (camillaSelezionata && !giacomoSelezionato) return 'camilla'
    if (!camillaSelezionata && giacomoSelezionato) return 'giacomo'
    return 'nessuno'
  })()

  // Filtro singolo: indica quale prof è l'unico selezionato (null se entrambi o nessuno)
  const filtroSingolo: 'camilla' | 'giacomo' | null =
    professionistaParam === 'camilla' || professionistaParam === 'giacomo' ? professionistaParam : null

  const caricaAppuntamenti = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ mese: meseStr })
      if (professionistaParam) params.set('professionista', professionistaParam)
      const res = await fetch(`/api/appuntamenti?${params}`)
      const data = await res.json()
      setAppuntamenti(Array.isArray(data) ? data : [])
    } catch {
      console.error('Errore caricamento appuntamenti')
    } finally {
      setLoading(false)
    }
  }, [meseStr, professionistaParam])

  useEffect(() => {
    caricaAppuntamenti()
  }, [caricaAppuntamenti])

  // Costruisce la griglia del calendario
  const primoGiorno = new Date(meseCorrente.getFullYear(), meseCorrente.getMonth(), 1)
  const ultimoGiorno = new Date(meseCorrente.getFullYear(), meseCorrente.getMonth() + 1, 0)

  // Offset: lunedì = 0
  const offsetInizio = (primoGiorno.getDay() + 6) % 7
  const totaleCelle = Math.ceil((offsetInizio + ultimoGiorno.getDate()) / 7) * 7

  const celle: (Date | null)[] = Array.from({ length: totaleCelle }, (_, i) => {
    const giorno = i - offsetInizio + 1
    if (giorno < 1 || giorno > ultimoGiorno.getDate()) return null
    return new Date(meseCorrente.getFullYear(), meseCorrente.getMonth(), giorno)
  })

  const getAppPerGiorno = (data: Date) => {
    const dataStr = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
    return appuntamenti.filter((a) => a.data === dataStr && a.stato !== 'Cancellato')
  }

  const isOggi = (data: Date) =>
    data.getDate() === oggi.getDate() &&
    data.getMonth() === oggi.getMonth() &&
    data.getFullYear() === oggi.getFullYear()

  const isSelezionato = (data: Date) =>
    giornoSelezionato &&
    data.getDate() === giornoSelezionato.getDate() &&
    data.getMonth() === giornoSelezionato.getMonth() &&
    data.getFullYear() === giornoSelezionato.getFullYear()

  const appGiornoSelezionato = giornoSelezionato ? getAppPerGiorno(giornoSelezionato) : []

  const mesePrecedente = () =>
    setMeseCorrente(new Date(meseCorrente.getFullYear(), meseCorrente.getMonth() - 1, 1))
  const meseSuccessivo = () =>
    setMeseCorrente(new Date(meseCorrente.getFullYear(), meseCorrente.getMonth() + 1, 1))

  return (
    <div className="flex h-full">
      {/* Calendario principale */}
      <div className="flex-1 p-3 sm:p-6 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-serif text-xl sm:text-2xl text-[#1A1A1A] truncate">
              {MESI[meseCorrente.getMonth()]} {meseCorrente.getFullYear()}
            </h1>
            {loading && (
              <div className="w-4 h-4 border-2 border-[#3B82F6]/30 border-t-[#3B82F6] rounded-full animate-spin" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setMeseCorrente(new Date(oggi.getFullYear(), oggi.getMonth(), 1))
                setGiornoSelezionato(oggi)
              }}
              className="btn-secondary text-xs px-3 py-2"
            >
              Oggi
            </button>
            <button onClick={mesePrecedente} className="btn-secondary px-3 py-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <button onClick={meseSuccessivo} className="btn-secondary px-3 py-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-4 mb-4">
          {LEGENDA.map(({ label, dot }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={clsx('w-2 h-2 rounded-full', dot)} />
              <span className="text-xs text-gray-400">{label}</span>
            </div>
          ))}
        </div>

        {/* Intestazione giorni */}
        <div className="grid grid-cols-7 mb-1">
          {GIORNI_SETTIMANA.map((g) => (
            <div key={g} className="text-center py-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{g}</span>
            </div>
          ))}
        </div>

        {/* Griglia giorni */}
        <div className="grid grid-cols-7 flex-1 gap-px bg-[#E5E7EB] rounded-xl overflow-hidden border border-[#E5E7EB]">
          {celle.map((data, idx) => {
            if (!data) {
              return <div key={idx} className="bg-[#FAFAFA]" />
            }

            const apps = getAppPerGiorno(data)
            const attivo = isOggi(data)
            const sel = isSelezionato(data)

            return (
              <button
                key={idx}
                onClick={() => setGiornoSelezionato(sel ? null : data)}
                className={clsx(
                  'bg-white p-1 sm:p-2 min-h-[60px] sm:min-h-[90px] text-left transition-colors hover:bg-blue-50/30 flex flex-col',
                  sel && 'bg-blue-50/50'
                )}
              >
                <span
                  className={clsx(
                    'inline-flex w-7 h-7 items-center justify-center rounded-full text-sm mb-1.5 font-medium transition-colors',
                    attivo && 'bg-[#1E3A5F] text-white',
                    !attivo && sel && 'bg-[#3B82F6]/15 text-[#1E3A5F]',
                    !attivo && !sel && 'text-[#1A1A1A]'
                  )}
                >
                  {data.getDate()}
                </span>

                <div className="space-y-0.5 flex-1">
                  {apps.slice(0, 3).map((app) => {
                    const colori = getColoriApp(app, filtroSingolo)
                    return (
                      <div
                        key={app.id}
                        className={clsx(
                          'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate',
                          colori.chip
                        )}
                      >
                        <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', colori.dot)} />
                        <span className="truncate font-medium">
                          {app.ora_inizio} {app.cliente_nome.split(' ')[0]}
                          {colori.isGuest && <span className="ml-1 opacity-70">·ospite</span>}
                        </span>
                      </div>
                    )
                  })}
                  {apps.length > 3 && (
                    <p className="text-xs text-gray-400 px-1">+{apps.length - 3} altri</p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Pannello giornata */}
      {giornoSelezionato && (
        <GiornataSidebar
          data={giornoSelezionato}
          appuntamenti={appGiornoSelezionato}
          filtroSingolo={filtroSingolo}
          onSeleziona={setAppSelezionato}
          onChiudi={() => setGiornoSelezionato(null)}
        />
      )}

      {/* Modal dettaglio appuntamento */}
      {appSelezionato && (
        <AppointmentModal
          appuntamento={appSelezionato}
          onClose={() => setAppSelezionato(null)}
          onAggiornato={caricaAppuntamenti}
        />
      )}
    </div>
  )
}
