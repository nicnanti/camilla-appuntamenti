import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { waitUntil } from '@vercel/functions'
import {
  getAppuntamenti,
  getAppuntamentoById,
  creaAppuntamento,
  aggiornaAppuntamento,
  eliminaAppuntamento,
  creaProssimoAppuntamento,
  aggiornaProssimoAppuntamentoByGcalId,
  eliminaProssimoAppuntamentoByGcalId,
} from '@/lib/airtable'
import {
  creaEventoCalendar,
  aggiornaEventoCalendar,
  eliminaEventoCalendar,
  getCalendarIdForProfessionista,
} from '@/lib/google-calendar'
import {
  inviaInvitoCalendario,
  inviaModificaCalendario,
  inviaCancellazioneCalendario,
  type ProfessionistaHost,
} from '@/lib/email'

function asHost(prof: string | undefined): ProfessionistaHost | null {
  if (prof === 'Camilla' || prof === 'Giacomo') return prof
  return null
}

// Lista destinatari email .ics:
// - L'host NON è incluso (vede già l'evento sul proprio Google Calendar)
// - Ogni staff (Camilla/Giacomo/Fiorella/Viviana) presente in guestList riceve
// - Eventuale CC sviluppo se DEV_EMAIL_CC è impostata
// - MAI cliente principale, MAI invitati extra
function destinatariIcs(_host: ProfessionistaHost, guestList: string[]): string[] {
  const EMAIL_CAMILLA  = process.env.CAMILLA_GMAIL_USER   ?? process.env.GOOGLE_CALENDAR_ID_CAMILLA
  const EMAIL_GIACOMO  = process.env.GIACOMO_GMAIL_USER   ?? process.env.GOOGLE_CALENDAR_ID_GIACOMO
  const EMAIL_FIORELLA = process.env.ASSISTANT_EMAIL_FIORELLA
  const EMAIL_VIVIANA  = process.env.ASSISTANT_EMAIL_VIVIANA
  const EMAIL_DEV      = process.env.DEV_EMAIL_CC

  const lista: (string | undefined)[] = []

  // Solo staff selezionati come guest (host escluso)
  if (guestList.includes('Camilla'))  lista.push(EMAIL_CAMILLA)
  if (guestList.includes('Giacomo'))  lista.push(EMAIL_GIACOMO)
  if (guestList.includes('Fiorella')) lista.push(EMAIL_FIORELLA)
  if (guestList.includes('Viviana'))  lista.push(EMAIL_VIVIANA)

  // CC sviluppo (rimuovi env var DEV_EMAIL_CC per disattivarlo)
  if (EMAIL_DEV) lista.push(EMAIL_DEV)

  return Array.from(new Set(lista.filter((e): e is string => !!e && e.trim() !== '')))
}

// Deriva i nomi staff dalla stringa di email del campo `guests` (comma-separated)
// Usato in PATCH/DELETE dove abbiamo solo gli email del record.
function nomiStaffDaGuestsField(guestsCommaSep: string): string[] {
  const lower = (guestsCommaSep ?? '').toLowerCase()
  const out: string[] = []
  const matchEnv = (envKey1: string, envKey2?: string): boolean => {
    const a = (process.env[envKey1] ?? '').toLowerCase()
    const b = (envKey2 ? (process.env[envKey2] ?? '') : '').toLowerCase()
    return (!!a && lower.includes(a)) || (!!b && lower.includes(b))
  }
  if (matchEnv('CAMILLA_GMAIL_USER',  'GOOGLE_CALENDAR_ID_CAMILLA'))  out.push('Camilla')
  if (matchEnv('GIACOMO_GMAIL_USER',  'GOOGLE_CALENDAR_ID_GIACOMO'))  out.push('Giacomo')
  if (matchEnv('ASSISTANT_EMAIL_FIORELLA'))                            out.push('Fiorella')
  if (matchEnv('ASSISTANT_EMAIL_VIVIANA'))                             out.push('Viviana')
  return out
}

// Mappa nome → email
const EMAIL_MAP: Record<string, string> = {
  Camilla:  process.env.GOOGLE_CALENDAR_ID_CAMILLA ?? 'camilla.ghisleni1@gmail.com',
  Giacomo:  process.env.GOOGLE_CALENDAR_ID_GIACOMO ?? 'giacomo.ghisleni1@gmail.com',
  Fiorella: process.env.ASSISTANT_EMAIL_FIORELLA   ?? '',
  Viviana:  process.env.ASSISTANT_EMAIL_VIVIANA    ?? '',
}

