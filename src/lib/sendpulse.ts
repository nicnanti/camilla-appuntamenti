const SENDPULSE_API = 'https://api.sendpulse.com'

// ─── Cache token + waba_id ────────────────────────────────────────────────────

let cachedToken: string | null = null
let tokenExpiresAt = 0
let cachedWabaId: string | null = null

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken

  const clientId     = process.env.SENDPULSE_CLIENT_ID
  const clientSecret = process.env.SENDPULSE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('SENDPULSE_CLIENT_ID o SENDPULSE_CLIENT_SECRET non configurati')
  }

  const res = await fetch(`${SENDPULSE_API}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`SendPulse auth fallita (${res.status}): ${body}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  cachedToken = data.access_token
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000

  console.log('[SendPulse] Token ottenuto, scade tra', data.expires_in, 's')
  return cachedToken
}

export async function getWabaId(): Promise<string> {
  if (cachedWabaId) return cachedWabaId

  // Se è in env, usalo
  const envWaba = process.env.SENDPULSE_WABA_ID
  if (envWaba) {
    cachedWabaId = envWaba
    return envWaba
  }

  // waba_id == phone_number_id su SendPulse
  const phoneNumberId = process.env.SENDPULSE_PHONE_NUMBER_ID
  if (!phoneNumberId) {
    throw new Error('SENDPULSE_PHONE_NUMBER_ID non configurato')
  }

  cachedWabaId = phoneNumberId
  return phoneNumberId
}

// ─── Invio template WhatsApp ──────────────────────────────────────────────────

export interface ParametriTemplate {
  phone: string
  nomeCliente: string
  dataFormattata: string
  oraInizio: string
}

export async function inviaReminderWhatsApp(params: ParametriTemplate): Promise<void> {
  const templateName = process.env.SENDPULSE_WA_TEMPLATE_NAME ?? 'reminder_appuntamento'
  const templateLang = process.env.SENDPULSE_WA_TEMPLATE_LANG ?? 'it'
  const botId        = process.env.SENDPULSE_BOT_ID

  if (!botId) throw new Error('SENDPULSE_BOT_ID non configurato')

  const phone = params.phone.replace(/\s+/g, '')
  const token = await getAccessToken()

  // Pulisce il nome cliente: rimuove tutto dopo trattino lungo o medio
  // Es: "NANTI NICOLA — figlio Paola" → "NANTI NICOLA"
  const nomeClientePulito = params.nomeCliente.split(/[—–]/)[0].trim()

  const body = {
    bot_id: botId,
    phone,
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: nomeClientePulito },
            { type: 'text', text: params.dataFormattata },
            { type: 'text', text: params.oraInizio },
          ],
        },
      ],
    },
  }

  console.log('[SendPulse] Invio WA →', phone, '| cliente:', nomeClientePulito, '|', params.dataFormattata, params.oraInizio)

  const res = await fetch(`${SENDPULSE_API}/whatsapp/contacts/sendTemplateByPhone`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.text()
    if (res.status === 401) {
      cachedToken = null
      tokenExpiresAt = 0
      return inviaReminderWhatsApp(params)
    }
    throw new Error(`SendPulse invio fallito (${res.status}): ${errBody}`)
  }

  console.log('[SendPulse] Inviato a', phone)
}

// ─── Helper date in italiano ─────────────────────────────────────────────────

const MESI_IT   = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']
const GIORNI_IT = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato']

export function formatDataItaliano(data: string): string {
  if (!data) return ''
  const [y, m, d] = data.split('-').map(Number)
  return `${d} ${MESI_IT[m - 1]} ${y}`
}

export function formatDataConGiorno(data: string): string {
  if (!data) return ''
  const d = new Date(data + 'T12:00:00')
  return `${GIORNI_IT[d.getDay()]} ${d.getDate()} ${MESI_IT[d.getMonth()]}`
}

// ─── Calcolo data target (venerdì→lunedì, altri→domani) in Europe/Rome ────────

export function getDataTarget(): string {
  const now = new Date()
  // Data corrente in Europe/Rome (formato YYYY-MM-DD via locale sv-SE)
  const oggiRome = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(now)
  // Giorno della settimana in Europe/Rome
  const weekdayShort = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', weekday: 'short' }).format(now)
  // 'Mon','Tue','Wed','Thu','Fri','Sat','Sun'

  const target = new Date(oggiRome + 'T12:00:00')
  const diasFromToday = weekdayShort === 'Fri' ? 3 : 1
  target.setDate(target.getDate() + diasFromToday)
  return target.toISOString().slice(0, 10)
}
