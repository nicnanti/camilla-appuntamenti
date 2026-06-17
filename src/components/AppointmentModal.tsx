'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import AddressAutocomplete from './AddressAutocomplete'
import InvitatiPicker from './InvitatiPicker'
import type { Appuntamento, Invitato } from '@/types'
import clsx from 'clsx'

interface Props {
  appuntamento: Appuntamento
  onClose: () => void
  onAggiornato: () => void
}

export default function AppointmentModal({ appuntamento, onClose, onAggiornato }: Props) {
  const [modalita, setModalita] = useState<'dettagli' | 'modifica' | 'sposta'>('dettagli')
  const [loading, setLoading] = useState(false)

  const dataFineIniziale = appuntamento.data_fine ?? ''
  const multiGiornoIniziale = !!(dataFineIniziale && dataFineIniziale > appuntamento.data)

  const [form, setForm] = useState({
    cliente_nome: appuntamento.cliente_nome,
    cliente_telefono: appuntamento.cliente_telefono,
    note: appuntamento.note ?? '',
    data: appuntamento.data,
    data_fine: dataFineIniziale,
    multiGiorno: multiGiornoIniziale,
    ora_inizio: appuntamento.ora_inizio,
    ora_fine: appuntamento.ora_fine,
    indirizzo: appuntamento.indirizzo ?? '',
    invitati: appuntamento.invitati ?? [],
  })

  const aggiorna = async () => {
    setLoading(true)
    try {
      // Normalizza data_fine: solo se checkbox attiva E successiva alla data inizio
      const dataFineNorm = form.multiGiorno && form.data_fine && form.data_fine > form.data ? form.data_fine : null
      const res = await fetch('/api/appuntamenti', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: appuntamento.id,
          google_calendar_event_id: appuntamento.google_calendar_event_id,
          ics_uid: appuntamento.ics_uid,
          ics_sequence: appuntamento.ics_sequence,
          guests: appuntamento.guests,
          professionista: appuntamento.professionista,
          ...form,
          data_fine: dataFineNorm,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Appuntamento aggiornato')
      onAggiornato()
      onClose()
    } catch {
      toast.error('Errore durante l\'aggiornamento')
    } finally {
      setLoading(false)
    }
  }

  const cancella = async () => {
    if (!confirm('Sei sicuro di voler cancellare questo appuntamento?')) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ id: appuntamento.id })
      if (appuntamento.google_calendar_event_id) params.set('gcalId', appuntamento.google_calendar_event_id)
      if (appuntamento.ics_uid) params.set('icsUid', appuntamento.ics_uid)
      if (appuntamento.ics_sequence !== undefined) params.set('icsSeq', String(appuntamento.ics_sequence))
      if (appuntamento.guests) params.set('guests', appuntamento.guests)
      if (appuntamento.professionista) params.set('prof', appuntamento.professionista)
      params.set('nome', appuntamento.cliente_nome)
      params.set('data', appuntamento.data)
      params.set('oraInizio', appuntamento.ora_inizio)
      params.set('oraFine', appuntamento.ora_fine)
      const res = await fetch(`/api/appuntamenti?${params}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Appuntamento cancellato')
      onAggiornato()
      onClose()
    } catch {
      toast.error('Errore durante la cancellazione')
    } finally {
      setLoading(false)
    }
  }

  const slotOrari: string[] = []
  for (let h = 8; h <= 20; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 20 && m > 0) break
      slotOrari.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }

  const formatData = (d: string) => {
    if (!d) return ''
    const [y, m, day] = d.split('-')
    return `${day}/${m}/${y}`
  }

  // Colore badge professionista (host)
  const badgeClass = appuntamento.professionista === 'Giacomo'
    ? 'bg-emerald-100 text-emerald-800'
    : 'bg-blue-100 text-blue-800'

  // Calcola i guest professionisti (Camilla/Giacomo coinvolti ma non host)
  const EMAIL_CAMILLA = 'camilla.ghisleni1@gmail.com'
  const EMAIL_GIACOMO = 'giacomo.ghisleni1@gmail.com'
  const host = appuntamento.professionista ?? ''
  const guestProf: string[] = (() => {
    const out: string[] = []
    const guestsLower = (appuntamento.guests ?? '').toLowerCase()
    let camillaCoinvolta = false
    let giacomoCoinvolto = false
    try {
      const parsed = JSON.parse(appuntamento.google_calendar_event_id ?? '')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !parsed.eventId) {
        if (parsed.camilla) camillaCoinvolta = true
        if (parsed.giacomo) giacomoCoinvolto = true
      }
    } catch {}
    if (guestsLower.includes(EMAIL_CAMILLA)) camillaCoinvolta = true
    if (guestsLower.includes(EMAIL_GIACOMO)) giacomoCoinvolto = true
    if (camillaCoinvolta && host !== 'Camilla') out.push('Camilla')
    if (giacomoCoinvolto && host !== 'Giacomo') out.push('Giacomo')
    return out
  })()

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#E5E7EB]">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {appuntamento.professionista && (
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${badgeClass}`}>
                  {appuntamento.professionista}
                  <span className="opacity-70 font-normal">(host)</span>
                </span>
              )}
              {guestProf.map((g) => (
                <span
                  key={g}
                  className={clsx(
                    'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border border-dashed',
                    g === 'Giacomo'
                      ? 'bg-emerald-50/60 text-emerald-700 border-emerald-400'
                      : 'bg-blue-50/60 text-blue-700 border-blue-400',
                  )}
                >
                  {g}
                  <span className="opacity-70 font-normal">(ospite)</span>
                </span>
              ))}
            </div>
            <h2 className="font-serif text-xl text-[#1A1A1A]">{appuntamento.cliente_nome}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Navigazione schede */}
        <div className="flex border-b border-[#E5E7EB] px-6">
          {(['dettagli', 'modifica', 'sposta'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setModalita(tab)}
              className={clsx(
                'py-3 px-1 mr-5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
                modalita === tab
                  ? 'border-[#1E3A5F] text-[#1E3A5F]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ── Vista Dettagli ── */}
          {modalita === 'dettagli' && (
            <div className="space-y-4">
              {appuntamento.data_fine && appuntamento.data_fine > appuntamento.data ? (
                <>
                  <InfoRiga label="Data inizio" valore={formatData(appuntamento.data)} />
                  <InfoRiga label="Data fine" valore={formatData(appuntamento.data_fine)} />
                </>
              ) : (
                <InfoRiga label="Data" valore={formatData(appuntamento.data)} />
              )}
              <InfoRiga label="Orario" valore={`${appuntamento.ora_inizio} – ${appuntamento.ora_fine}`} />
              {appuntamento.cliente_telefono && (
                <InfoRiga label="Telefono" valore={appuntamento.cliente_telefono} />
              )}
              <InfoRiga label="Indirizzo" valore={appuntamento.indirizzo || '—'} />
              {appuntamento.guests && (
                <InfoRiga label="Guest" valore={appuntamento.guests} />
              )}
              {appuntamento.invitati && appuntamento.invitati.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1.5">Invitati</p>
                  <div className="space-y-1">
                    {appuntamento.invitati.map((inv, i) => (
                      <div key={`${inv.telefono}-${i}`} className="text-sm text-[#1A1A1A] flex justify-between gap-2">
                        <span className="font-medium truncate">{inv.nome}</span>
                        {inv.telefono && <span className="text-gray-500">{inv.telefono}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <InfoRiga label="Stato" valore={appuntamento.stato} />
              {appuntamento.note && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Note</p>
                  <p className="text-sm text-[#1A1A1A] bg-gray-50 rounded-lg p-3">{appuntamento.note}</p>
                </div>
              )}
              <div className="pt-4 flex gap-3">
                <button onClick={() => setModalita('modifica')} className="btn-secondary flex-1">
                  Modifica
                </button>
                <button onClick={cancella} disabled={loading} className="btn-danger flex-1">
                  {loading ? 'Cancellazione...' : 'Cancella'}
                </button>
              </div>
            </div>
          )}

          {/* ── Vista Modifica ── */}
          {modalita === 'modifica' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Nome cliente</label>
                <input
                  className="input-field"
                  value={form.cliente_nome}
                  onChange={(e) => setForm({ ...form, cliente_nome: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Telefono</label>
                <input
                  className="input-field"
                  value={form.cliente_telefono}
                  onChange={(e) => setForm({ ...form, cliente_telefono: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Indirizzo</label>
                <div className="input-field !p-0 !border-0 !bg-transparent">
                  <AddressAutocomplete
                    value={form.indirizzo}
                    onChange={(v) => setForm((prev) => ({ ...prev, indirizzo: v }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Invitati</label>
                <InvitatiPicker
                  invitati={form.invitati}
                  onAggiungi={(inv: Invitato) => setForm((prev) => ({ ...prev, invitati: [...prev.invitati, inv] }))}
                  onRimuovi={(idx) => setForm((prev) => ({ ...prev, invitati: prev.invitati.filter((_, i) => i !== idx) }))}
                />
              </div>
              {form.multiGiorno ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Data inizio</label>
                    <input
                      type="date"
                      className="input-field"
                      value={form.data}
                      onChange={(e) => {
                        const nuovaData = e.target.value
                        const dataFineAggiornata = form.data_fine && form.data_fine < nuovaData ? nuovaData : form.data_fine
                        setForm({ ...form, data: nuovaData, data_fine: dataFineAggiornata })
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Data fine</label>
                    <input
                      type="date"
                      className="input-field"
                      value={form.data_fine}
                      min={form.data}
                      onChange={(e) => setForm({ ...form, data_fine: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Data</label>
                  <input
                    type="date"
                    className="input-field"
                    value={form.data}
                    onChange={(e) => setForm({ ...form, data: e.target.value })}
                  />
                </div>
              )}

              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.multiGiorno}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setForm((prev) => ({
                        ...prev,
                        multiGiorno: checked,
                        data_fine: checked ? (prev.data_fine || prev.data) : '',
                      }))
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-[#1E3A5F] focus:ring-[#1E3A5F]"
                  />
                  <span className="text-xs text-gray-500">Data di fine diversa</span>
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Note</label>
                <textarea
                  className="input-field resize-none"
                  rows={3}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>
              <button onClick={aggiorna} disabled={loading} className="btn-primary w-full mt-2">
                {loading ? 'Salvataggio...' : 'Salva modifiche'}
              </button>
            </div>
          )}

          {/* ── Vista Sposta ── */}
          {modalita === 'sposta' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Nuova data</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Ora inizio</label>
                <select
                  className="input-field"
                  value={form.ora_inizio}
                  onChange={(e) => setForm({ ...form, ora_inizio: e.target.value })}
                >
                  {slotOrari.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Ora fine</label>
                <select
                  className="input-field"
                  value={form.ora_fine}
                  onChange={(e) => setForm({ ...form, ora_fine: e.target.value })}
                >
                  {slotOrari.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <button
                onClick={async () => {
                  setLoading(true)
                  try {
                    const res = await fetch('/api/appuntamenti', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        id: appuntamento.id,
                        google_calendar_event_id: appuntamento.google_calendar_event_id,
                        data: form.data,
                        ora_inizio: form.ora_inizio,
                        ora_fine: form.ora_fine,
                        stato: 'Spostato',
                      }),
                    })
                    if (!res.ok) throw new Error()
                    toast.success('Appuntamento spostato')
                    onAggiornato()
                    onClose()
                  } catch {
                    toast.error('Errore durante lo spostamento')
                  } finally {
                    setLoading(false)
                  }
                }}
                disabled={loading}
                className="btn-primary w-full mt-2"
              >
                {loading ? 'Spostamento...' : 'Conferma spostamento'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRiga({ label, valore }: { label: string; valore: string }) {
  return (
    <div className="flex justify-between items-start">
      <span className="text-xs text-gray-400 uppercase tracking-wider pt-0.5">{label}</span>
      <span className="text-sm text-[#1A1A1A] font-medium text-right">{valore}</span>
    </div>
  )
}
