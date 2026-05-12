import * as fs from 'fs'
import * as path from 'path'
import { google } from 'googleapis'
import Airtable from 'airtable'

// ─── Carica .env.local ────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.local non trovato in: ${envPath}`)
  }
  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    // Rimuovi virgolette esterne se presenti
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

// ─── Helpers data/ora ─────────────────────────────────────────────────────────

function estraiData(dateTime: string): string {
  // dateTime: ISO 8601, es. "2026-04-15T10:00:00+02:00"
  return dateTime.slice(0, 10) // YYYY-MM-DD
}

function estraiOra(dateTime: string): string {
  // Prende HH:MM dal datetime ISO
  const match = dateTime.match(/T(\d{2}:\d{2})/)
  return match ? match[1] : '00:00'
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv()

  const calendarId = process.env.GOOGLE_CALENDAR_ID
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY
  const airtableApiKey = process.env.AIRTABLE_API_KEY
  const airtableBaseId = process.env.AIRTABLE_BASE_ID

  if (!calendarId || !serviceAccountEmail || !privateKeyRaw || !airtableApiKey || !airtableBaseId) {
    throw new Error('Variabili d\'ambiente mancanti. Controlla .env.local')
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n')

  // ─── Auth Google ────────────────────────────────────────────────────────────

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: serviceAccountEmail,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  })

  const calendar = google.calendar({ version: 'v3', auth })

  // ─── Leggi eventi futuri ────────────────────────────────────────────────────

  console.log(`\nLettura eventi dal calendario: ${calendarId}\n`)

  const risposta = await calendar.events.list({
    calendarId,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500,
  })

  const eventi = risposta.data.items ?? []
  console.log(`Trovati ${eventi.length} eventi futuri.\n`)

  if (eventi.length === 0) {
    console.log('Nessun evento da importare.')
    return
  }

  // ─── Airtable ───────────────────────────────────────────────────────────────

  const base = new Airtable({ apiKey: airtableApiKey }).base(airtableBaseId)
  const tabella = base('Appuntamenti')

  let importati = 0
  let saltati = 0

  for (const evento of eventi) {
    const eventId = evento.id
    const summary = evento.summary ?? 'Senza titolo'
    const start = evento.start?.dateTime ?? evento.start?.date
    const end = evento.end?.dateTime ?? evento.end?.date

    if (!start || !end || !eventId) {
      console.log(`  [SALTATO] Evento senza start/end/id: "${summary}"`)
      saltati++
      continue
    }

    const data = estraiData(start)
    const oraInizio = estraiOra(start)
    const oraFine = estraiOra(end)

    try {
      await tabella.create({
        cliente_nome: summary,
        cliente_telefono: '',
        data,
        ora_inizio: oraInizio,
        ora_fine: oraFine,
        tipo: 'Altro',
        note: evento.description ?? '',
        google_calendar_event_id: eventId,
        reminder_sent: false,
        stato: 'Confermato',
      })

      console.log(`  [OK] "${summary}" — ${data} ${oraInizio}–${oraFine}`)
      importati++
    } catch (err) {
      console.error(`  [ERRORE] "${summary}" — ${(err as Error).message}`)
    }
  }

  console.log(`\nImportazione completata: ${importati} importati, ${saltati} saltati.`)
}

main().catch((err) => {
  console.error('\nERRORE FATALE:', err.message)
  process.exit(1)
})
