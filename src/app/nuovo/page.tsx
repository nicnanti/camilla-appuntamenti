'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import ContactSearch from '@/components/ContactSearch'
import DatePicker from '@/components/DatePicker'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import InvitatiPicker from '@/components/InvitatiPicker'
import type { Invitato } from '@/types'
import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, isWeekend, parseISO, startOfWeek } from 'date-fns'

function generaSlotOrari(): string[] {
  const slot: string[] = []
  for (let h = 0; h <= 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      slot.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return slot
}

const SLOT_ORARI = generaSlotOrari()

// ── Ricorrenza ────────────────────────────────────────────────────────────────
type Ricorrenza = 'nessuna' | 'giornaliera' | 'lavorativa' | 'settimanale' | 'bisettimanale' | 'mensile' | 'personalizzata'
type UnitaPersonalizzata = 'giorni' | 'settimane' | 'mesi'

// Configurazione della ricorrenza personalizzata: "ogni N giorni/settimane/mesi".
// `giorni` (solo per unità settimane): giorni della settimana selezionati, 0 = lunedì … 6 = domenica.
interface Personalizzata {
  intervallo: number
  unita: UnitaPersonalizzata
  giorni: number[]
}

const GIORNI_SETTIMANA = ['L', 'M', 'M', 'G', 'V', 'S', 'D']
const NOMI_GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']

// Indice lunedì-based (0..6) del giorno della settimana di una data YYYY-MM-DD
function giornoSettimanaLun(data: string): number {
  return (parseISO(data).getDay() + 6) % 7
}

const RICORRENZA_OPTIONS: Array<{ value: Ricorrenza; label: string }> = [
  { value: 'nessuna',       label: 'Non si ripete' },
  { value: 'giornaliera',   label: 'Ogni giorno' },
  { value: 'lavorativa',    label: 'Ogni giorno lavorativo (lun–ven)' },
  { value: 'settimanale',   label: 'Ogni settimana' },
  { value: 'bisettimanale', label: 'Ogni 2 settimane' },
  { value: 'mensile',       label: 'Ogni mese' },
  { value: 'personalizzata', label: 'Personalizzata…' },
]

// Limite di sicurezza: ogni occorrenza crea un evento Google Calendar, due record
// Airtable e le email .ics, quindi la serie non può essere illimitata.
const MAX_OCCORRENZE = 52

// Genera le date (YYYY-MM-DD) della serie, inclusa la data di inizio.
// Si ferma a `fine` (inclusa) oppure al raggiungimento di `max` occorrenze.
function generaDateRicorrenza(
  inizio: string,
  tipo: Ricorrenza,
  fine: string,
  pers?: Personalizzata,
  max = MAX_OCCORRENZE,
): string[] {
  if (!inizio) return []
  if (tipo === 'nessuna' || !fine || fine < inizio) return [inizio]
  const start = parseISO(inizio)
  const out: string[] = []

  if (tipo === 'personalizzata') {
    const intervallo = Math.max(1, Math.floor(pers?.intervallo ?? 1))
    const unita = pers?.unita ?? 'settimane'
    if (unita === 'settimane') {
      // Settimane con giorni scelti: partiamo dal lunedì della settimana di inizio e
      // per ogni settimana "attiva" aggiungiamo i giorni selezionati (>= inizio, <= fine).
      const giorni = (pers?.giorni?.length ? pers.giorni : [giornoSettimanaLun(inizio)]).slice().sort()
      const lunedi = startOfWeek(start, { weekStartsOn: 1 })
      for (let w = 0; out.length < max; w++) {
        const base = addWeeks(lunedi, w * intervallo)
        if (format(base, 'yyyy-MM-dd') > fine) break
        for (const g of giorni) {
          const s = format(addDays(base, g), 'yyyy-MM-dd')
          if (s < inizio || s > fine) continue
          out.push(s)
          if (out.length >= max) break
        }
      }
      return out.length > 0 ? out : [inizio]
    }
    for (let i = 0; out.length < max; i++) {
      const d = unita === 'giorni' ? addDays(start, i * intervallo) : addMonths(start, i * intervallo)
      const s = format(d, 'yyyy-MM-dd')
      if (s > fine) break
      out.push(s)
    }
    return out.length > 0 ? out : [inizio]
  }

  // Per giornaliera/lavorativa iteriamo giorno per giorno; per le altre usiamo l'indice
  // (addMonths(start, i) evita lo slittamento sui mesi con meno giorni: 31 gen → 28 feb → 31 mar).
  for (let i = 0; out.length < max; i++) {
    let d: Date
    switch (tipo) {
      case 'giornaliera':
      case 'lavorativa':    d = addDays(start, i); break
      case 'settimanale':   d = addWeeks(start, i); break
      case 'bisettimanale': d = addWeeks(start, i * 2); break
      case 'mensile':       d = addMonths(start, i); break
      default:              return [inizio]
    }
    const s = format(d, 'yyyy-MM-dd')
    if (s > fine) break
    if (tipo === 'lavorativa' && isWeekend(d) && i > 0) continue
    out.push(s)
  }
  return out.length > 0 ? out : [inizio]
}

// Sposta una data YYYY-MM-DD di `giorni` giorni (usato per data_fine nelle serie multi-giorno)
function spostaData(data: string, giorni: number): string {
  return format(addDays(parseISO(data), giorni), 'yyyy-MM-dd')
}

function formatDataBreve(d: string): string {
  const [y, m, g] = d.split('-')
  return `${g}/${m}/${y}`
}

// Guest disponibili per ogni professionista (il professionista stesso non compare)
const GUEST_OPTIONS: Record<string, string[]> = {
  Camilla: ['Giacomo', 'Fiorella', 'Viviana'],
  Giacomo: ['Camilla', 'Fiorella', 'Viviana'],
}

interface FormState {
  cliente_nome: string
  cliente_telefono: string
  cliente_dettagli: string
  cliente_indirizzo: string
  data: string
  data_fine: string      // valorizzato solo quando multiGiorno = true
  multiGiorno: boolean   // checkbox "Data di fine diversa"
  ora_inizio: string
  ora_fine: string
  note: string
  professionista: string
  guest: string[]
  invitati: Invitato[]
  ricorrenza: Ricorrenza
  ricorrenza_fine: string   // YYYY-MM-DD, ultima data della serie (valorizzata solo se ricorrenza ≠ nessuna)
  personalizzata: Personalizzata  // usata solo se ricorrenza = personalizzata
}

interface Errori {
  professionista?: string
  cliente_nome?: string
  data?: string
  data_fine?: string
  ora_fine?: string
  ricorrenza_fine?: string
  personalizzata?: string
}

function ProfChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  const color = label === 'Camilla' ? 'bg-[#1E3A5F] border-[#1E3A5F]' : 'bg-emerald-600 border-emerald-600'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer select-none ${
        selected ? `${color} text-white` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
      }`}
    >
      {label}
    </button>
  )
}

function GuestChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer select-none ${
        selected
          ? 'bg-amber-500 border-amber-500 text-white'
          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
      }`}
    >
      {label}
    </button>
  )
}