// Professionisti: Google Calendar accessibile + email .ics
const PROFESSIONISTI = new Set(['Camilla', 'Giacomo'])

function resolveEmail(nome: string): string {
  return EMAIL_MAP[nome] ?? ''
}

function resolveEmails(nomi: string[]): string[] {
  return nomi.map(resolveEmail).filter(Boolean)
}

// ─── Formato storage: {"camilla": "eventId", "giacomo": "eventId2"} — professionista + guest professionisti ──

type CalendarEventsMap = Record<string, string>

function parseCalendarEvents(gcalId: string | undefined): Array<{ nome: string; calendarId: string; eventId: string }> {
  if (!gcalId) return []
  try {
    const parsed = JSON.parse(gcalId)

    // Nuovo formato: {"camilla": "eventId"} o {"giacomo": "eventId", "camilla": "eventId"}
    if (parsed && !Array.isArray(parsed) && !parsed.eventId && !parsed.professionista) {
      return Object.entries(parsed as CalendarEventsMap)
        .filter(([, v]) => typeof v === 'string' && v)
        .map(([nome, eventId]) => ({
          nome,
          calendarId: getCalendarIdForProfessionista(nome.charAt(0).toUpperCase() + nome.slice(1)),
          eventId,
        }))
    }

    // Vecchio formato singolo: {"professionista": "Giacomo", "calendarId": "...", "eventId": "..."}
    if (parsed && !Array.isArray(parsed) && parsed.eventId) {
      return [{
        nome: (parsed.professionista ?? 'camilla').toLowerCase(),
        calendarId: parsed.calendarId ?? getCalendarIdForProfessionista(parsed.professionista ?? 'Camilla'),
        eventId: parsed.eventId,
      }]
    }

    // Vecchio formato array
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .filter((e) => e.eventId)
        .map((e) => ({
          nome: (e.professionista ?? 'camilla').toLowerCase(),
          calendarId: e.calendarId ?? getCalendarIdForProfessionista(e.professionista ?? 'Camilla'),
          eventId: e.eventId,
        }))
    }
  } catch {}

  // Legacy: stringa plain = eventId di Camilla
  return [{ nome: 'camilla', calendarId: getCalendarIdForProfessionista('Camilla'), eventId: gcalId }]
}

// Estrae i nomi-chiave (lowercase) dal gcalId raw — gestisce nuovo formato, legacy e array
function chiaviProfDalGcalId(gcalId?: string): Set<string> {
  if (!gcalId) return new Set()
  try {
    const parsed = JSON.parse(gcalId)
    // Nuovo formato: {"camilla":"id","giacomo":"id"}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !parsed.eventId && !parsed.professionista) {
      return new Set(Object.keys(parsed).filter((k) => parsed[k]).map((k) => k.toLowerCase()))
    }
    // Vecchio formato singolo: {professionista, calendarId, eventId}
    if (parsed && !Array.isArray(parsed) && parsed.professionista) {
      return new Set([String(parsed.professionista).toLowerCase()])
    }
    // Vecchio array
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((e) => String(e.professionista ?? '').toLowerCase()).filter(Boolean))
    }
  } catch {}
  return new Set()
}

