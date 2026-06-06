import Airtable from 'airtable'
import { inviaReminderWhatsApp, formatDataConGiorno, getDataTarget } from './sendpulse'

interface InvitatoLite {
  nome: string
  telefono: string
}

function parseInvitatiField(raw: unknown): InvitatoLite[] {
  if (typeof raw !== 'string' || !raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
        .filter((i) => i && typeof i.telefono === 'string' && i.telefono.trim())
        .map((i) => ({ nome: String(i.nome ?? ''), telefono: String(i.telefono) }))
    }
  } catch {}
  return []
}

export interface RisultatoCheckReminders {
  success: true
  date_checked: string
  reminders_sent: number
  reminders_failed: number
  checked: number
  errors: string[]
}

function getTabelle() {
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID!)
  return {
    tabellaProssimi:      base('tblS4JJw5IdVbaOmT'),
    tabellaAppuntamenti:  base('Appuntamenti'),
  }
}

async function segnaReminderInviato(idProssimo: string, clienteNome: string): Promise<void> {
  const { tabellaProssimi, tabellaAppuntamenti } = getTabelle()
  const ora = new Date().toISOString().split('T')[0]
  await tabellaProssimi.update(idProssimo, {
    reminder_sent: true,
    reminder_sent_at: ora,
  })

  try {
    const records = await tabellaAppuntamenti
      .select({ filterByFormula: `{cliente_nome} = '${clienteNome.replace(/'/g, "\\'")}'`, maxRecords: 10 })
      .all()
    for (const r of records) {
      if (!r.fields.reminder_sent) {
        await tabellaAppuntamenti.update(r.id, { reminder_sent: true, reminder_sent_at: ora })
      }
    }
  } catch (err) {
    console.warn('[Reminder] Impossibile aggiornare reminder_sent su Appuntamenti:', err)
  }
}

export async function eseguiCheckReminders(options?: { dataTarget?: string }): Promise<RisultatoCheckReminders> {
  const { tabellaProssimi } = getTabelle()

  const dataTarget = options?.dataTarget ?? getDataTarget()
  console.log(`[Reminder] Check reminder per data: ${dataTarget}`)

  const records = await tabellaProssimi
    .select({ filterByFormula: `AND(DATETIME_FORMAT({data}, 'YYYY-MM-DD') = "${dataTarget}", {reminder_sent} = FALSE(), OR({stato} = 'Confermato', {stato} = ''))` })
    .all()

  console.log(`[Reminder] ${records.length} appuntamento/i trovati per ${dataTarget}`)

  const errors: string[] = []
  let sent = 0
  let failed = 0

  for (const record of records) {
    const id          = record.id
    const clienteNome = (record.fields.cliente_nome as string) ?? ''
    const telefono    = (record.fields.cliente_telefono as string) ?? ''
    const data        = (record.fields.data as string) ?? ''
    const oraInizio   = (record.fields.ora_inizio as string) ?? ''
    const invitati    = parseInvitatiField(record.fields.invitati)
    const dataFmt     = formatDataConGiorno(data)

    if (!telefono && invitati.length === 0) {
      const msg = `Numero mancante per appuntamento ${id} (${clienteNome}) — nessun invitato con telefono`
      console.warn('[Reminder]', msg)
      errors.push(msg)
      failed++
      continue
    }

    // 1) Invia al cliente principale (se ha telefono)
    let clienteInviato = false
    if (telefono) {
      try {
        await inviaReminderWhatsApp({ phone: telefono, nomeCliente: clienteNome, dataFormattata: dataFmt, oraInizio })
        clienteInviato = true
        sent++
        console.log(`[Reminder] ✓ Inviato a ${clienteNome} (${telefono})`)
      } catch (err) {
        const msg = `Errore invio a ${clienteNome} (${telefono}): ${err instanceof Error ? err.message : String(err)}`
        console.error('[Reminder]', msg)
        errors.push(msg)
        failed++
      }
    }

    // 2) Invia agli invitati (best-effort, non blocca)
    for (const inv of invitati) {
      try {
        await inviaReminderWhatsApp({ phone: inv.telefono, nomeCliente: inv.nome || clienteNome, dataFormattata: dataFmt, oraInizio })
        sent++
        console.log(`[Reminder] ✓ Inviato a invitato ${inv.nome} (${inv.telefono})`)
      } catch (err) {
        const msg = `Errore invio a invitato ${inv.nome} (${inv.telefono}): ${err instanceof Error ? err.message : String(err)}`
        console.error('[Reminder]', msg)
        errors.push(msg)
        failed++
      }
    }

    // Segna reminder_sent se almeno il cliente principale (o, se manca, almeno un invitato) è stato inviato
    if (clienteInviato || (!telefono && invitati.length > 0)) {
      try {
        await segnaReminderInviato(id, clienteNome)
      } catch (err) {
        console.warn('[Reminder] Impossibile segnare reminder_sent:', err)
      }
    }
  }

  return {
    success: true,
    date_checked: dataTarget,
    reminders_sent: sent,
    reminders_failed: failed,
    checked: records.length,
    errors,
  }
}
