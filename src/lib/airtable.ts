import Airtable from 'airtable'
import type { Appuntamento, Contatto } from '@/types'

interface GcalEntry {
  professionista: string
  calendarId: string
  eventId: string
}

function parseGcalEntry(gcalId: string): GcalEntry | null {
  if (!gcalId) return null
  try {
    const parsed = JSON.parse(gcalId)
    if (parsed && !Array.isArray(parsed) && parsed.eventId) return parsed as GcalEntry
    if (Array.isArray(parsed) && parsed.length > 0) {
      return { professionista: parsed[0].professionista ?? '', calendarId: parsed[0].calendarId ?? '', eventId: parsed[0].eventId ?? '' }
    }
  } catch {}
  return { professionista: '', calendarId: '', eventId: gcalId }
}

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID!)

const tabellaAppuntamenti = base('Appuntamenti')
const tabellaProssimiAppuntamenti = base('tblS4JJw5IdVbaOmT')
const tabellaContatti = base('tbltW0SKP1MJeg9Bv')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mappaAppuntamento(record: Airtable.Record<Airtable.FieldSet>): Appuntamento {
  const f = record.fields
  const gcalId = (f.google_calendar_event_id as string) ?? ''
  const entry = parseGcalEntry(gcalId)

  return {
    id: record.id,
    cliente_nome: (f.cliente_nome as string) ?? '',
    cliente_telefono: (f.cliente_telefono as string) ?? '',
    data: (f.data as string) ?? '',
    ora_inizio: (f.ora_inizio as string) ?? '',
    ora_fine: (f.ora_fine as string) ?? '',
    tipo: (f.tipo as string) ?? '',
    note: (f.note as string) ?? '',
    google_calendar_event_id: gcalId,
    professionista: entry?.professionista ?? '',
    host: (f.host as string) ?? '',
    guests: (f.guests as string) ?? '',
    reminder_sent: (f.reminder_sent as boolean) ?? false,
    reminder_sent_at: (f.reminder_sent_at as string) ?? '',
    stato: (f.stato as Appuntamento['stato']) ?? 'Confermato',
    ics_uid: (f.ics_uid as string) ?? '',
    ics_sequence: (f.ics_sequence as number) ?? 0,
    created_at: (f.created_at as string) ?? '',
  }
}

function mappaContatto(record: Airtable.Record<Airtable.FieldSet>): Contatto {
  const f = record.fields
  return {
    id: record.id,
    nome: (f.nome as string) ?? '',
    cognome: (f.cognome as string) ?? '',
    dettagli: (f.dettagli as string) ?? '',
    telefono: (f.numero as string) ?? '',
    email: (f.email as string) ?? '',
    nota: (f.nota as string) ?? '',
    created_at: (f.created_at as string) ?? '',
  }
}

// ─── Appuntamenti ─────────────────────────────────────────────────────────────

export async function getAppuntamenti(filtroMese?: string): Promise<Appuntamento[]> {
  const records = await tabellaAppuntamenti
    .select({ sort: [{ field: 'data', direction: 'asc' }, { field: 'ora_inizio', direction: 'asc' }] })
    .all()

  const appuntamenti = records.map(mappaAppuntamento)
  if (filtroMese) return appuntamenti.filter((a) => a.data.startsWith(filtroMese))
  return appuntamenti
}

export async function getAppuntamentiByData(data: string): Promise<Appuntamento[]> {
  const records = await tabellaAppuntamenti
    .select({ filterByFormula: `{data} = '${data}'`, sort: [{ field: 'ora_inizio', direction: 'asc' }] })
    .all()
  return records.map(mappaAppuntamento)
}

export async function getAppuntamentoById(id: string): Promise<Appuntamento> {
  const record = await tabellaAppuntamenti.find(id)
  return mappaAppuntamento(record)
}

export async function creaAppuntamento(
  dati: Omit<Appuntamento, 'id' | 'created_at' | 'reminder_sent' | 'stato'>
): Promise<Appuntamento> {
  const record = await tabellaAppuntamenti.create({
    cliente_nome: dati.cliente_nome,
    cliente_telefono: dati.cliente_telefono,
    data: dati.data,
    ora_inizio: dati.ora_inizio,
    ora_fine: dati.ora_fine,
    note: dati.note ?? '',
    google_calendar_event_id: dati.google_calendar_event_id ?? '',
    host: dati.host ?? '',
    guests: dati.guests ?? '',
    reminder_sent: false,
    stato: 'Confermato',
    ics_uid: dati.ics_uid ?? '',
    ics_sequence: dati.ics_sequence ?? 0,
  })
  return mappaAppuntamento(record)
}

export async function aggiornaAppuntamento(
  id: string,
  dati: Partial<Omit<Appuntamento, 'id' | 'created_at'>>
): Promise<Appuntamento> {
  const campi: Airtable.FieldSet = {}
  if (dati.cliente_nome !== undefined) campi.cliente_nome = dati.cliente_nome
  if (dati.cliente_telefono !== undefined) campi.cliente_telefono = dati.cliente_telefono
  if (dati.data !== undefined) campi.data = dati.data
  if (dati.ora_inizio !== undefined) campi.ora_inizio = dati.ora_inizio
  if (dati.ora_fine !== undefined) campi.ora_fine = dati.ora_fine
  if (dati.note !== undefined) campi.note = dati.note
  if (dati.google_calendar_event_id !== undefined) campi.google_calendar_event_id = dati.google_calendar_event_id
  if (dati.reminder_sent !== undefined) campi.reminder_sent = dati.reminder_sent
  if (dati.reminder_sent_at !== undefined) campi.reminder_sent_at = dati.reminder_sent_at
  if (dati.stato !== undefined) campi.stato = dati.stato
  if (dati.ics_uid !== undefined) campi.ics_uid = dati.ics_uid
  if (dati.ics_sequence !== undefined) campi.ics_sequence = dati.ics_sequence

  const record = await tabellaAppuntamenti.update(id, campi)
  return mappaAppuntamento(record)
}

