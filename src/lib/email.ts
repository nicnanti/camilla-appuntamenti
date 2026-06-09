import nodemailer from 'nodemailer'

interface DatiAppuntamento {
  cliente_nome: string
  cliente_telefono?: string
  note?: string
  data: string          // YYYY-MM-DD
  ora_inizio: string    // HH:MM
  ora_fine: string      // HH:MM
  professionistaNome: string
  icsUid: string
  icsSequence: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDataItaliano(data: string): string {
  if (!data) return ''
  const [y, m, d] = data.split('-')
  const mesi = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']
  return `${parseInt(d)} ${mesi[parseInt(m) - 1]} ${y}`
}

// Converte YYYY-MM-DD + HH:MM in formato iCal con timezone (TZID=Europe/Rome)
function toIcalDateTime(data: string, ora: string): string {
  const d = data.replace(/-/g, '')
  const t = ora.replace(':', '') + '00'
  return `${d}T${t}`
}

// ─── Generazione .ics ─────────────────────────────────────────────────────────

function generaIcs(
  dati: DatiAppuntamento,
  emailAssistente: string,
  method: 'REQUEST' | 'CANCEL'
): string {
  const dtStart = toIcalDateTime(dati.data, dati.ora_inizio)
  const dtEnd   = toIcalDateTime(dati.data, dati.ora_fine)
  const status  = method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'
  const organizer = process.env.GMAIL_USER ?? 'nicola.nanti05@gmail.com'

  const descrizione = [
    `Professionista: ${dati.professionistaNome}`,
    dati.cliente_telefono ? `Telefono: ${dati.cliente_telefono}` : '',
    dati.note ? `Note: ${dati.note}` : '',
  ].filter(Boolean).join('\\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Studio Ghisleni//Appuntamenti//IT',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${dati.icsUid}@studiorghisleni`,
    `DTSTART;TZID=Europe/Rome:${dtStart}`,
    `DTEND;TZID=Europe/Rome:${dtEnd}`,
    `SUMMARY:${dati.cliente_nome}`,
    `DESCRIPTION:${descrizione}`,
    'LOCATION:Studio Ghisleni',
    `ORGANIZER;CN=Studio Ghisleni:mailto:${organizer}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${emailAssistente}`,
    `STATUS:${status}`,
    `SEQUENCE:${dati.icsSequence}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

// ─── Trasporto SMTP ──────────────────────────────────────────────────────────

function getTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    // Senza questi, una connessione SMTP fallita resta appesa ~120s (default Node)
    connectionTimeout: 10_000,
    greetingTimeout:   10_000,
    socketTimeout:     10_000,
  })
}

// ─── Logging helper ──────────────────────────────────────────────────────────

interface NodemailerErr {
  message?: string
  code?: string
  command?: string
  response?: string
  responseCode?: number
}

function logEmailError(tag: string, destinatario: string, err: unknown): void {
  const e = (err ?? {}) as NodemailerErr
  console.error(`[Email] ✗ ${tag} → ${destinatario}`)
  console.error(`  code:         ${e.code ?? '(none)'}`)
  console.error(`  command:      ${e.command ?? '(none)'}`)
  console.error(`  responseCode: ${e.responseCode ?? '(none)'}`)
  console.error(`  response:     ${e.response ?? '(none)'}`)
  console.error(`  message:      ${e.message ?? String(err)}`)
}

// ─── Connection verify ───────────────────────────────────────────────────────

export async function verificaSmtp(): Promise<{ ok: boolean; error?: string }> {
  const transporter = getTransporter()
  if (!transporter) return { ok: false, error: 'GMAIL_USER/GMAIL_APP_PASSWORD non configurati' }
  try {
    await transporter.verify()
    return { ok: true }
  } catch (err) {
    const e = (err ?? {}) as NodemailerErr
    const summary = [e.code, e.responseCode, e.message ?? String(err)].filter(Boolean).join(' | ')
    return { ok: false, error: summary }
  }
}

export async function inviaEmailTest(destinatario: string): Promise<{ ok: boolean; error?: string }> {
  const transporter = getTransporter()
  if (!transporter) return { ok: false, error: 'GMAIL_USER/GMAIL_APP_PASSWORD non configurati' }
  try {
    const info = await transporter.sendMail({
      from: `"Studio Ghisleni" <${process.env.GMAIL_USER}>`,
      to: destinatario,
      subject: 'Test SMTP — Studio Ghisleni',
      text: 'Se ricevi questa email, il transporter SMTP funziona.',
    })
    console.log('[Email] Test send OK →', destinatario, '| messageId:', info.messageId)
    return { ok: true }
  } catch (err) {
    logEmailError('TEST', destinatario, err)
    const e = (err ?? {}) as NodemailerErr
    return { ok: false, error: [e.code, e.responseCode, e.message ?? String(err)].filter(Boolean).join(' | ') }
  }
}

