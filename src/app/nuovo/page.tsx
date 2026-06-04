'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import ContactSearch from '@/components/ContactSearch'
import DatePicker from '@/components/DatePicker'

function generaSlotOrari(): string[] {
  const slot: string[] = []
  for (let h = 8; h <= 20; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 20 && m > 0) break
      slot.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return slot
}

const SLOT_ORARI = generaSlotOrari()

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
  ora_inizio: string
  ora_fine: string
  note: string
  professionista: string
  guest: string[]
}

interface Errori {
  professionista?: string
  cliente_nome?: string
  data?: string
  ora_fine?: string
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

export default function PaginaNuovoAppuntamento() {
  const router = useRouter()
  const oggi = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState<FormState>({
    cliente_nome: '',
    cliente_telefono: '',
    cliente_dettagli: '',
    cliente_indirizzo: '',
    data: oggi,
    ora_inizio: '09:00',
    ora_fine: '10:00',
    note: '',
    professionista: '',
    guest: [],
  })
  const [errori, setErrori] = useState<Errori>({})
  const [loading, setLoading] = useState(false)

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
    if (form.ora_inizio >= form.ora_fine) e.ora_fine = "L'ora di fine deve essere dopo l'inizio"
    setErrori(e)
    return Object.keys(e).length === 0
  }

  const creaAppuntamento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valida()) return
    setLoading(true)
    try {
      const res = await fetch('/api/appuntamenti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_nome: form.cliente_nome,
          cliente_telefono: form.cliente_telefono,
          cliente_dettagli: form.cliente_dettagli,
          indirizzo: form.cliente_indirizzo,
          data: form.data,
          ora_inizio: form.ora_inizio,
          ora_fine: form.ora_fine,
          note: form.note,
          professionista: form.professionista,
          guest: form.guest,
          tipo: '',
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.errore ?? 'Errore durante la creazione')
      }
      toast.success('Appuntamento creato con successo!')
      router.refresh()
      router.push('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore durante la creazione')
    } finally {
      setLoading(false)
    }
  }

  const guestDisponibili = GUEST_OPTIONS[form.professionista] ?? []

  return (
    <div className="h-full flex items-center justify-center p-6 overflow-hidden">
      <form onSubmit={creaAppuntamento} noValidate className="w-full max-w-sm">

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
                setForm({
                  ...form,
                  cliente_nome: nome,
                  cliente_telefono: tel,
                  cliente_dettagli: dettagli,
                  cliente_indirizzo: indirizzo,
                })
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

          {/* Indirizzo */}
          <div className="px-4 py-3">
            <input
              type="text"
              className="w-full text-sm text-[#1A1A1A] placeholder-gray-400 bg-transparent focus:outline-none"
              placeholder="Indirizzo (opzionale)"
              value={form.cliente_indirizzo}
              onChange={(e) => setForm({ ...form, cliente_indirizzo: e.target.value })}
            />
          </div>

          {/* Calendario */}
          <div className="px-4 py-3">
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

          {/* Orario */}
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
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Crea appuntamento
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  )
}
