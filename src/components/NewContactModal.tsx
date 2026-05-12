'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
  onCreato: () => void
}

export default function NewContactModal({ onClose, onCreato }: Props) {
  const [form, setForm] = useState({
    nome: '',
    cognome: '',
    telefono: '+39',
    email: '',
    dettagli: '',
    nota: '',
  })
  const [loading, setLoading] = useState(false)
  const [errori, setErrori] = useState<Partial<Record<'nome' | 'cognome' | 'telefono', string>>>({})

  const valida = () => {
    const e: typeof errori = {}
    if (!form.nome.trim()) e.nome = 'Obbligatorio'
    if (!form.cognome.trim()) e.cognome = 'Obbligatorio'
    if (!form.telefono.trim() || form.telefono === '+39') e.telefono = 'Obbligatorio'
    setErrori(e)
    return Object.keys(e).length === 0
  }

  const salva = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valida()) return
    setLoading(true)
    try {
      const res = await fetch('/api/contatti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.errore ?? 'Errore')
      }
      toast.success(`${form.nome} ${form.cognome} aggiunto ai contatti`)
      onCreato()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore durante il salvataggio')
    } finally {
      setLoading(false)
    }
  }

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [field]: e.target.value })
    if (field in errori) setErrori({ ...errori, [field]: undefined })
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-[#E5E7EB]">
          <h2 className="font-serif text-xl text-[#1A1A1A]">Nuovo contatto</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={salva} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Nome <span className="text-red-400">*</span></label>
              <input className={`input-field ${errori.nome ? 'border-red-300' : ''}`} placeholder="Mario" value={form.nome} onChange={set('nome')} />
              {errori.nome && <p className="text-xs text-red-500 mt-1">{errori.nome}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Cognome <span className="text-red-400">*</span></label>
              <input className={`input-field ${errori.cognome ? 'border-red-300' : ''}`} placeholder="Rossi" value={form.cognome} onChange={set('cognome')} />
              {errori.cognome && <p className="text-xs text-red-500 mt-1">{errori.cognome}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Telefono <span className="text-red-400">*</span></label>
            <input type="tel" className={`input-field ${errori.telefono ? 'border-red-300' : ''}`} placeholder="+39 333 1234567" value={form.telefono} onChange={set('telefono')} />
            {errori.telefono && <p className="text-xs text-red-500 mt-1">{errori.telefono}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
            <input type="email" className="input-field" placeholder="mario.rossi@email.it" value={form.email} onChange={set('email')} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Dettagli</label>
            <input className="input-field" placeholder="Es. nome figlio, riferimento..." value={form.dettagli} onChange={set('dettagli')} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Note</label>
            <textarea className="input-field resize-none" rows={2} placeholder="Aggiungi una nota..." value={form.nota} onChange={set('nota')} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annulla</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Salvataggio...' : 'Aggiungi contatto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
