// Carica le env da .env.local prima di tutto
import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { google } from 'googleapis'
import Airtable from 'airtable'

// ─── Configurazione professionisti ────────────────────────────────────────────

const PROFESSIONISTI = [
  { nome: 'Camilla', envKey: 'GOOGLE_CALENDAR_ID_CAMILLA' },
  { nome: 'Giacomo', envKey: 'GOOGLE_CALENDAR_ID_GIACOMO' },
] as const

// ─── Helpers data/ora ─────────────────────────────────────────────────────────

function estraiData(dateTime: string): string {
  return dateTime.slice(0, 10)
}

function estraiOra(dateTime: string): string {
  const match = dateTime.match(/T(\d{2}:\d{2})/)
  return match ? match[1] : '00:00'
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const required = [
    'GOOGLE_CALENDAR_ID_CAMILLA',
    'GOOGLE_CALENDAR_ID_GIACOMO',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'AIRTABLE_API_KEY',
    'AIRTABLE_BASE_ID',
  ]
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`✗ Variabile d'ambiente mancante: ${key}`)
      process.exit(1)
    }
  }

  const privateKey = process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n')
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  })
  const calendar = google.calendar({ version: 'v3', auth })

  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID!)
  const tabellaProssimi = base('tblS4JJw5IdVbaOmT')

  let totImportati = 0
  let totDuplicati = 0
  let totSaltati   = 0
  let totErrori    = 0

  for (const prof of PROFESSIONISTI) {
    const calendarId = process.env[prof.envKey]!
    console.log('\n═══════════════════════════════════════════════════════')
    console.log(`Calendario di ${prof.nome}: ${calendarId}`)
    console.log('═══════════════════════════════════════════════════════')

    const risposta = await calendar.events.list({
      calendarId,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      timeMin: new Date().toISOString(),
    })

    const eventi = risposta.data.items ?? []
    console.log(`Trovati ${eventi.length} eventi futuri\n`)

    for (const evento of eventi) {
      const eventId = evento.id
      const summary = evento.summary ?? 'Senza titolo'
      const start   = evento.start?.dateTime ?? evento.start?.date
      const end     = evento.end?.dateTime ?? evento.end?.date

      if (!start || !end || !eventId) {
        console.log(`  [SALTATO] "${summary}" — start/end/id mancante`)
        totSaltati++
        continue
      }

      // Check duplicato: cerca l'eventId dentro il campo (gestisce sia plain string che JSON)
      const duplicati = await tabellaProssimi
        .select({ filterByFormula: `FIND('${eventId}', {google_calendar_event_id})`, maxRecords: 1 })
        .all()
      if (duplicati.length > 0) {
        console.log(`  [DUP]     "${summary}" — eventId ${eventId.slice(0, 10)}… già presente`)
        totDuplicati++
        continue
      }

      const data      = estraiData(start)
      const oraInizio = estraiOra(start)
      const oraFine   = estraiOra(end)

      // Formato gcal-id consistente con quello scritto dalla API: {"camilla":"eventId"}
      const gcalIdJson = JSON.stringify({ [prof.nome.toLowerCase()]: eventId })

      try {
        await tabellaProssimi.create({
          cliente_nome: summary,
          cliente_telefono: '',
          data,
          ora_inizio: oraInizio,
          ora_fine: oraFine,
          note: evento.description ?? '',
          google_calendar_event_id: gcalIdJson,
          host: calendarId,
          guests: '',
          reminder_sent: false,
          stato: 'Confermato',
        })
        console.log(`  [OK]      "${summary}" — ${data} ${oraInizio}–${oraFine}`)
        totImportati++
      } catch (err) {
        console.error(`  [ERRORE]  "${summary}" — ${(err as Error).message}`)
        totErrori++
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════')
  console.log('Riepilogo import')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`Importati: ${totImportati}`)
  console.log(`Duplicati: ${totDuplicati}`)
  console.log(`Saltati:   ${totSaltati}`)
  console.log(`Errori:    ${totErrori}`)
}

main().catch((err) => {
  console.error('\n✗ ERRORE FATALE:', err.message ?? err)
  process.exit(1)
})
