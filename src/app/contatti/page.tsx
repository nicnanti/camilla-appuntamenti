'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import NewContactModal from '@/components/NewContactModal'
import type { Contatto } from '@/types'

function Avatar({ nome, cognome }: { nome: string; cognome: string }) {
  const colori = [
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-purple-100 text-purple-700',
    'bg-rose-100 text-rose-700',
  ]
  const colore = colori[nome.charCodeAt(0) % colori.length]
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${colore}`}>
      {nome.charAt(0).toUpperCase()}{cognome.charAt(0).toUpperCase()}
    </div>
  )
}

const COL = 'grid-cols-[32px_1fr_1fr_1fr_1fr_1fr_1.2fr_64px]'
const HEADER_COLS = ['Nome', 'Cognome', 'Telefono', 'Indirizzo', 'Dettagli', 'Note', '']

export default function PaginaContatti() {
  const [contatti, setContatti] = useState<Contatto[]>([])
  const [loading, setLoading] = useState(true)
  const [ricerca, setRicerca] = useState('')
  const [mostraModal, setMostraModal] = useState(false)
  const [contattoInModifica, setContattoInModifica] = useState<Contatto | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)

  const carica = useCallback(async () => {
    setLoading(true)
    try {
      const params = ricerca ? `?q=${encodeURIComponent(ricerca)}` : ''
      const res = await fetch(`/api/contatti${params}`)
      const data = await res.json()
      setContatti(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Errore nel caricamento dei contatti')
    } finally {
      setLoading(false)
    }
  }, [ricerca])

  useEffect(() => {
    const timer = setTimeout(carica, 300)
    return () => clearTimeout(timer)
  }, [carica])

  const elimina = async (c: Contatto) => {
    if (!confirm(`Eliminare ${c.nome} ${c.cognome}? L'operazione è irreversibile.`)) return
    setEliminando(c.id)
    try {
      const res = await fetch(`/api/contatti?id=${c.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success(`${c.nome} ${c.cognome} eliminato`)
      setContatti((prev) => prev.filter((x) => x.id !== c.id))
    } catch {
      toast.error('Errore durante l\'eliminazione')
    } finally {
      setEliminando(null)
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-serif text-3xl text-[#1A1A1A] mb-1">Contatti</h1>
          <p className="text-sm text-gray-400">
            {loading ? 'Caricamento...' : `${contatti.length} contatto${contatti.length !== 1 ? 'i' : ''}`}
          </p>
        </div>
        <button onClick={() => setMostraModal(true)} className="btn-primary flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Aggiungi contatto
        </button>
      </div>

      {/* Ricerca */}
      <div className="relative mb-6">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
        <input
          type="text"
          className="input-field pl-10"
          placeholder="Cerca per nome, cognome o dettagli..."
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
        />
        {ricerca && (
          <button onClick={() => setRicerca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {/* Tabella */}
      <div className="card overflow-hidden overflow-x-auto">
        {/* Intestazione */}
        <div className={`hidden md:grid ${COL} gap-3 px-4 py-3 border-b border-[#E5E7EB] bg-[#FAFAFA] items-center`}>
          <div />
          {HEADER_COLS.map((h, i) => (
            <p key={i} className="text-xs font-medium text-gray-400 uppercase tracking-wider">{h}</p>
          ))}
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="w-6 h-6 border-2 border-[#3B82F6]/30 border-t-[#3B82F6] rounded-full animate-spin" />
          </div>
        ) : contatti.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              {ricerca ? `Nessun contatto trovato per "${ricerca}"` : 'Nessun contatto ancora'}
            </p>
            {!ricerca && (
              <button onClick={() => setMostraModal(true)} className="btn-primary text-sm">
                Aggiungi il primo contatto
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#F3F4F6]">
            {contatti.map((c) => (
              <div
                key={c.id}
                className={`grid ${COL} gap-3 px-4 py-3 items-center transition-colors hover:bg-[#FAFAFA]`}
              >
                <Avatar nome={c.nome} cognome={c.cognome} />
                <p className="text-sm font-medium text-[#1A1A1A] truncate">{c.nome}</p>
                <p className="text-sm font-medium text-[#1A1A1A] truncate">{c.cognome}</p>
                <div>
                  {c.telefono ? (
                    <a href={`tel:${c.telefono}`} className="text-sm text-[#3B82F6] hover:underline">
                      {c.telefono}
                    </a>
                  ) : (
                    <span className="text-sm text-gray-300">—</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 truncate">
                  {[c.indirizzo, c.comune].filter(Boolean).join(', ') || <span className="text-gray-300">—</span>}
                </p>
                <p className="text-sm text-gray-500 truncate" title={c.dettagli ?? ''}>
                  {c.dettagli || <span className="text-gray-300">—</span>}
                </p>
                <p className="text-sm text-gray-500 line-clamp-2" title={c.note ?? ''}>
                  {c.note || <span className="text-gray-300">—</span>}
                </p>
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => setContattoInModifica(c)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#1E3A5F] hover:bg-[#F0F4F8] transition-colors"
                    title="Modifica"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => elimina(c)}
                    disabled={eliminando === c.id}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                    title="Elimina"
                  >
                    {eliminando === c.id ? (
                      <div className="w-3 h-3 border-2 border-red-300/30 border-t-red-400 rounded-full animate-spin" />
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {mostraModal && (
        <NewContactModal
          onClose={() => setMostraModal(false)}
          onCreato={() => { setMostraModal(false); carica() }}
        />
      )}

      {contattoInModifica && (
        <NewContactModal
          contattoEsistente={contattoInModifica}
          onClose={() => setContattoInModifica(null)}
          onCreato={() => { setContattoInModifica(null); carica() }}
        />
      )}
    </div>
  )
}
