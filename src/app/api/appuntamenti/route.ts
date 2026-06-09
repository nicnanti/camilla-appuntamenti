import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
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
} from '@/lib/email'

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

    // ── Google Calendar: tutti i professionisti coinvolti in PARALLELO ────────
    const tGcal = Date.now()
    const destinatari = [prof, ...guestList.filter((g) => PROFESSIONISTI.has(g) && g !== prof)]
    const eventResults = await Promise.all(
      destinatari.map(async (dest) => {
        const t = Date.now()
        try {
          const eventId = await creaEventoCalendar(appData, getCalendarIdForProfessionista(dest), prof)
          console.log(`[TIMING] GCal ${dest}: ${Date.now() - t}ms`)
          return { dest, eventId }
        } catch (err) {
          console.error(`Errore Google Calendar (${dest}):`, err)
          return { dest, eventId: '' }
        }
      })
    )
    const calendarEventsMap: Record<string, string> = {}
    for (const r of eventResults) {
      if (r.eventId) calendarEventsMap[r.dest.toLowerCase()] = r.eventId
    }
    const gcalIdToStore = Object.keys(calendarEventsMap).length > 0 ? JSON.stringify(calendarEventsMap) : ''
    console.log(`[TIMING] Google Calendar totale (${destinatari.length} eventi paralleli): ${Date.now() - tGcal}ms`)

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

    // ── Email .ics: FIRE-AND-FORGET — non blocca la risposta ──────────────────
    const datiIcs = { cliente_nome, cliente_telefono: cliente_telefono ?? '', note: note ?? '', data, ora_inizio, ora_fine, professionistaNome: prof, icsUid, icsSequence: 0 }
    const destEmail = [
      ...guestEmails,
      ...invitatiList.filter((inv) => inv.email).map((inv) => inv.email as string),
    ]
    if (destEmail.length > 0) {
      const tEmail = Date.now()
      // NON awaited — parte in background, l'endpoint risponde subito
      Promise.allSettled(
        destEmail.map((email) => inviaInvitoCalendario(datiIcs, email))
      ).then((risultati) => {
        const ok = risultati.filter((r) => r.status === 'fulfilled').length
        console.log(`[TIMING] Email .ics (background): ${Date.now() - tEmail}ms — ${ok}/${destEmail.length} inviate`)
        risultati.forEach((r, i) => {
          if (r.status === 'rejected') {
            const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
            console.error(`  ✗ .ics a ${destEmail[i]}: ${msg}`)
          }
        })
      })
    }

    console.log(`[TIMING] POST totale (escluse email async): ${Date.now() - tStart}ms`)
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

    // ── Google Calendar: tutti i calendari in PARALLELO ───────────────────────
    const tGcal = Date.now()
    await Promise.all(entries.map(async (entry) => {
      try {
        await aggiornaEventoCalendar(entry.eventId, entry.calendarId, datiAggiornamento)
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

    // ── Email .ics: FIRE-AND-FORGET ───────────────────────────────────────────
    if (ics_uid) {
      const datiIcs = {
        cliente_nome:     datiAggiornamento.cliente_nome ?? '',
        cliente_telefono: datiAggiornamento.cliente_telefono ?? '',
        note:             datiAggiornamento.note ?? '',
        data:             datiAggiornamento.data ?? '',
        ora_inizio:       datiAggiornamento.ora_inizio ?? '',
        ora_fine:         datiAggiornamento.ora_fine ?? '',
        professionistaNome: profField ?? '',
        icsUid: ics_uid,
        icsSequence: nuovaSequence,
      }
      const destEmail = [
        ...(typeof guestsField === 'string' ? guestsField.split(',').map((e: string) => e.trim()).filter(Boolean) : []),
        ...((Array.isArray(datiAggiornamento.invitati) ? datiAggiornamento.invitati : (appuntamento.invitati ?? []))
          .filter((inv: { email?: string }) => inv.email)
          .map((inv: { email?: string }) => inv.email as string)),
      ]
      if (destEmail.length > 0) {
        const tEmail = Date.now()
        Promise.allSettled(destEmail.map((email) => inviaModificaCalendario(datiIcs, email)))
          .then((risultati) => {
            const ok = risultati.filter((r) => r.status === 'fulfilled').length
            console.log(`[TIMING] PATCH email .ics (background): ${Date.now() - tEmail}ms — ${ok}/${destEmail.length} inviate`)
          })
      }
    }

    console.log(`[TIMING] PATCH totale (esclusi invii async): ${Date.now() - tStart}ms`)
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
    const icsUid = searchParams.get('icsUid') ?? undefined
    const icsSequence = parseInt(searchParams.get('icsSeq') ?? '0', 10)
    const guestsParam = searchParams.get('guests') ?? ''
    const profParam = searchParams.get('prof') ?? ''
    const appData = {
      cliente_nome: searchParams.get('nome') ?? '',
      data: searchParams.get('data') ?? '',
      ora_inizio: searchParams.get('oraInizio') ?? '',
      ora_fine: searchParams.get('oraFine') ?? '',
    }

    if (!id) return NextResponse.json({ errore: 'ID mancante' }, { status: 400 })

    const tStart = Date.now()
    const entries = parseCalendarEvents(gcalId ?? undefined)

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

    // ── Email .ics cancellazione: FIRE-AND-FORGET ─────────────────────────────
    if (icsUid && guestsParam) {
      const guestEmails = guestsParam.split(',').map((e) => e.trim()).filter(Boolean)
      if (guestEmails.length > 0) {
        const tEmail = Date.now()
        Promise.allSettled(guestEmails.map((email) =>
          inviaCancellazioneCalendario(
            {
              cliente_nome: appData.cliente_nome,
              data: appData.data,
              ora_inizio: appData.ora_inizio,
              ora_fine: appData.ora_fine,
              professionistaNome: profParam,
              icsUid,
              icsSequence: icsSequence + 1,
            },
            email
          )
        )).then((risultati) => {
          const ok = risultati.filter((r) => r.status === 'fulfilled').length
          console.log(`[TIMING] DELETE email .ics CANCEL (background): ${Date.now() - tEmail}ms — ${ok}/${guestEmails.length} inviate`)
        })
      }
    }

    console.log(`[TIMING] DELETE totale (esclusi invii async): ${Date.now() - tStart}ms`)
    return NextResponse.json({ successo: true })
  } catch (error) {
    console.error('Errore DELETE /api/appuntamenti:', error)
    return NextResponse.json({ errore: "Impossibile cancellare l'appuntamento" }, { status: 500 })
  }
}
