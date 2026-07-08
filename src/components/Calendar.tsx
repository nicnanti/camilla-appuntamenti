'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import AppointmentModal from './AppointmentModal'
import { useApp } from '@/contexts/AppContext'
import type { Appuntamento } from '@/types'

const GIORNI_SETTIMANA = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const GIORNI_FULL = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]
const MESI_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

// ─── Helper date ─────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function lunediDellaSettimana(d: Date): Date {
  const offset = (d.getDay() + 6) % 7 // Lun=0, Dom=6
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  result.setDate(result.getDate() - offset)
  return result
}

function isStessoGiorno(a: Date, b: Date): boolean {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
}

// Altezza in px di un'ora nella griglia settimana/giorno
const ALTEZZA_ORA = 48
const ORE_VISIBILI = Array.from({ length: 24 }, (_, i) => i) // 0..23

function offsetTopDaOra(orario: string): number {
  const [h, m] = orario.split(':').map(Number)
  return (h * 60 + m) * (ALTEZZA_ORA / 60)
}

function altezzaDaDurata(inizio: string, fine: string): number {
  const h = offsetTopDaOra(fine) - offsetTopDaOra(inizio)
  return Math.max(h, 22) // minimo 22px per stare comoda 1 riga di testo
}

function durataInMinuti(inizio: string, fine: string): number {
  const [h1, m1] = inizio.split(':').map(Number)
  const [h2, m2] = fine.split(':').map(Number)
  return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1))
}

function isMultiGiorno(app: Appuntamento): boolean {
  return !!(app.data_fine && app.data_fine > app.data)
}

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
  onCreaAppuntamento: (data: Date, ora: string) => void
  onChiudi: () => void
}