// useSearchParams richiede Suspense boundary per il prerendering statico.
export default function PaginaNuovoAppuntamento() {
  return (
    <Suspense fallback={<div className="min-h-full flex items-center justify-center text-sm text-gray-400">Caricamento…</div>}>
      <FormNuovoAppuntamento />
    </Suspense>
  )
}

function FormNuovoAppuntamento() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const oggi = new Date().toISOString().split('T')[0]

  // Prefill da query string quando l'utente clicca uno slot orario nel calendario:
  // /nuovo?data=YYYY-MM-DD&ora=HH:MM
  const dataQuery = searchParams?.get('data') ?? ''
  const oraQuery  = searchParams?.get('ora')  ?? ''
  const dataIniziale = dataQuery && /^\d{4}-\d{2}-\d{2}$/.test(dataQuery) ? dataQuery : oggi
  const oraInizioIniziale = oraQuery && /^\d{2}:\d{2}$/.test(oraQuery) ? oraQuery : '09:00'
  const oraFineIniziale = (() => {
    const [h, m] = oraInizioIniziale.split(':').map(Number)
    if (h >= 23) return '23:45'
    return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  })()

  const [form, setForm] = useState<FormState>({
    cliente_nome: '',
    cliente_telefono: '',
    cliente_dettagli: '',
    cliente_indirizzo: '',
    data: dataIniziale,
    data_fine: '',
    multiGiorno: false,
    ora_inizio: oraInizioIniziale,
    ora_fine: oraFineIniziale,
    note: '',
    professionista: '',
    guest: [],
    invitati: [],
    ricorrenza: 'nessuna',
    ricorrenza_fine: '',
    personalizzata: { intervallo: 1, unita: 'settimane', giorni: [giornoSettimanaLun(dataIniziale)] },
  })
  const [errori, setErrori] = useState<Errori>({})
  const [loading, setLoading] = useState(false)
  // Avanzamento creazione serie ricorrente: { fatti, totale }
  const [progresso, setProgresso] = useState<{ fatti: number; totale: number } | null>(null)

  const ricorrente = form.ricorrenza !== 'nessuna'
  // Date della serie calcolate dal form corrente (anteprima + creazione)
  const dateSerie = ricorrente
    ? generaDateRicorrenza(form.data, form.ricorrenza, form.ricorrenza_fine, form.personalizzata, MAX_OCCORRENZE + 1)
    : [form.data]

  const selezionaProfessionista = (p: string) => {
    // Selezione singola; rimuovi dai guest eventuali nomi incompatibili
    const guestValidi = GUEST_OPTIONS[p] ?? []
    const nuoviGuest = form.guest.filter((g) => guestValidi.includes(g))
    setForm({ ...form, professionista: p, guest: nuoviGuest })
    if (errori.professionista) setErrori({ ...errori, professionista: undefined })
  }

  const toggleGuest = (g: string) => {
    const next = form.guest.includes(g)
      ? form.guest.filter((x) => x !== g)
      : [...form.guest, g]
    setForm({ ...form, guest: next })
  }

  const valida = (): boolean => {
    const e: Errori = {}
    if (!form.professionista) e.professionista = 'Seleziona un professionista'
    if (!form.cliente_nome.trim()) e.cliente_nome = 'Inserisci il nome del cliente'
    if (!form.data) e.data = 'Seleziona una data'
    if (form.multiGiorno) {
      if (!form.data_fine) {
        e.data_fine = 'Seleziona la data di fine'
      } else if (form.data_fine < form.data) {
        e.data_fine = 'La data di fine non può essere precedente alla data di inizio'
      }
    }
    if (form.ora_inizio >= form.ora_fine) e.ora_fine = "L'ora di fine deve essere dopo l'inizio"
    if (ricorrente) {
      if (form.ricorrenza === 'personalizzata') {
        const { intervallo, unita, giorni } = form.personalizzata
        if (!Number.isInteger(intervallo) || intervallo < 1 || intervallo > 99) {
          e.personalizzata = "L'intervallo deve essere un numero tra 1 e 99"
        } else if (unita === 'settimane' && giorni.length === 0) {
          e.personalizzata = 'Seleziona almeno un giorno della settimana'
        }
      }
      if (!form.ricorrenza_fine) {
        e.ricorrenza_fine = 'Seleziona fino a quando ripetere'
      } else if (form.ricorrenza_fine <= form.data) {
        e.ricorrenza_fine = 'La data di fine ripetizione deve essere successiva alla data di inizio'
      } else if (dateSerie.length > MAX_OCCORRENZE) {
        e.ricorrenza_fine = `Massimo ${MAX_OCCORRENZE} appuntamenti per serie: scegli una data di fine più vicina`
      }
    }
    setErrori(e)
    return Object.keys(e).length === 0
  }

  const creaAppuntamento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valida()) return
    setLoading(true)
    try {
      // data_fine solo se checkbox attiva E data successiva alla data inizio
      const dataFineNorm = form.multiGiorno && form.data_fine && form.data_fine > form.data ? form.data_fine : null
      // Per le serie multi-giorno ogni occorrenza mantiene la stessa durata in giorni
      const durataGiorni = dataFineNorm ? differenceInCalendarDays(parseISO(dataFineNorm), parseISO(form.data)) : 0

      const bodyBase = {
        cliente_nome: form.cliente_nome,
        cliente_telefono: form.cliente_telefono,
        cliente_dettagli: form.cliente_dettagli,
        indirizzo: form.cliente_indirizzo,
        ora_inizio: form.ora_inizio,
        ora_fine: form.ora_fine,
        note: form.note,
        professionista: form.professionista,
        guest: form.guest,
        invitati: form.invitati,
        tipo: '',
      }

      const inviaOccorrenza = async (data: string) => {
        const bodyAppuntamento = {
          ...bodyBase,
          data,
          data_fine: dataFineNorm ? spostaData(data, durataGiorni) : null,
        }
        console.log('[Form] body appuntamento inviato:', bodyAppuntamento)
        const res = await fetch('/api/appuntamenti', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyAppuntamento),
        })
        if (!res.ok) {
          let messaggio = 'Errore durante la creazione'
          try { messaggio = (await res.json()).errore ?? messaggio } catch {}
          throw new Error(messaggio)
        }
      }

      // Appuntamento singolo: comportamento classico
      if (!ricorrente) {
        await inviaOccorrenza(form.data)
        toast.success('Appuntamento creato con successo!')
        router.refresh()
        router.push('/')
        return
      }

      // Serie ricorrente: una POST per occorrenza, in sequenza.
      // (Ogni occorrenza è un appuntamento indipendente: evento GCal, record Airtable,
      // reminder e email .ics propri — così modifica/cancellazione funzionano come sempre.)
      const totale = dateSerie.length
      const fallite: string[] = []
      setProgresso({ fatti: 0, totale })
      for (let i = 0; i < totale; i++) {
        try {
          await inviaOccorrenza(dateSerie[i])
        } catch (err) {
          console.error(`[Form] occorrenza ${dateSerie[i]} fallita:`, err)
          fallite.push(dateSerie[i])
        }
        setProgresso({ fatti: i + 1, totale })
      }

      const create = totale - fallite.length
      if (fallite.length === 0) {
        toast.success(`${totale} appuntamenti creati con successo!`)
      } else if (create === 0) {
        throw new Error('Nessun appuntamento creato: riprova')
      } else {
        toast.error(
          `Creati ${create} appuntamenti su ${totale}. Non creati: ${fallite.map(formatDataBreve).join(', ')}`,
          { duration: 10000 },
        )
      }
      router.refresh()
      router.push('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore durante la creazione')
    } finally {
      setLoading(false)
      setProgresso(null)
    }
  }

  const guestDisponibili = GUEST_OPTIONS[form.professionista] ?? []

  return (
    <div className="min-h-full flex justify-center px-4 py-8 sm:py-12">
      <form onSubmit={creaAppuntamento} noValidate className="w-full max-w-sm pb-16">

        <h1 className="font-serif text-2xl text-[#1A1A1A] mb-4 text-center">Nuovo appuntamento</h1>

        <div className="card divide-y divide-[#F3F4F6]">

          {/* Professionista — selezione singola */}
          <div className="px-4 py-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Professionista</p>
            <div className="flex gap-2">
              {['Camilla', 'Giacomo'].map((p) => (
                <ProfChip
                  key={p}
                  label={p}
                  selected={form.professionista === p}
                  onClick={() => selezionaProfessionista(p)}
                />
              ))}
            </div>
            {errori.professionista && <p className="text-xs text-red-500 mt-1">{errori.professionista}</p>}
          </div>

          {/* Guest — appare solo se professionista selezionato */}
          {form.professionista && (
            <div className="px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Guest</p>
              <div className="flex flex-wrap gap-2">
                {guestDisponibili.map((g) => (
                  <GuestChip
                    key={g}
                    label={g}
                    selected={form.guest.includes(g)}
                    onClick={() => toggleGuest(g)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Cliente */}
          <div className="px-4 py-3">
            <ContactSearch
              value={form.cliente_nome}
              onChange={(nome, tel, dettagli, indirizzo) => {
                // Solo i campi forniti vengono aggiornati: digitare nel campo nome
                // non azzera telefono/indirizzo editati a mano dall'utente.
                setForm((prev) => ({
                  ...prev,
                  cliente_nome: nome,
                  ...(tel       !== undefined && { cliente_telefono:  tel       }),
                  ...(dettagli  !== undefined && { cliente_dettagli:  dettagli  }),
                  ...(indirizzo !== undefined && { cliente_indirizzo: indirizzo }),
                }))
                if (errori.cliente_nome) setErrori({ ...errori, cliente_nome: undefined })
              }}
            />
            {errori.cliente_nome && <p className="text-xs text-red-500 mt-1">{errori.cliente_nome}</p>}
          </div>

          {/* Telefono */}
          <div className="px-4 py-3">
            <input
              type="tel"
              className="w-full text-sm text-[#1A1A1A] placeholder-gray-400 bg-transparent focus:outline-none"
              placeholder="Telefono (opzionale)"
              value={form.cliente_telefono}
              onChange={(e) => setForm({ ...form, cliente_telefono: e.target.value })}
            />
          </div>

          {/* Indirizzo (con autocomplete OpenStreetMap/Photon) */}
          <div className="px-4 py-3">
            <AddressAutocomplete
              value={form.cliente_indirizzo}
              onChange={(v) => setForm((prev) => ({ ...prev, cliente_indirizzo: v }))}
            />
          </div>

          {/* Invitati extra */}
          <div className="px-4 py-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Invitati</p>
            <InvitatiPicker
              invitati={form.invitati}
              onAggiungi={(inv) => setForm((prev) => ({ ...prev, invitati: [...prev.invitati, inv] }))}
              onRimuovi={(idx) => setForm((prev) => ({ ...prev, invitati: prev.invitati.filter((_, i) => i !== idx) }))}
            />
          </div>

          {/* Data + Ora — layout condizionale in base a multiGiorno */}
          {form.multiGiorno ? (
            <>
              {/* Multi-giorno: 2 calendari affiancati */}
              <div className="px-4 py-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Data inizio</p>
                  <DatePicker
                    value={form.data}
                    min={oggi}
                    errore={!!errori.data}
                    onChange={(data) => {
                      const data_fine = form.data_fine && form.data_fine < data ? data : form.data_fine
                      setForm({ ...form, data, data_fine })
                      if (errori.data) setErrori({ ...errori, data: undefined })
                      if (errori.data_fine) setErrori({ ...errori, data_fine: undefined })
                    }}
                  />
                  {errori.data && <p className="text-xs text-red-500 mt-1">{errori.data}</p>}
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Data fine</p>
                  <DatePicker
                    value={form.data_fine}
                    min={form.data || oggi}
                    errore={!!errori.data_fine}
                    onChange={(data_fine) => {
                      setForm({ ...form, data_fine })
                      if (errori.data_fine) setErrori({ ...errori, data_fine: undefined })
                    }}
                  />
                  {errori.data_fine && <p className="text-xs text-red-500 mt-1">{errori.data_fine}</p>}
                </div>
              </div>

              {/* Orari sotto i rispettivi calendari */}
              <div className="px-4 py-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Ora inizio</p>
                  <select
                    className="w-full text-sm text-[#1A1A1A] bg-transparent focus:outline-none"
                    value={form.ora_inizio}
                    onChange={(e) => {
                      setForm({ ...form, ora_inizio: e.target.value })
                      if (errori.ora_fine) setErrori({ ...errori, ora_fine: undefined })
                    }}
                  >
                    {SLOT_ORARI.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Ora fine</p>
                  <select
                    className={`w-full text-sm bg-transparent focus:outline-none ${errori.ora_fine ? 'text-red-400' : 'text-[#1A1A1A]'}`}
                    value={form.ora_fine}
                    onChange={(e) => {
                      setForm({ ...form, ora_fine: e.target.value })
                      if (errori.ora_fine) setErrori({ ...errori, ora_fine: undefined })
                    }}
                  >
                    {SLOT_ORARI.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  {errori.ora_fine && <p className="text-xs text-red-500 mt-1">{errori.ora_fine}</p>}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Default singolo giorno */}
              <div className="px-4 py-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Data</p>
                <DatePicker
                  value={form.data}
                  min={oggi}
                  errore={!!errori.data}
                  onChange={(data) => {
                    setForm({ ...form, data })
                    if (errori.data) setErrori({ ...errori, data: undefined })
                  }}
                />
                {errori.data && <p className="text-xs text-red-500 mt-1">{errori.data}</p>}
              </div>

              <div className="px-4 py-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Inizio</p>
                  <select
                    className="w-full text-sm text-[#1A1A1A] bg-transparent focus:outline-none"
                    value={form.ora_inizio}
                    onChange={(e) => {
                      const nuova = e.target.value
                      const idx = SLOT_ORARI.indexOf(nuova)
                      const fine = nuova >= form.ora_fine
                        ? SLOT_ORARI[Math.min(idx + 4, SLOT_ORARI.length - 1)]
                        : form.ora_fine
                      setForm({ ...form, ora_inizio: nuova, ora_fine: fine })
                      if (errori.ora_fine) setErrori({ ...errori, ora_fine: undefined })
                    }}
                  >
                    {SLOT_ORARI.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Fine</p>
                  <select
                    className={`w-full text-sm bg-transparent focus:outline-none ${errori.ora_fine ? 'text-red-400' : 'text-[#1A1A1A]'}`}
                    value={form.ora_fine}
                    onChange={(e) => {
                      setForm({ ...form, ora_fine: e.target.value })
                      if (errori.ora_fine) setErrori({ ...errori, ora_fine: undefined })
                    }}
                  >
                    {SLOT_ORARI.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  {errori.ora_fine && <p className="text-xs text-red-500 mt-1">{errori.ora_fine}</p>}
                </div>
              </div>
            </>
          )}

          {/* Checkbox "Data di fine diversa" */}
          <div className="px-4 py-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.multiGiorno}
                onChange={(e) => {
                  const checked = e.target.checked
                  setForm((prev) => ({
                    ...prev,
                    multiGiorno: checked,
                    // Quando si attiva, default data_fine = data (l'utente la cambierà)
                    // Quando si disattiva, svuota data_fine
                    data_fine: checked ? (prev.data_fine || prev.data) : '',
                  }))
                  if (errori.data_fine) setErrori({ ...errori, data_fine: undefined })
                }}
                className="w-4 h-4 rounded border-gray-300 text-[#1E3A5F] focus:ring-[#1E3A5F]"
              />
              <span className="text-xs text-gray-500">Data di fine diversa</span>
            </label>
          </div>

          {/* Ripeti — appuntamenti ricorrenti */}
          <div className="px-4 py-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Ripeti</p>
            <select
              className="w-full text-sm text-[#1A1A1A] bg-transparent focus:outline-none"
              value={form.ricorrenza}
              onChange={(e) => {
                const ricorrenza = e.target.value as Ricorrenza
                setForm((prev) => ({
                  ...prev,
                  ricorrenza,
                  // Attivando la ripetizione proponiamo una fine di default (~3 mesi);
                  // disattivandola svuotiamo il campo.
                  ricorrenza_fine: ricorrenza === 'nessuna'
                    ? ''
                    : (prev.ricorrenza_fine || spostaData(prev.data || oggi, 90)),
                }))
                if (errori.ricorrenza_fine) setErrori({ ...errori, ricorrenza_fine: undefined })
              }}
            >
              {RICORRENZA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {form.ricorrenza === 'personalizzata' && (
            <div className="px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Ripeti ogni</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={99}
                  inputMode="numeric"
                  className={`w-16 text-sm text-center bg-white border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 ${errori.personalizzata ? 'border-red-300 text-red-500' : 'border-[#E5E7EB] text-[#1A1A1A]'}`}
                  value={form.personalizzata.intervallo}
                  onChange={(e) => {
                    const intervallo = e.target.value === '' ? 0 : parseInt(e.target.value, 10)
                    setForm((prev) => ({ ...prev, personalizzata: { ...prev.personalizzata, intervallo } }))
                    if (errori.personalizzata) setErrori({ ...errori, personalizzata: undefined })
                  }}
                />
                <select
                  className="flex-1 text-sm text-[#1A1A1A] bg-white border border-[#E5E7EB] rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30"
                  value={form.personalizzata.unita}
                  onChange={(e) => {
                    const unita = e.target.value as UnitaPersonalizzata
                    setForm((prev) => ({
                      ...prev,
                      personalizzata: {
                        ...prev.personalizzata,
                        unita,
                        // Passando alle settimane, se non ci sono giorni scelti proponiamo quello della data di inizio
                        giorni: unita === 'settimane' && prev.personalizzata.giorni.length === 0
                          ? [giornoSettimanaLun(prev.data || oggi)]
                          : prev.personalizzata.giorni,
                      },
                    }))
                    if (errori.personalizzata) setErrori({ ...errori, personalizzata: undefined })
                  }}
                >
                  <option value="giorni">{form.personalizzata.intervallo === 1 ? 'giorno' : 'giorni'}</option>
                  <option value="settimane">{form.personalizzata.intervallo === 1 ? 'settimana' : 'settimane'}</option>
                  <option value="mesi">{form.personalizzata.intervallo === 1 ? 'mese' : 'mesi'}</option>
                </select>
              </div>

              {form.personalizzata.unita === 'settimane' && (
                <div className="mt-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Nei giorni</p>
                  <div className="flex gap-1.5">
                    {GIORNI_SETTIMANA.map((lettera, idx) => {
                      const attivo = form.personalizzata.giorni.includes(idx)
                      return (
                        <button
                          key={idx}
                          type="button"
                          title={NOMI_GIORNI[idx]}
                          aria-label={NOMI_GIORNI[idx]}
                          aria-pressed={attivo}
                          onClick={() => {
                            setForm((prev) => {
                              const giorni = prev.personalizzata.giorni.includes(idx)
                                ? prev.personalizzata.giorni.filter((g) => g !== idx)
                                : [...prev.personalizzata.giorni, idx].sort()
                              return { ...prev, personalizzata: { ...prev.personalizzata, giorni } }
                            })
                            if (errori.personalizzata) setErrori({ ...errori, personalizzata: undefined })
                          }}
                          className={`w-8 h-8 rounded-full text-xs font-medium border transition-all select-none ${
                            attivo
                              ? 'bg-[#1E3A5F] border-[#1E3A5F] text-white'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {lettera}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {errori.personalizzata && <p className="text-xs text-red-500 mt-2">{errori.personalizzata}</p>}
            </div>
          )}

          {ricorrente && (
            <div className="px-4 py-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Fino al</p>
              <DatePicker
                value={form.ricorrenza_fine}
                min={form.data || oggi}
                errore={!!errori.ricorrenza_fine}
                onChange={(ricorrenza_fine) => {
                  setForm({ ...form, ricorrenza_fine })
                  if (errori.ricorrenza_fine) setErrori({ ...errori, ricorrenza_fine: undefined })
                }}
              />
              {errori.ricorrenza_fine ? (
                <p className="text-xs text-red-500 mt-1">{errori.ricorrenza_fine}</p>
              ) : (
                <p className="text-xs text-gray-400 mt-2">
                  {dateSerie.length > MAX_OCCORRENZE
                    ? `Più di ${MAX_OCCORRENZE} appuntamenti: scegli una data di fine più vicina`
                    : dateSerie.length <= 1
                      ? 'Verrà creato un solo appuntamento'
                      : `Verranno creati ${dateSerie.length} appuntamenti, dal ${formatDataBreve(dateSerie[0])} al ${formatDataBreve(dateSerie[dateSerie.length - 1])}`}
                </p>
              )}
            </div>
          )}

          {/* Note */}
          <div className="px-4 py-2.5">
            <input
              type="text"
              className="w-full text-xs text-gray-400 placeholder-gray-300 bg-transparent focus:outline-none"
              placeholder="Note (opzionale)"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button type="button" onClick={() => router.push('/')} className="btn-secondary flex-1">
            Annulla
          </button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {progresso && <span>Creazione {progresso.fatti}/{progresso.totale}…</span>}
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {ricorrente && dateSerie.length > 1 ? `Crea ${dateSerie.length} appuntamenti` : 'Crea appuntamento'}
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  )
}