// GET /api/appuntamenti?mese=YYYY-MM | ?inizio=YYYY-MM-DD&fine=YYYY-MM-DD [&professionista=camilla|giacomo|nessuno]
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mese   = searchParams.get('mese') ?? undefined
    const inizio = searchParams.get('inizio') ?? undefined
    const fine   = searchParams.get('fine') ?? undefined
    const prof   = (searchParams.get('professionista') ?? '').toLowerCase()
    const appuntamenti = await getAppuntamenti({ mese, inizio, fine })
    const range = inizio && fine ? `${inizio}→${fine}` : (mese ?? '*')
    console.log(`[GET /api/appuntamenti] range=${range} prof=${prof || '*'} → letti da Airtable: ${appuntamenti.length}`)

    if (prof === 'nessuno') {
      console.log(`[GET /api/appuntamenti] filtro=nessuno → restituiti: 0`)
      return NextResponse.json([])
    }

    if (prof === 'camilla' || prof === 'giacomo') {
      const emailTarget  = (resolveEmail(prof === 'camilla' ? 'Camilla' : 'Giacomo') ?? '').toLowerCase()
      const filtrati = appuntamenti.filter((a) => {
        const profsCoinvolti = chiaviProfDalGcalId(a.google_calendar_event_id)
        // 1) Match diretto sul professionista parsato (case-insensitive)
        if ((a.professionista ?? '').toLowerCase() === prof) return true
        // 2) Match nelle chiavi del gcalId JSON (per record con più professionisti)
        if (profsCoinvolti.has(prof)) return true
        // 3) Match nell'email guests (per record creati dalla piattaforma con guests)
        if (emailTarget && (a.guests ?? '').toLowerCase().includes(emailTarget)) return true
        return false
      })
      // Log dettagliato per debug
      console.log(`[GET /api/appuntamenti] filtro=${prof} → restituiti: ${filtrati.length}/${appuntamenti.length}`)
      if (filtrati.length === 0 && appuntamenti.length > 0) {
        console.log(`[GET /api/appuntamenti] DEBUG primi 5 record esclusi:`)
        appuntamenti.slice(0, 5).forEach((a) => {
          const profs = Array.from(chiaviProfDalGcalId(a.google_calendar_event_id)).join(',') || '(vuoto)'
          console.log(`  id=${a.id} | cliente=${a.cliente_nome} | prof=${a.professionista || '(vuoto)'} | gcalKeys=${profs} | guests=${a.guests || '(vuoto)'} | rawGcal=${(a.google_calendar_event_id ?? '').slice(0, 60)}`)
        })
      }
      return NextResponse.json(filtrati)
    }

    console.log(`[GET /api/appuntamenti] nessun filtro → restituiti: ${appuntamenti.length}`)
    return NextResponse.json(appuntamenti)
  } catch (error) {
    console.error('Errore GET /api/appuntamenti:', error)
    return NextResponse.json({ errore: 'Impossibile recuperare gli appuntamenti' }, { status: 500 })
  }
}