// ─── Funzioni pubbliche ───────────────────────────────────────────────────────

export async function inviaInvitoCalendario(
  dati: DatiAppuntamento,
  emailAssistente: string
): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn('[Email] GMAIL_APP_PASSWORD non configurato — invito saltato per', emailAssistente)
    return
  }

  const icsContent = generaIcs(dati, emailAssistente, 'REQUEST')
  const dataIt = formatDataItaliano(dati.data)
  const from = `"Studio Ghisleni" <${process.env.GMAIL_USER}>`

  try {
    const info = await transporter.sendMail({
      from,
      to: emailAssistente,
      subject: `Nuovo appuntamento: ${dati.cliente_nome} — ${dataIt} ore ${dati.ora_inizio}`,
      text: `Nuovo appuntamento\nCliente: ${dati.cliente_nome}\nData: ${dataIt}\nOra: ${dati.ora_inizio} - ${dati.ora_fine}\nProfessionista: ${dati.professionistaNome}`,
      html: `<h3>Nuovo appuntamento</h3><p><strong>Cliente:</strong> ${dati.cliente_nome}</p><p><strong>Data:</strong> ${dataIt}</p><p><strong>Ora:</strong> ${dati.ora_inizio} - ${dati.ora_fine}</p><p><strong>Professionista:</strong> ${dati.professionistaNome}</p>`,
      icalEvent: {
        filename: 'invite.ics',
        method: 'REQUEST',
        content: icsContent,
      },
    })
    console.log(`[Email] ✓ INVITO → ${emailAssistente} | messageId: ${info.messageId}`)
  } catch (err) {
    logEmailError('INVITO', emailAssistente, err)
    throw err
  }
}

export async function inviaModificaCalendario(
  dati: DatiAppuntamento,
  emailAssistente: string
): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn('[Email] GMAIL_APP_PASSWORD non configurato — modifica saltata per', emailAssistente)
    return
  }

  const icsContent = generaIcs(dati, emailAssistente, 'REQUEST')
  const dataIt = formatDataItaliano(dati.data)
  const from = `"Studio Ghisleni" <${process.env.GMAIL_USER}>`

  try {
    const info = await transporter.sendMail({
      from,
      to: emailAssistente,
      subject: `Appuntamento aggiornato: ${dati.cliente_nome} — ${dataIt} ore ${dati.ora_inizio}`,
      text: `Appuntamento aggiornato\nCliente: ${dati.cliente_nome}\nData: ${dataIt}\nOra: ${dati.ora_inizio} - ${dati.ora_fine}\nProfessionista: ${dati.professionistaNome}`,
      html: `<h3>Appuntamento aggiornato</h3><p><strong>Cliente:</strong> ${dati.cliente_nome}</p><p><strong>Data:</strong> ${dataIt}</p><p><strong>Ora:</strong> ${dati.ora_inizio} - ${dati.ora_fine}</p><p><strong>Professionista:</strong> ${dati.professionistaNome}</p>`,
      icalEvent: {
        filename: 'invite.ics',
        method: 'REQUEST',
        content: icsContent,
      },
    })
    console.log(`[Email] ✓ MODIFICA → ${emailAssistente} | messageId: ${info.messageId}`)
  } catch (err) {
    logEmailError('MODIFICA', emailAssistente, err)
    throw err
  }
}

export async function inviaCancellazioneCalendario(
  dati: DatiAppuntamento,
  emailAssistente: string
): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn('[Email] GMAIL_APP_PASSWORD non configurato — cancellazione saltata per', emailAssistente)
    return
  }

  const icsContent = generaIcs(dati, emailAssistente, 'CANCEL')
  const dataIt = formatDataItaliano(dati.data)
  const from = `"Studio Ghisleni" <${process.env.GMAIL_USER}>`

  try {
    const info = await transporter.sendMail({
      from,
      to: emailAssistente,
      subject: `Appuntamento cancellato: ${dati.cliente_nome} — ${dataIt} ore ${dati.ora_inizio}`,
      text: `Appuntamento cancellato\nCliente: ${dati.cliente_nome}\nData: ${dataIt}\nOra: ${dati.ora_inizio} - ${dati.ora_fine}\nProfessionista: ${dati.professionistaNome}`,
      html: `<h3>Appuntamento cancellato</h3><p><strong>Cliente:</strong> ${dati.cliente_nome}</p><p><strong>Data:</strong> ${dataIt}</p><p><strong>Ora:</strong> ${dati.ora_inizio} - ${dati.ora_fine}</p><p><strong>Professionista:</strong> ${dati.professionistaNome}</p>`,
      icalEvent: {
        filename: 'invite.ics',
        method: 'CANCEL',
        content: icsContent,
      },
    })
    console.log(`[Email] ✓ CANCEL → ${emailAssistente} | messageId: ${info.messageId}`)
  } catch (err) {
    logEmailError('CANCEL', emailAssistente, err)
    throw err
  }
}