export async function eliminaAppuntamento(id: string): Promise<void> {
  await tabellaAppuntamenti.destroy(id)
}

// ─── Prossimi Appuntamenti ────────────────────────────────────────────────────

export async function creaProssimoAppuntamento(app: Appuntamento): Promise<void> {
  await tabellaProssimiAppuntamenti.create({
    cliente_nome: app.cliente_nome,
    cliente_telefono: app.cliente_telefono,
    data: app.data,
    ora_inizio: app.ora_inizio,
    ora_fine: app.ora_fine,
    note: app.note ?? '',
    google_calendar_event_id: app.google_calendar_event_id ?? '',
    host: app.host ?? '',
    guests: app.guests ?? '',
    reminder_sent: app.reminder_sent,
    stato: app.stato,
    ics_uid: app.ics_uid ?? '',
    ics_sequence: app.ics_sequence ?? 0,
  })
}

export async function aggiornaProssimoAppuntamentoByGcalId(
  gcalId: string,
  dati: Partial<Omit<Appuntamento, 'id' | 'created_at'>>
): Promise<void> {
  // FIND gestisce sia il caso legacy (campo = eventId raw) sia il nuovo JSON che contiene eventId
  const records = await tabellaProssimiAppuntamenti
    .select({ filterByFormula: `FIND('${gcalId}', {google_calendar_event_id})`, maxRecords: 1 })
    .all()
  if (records.length === 0) return

  const campi: Airtable.FieldSet = {}
  if (dati.cliente_nome !== undefined) campi.cliente_nome = dati.cliente_nome
  if (dati.cliente_telefono !== undefined) campi.cliente_telefono = dati.cliente_telefono
  if (dati.data !== undefined) campi.data = dati.data
  if (dati.ora_inizio !== undefined) campi.ora_inizio = dati.ora_inizio
  if (dati.ora_fine !== undefined) campi.ora_fine = dati.ora_fine
  if (dati.note !== undefined) campi.note = dati.note
  if (dati.reminder_sent !== undefined) campi.reminder_sent = dati.reminder_sent
  if (dati.reminder_sent_at !== undefined) campi.reminder_sent_at = dati.reminder_sent_at
  if (dati.stato !== undefined) campi.stato = dati.stato
  if (dati.ics_uid !== undefined) campi.ics_uid = dati.ics_uid
  if (dati.ics_sequence !== undefined) campi.ics_sequence = dati.ics_sequence

  await tabellaProssimiAppuntamenti.update(records[0].id, campi)
}

export async function eliminaProssimoAppuntamentoByGcalId(gcalId: string): Promise<void> {
  const records = await tabellaProssimiAppuntamenti
    .select({ filterByFormula: `FIND('${gcalId}', {google_calendar_event_id})`, maxRecords: 1 })
    .all()
  if (records.length === 0) return
  await tabellaProssimiAppuntamenti.destroy(records[0].id)
}

export async function eliminaProssimiAppuntamentiPassati(): Promise<number> {
  const oggi = new Date().toISOString().slice(0, 10)
  const records = await tabellaProssimiAppuntamenti.select().all()
  const passati = records.filter((r) => ((r.fields.data as string) ?? '') < oggi)
  if (passati.length === 0) return 0
  for (let i = 0; i < passati.length; i += 10) {
    await tabellaProssimiAppuntamenti.destroy(passati.slice(i, i + 10).map((r) => r.id))
  }
  return passati.length
}

// ─── Contatti ─────────────────────────────────────────────────────────────────

export async function getContatti(ricerca?: string): Promise<Contatto[]> {
  const records = await tabellaContatti
    .select({ sort: [{ field: 'cognome', direction: 'asc' }, { field: 'nome', direction: 'asc' }] })
    .all()

  const contatti = records.map(mappaContatto)
  if (!ricerca) return contatti

  const q = ricerca.toLowerCase()
  return contatti.filter(
    (c) =>
      c.nome.toLowerCase().includes(q) ||
      c.cognome.toLowerCase().includes(q) ||
      `${c.nome} ${c.cognome}`.toLowerCase().includes(q) ||
      (c.dettagli ?? '').toLowerCase().includes(q)
  )
}

export async function creaContatto(dati: Omit<Contatto, 'id' | 'created_at'>): Promise<Contatto> {
  const record = await tabellaContatti.create({
    nome: dati.nome,
    cognome: dati.cognome,
    dettagli: dati.dettagli ?? '',
    numero: dati.telefono,
    email: dati.email ?? '',
    nota: dati.nota ?? '',
  })
  return mappaContatto(record)
}

export async function aggiornaContatto(
  id: string,
  dati: Partial<Omit<Contatto, 'id' | 'created_at'>>
): Promise<Contatto> {
  const campi: Airtable.FieldSet = {}
  if (dati.nome !== undefined) campi.nome = dati.nome
  if (dati.cognome !== undefined) campi.cognome = dati.cognome
  if (dati.dettagli !== undefined) campi.dettagli = dati.dettagli
  if (dati.telefono !== undefined) campi.numero = dati.telefono
  if (dati.email !== undefined) campi.email = dati.email
  if (dati.nota !== undefined) campi.nota = dati.nota
  const record = await tabellaContatti.update(id, campi)
  return mappaContatto(record)
}

export async function eliminaContatto(id: string): Promise<void> {
  await tabellaContatti.destroy(id)
}
