import Airtable from 'airtable'
import type { Appuntamento, Contatto, Invitato } from '@/types'

interface GcalEntry {
  professionista: string
  calendarId: string
  eventId: string
}

function parseInvitati(raw: unknown): Invitato[] {
  if (!raw) return []
  if (typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
        .filter((i) => i && typeof i.nome === 'string')
        .map((i) => ({ nome: String(i.nome), telefono: String(i.telefono ?? ''), email: i.email ? String(i.email) : undefined }))
    }
  } catch {}
  return []
}

function stringifyInvitati(invitati?: Invitato[]): string {
  if (!invitati || invitati.length === 0) return ''
  return JSON.stringify(invitati)
}

// I campi Date di Airtable non accettano stringa vuota: causa 422 INVALID_VALUE_FOR_COLUMN.
// undefined o ''  → omette (no-op);
// null            → svuota il campo lato Airtable;
// stringa valida  → imposta normalmente.
function assegnaCampoData(campi: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) return
  if (value === '') return
  campi[key] = value
}

function parseGcalEntry(gcalId: string): GcalEntry | null {
  if (!gcalId) return null
  try {
    const parsed = JSON.parse(gcalId)
    // Nuovo formato: {"camilla":"eventId"} o {"giacomo":"eventId","camilla":"..."}
    if (parsed && !Array.isArray(parsed) && !parsed.eventId && !parsed.professionista) {
      const chiavi = Object.keys(parsed).filter((k) => typeof parsed[k] === 'string' && parsed[k])
      if (chiavi.length > 0) {
        const nome = chiavi[0]
        return {
          professionista: nome.charAt(0).toUpperCase() + nome.slice(1),
          calendarId: '',
          eventId: parsed[nome] as string,
        }
      }
    }
    // Vecchio formato oggetto: {professionista, calendarId, eventId}
    if (parsed && !Array.isArray(parsed) && parsed.eventId) return parsed as GcalEntry
    // Vecchio formato array
    if (Array.isArray(parsed) && parsed.length > 0) {
      return { professionista: parsed[0].professionista ?? '', calendarId: parsed[0].calendarId ?? '', eventId: parsed[0].eventId ?? '' }
    }
  } catch {}
  return { professionista: '', calendarId: '', eventId: gcalId }
}

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID!)

const tabellaAppuntamenti = base('Appuntamenti')
const tabellaProssimiAppuntamenti = base('tblS4JJw5IdVbaOmT')
const tabellaContatti = base(process.env.AIRTABLE_CONTATTI_TABLE ?? 'tblOlAYVnEDGZMfsV')

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
    data_fine: (f.data_fine as string) || undefined,
    ora_inizio: (f.ora_inizio as string) ?? '',
    ora_fine: (f.ora_fine as string) ?? '',
    tipo: (f.tipo as string) ?? '',
    note: (f.note as string) ?? '',
    google_calendar_event_id: gcalId,
    professionista: entry?.professionista ?? '',
    host: (f.host as string) ?? '',
    guests: (f.guests as string) ?? '',
    indirizzo: (f.location as string) ?? '',
    reminder_sent: (f.reminder_sent as boolean) ?? false,
    reminder_sent_at: (f.reminder_sent_at as string) ?? '',
    stato: (f.stato as Appuntamento['stato']) ?? 'Confermato',
    ics_uid: (f.ics_uid as string) ?? '',
    ics_sequence: (f.ics_sequence as number) ?? 0,
    invitati: parseInvitati(f.invitati),
    created_at: (f.created_at as string) ?? '',
  }
}

function mappaContatto(record: Airtable.Record<Airtable.FieldSet>): Contatto {
  const f = record.fields
  return {
    id: record.id,
    nome: (f['Nome'] as string) ?? '',
    cognome: (f['Cognome'] as string) ?? '',
    nome_completo: (f['Nome Completo'] as string) ?? '',
    telefono: (f['Telefono'] as string) ?? '',
    email: (f['Email'] as string) ?? '',
    indirizzo: (f['Indirizzo di Residenza'] as string) ?? '',
    comune: (f['Comune di Residenza'] as string) ?? '',
    provincia: (f['Provincia'] as string) ?? '',
    gruppo: (f['gruppo'] as string) ?? '',
    dettagli: '',
    nota: '',
    created_at: '',
  }
}

// ─── Appuntamenti ─────────────────────────────────────────────────────────────