// POST /api/appuntamenti
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      cliente_nome,
      cliente_telefono,
      cliente_dettagli,
      indirizzo,
      data,
      ora_inizio,
      ora_fine,
      note,
      professionista,  // "Camilla" | "Giacomo"
      guest,           // string[]: ["Giacomo", "Fiorella", ...]
      invitati,        // Invitato[]: [{ nome, telefono, email? }, ...]
    } = body

    const invitatiList: Array<{ nome: string; telefono: string; email?: string }> =
      Array.isArray(invitati) ? invitati : []

    if (!cliente_nome || !data || !ora_inizio || !ora_fine) {
      return NextResponse.json({ errore: 'Campi obbligatori mancanti' }, { status: 400 })
    }

    const prof: string = professionista ?? 'Camilla'
    const guestList: string[] = Array.isArray(guest) ? guest : []
    const hostEmail = resolveEmail(prof)
    const guestEmails = resolveEmails(guestList)
    const icsUid = randomUUID()

    const appData = {
      cliente_nome,
      cliente_telefono: cliente_telefono ?? '',
      cliente_dettagli: cliente_dettagli ?? '',
      indirizzo: indirizzo ?? '',
      data,
      ora_inizio,
      ora_fine,
      note: note ?? '',
    }

    const tStart = Date.now()

    // ── Google Calendar: UN solo evento nel calendario dell'host ──────────────
    // (no attendees / sendUpdates: gli inviti email li manda nodemailer)
    const tGcal = Date.now()
    const calendarEventsMap: Record<string, string> = {}
    try {
      const eventId = await creaEventoCalendar(appData, getCalendarIdForProfessionista(prof), prof)
      if (eventId) calendarEventsMap[prof.toLowerCase()] = eventId
    } catch (err) {
      console.error('[POST] ✗ Google Calendar (host):', err)
    }
    const gcalIdToStore = Object.keys(calendarEventsMap).length > 0 ? JSON.stringify(calendarEventsMap) : ''
    console.log(`[TIMING] Google Calendar (host: ${prof}): ${Date.now() - tGcal}ms`)

    // ── Airtable: ENTRAMBE le tabelle in PARALLELO ────────────────────────────
    const tAt = Date.now()
    const datiCondivisi = {
      cliente_nome,
      cliente_telefono: cliente_telefono ?? '',
      data,
      ora_inizio,
      ora_fine,
      note: note ?? '',
      google_calendar_event_id: gcalIdToStore,
      host: hostEmail,
      guests: guestEmails.join(','),
      ics_uid: icsUid,
      ics_sequence: 0,
      invitati: invitatiList,
    }
    const [appuntamento] = await Promise.all([
      creaAppuntamento(datiCondivisi),
      creaProssimoAppuntamento(datiCondivisi)
        .then(() => console.log(`[POST] ✓ Prossimi Appuntamenti — record creato per ${cliente_nome}`))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[POST] ✗ ERRORE Prossimi Appuntamenti: ${msg}`)
          console.error(`  → Il reminder WhatsApp non partirà finché non viene corretto.`)
          console.error(`  → Verifica che la tabella Prossimi Appuntamenti abbia: invitati, ics_uid, ics_sequence, reminder_sent_at, host, guests.`)
        }),
    ])
    console.log(`[TIMING] Airtable (entrambe tabelle, parallelo): ${Date.now() - tAt}ms`)

    // ── Email .ics: FIRE-AND-FORGET, SMTP dell'host (Camilla o Giacomo) ───────
    const host = asHost(prof)
    if (host) {
      const datiIcs = {
        cliente_nome,
        cliente_telefono: cliente_telefono ?? '',
        note: note ?? '',
        data,
        ora_inizio,
        ora_fine,
        professionistaNome: prof,
        icsUid,
        icsSequence: 0,
      }
      const destinatari = destinatariIcs(host, guestList)
      if (destinatari.length > 0) {
        // Sequenziale con 500ms di pausa (Gmail rate-limit sulle connessioni parallele).
        // waitUntil() tiene viva la funzione serverless oltre la response al client.
        waitUntil((async () => {
          let okCount = 0
          for (const email of destinatari) {
            try {
              await inviaInvitoCalendario(datiIcs, email, host)
              okCount++
            } catch (err) {
              console.error(`[Email] ✗ INVITO (da ${host}) → ${email}`, err)
            }
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
          console.log(`[Email .ics POST] ${okCount}/${destinatari.length} inviate (host: ${host}, destinatari: ${destinatari.join(', ')})`)
        })())
      }
    } else {
      console.warn(`[POST] Professionista host non riconosciuto ("${prof}") — email .ics non inviate.`)
    }

    console.log(`[TIMING] POST totale: ${Date.now() - tStart}ms`)
    return NextResponse.json(appuntamento, { status: 201 })
  } catch (error) {
    console.error('Errore POST /api/appuntamenti:', error)
    return NextResponse.json({ errore: "Impossibile creare l'appuntamento" }, { status: 500 })
  }
}

// PATCH /api/appuntamenti
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, google_calendar_event_id, ics_uid, ics_sequence, guests: guestsField, professionista: profField, ...datiAggiornamento } = body

    if (!id) return NextResponse.json({ errore: 'ID mancante' }, { status: 400 })

    // Rileva se data/ora sono cambiate per resettare reminder
    const tStart = Date.now()
    let orarioCambiato = false
    try {
      const corrente = await getAppuntamentoById(id)
      orarioCambiato =
        (datiAggiornamento.data !== undefined && datiAggiornamento.data !== corrente.data) ||
        (datiAggiornamento.ora_inizio !== undefined && datiAggiornamento.ora_inizio !== corrente.ora_inizio) ||
        (datiAggiornamento.ora_fine !== undefined && datiAggiornamento.ora_fine !== corrente.ora_fine)
    } catch (err) {
      console.warn('[PATCH] Impossibile leggere record corrente per confronto orari:', err)
    }
    console.log(`[TIMING] PATCH lettura corrente: ${Date.now() - tStart}ms`)

    const nuovaSequence = (ics_sequence ?? 0) + 1
    const reminderReset = orarioCambiato ? { reminder_sent: false, reminder_sent_at: null } : {}
    const entries = parseCalendarEvents(google_calendar_event_id)

    const guestEmailsPatch: string[] = typeof guestsField === 'string'
      ? guestsField.split(',').map((e: string) => e.trim()).filter(Boolean)
      : []
    // NB: gli `invitati` NON ricevono email .ics — sono clienti aggiuntivi, non staff.

    // ── Google Calendar: tutti i calendari in PARALLELO (no attendees, no sendUpdates) ─
    const tGcal = Date.now()
    await Promise.all(entries.map(async (entry) => {
      try {
        await aggiornaEventoCalendar(entry.eventId, entry.calendarId, datiAggiornamento, profField)
      } catch (err) {
        console.error(`[PATCH] ✗ aggiornaEventoCalendar (${entry.nome}):`, err)
      }
    }))
    console.log(`[TIMING] PATCH GCal (${entries.length} eventi paralleli): ${Date.now() - tGcal}ms`)

    // ── Airtable: ENTRAMBE le tabelle in PARALLELO ────────────────────────────
    const tAt = Date.now()
    const primaryEntry = entries[0]
    const [appuntamento] = await Promise.all([
      aggiornaAppuntamento(id, {
        ...datiAggiornamento,
        ...reminderReset,
        google_calendar_event_id,
        ics_sequence: nuovaSequence,
      }),
      primaryEntry?.eventId
        ? aggiornaProssimoAppuntamentoByGcalId(primaryEntry.eventId, {
            ...datiAggiornamento,
            ...reminderReset,
            ics_sequence: nuovaSequence,
          })
            .then(() => console.log(`[PATCH] ✓ Prossimi Appuntamenti aggiornato (eventId ${primaryEntry.eventId.slice(0, 10)}…)`))
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err)
              console.error(`[PATCH] ✗ ERRORE Prossimi Appuntamenti: ${msg}`)
            })
        : Promise.resolve(),
    ])
    console.log(`[TIMING] PATCH Airtable (entrambe tabelle parallelo): ${Date.now() - tAt}ms`)

    // ── Email .ics MODIFICA: FIRE-AND-FORGET, SMTP dell'host ──────────────────
    const hostPatch = asHost(profField)
    if (hostPatch && ics_uid) {
      const datiIcs = {
        cliente_nome:     datiAggiornamento.cliente_nome ?? appuntamento.cliente_nome,
        cliente_telefono: datiAggiornamento.cliente_telefono ?? appuntamento.cliente_telefono,
        note:             datiAggiornamento.note ?? appuntamento.note ?? '',
        data:             datiAggiornamento.data ?? appuntamento.data,
        ora_inizio:       datiAggiornamento.ora_inizio ?? appuntamento.ora_inizio,
        ora_fine:         datiAggiornamento.ora_fine ?? appuntamento.ora_fine,
        professionistaNome: profField,
        icsUid: ics_uid,
        icsSequence: nuovaSequence,
      }
      // I `guests` su Airtable sono email — derivo i nomi staff da lì
      const guestListPatch = nomiStaffDaGuestsField(guestEmailsPatch.join(','))
      const destinatari = destinatariIcs(hostPatch, guestListPatch)
      if (destinatari.length > 0) {
        // Sequenziale con 500ms di pausa. waitUntil() previene troncamento serverless.
        waitUntil((async () => {
          let okCount = 0
          for (const email of destinatari) {
            try {
              await inviaModificaCalendario(datiIcs, email, hostPatch)
              okCount++
            } catch (err) {
              console.error(`[Email] ✗ MODIFICA (da ${hostPatch}) → ${email}`, err)
            }
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
          console.log(`[Email .ics PATCH] ${okCount}/${destinatari.length} inviate (host: ${hostPatch}, destinatari: ${destinatari.join(', ')})`)
        })())
      }
    } else if (!hostPatch) {
      console.warn(`[PATCH] Professionista host non riconosciuto ("${profField}") — email .ics non inviate.`)
    }

    console.log(`[TIMING] PATCH totale: ${Date.now() - tStart}ms`)
    return NextResponse.json(appuntamento)
  } catch (error) {
    console.error('Errore PATCH /api/appuntamenti:', error)
    return NextResponse.json({ errore: "Impossibile aggiornare l'appuntamento" }, { status: 500 })
  }
}

// DELETE /api/appuntamenti?id=...&gcalId=...
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const gcalId = searchParams.get('gcalId')

    if (!id) return NextResponse.json({ errore: 'ID mancante' }, { status: 400 })

    const tStart = Date.now()
    const entries = parseCalendarEvents(gcalId ?? undefined)

    // Leggi l'appuntamento PRIMA di cancellarlo (serve per le email .ics)
    let appPreDelete: Awaited<ReturnType<typeof getAppuntamentoById>> | null = null
    try {
      appPreDelete = await getAppuntamentoById(id)
    } catch (err) {
      console.warn('[DELETE] Impossibile leggere appuntamento prima della cancellazione (email .ics non inviabili):', err)
    }

    // ── Google Calendar: cancella tutti gli eventi in PARALLELO ───────────────
    const tGcal = Date.now()
    await Promise.all(entries.map(async (entry) => {
      const t = Date.now()
      try {
        await eliminaEventoCalendar(entry.eventId, entry.calendarId)
        console.log(`[DELETE] ✓ GCal ${entry.nome}: ${Date.now() - t}ms`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[DELETE] ✗ GCal ${entry.nome}: ${msg}`)
      }
    }))
    console.log(`[TIMING] DELETE GCal (${entries.length} eventi paralleli): ${Date.now() - tGcal}ms`)

    // ── Airtable: ENTRAMBE le tabelle in PARALLELO ────────────────────────────
    const tAt = Date.now()
    const primaryEntry = entries[0]
    await Promise.all([
      eliminaAppuntamento(id)
        .then(() => console.log(`[DELETE] ✓ Appuntamenti — record eliminato (${id})`))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[DELETE] ✗ Appuntamenti: ${msg}`)
          throw err
        }),
      primaryEntry?.eventId
        ? eliminaProssimoAppuntamentoByGcalId(primaryEntry.eventId)
            .then(() => console.log(`[DELETE] ✓ Prossimi Appuntamenti — record eliminato (eventId ${primaryEntry.eventId.slice(0, 10)}…)`))
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err)
              console.error(`[DELETE] ✗ Prossimi Appuntamenti: ${msg}`)
              // non rilanciamo: Prossimi è secondaria
            })
        : Promise.resolve(),
    ])
    console.log(`[TIMING] DELETE Airtable (entrambe tabelle parallelo): ${Date.now() - tAt}ms`)

    // ── Email .ics CANCEL: FIRE-AND-FORGET, SMTP dell'host ────────────────────
    const hostDel = appPreDelete ? asHost(appPreDelete.professionista) : null
    if (hostDel && appPreDelete) {
      const datiIcs = {
        cliente_nome: appPreDelete.cliente_nome,
        cliente_telefono: appPreDelete.cliente_telefono,
        data: appPreDelete.data,
        ora_inizio: appPreDelete.ora_inizio,
        ora_fine: appPreDelete.ora_fine,
        professionistaNome: appPreDelete.professionista ?? '',
        icsUid: appPreDelete.ics_uid ?? '',
        icsSequence: (appPreDelete.ics_sequence ?? 0) + 1,
      }
      // Deriva i nomi staff dagli email salvati nel record
      const guestListDel = nomiStaffDaGuestsField(appPreDelete.guests ?? '')
      const destinatari = destinatariIcs(hostDel, guestListDel)
      if (destinatari.length > 0) {
        // Sequenziale con 500ms di pausa. waitUntil() previene troncamento serverless.
        waitUntil((async () => {
          let okCount = 0
          for (const email of destinatari) {
            try {
              await inviaCancellazioneCalendario(datiIcs, email, hostDel)
              okCount++
            } catch (err) {
              console.error(`[Email] ✗ CANCEL (da ${hostDel}) → ${email}`, err)
            }
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
          console.log(`[Email .ics DELETE] ${okCount}/${destinatari.length} inviate (host: ${hostDel}, destinatari: ${destinatari.join(', ')})`)
        })())
      }
    } else if (appPreDelete && !hostDel) {
      console.warn(`[DELETE] Professionista host non riconosciuto ("${appPreDelete.professionista}") — email cancellazione non inviate.`)
    }

    console.log(`[TIMING] DELETE totale: ${Date.now() - tStart}ms`)
    return NextResponse.json({ successo: true })
  } catch (error) {
    console.error('Errore DELETE /api/appuntamenti:', error)
    return NextResponse.json({ errore: "Impossibile cancellare l'appuntamento" }, { status: 500 })
  }
}