function GiornataSidebar({ data, appuntamenti, filtroSingolo, onSeleziona, onCreaAppuntamento, onChiudi }: GiornataSidebarProps) {
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
          const oraSlot = formatOra(h)
          return (
            <div
              key={h}
              onClick={(e) => {
                // Ignora click sui bottoni appuntamento (usano stopPropagation).
                // Click sul resto della riga = crea nuovo appuntamento a questo orario.
                if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.slotArea === 'true') {
                  onCreaAppuntamento(data, oraSlot)
                }
              }}
              className="flex border-b border-[#F3F4F6] min-h-[56px] cursor-pointer hover:bg-blue-50/40 transition-colors group"
              title="Crea appuntamento in questa fascia oraria"
            >
              <div className="w-14 flex-shrink-0 px-3 py-2" data-slot-area="true">
                <span className="text-xs text-gray-300 group-hover:text-[#1E3A5F]">{formatOra(h)}</span>
              </div>
              <div className="flex-1 p-1.5 space-y-1" data-slot-area="true">
                {apps.map((app) => {
                  const colori = getColoriApp(app, filtroSingolo)
                  return (
                  <button
                    key={app.id}
                    onClick={(e) => { e.stopPropagation(); onSeleziona(app) }}
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

type Vista = 'mese' | 'settimana' | 'giorno'

export default function Calendar() {
  const router = useRouter()
  const oggi = new Date()

  // Naviga a /nuovo con data + ora prefilled (usato da GiornataSidebar e GiornoView)
  const creaAppuntamentoConSlot = useCallback((d: Date, ora: string) => {
    const dataStr = ymd(d)
    router.push(`/nuovo?data=${encodeURIComponent(dataStr)}&ora=${encodeURIComponent(ora)}`)
  }, [router])
  const [vista, setVista] = useState<Vista>('mese')
  const [dataCorrente, setDataCorrente] = useState<Date>(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()))
  const [appuntamenti, setAppuntamenti] = useState<Appuntamento[]>([])
  const [loading, setLoading] = useState(true)
  const [giornoSelezionato, setGiornoSelezionato] = useState<Date | null>(null)
  const [appSelezionato, setAppSelezionato] = useState<Appuntamento | null>(null)

  const { camillaSelezionata, giacomoSelezionato } = useApp()

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

  // Calcola il range di date in base alla vista
  const { fetchParams, titolo } = (() => {
    if (vista === 'mese') {
      const meseStr = `${dataCorrente.getFullYear()}-${String(dataCorrente.getMonth() + 1).padStart(2, '0')}`
      return {
        fetchParams: { mese: meseStr },
        titolo: `${MESI[dataCorrente.getMonth()]} ${dataCorrente.getFullYear()}`,
      }
    }
    if (vista === 'settimana') {
      const lun = lunediDellaSettimana(dataCorrente)
      const dom = new Date(lun); dom.setDate(lun.getDate() + 6)
      const titoloS = lun.getMonth() === dom.getMonth()
        ? `${lun.getDate()}–${dom.getDate()} ${MESI[lun.getMonth()].toLowerCase()} ${lun.getFullYear()}`
        : `${lun.getDate()} ${MESI_SHORT[lun.getMonth()]} – ${dom.getDate()} ${MESI_SHORT[dom.getMonth()]} ${dom.getFullYear()}`
      return {
        fetchParams: { inizio: ymd(lun), fine: ymd(dom) },
        titolo: titoloS,
      }
    }
    // giorno
    return {
      fetchParams: { inizio: ymd(dataCorrente), fine: ymd(dataCorrente) },
      titolo: `${GIORNI_FULL[dataCorrente.getDay()]} ${dataCorrente.getDate()} ${MESI[dataCorrente.getMonth()].toLowerCase()} ${dataCorrente.getFullYear()}`,
    }
  })()

  const fetchKey = JSON.stringify({ ...fetchParams, professionistaParam })

  const caricaAppuntamenti = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(fetchParams)) {
        if (v) params.set(k, v)
      }
      if (professionistaParam) params.set('professionista', professionistaParam)
      const res = await fetch(`/api/appuntamenti?${params}`)
      const data = await res.json()
      setAppuntamenti(Array.isArray(data) ? data : [])
    } catch {
      console.error('Errore caricamento appuntamenti')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey])

  useEffect(() => {
    caricaAppuntamenti()
  }, [caricaAppuntamenti])

  const getAppPerGiorno = (data: Date) => {
    const dataStr = ymd(data)
    return appuntamenti.filter((a) => {
      if (a.stato === 'Cancellato') return false
      // Multi-giorno: il giorno deve cadere nel range [a.data .. a.data_fine] inclusi
      if (a.data_fine && a.data_fine > a.data) {
        return dataStr >= a.data && dataStr <= a.data_fine
      }
      return a.data === dataStr
    })
  }

  const isOggi = (data: Date) => isStessoGiorno(data, oggi)

  // Navigazione
  const indietro = () => {
    const d = new Date(dataCorrente)
    if (vista === 'mese')     d.setMonth(d.getMonth() - 1)
    if (vista === 'settimana') d.setDate(d.getDate() - 7)
    if (vista === 'giorno')    d.setDate(d.getDate() - 1)
    setDataCorrente(d)
  }
  const avanti = () => {
    const d = new Date(dataCorrente)
    if (vista === 'mese')     d.setMonth(d.getMonth() + 1)
    if (vista === 'settimana') d.setDate(d.getDate() + 7)
    if (vista === 'giorno')    d.setDate(d.getDate() + 1)
    setDataCorrente(d)
  }
  const vaiAOggi = () => {
    setDataCorrente(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()))
  }

  // Costruisce la griglia del MESE (solo per vista mese)
  const primoGiorno = new Date(dataCorrente.getFullYear(), dataCorrente.getMonth(), 1)
  const ultimoGiorno = new Date(dataCorrente.getFullYear(), dataCorrente.getMonth() + 1, 0)
  const offsetInizio = (primoGiorno.getDay() + 6) % 7
  const totaleCelle = Math.ceil((offsetInizio + ultimoGiorno.getDate()) / 7) * 7
  const celle: (Date | null)[] = Array.from({ length: totaleCelle }, (_, i) => {
    const giorno = i - offsetInizio + 1
    if (giorno < 1 || giorno > ultimoGiorno.getDate()) return null
    return new Date(dataCorrente.getFullYear(), dataCorrente.getMonth(), giorno)
  })
  const isSelezionato = (data: Date) =>
    giornoSelezionato && isStessoGiorno(data, giornoSelezionato)
  const appGiornoSelezionato = giornoSelezionato ? getAppPerGiorno(giornoSelezionato) : []

  // Giorni della settimana (per vista settimana)
  const giorniSettimana: Date[] = (() => {
    const lun = lunediDellaSettimana(dataCorrente)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lun); d.setDate(lun.getDate() + i); return d
    })
  })()

  return (
    <div className="flex h-full">
      {/* Calendario principale */}
      <div className="flex-1 p-3 sm:p-6 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-serif text-xl sm:text-2xl text-[#1A1A1A] truncate capitalize">
              {titolo}
            </h1>
            {loading && (
              <div className="w-4 h-4 border-2 border-[#3B82F6]/30 border-t-[#3B82F6] rounded-full animate-spin" />
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Selettore vista */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              {([
                { id: 'mese', label: 'Mese' },
                { id: 'settimana', label: 'Settimana' },
                { id: 'giorno', label: 'Giorno' },
              ] as const).map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVista(v.id)}
                  className={clsx(
                    'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                    vista === v.id ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <button onClick={vaiAOggi} className="btn-secondary text-xs px-3 py-2">
              Oggi
            </button>
            <button onClick={indietro} className="btn-secondary px-3 py-2" aria-label="Indietro">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <button onClick={avanti} className="btn-secondary px-3 py-2" aria-label="Avanti">
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

        {/* ─── Vista MESE ─── */}
        {vista === 'mese' && (
          <>
            <div className="grid grid-cols-7 mb-1">
              {GIORNI_SETTIMANA.map((g) => (
                <div key={g} className="text-center py-2">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{g}</span>
                </div>
              ))}
            </div>

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
                        const multi = isMultiGiorno(app)
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
                              {multi && <span className="mr-0.5" title="Multi-giorno">📅</span>}
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
          </>
        )}

        {/* ─── Vista SETTIMANA ─── */}
        {vista === 'settimana' && (
          <SettimanaView
            giorni={giorniSettimana}
            getAppPerGiorno={getAppPerGiorno}
            isOggi={isOggi}
            filtroSingolo={filtroSingolo}
            onSeleziona={setAppSelezionato}
          />
        )}

        {/* ─── Vista GIORNO ─── */}
        {vista === 'giorno' && (
          <GiornoView
            data={dataCorrente}
            appuntamenti={getAppPerGiorno(dataCorrente)}
            isOggi={isOggi(dataCorrente)}
            filtroSingolo={filtroSingolo}
            onSeleziona={setAppSelezionato}
          />
        )}
      </div>

      {/* Pannello giornata (solo per vista mese) */}
      {vista === 'mese' && giornoSelezionato && (
        <GiornataSidebar
          data={giornoSelezionato}
          appuntamenti={appGiornoSelezionato}
          filtroSingolo={filtroSingolo}
          onSeleziona={setAppSelezionato}
          onCreaAppuntamento={creaAppuntamentoConSlot}
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

// ═══════════════════════════════════════════════════════════════════════════
// VISTA SETTIMANA
// ═══════════════════════════════════════════════════════════════════════════

interface SettimanaViewProps {
  giorni: Date[]
  getAppPerGiorno: (d: Date) => Appuntamento[]
  isOggi: (d: Date) => boolean
  filtroSingolo: 'camilla' | 'giacomo' | null
  onSeleziona: (app: Appuntamento) => void
}

function SettimanaView({ giorni, getAppPerGiorno, isOggi, filtroSingolo, onSeleziona }: SettimanaViewProps) {
  return (
    <div className="flex-1 overflow-auto rounded-xl border border-[#E5E7EB] bg-white">
      <div className="grid grid-cols-[56px_repeat(7,minmax(110px,1fr))] min-w-[820px]">
        {/* Header giorni */}
        <div className="border-b border-r border-[#E5E7EB] bg-[#FAFAFA]" />
        {giorni.map((g) => {
          const attivo = isOggi(g)
          return (
            <div
              key={g.toISOString()}
              className={clsx(
                'border-b border-r border-[#E5E7EB] py-2 px-2 text-center',
                attivo ? 'bg-[#1E3A5F]/5' : 'bg-[#FAFAFA]',
              )}
            >
              <p className="text-[10px] uppercase tracking-wider text-gray-400">{GIORNI_SETTIMANA[(g.getDay() + 6) % 7]}</p>
              <p className={clsx('text-sm font-semibold', attivo ? 'text-[#1E3A5F]' : 'text-[#1A1A1A]')}>
                {g.getDate()}
              </p>
            </div>
          )
        })}

        {/* Body: colonna ore + 7 colonne giorni */}
        <div className="relative">
          {ORE_VISIBILI.map((h) => (
            <div key={h} className="border-b border-r border-[#E5E7EB] flex items-start justify-end pr-1.5 pt-0.5" style={{ height: ALTEZZA_ORA }}>
              <span className="text-[10px] text-gray-400">{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>
        {giorni.map((g) => {
          const apps = getAppPerGiorno(g)
          return (
            <div key={g.toISOString()} className="relative border-r border-[#E5E7EB]">
              {ORE_VISIBILI.map((h) => (
                <div key={h} className="border-b border-[#F3F4F6]" style={{ height: ALTEZZA_ORA }} />
              ))}
              {apps.map((app) => {
                const colori = getColoriApp(app, filtroSingolo)
                const compatto = durataInMinuti(app.ora_inizio, app.ora_fine) <= 30
                const multi = isMultiGiorno(app)
                return (
                  <button
                    key={app.id}
                    onClick={() => onSeleziona(app)}
                    className={clsx(
                      'absolute left-1 right-1 rounded-md border text-left overflow-hidden hover:shadow-soft transition-shadow',
                      compatto ? 'px-1 py-px' : 'px-1.5 py-0.5',
                      colori.chip,
                    )}
                    style={{
                      top: offsetTopDaOra(app.ora_inizio),
                      height: altezzaDaDurata(app.ora_inizio, app.ora_fine),
                    }}
                  >
                    {compatto ? (
                      <p className="text-[10px] truncate leading-none whitespace-nowrap">
                        {multi && <span className="mr-0.5" title="Multi-giorno">📅</span>}
                        <span className="opacity-70">{app.ora_inizio}</span>{' '}
                        <span className="font-semibold">{app.cliente_nome}</span>
                        {colori.isGuest && <span className="ml-1 text-[9px] opacity-70 uppercase">·osp</span>}
                      </p>
                    ) : (
                      <>
                        <p className="text-[11px] opacity-70 leading-tight truncate">{app.ora_inizio}</p>
                        <p className="text-[11px] font-semibold truncate leading-tight">
                          {multi && <span className="mr-0.5" title="Multi-giorno">📅</span>}
                          {app.cliente_nome}
                        </p>
                        {colori.isGuest && (
                          <p className="text-[9px] opacity-70 uppercase tracking-wider truncate">ospite</p>
                        )}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// VISTA GIORNO
// ═══════════════════════════════════════════════════════════════════════════

interface GiornoViewProps {
  data: Date
  appuntamenti: Appuntamento[]
  isOggi: boolean
  filtroSingolo: 'camilla' | 'giacomo' | null
  onSeleziona: (app: Appuntamento) => void
}

function GiornoView({ data, appuntamenti, isOggi, filtroSingolo, onSeleziona }: GiornoViewProps) {
  return (
    <div className="flex-1 overflow-auto rounded-xl border border-[#E5E7EB] bg-white">
      <div className={clsx('px-4 py-3 border-b border-[#E5E7EB]', isOggi ? 'bg-[#1E3A5F]/5' : 'bg-[#FAFAFA]')}>
        <p className="text-[10px] uppercase tracking-wider text-gray-400">{GIORNI_FULL[data.getDay()]}</p>
        <p className={clsx('text-lg font-serif', isOggi ? 'text-[#1E3A5F]' : 'text-[#1A1A1A]')}>
          {data.getDate()} {MESI[data.getMonth()].toLowerCase()}
        </p>
      </div>

      <div className="grid grid-cols-[64px_1fr]">
        {/* Colonna ore */}
        <div>
          {ORE_VISIBILI.map((h) => (
            <div key={h} className="border-b border-r border-[#E5E7EB] flex items-start justify-end pr-2 pt-0.5" style={{ height: ALTEZZA_ORA }}>
              <span className="text-[10px] text-gray-400">{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>

        {/* Colonna eventi */}
        <div className="relative">
          {ORE_VISIBILI.map((h) => (
            <div key={h} className="border-b border-[#F3F4F6]" style={{ height: ALTEZZA_ORA }} />
          ))}
          {appuntamenti.map((app) => {
            const colori = getColoriApp(app, filtroSingolo)
            const compatto = durataInMinuti(app.ora_inizio, app.ora_fine) <= 30
            const multi = isMultiGiorno(app)
            return (
              <button
                key={app.id}
                onClick={() => onSeleziona(app)}
                className={clsx(
                  'absolute left-2 right-2 rounded-md border text-left overflow-hidden hover:shadow-soft transition-shadow',
                  compatto ? 'px-2 py-0.5' : 'px-2 py-1',
                  colori.chip,
                )}
                style={{
                  top: offsetTopDaOra(app.ora_inizio),
                  height: altezzaDaDurata(app.ora_inizio, app.ora_fine),
                }}
              >
                {compatto ? (
                  <p className="text-xs truncate leading-tight whitespace-nowrap">
                    {multi && <span className="mr-0.5" title="Multi-giorno">📅</span>}
                    <span className="opacity-70 font-normal">{app.ora_inizio}–{app.ora_fine}</span>{' '}
                    <span className="font-semibold">{app.cliente_nome}</span>
                    {colori.isGuest && <span className="ml-1.5 text-[10px] opacity-70 uppercase tracking-wider">ospite</span>}
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-semibold truncate leading-tight">
                      {multi && <span className="mr-1" title="Multi-giorno">📅</span>}
                      {app.cliente_nome}
                      {colori.isGuest && <span className="ml-2 text-[10px] opacity-70 uppercase tracking-wider">ospite</span>}
                    </p>
                    <p className="text-xs opacity-70 truncate">{app.ora_inizio} – {app.ora_fine}</p>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
