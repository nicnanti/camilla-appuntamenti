import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import type { Invitato } from '@/types'

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
  invitati?: Invitato[]
}

// ─── Rendering invitati ──────────────────────────────────────────────────────

// Per body HTML (email)
function invitatiHtml(invitati?: Invitato[]): string {
  if (!invitati || invitati.length === 0) return ''
  const items = invitati
    .map((i) => `<li>${escapeHtml(i.nome)}${i.telefono ? ` — ${escapeHtml(i.telefono)}` : ''}</li>`)
    .join('')
  return `<p><strong>Invitati:</strong></p><ul>${items}</ul>`
}

// Per body testuale (email)
function invitatiText(invitati?: Invitato[]): string {
  if (!invitati || invitati.length === 0) return ''
  const rows = invitati.map((i) => `- ${i.nome}${i.telefono ? ` (${i.telefono})` : ''}`).join('\n')
  return `\nInvitati:\n${rows}`
}

// Per DESCRIPTION del file .ics (una riga sola)
function invitatiIcs(invitati?: Invitato[]): string {
  if (!invitati || invitati.length === 0) return ''
  return invitati.map((i) => `${i.nome}${i.telefono ? ` (${i.telefono})` : ''}`).join(', ')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

  const invitatiRiga = invitatiIcs(dati.invitati)
  const descrizione = [
    `Professionista: ${dati.professionistaNome}`,
    dati.cliente_telefono ? `Telefono: ${dati.cliente_telefono}` : '',
    dati.note ? `Note: ${dati.note}` : '',
    invitatiRiga ? `Invitati: ${invitatiRiga}` : '',
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

export type ProfessionistaHost = 'Camilla' | 'Giacomo'

function buildTransporter(user: string, pass: string) {
  // Pool: riusa la connessione TCP invece di aprirla/chiuderla per ogni email.
  // Evita rate-limit Gmail e ETIMEDOUT su invii multipli.
  // `pool`/`maxConnections`/`maxMessages`/`family` non sono nei tipi SMTPTransport.Options
  // ma vengono passati direttamente a nodemailer/net.connect a runtime.
  const opts: SMTPTransport.Options & {
    pool?: boolean
    maxConnections?: number
    maxMessages?: number
    family?: 4 | 6
  } = {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
    pool: true,
    maxConnections: 1,
    maxMessages: 10,
    connectionTimeout: 15_000,
    greetingTimeout:   15_000,
    socketTimeout:     15_000,
    family: 4, // Railway non supporta IPv6 → forza IPv4
  }
  return nodemailer.createTransport(opts)
}

// Transporter generico (GMAIL_USER / GMAIL_APP_PASSWORD) — usato solo da /api/test-email
function getTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null
  return buildTransporter(user, pass)
}

// Transporter per il professionista host — usato dagli inviti/modifiche/cancellazioni
function getTransporterPerProf(host: ProfessionistaHost) {
  const isCamilla = host === 'Camilla'
  const user = isCamilla ? process.env.CAMILLA_GMAIL_USER : process.env.GIACOMO_GMAIL_USER
  const pass = isCamilla ? process.env.CAMILLA_GMAIL_APP_PASSWORD : process.env.GIACOMO_GMAIL_APP_PASSWORD
  if (!user || !pass) {
    throw new Error(`Credenziali SMTP mancanti per ${host} (env: ${host.toUpperCase()}_GMAIL_USER / ${host.toUpperCase()}_GMAIL_APP_PASSWORD)`)
  }
  return { transporter: buildTransporter(user, pass), user }
}

function fromHeader(host: ProfessionistaHost, fromEmail: string): string {
  const fullName = host === 'Camilla' ? 'Camilla Ghisleni' : 'Giacomo Ghisleni'
  return `"${fullName} - Studio Ghisleni" <${fromEmail}>`
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
  emailAssistente: string,
  host: ProfessionistaHost
): Promise<void> {
  const { transporter, user } = getTransporterPerProf(host)
  const icsContent = generaIcs(dati, emailAssistente, 'REQUEST')
  const dataIt = formatDataItaliano(dati.data)

  try {
    const info = await transporter.sendMail({
      from: fromHeader(host, user),
      replyTo: user,
      to: emailAssistente,
      subject: `Nuovo appuntamento: ${dati.cliente_nome} — ${dataIt} ore ${dati.ora_inizio}`,
      text: `Nuovo appuntamento\nCliente: ${dati.cliente_nome}\nData: ${dataIt}\nOra: ${dati.ora_inizio} - ${dati.ora_fine}\nProfessionista: ${dati.professionistaNome}${invitatiText(dati.invitati)}`,
      html: `<h3>Nuovo appuntamento</h3><p><strong>Cliente:</strong> ${escapeHtml(dati.cliente_nome)}</p><p><strong>Data:</strong> ${escapeHtml(dataIt)}</p><p><strong>Ora:</strong> ${escapeHtml(dati.ora_inizio)} - ${escapeHtml(dati.ora_fine)}</p><p><strong>Professionista:</strong> ${escapeHtml(dati.professionistaNome)}</p>${invitatiHtml(dati.invitati)}`,
      icalEvent: {
        filename: 'invite.ics',
        method: 'REQUEST',
        content: icsContent,
      },
    })
    console.log(`[Email] ✓ INVITO (da ${host}) → ${emailAssistente} | messageId: ${info.messageId}`)
  } catch (err) {
    logEmailError(`INVITO (da ${host})`, emailAssistente, err)
    throw err
  }
}

export async function inviaModificaCalendario(
  dati: DatiAppuntamento,
  emailAssistente: string,
  host: ProfessionistaHost
): Promise<void> {
  const { transporter, user } = getTransporterPerProf(host)
  const icsContent = generaIcs(dati, emailAssistente, 'REQUEST')
  const dataIt = formatDataItaliano(dati.data)

  try {
    const info = await transporter.sendMail({
      from: fromHeader(host, user),
      replyTo: user,
      to: emailAssistente,
      subject: `Appuntamento aggiornato: ${dati.cliente_nome} — ${dataIt} ore ${dati.ora_inizio}`,
      text: `Appuntamento aggiornato\nCliente: ${dati.cliente_nome}\nData: ${dataIt}\nOra: ${dati.ora_inizio} - ${dati.ora_fine}\nProfessionista: ${dati.professionistaNome}${invitatiText(dati.invitati)}`,
      html: `<h3>Appuntamento aggiornato</h3><p><strong>Cliente:</strong> ${escapeHtml(dati.cliente_nome)}</p><p><strong>Data:</strong> ${escapeHtml(dataIt)}</p><p><strong>Ora:</strong> ${escapeHtml(dati.ora_inizio)} - ${escapeHtml(dati.ora_fine)}</p><p><strong>Professionista:</strong> ${escapeHtml(dati.professionistaNome)}</p>${invitatiHtml(dati.invitati)}`,
      icalEvent: {
        filename: 'invite.ics',
        method: 'REQUEST',
        content: icsContent,
      },
    })
    console.log(`[Email] ✓ MODIFICA (da ${host}) → ${emailAssistente} | messageId: ${info.messageId}`)
  } catch (err) {
    logEmailError(`MODIFICA (da ${host})`, emailAssistente, err)
    throw err
  }
}

export async function inviaCancellazioneCalendario(
  dati: DatiAppuntamento,
  emailAssistente: string,
  host: ProfessionistaHost
): Promise<void> {
  const { transporter, user } = getTransporterPerProf(host)
  const icsContent = generaIcs(dati, emailAssistente, 'CANCEL')
  const dataIt = formatDataItaliano(dati.data)

  try {
    const info = await transporter.sendMail({
      from: fromHeader(host, user),
      replyTo: user,
      to: emailAssistente,
      subject: `Appuntamento cancellato: ${dati.cliente_nome} — ${dataIt} ore ${dati.ora_inizio}`,
      text: `Appuntamento cancellato\nCliente: ${dati.cliente_nome}\nData: ${dataIt}\nOra: ${dati.ora_inizio} - ${dati.ora_fine}\nProfessionista: ${dati.professionistaNome}${invitatiText(dati.invitati)}`,
      html: `<h3>Appuntamento cancellato</h3><p><strong>Cliente:</strong> ${escapeHtml(dati.cliente_nome)}</p><p><strong>Data:</strong> ${escapeHtml(dataIt)}</p><p><strong>Ora:</strong> ${escapeHtml(dati.ora_inizio)} - ${escapeHtml(dati.ora_fine)}</p><p><strong>Professionista:</strong> ${escapeHtml(dati.professionistaNome)}</p>${invitatiHtml(dati.invitati)}`,
      icalEvent: {
        filename: 'invite.ics',
        method: 'CANCEL',
        content: icsContent,
      },
    })
    console.log(`[Email] ✓ CANCEL (da ${host}) → ${emailAssistente} | messageId: ${info.messageId}`)
  } catch (err) {
    logEmailError(`CANCEL (da ${host})`, emailAssistente, err)
    throw err
  }
}