export async function getAppuntamenti(
  opts?: string | { mese?: string; inizio?: string; fine?: string },
): Promise<Appuntamento[]> {
  // Backward-compat: stringa → { mese }
  const o = typeof opts === 'string' ? { mese: opts } : (opts ?? {})

  const records = await tabellaAppuntamenti
    .select({ sort: [{ field: 'data', direction: 'asc' }, { field: 'ora_inizio', direction: 'asc' }] })
    .all()

  const appuntamenti = records.map(mappaAppuntamento)

  if (o.inizio && o.fine) {
    return appuntamenti.filter((a) => a.data >= o.inizio! && a.data <= o.fine!)
  }
  if (o.mese) {
    return appuntamenti.filter((a) => a.data.startsWith(o.mese!))
  }
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
  const payload: Record<string, unknown> = {
    cliente_nome: dati.cliente_nome,
    cliente_telefono: dati.cliente_telefono,
    data: dati.data,
    ora_inizio: dati.ora_inizio,
    ora_fine: dati.ora_fine,
    note: dati.note ?? '',
    google_calendar_event_id: dati.google_calendar_event_id ?? '',
    host: dati.host ?? '',
    guests: dati.guests ?? '',
    location: dati.indirizzo ?? '',
    reminder_sent: false,
    stato: 'Confermato',
    ics_uid: dati.ics_uid ?? '',
    ics_sequence: dati.ics_sequence ?? 0,
  }
  assegnaCampoData(payload, 'data_fine', dati.data_fine)
  payload.invitati = stringifyInvitati(dati.invitati)
  const record = await tabellaAppuntamenti.create(payload as Airtable.FieldSet)
  return mappaAppuntamento(record)
}

export async function aggiornaAppuntamento(
  id: string,
  dati: Partial<Omit<Appuntamento, 'id' | 'created_at'>>
): Promise<Appuntamento> {
  const campi: Record<string, unknown> = {}
  if (dati.cliente_nome !== undefined) campi.cliente_nome = dati.cliente_nome
  if (dati.cliente_telefono !== undefined) campi.cliente_telefono = dati.cliente_telefono
  assegnaCampoData(campi, 'data', dati.data)
  if (dati.ora_inizio !== undefined) campi.ora_inizio = dati.ora_inizio
  if (dati.ora_fine !== undefined) campi.ora_fine = dati.ora_fine
  if (dati.note !== undefined) campi.note = dati.note
  if (dati.google_calendar_event_id !== undefined) campi.google_calendar_event_id = dati.google_calendar_event_id
  if (dati.reminder_sent !== undefined) campi.reminder_sent = dati.reminder_sent
  assegnaCampoData(campi, 'reminder_sent_at', dati.reminder_sent_at)
  if (dati.stato !== undefined) campi.stato = dati.stato
  if (dati.ics_uid !== undefined) campi.ics_uid = dati.ics_uid
  if (dati.ics_sequence !== undefined) campi.ics_sequence = dati.ics_sequence
  if (dati.invitati !== undefined) campi.invitati = stringifyInvitati(dati.invitati)
  if (dati.indirizzo !== undefined) campi.location = dati.indirizzo
  assegnaCampoData(campi, 'data_fine', dati.data_fine)

  const record = await tabellaAppuntamenti.update(id, campi as Airtable.FieldSet)
  return mappaAppuntamento(record)
}

export async function eliminaAppuntamento(id: string): Promise<void> {
  await tabellaAppuntamenti.destroy(id)
}

// ─── Prossimi Appuntamenti ────────────────────────────────────────────────────

export async function creaProssimoAppuntamento(
  app: Omit<Appuntamento, 'id' | 'created_at' | 'reminder_sent' | 'stato'>,
): Promise<void> {
  const payload: Record<string, unknown> = {
    cliente_nome: app.cliente_nome,
    cliente_telefono: app.cliente_telefono,
    data: app.data,
    ora_inizio: app.ora_inizio,
    ora_fine: app.ora_fine,
    note: app.note ?? '',
    google_calendar_event_id: app.google_calendar_event_id ?? '',
    host: app.host ?? '',
    guests: app.guests ?? '',
    location: app.indirizzo ?? '',
    reminder_sent: false,
    stato: 'Confermato',
    ics_uid: app.ics_uid ?? '',
    ics_sequence: app.ics_sequence ?? 0,
    invitati: stringifyInvitati(app.invitati),
  }
  assegnaCampoData(payload, 'data_fine', app.data_fine)
  await tabellaProssimiAppuntamenti.create(payload as Airtable.FieldSet)
}

