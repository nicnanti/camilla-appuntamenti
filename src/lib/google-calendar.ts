import { google } from 'googleapis'
import type { Appuntamento } from '@/types'

function getAuthClient() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })
}

function getCalendar() {
  return google.calendar({ version: 'v3', auth: getAuthClient() })
}

// ─── Mapping professionista → calendarId ─────────────────────────────────────

export function getCalendarIdForProfessionista(professionista: string): string {
  if (professionista === 'Camilla') return process.env.GOOGLE_CALENDAR_ID_CAMILLA!
  if (professionista === 'Giacomo') return process.env.GOOGLE_CALENDAR_ID_GIACOMO!
  return process.env.GOOGLE_CALENDAR_ID_CAMILLA!
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toGoogleDateTime(data: string, ora: string): string {
  return `${data}T${ora}:00`
}

function costruisciTitoloEvento(app: Partial<Appuntamento>): string {
  return app.cliente_nome ?? 'Cliente'
}

function costruisciDescrizioneEvento(app: Partial<Appuntamento>, professionistaNome?: string): string {
  const righe: string[] = []
  if (professionistaNome) righe.push(`Professionista: ${professionistaNome}`)
  if (app.cliente_telefono) righe.push(`Telefono: ${app.cliente_telefono}`)
  if (app.cliente_dettagli) righe.push(`Dettagli: ${app.cliente_dettagli}`)
  if (app.note) righe.push(`\nNote: ${app.note}`)
  return righe.join('\n')
}

// ─── Operazioni CRUD ──────────────────────────────────────────────────────────

export async function creaEventoCalendar(
  app: Partial<Appuntamento> & { data: string; ora_inizio: string; ora_fine: string },
  calendarId: string,
  professionistaNome?: string,
): Promise<string> {
  const calendar = getCalendar()

  // Per appuntamenti multi-giorno: end usa data_fine, altrimenti stesso giorno di start.
  const dataFineEvento = (app.data_fine && app.data_fine > app.data) ? app.data_fine : app.data

  // Niente attendees né sendUpdates: gli inviti email li manda nodemailer dall'host SMTP.
  const requestBody: Record<string, unknown> = {
    summary: costruisciTitoloEvento(app),
    description: costruisciDescrizioneEvento(app, professionistaNome),
    start: {
      dateTime: toGoogleDateTime(app.data, app.ora_inizio),
      timeZone: 'Europe/Rome',
    },
    end: {
      dateTime: toGoogleDateTime(dataFineEvento, app.ora_fine),
      timeZone: 'Europe/Rome',
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 60 },
      ],
    },
  }

  if (app.indirizzo) requestBody.location = app.indirizzo

  console.log(`[GCal] creaEventoCalendar → ${calendarId}`)
  const risposta = await calendar.events.insert({ calendarId, requestBody })
  return risposta.data.id ?? ''
}

export async function aggiornaEventoCalendar(
  eventId: string,
  calendarId: string,
  app: Partial<Appuntamento>,
  professionistaNome?: string,
): Promise<void> {
  const calendar = getCalendar()

  const aggiornamenti: Record<string, unknown> = {}

  if (app.cliente_nome) {
    aggiornamenti.summary = costruisciTitoloEvento(app)
  }

  if (app.cliente_telefono !== undefined || app.note !== undefined) {
    aggiornamenti.description = costruisciDescrizioneEvento(app, professionistaNome)
  }

  if (app.data && app.ora_inizio) {
    aggiornamenti.start = {
      dateTime: toGoogleDateTime(app.data, app.ora_inizio),
      timeZone: 'Europe/Rome',
    }
  }

  if (app.data && app.ora_fine) {
    // Multi-giorno: usa data_fine se presente e successiva a data, altrimenti stessa data.
    const dataFineEvento = (app.data_fine && app.data_fine > app.data) ? app.data_fine : app.data
    aggiornamenti.end = {
      dateTime: toGoogleDateTime(dataFineEvento, app.ora_fine),
      timeZone: 'Europe/Rome',
    }
  }

  if (app.indirizzo !== undefined) aggiornamenti.location = app.indirizzo

  console.log(`[GCal] aggiornaEventoCalendar → ${eventId} (${calendarId})`)
  await calendar.events.patch({ calendarId, eventId, requestBody: aggiornamenti })
}

export async function eliminaEventoCalendar(eventId: string, calendarId: string): Promise<void> {
  const calendar = getCalendar()
  console.log(`[GCal] eliminaEventoCalendar → ${eventId} (${calendarId})`)
  await calendar.events.delete({ calendarId, eventId })
}
