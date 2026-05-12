// Carica le env da .env.local prima di tutto
import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import Airtable from 'airtable'
import { eseguiCheckReminders } from '../lib/reminders'

const TEST_CLIENTE_NOME     = 'Nicola Nanti'
const TEST_CLIENTE_TELEFONO = '+39 327 812 6875'
const TEST_ORA_INIZIO       = '15:00'

async function main() {
  // Verifica env
  for (const key of ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID', 'SENDPULSE_CLIENT_ID', 'SENDPULSE_CLIENT_SECRET', 'SENDPULSE_PHONE_NUMBER_ID']) {
    if (!process.env[key]) {
      console.error(`✗ Variabile d'ambiente mancante: ${key}`)
      process.exit(1)
    }
  }

  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID!)
  const tabellaProssimi = base('tblS4JJw5IdVbaOmT')

  // Calcola domani (YYYY-MM-DD)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowString = tomorrow.toISOString().split('T')[0]

  console.log('═══════════════════════════════════════════════════════')
  console.log('Test reminder WhatsApp')
  console.log('═══════════════════════════════════════════════════════')
  console.log('Cliente: ', TEST_CLIENTE_NOME)
  console.log('Telefono:', TEST_CLIENTE_TELEFONO)
  console.log('Domani:  ', tomorrowString)
  console.log('Ora:     ', TEST_ORA_INIZIO)
  console.log('───────────────────────────────────────────────────────')

  // 1. Crea il record di test
  console.log(`\n[1/3] Creo record di test con data = ${tomorrowString}...`)
  const record = await tabellaProssimi.create({
    cliente_nome: TEST_CLIENTE_NOME,
    cliente_telefono: TEST_CLIENTE_TELEFONO,
    data: tomorrowString,
    ora_inizio: TEST_ORA_INIZIO,
    ora_fine: '16:00',
    reminder_sent: false,
    stato: 'Confermato',
  })
  console.log('     ✓ Record creato:', record.id)
  console.log('     Fields salvati:', JSON.stringify(record.fields))

  // Attesa per la propagazione Airtable
  console.log('     Attendo 2s per propagazione Airtable...')
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // DEBUG: verifica che il record sia realmente presente con quella data
  console.log(`\n[DEBUG] Leggo da Airtable tutti i record con data = ${tomorrowString}...`)
  const debugRecords = await tabellaProssimi
    .select({ filterByFormula: `DATETIME_FORMAT({data}, 'YYYY-MM-DD') = "${tomorrowString}"` })
    .all()
  console.log(`[DEBUG] Record trovati per ${tomorrowString}: ${debugRecords.length}`)
  debugRecords.forEach((r) => {
    console.log(
      '  -',
      r.fields.cliente_nome,
      '| reminder_sent:', r.fields.reminder_sent,
      '| stato:', r.fields.stato,
      '| data:', r.fields.data,
    )
  })

  // 2. Esegui il check reminder forzando la data target a domani
  console.log(`\n[2/3] Eseguo check-reminders con parametri:`)
  console.log('     dataTarget:', tomorrowString)
  let risultato
  try {
    risultato = await eseguiCheckReminders({ dataTarget: tomorrowString })
  } catch (err) {
    console.error('     ✗ Errore durante check-reminders:', err)
    console.log('\n[cleanup] Rimuovo record di test...')
    await tabellaProssimi.destroy(record.id)
    process.exit(1)
  }

  // 3. Verifica risultato
  console.log('\n[3/3] Risultato:')
  console.log(JSON.stringify(risultato, null, 2))

  if (risultato.reminders_sent > 0 && risultato.reminders_failed === 0) {
    console.log(`\n✓ Reminder inviato con successo a ${TEST_CLIENTE_TELEFONO}`)
  } else {
    console.log(`\n✗ Invio fallito (sent=${risultato.reminders_sent}, failed=${risultato.reminders_failed})`)
    if (risultato.errors.length > 0) console.log('  Errori:', risultato.errors)
  }

  // 4. Cleanup
  console.log('\n[cleanup] Rimuovo record di test...')
  try {
    await tabellaProssimi.destroy(record.id)
    console.log('     Record rimosso')
  } catch (err) {
    console.warn('     Impossibile rimuovere il record:', err)
    console.warn(`     Rimuovilo manualmente: ${record.id}`)
  }

  console.log('═══════════════════════════════════════════════════════')
}

main().catch((err) => {
  console.error('Errore non gestito:', err)
  process.exit(1)
})