export async function aggiornaProssimoAppuntamentoByGcalId(
  gcalId: string,
  dati: Partial<Omit<Appuntamento, 'id' | 'created_at'>>
): Promise<void> {
  // FIND gestisce sia il caso legacy (campo = eventId raw) sia il nuovo JSON che contiene eventId
  const records = await tabellaProssimiAppuntamenti
    .select({ filterByFormula: `FIND('${gcalId}', {google_calendar_event_id})`, maxRecords: 1 })
    .all()
  if (records.length === 0) {
    console.warn(`[Airtable] aggiornaProssimo: nessun record con eventId ${gcalId.slice(0, 12)}… nella tabella Prossimi Appuntamenti (skip)`)
    return
  }

  const campi: Record<string, unknown> = {}
  if (dati.cliente_nome !== undefined) campi.cliente_nome = dati.cliente_nome
  if (dati.cliente_telefono !== undefined) campi.cliente_telefono = dati.cliente_telefono
  assegnaCampoData(campi, 'data', dati.data)
  if (dati.ora_inizio !== undefined) campi.ora_inizio = dati.ora_inizio
  if (dati.ora_fine !== undefined) campi.ora_fine = dati.ora_fine
  if (dati.note !== undefined) campi.note = dati.note
  if (dati.reminder_sent !== undefined) campi.reminder_sent = dati.reminder_sent
  assegnaCampoData(campi, 'reminder_sent_at', dati.reminder_sent_at)
  if (dati.stato !== undefined) campi.stato = dati.stato
  if (dati.ics_uid !== undefined) campi.ics_uid = dati.ics_uid
  if (dati.ics_sequence !== undefined) campi.ics_sequence = dati.ics_sequence
  if (dati.invitati !== undefined) campi.invitati = stringifyInvitati(dati.invitati)
  if (dati.indirizzo !== undefined) campi.location = dati.indirizzo
  assegnaCampoData(campi, 'data_fine', dati.data_fine)

  await tabellaProssimiAppuntamenti.update(records[0].id, campi as Airtable.FieldSet)
}

export async function eliminaProssimoAppuntamentoByGcalId(gcalId: string): Promise<void> {
  const records = await tabellaProssimiAppuntamenti
    .select({ filterByFormula: `FIND('${gcalId}', {google_calendar_event_id})`, maxRecords: 1 })
    .all()
  if (records.length === 0) {
    console.warn(`[Airtable] eliminaProssimo: nessun record con eventId ${gcalId.slice(0, 12)}… nella tabella Prossimi Appuntamenti (skip)`)
    return
  }
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
    .select({ sort: [{ field: 'Cognome', direction: 'asc' }, { field: 'Nome', direction: 'asc' }] })
    .all()

  const contatti = records.map(mappaContatto)
  if (!ricerca) return contatti

  const q = ricerca.toLowerCase()
  return contatti.filter(
    (c) =>
      c.nome.toLowerCase().includes(q) ||
      c.cognome.toLowerCase().includes(q) ||
      (c.nome_completo ?? '').toLowerCase().includes(q) ||
      `${c.nome} ${c.cognome}`.toLowerCase().includes(q) ||
      `${c.cognome} ${c.nome}`.toLowerCase().includes(q)
  )
}

export async function creaContatto(dati: Omit<Contatto, 'id' | 'created_at'>): Promise<Contatto> {
  const campi: Airtable.FieldSet = {
    'Nome': dati.nome,
    'Cognome': dati.cognome,
    'Nome Completo': dati.nome_completo ?? `${dati.cognome} ${dati.nome}`.trim(),
    'Telefono': dati.telefono ?? '',
    'Email': dati.email ?? '',
  }
  if (dati.indirizzo !== undefined) campi['Indirizzo di Residenza'] = dati.indirizzo
  if (dati.comune !== undefined)    campi['Comune di Residenza']    = dati.comune
  if (dati.provincia !== undefined) campi['Provincia']              = dati.provincia
  if (dati.gruppo !== undefined)    campi['gruppo']                 = dati.gruppo

  const record = await tabellaContatti.create(campi)
  return mappaContatto(record)
}

export async function aggiornaContatto(
  id: string,
  dati: Partial<Omit<Contatto, 'id' | 'created_at'>>
): Promise<Contatto> {
  const campi: Airtable.FieldSet = {}
  if (dati.nome          !== undefined) campi['Nome']                   = dati.nome
  if (dati.cognome       !== undefined) campi['Cognome']                = dati.cognome
  if (dati.nome_completo !== undefined) campi['Nome Completo']          = dati.nome_completo
  if (dati.telefono      !== undefined) campi['Telefono']               = dati.telefono
  if (dati.email         !== undefined) campi['Email']                  = dati.email
  if (dati.indirizzo     !== undefined) campi['Indirizzo di Residenza'] = dati.indirizzo
  if (dati.comune        !== undefined) campi['Comune di Residenza']    = dati.comune
  if (dati.provincia     !== undefined) campi['Provincia']              = dati.provincia
  if (dati.gruppo        !== undefined) campi['gruppo']                 = dati.gruppo

  const record = await tabellaContatti.update(id, campi)
  return mappaContatto(record)
}

export async function eliminaContatto(id: string): Promise<void> {
  await tabellaContatti.destroy(id)
}
