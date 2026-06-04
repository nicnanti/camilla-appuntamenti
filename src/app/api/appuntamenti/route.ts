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

// GET /api/appuntamenti?mese=YYYY-MM&professionista=camilla|giacomo|nessuno
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mese = searchParams.get('mese') ?? undefined
    const prof = (searchParams.get('professionista') ?? '').toLowerCase()
    const appuntamenti = await getAppuntamenti(mese)

    if (prof === 'nessuno') {
      return NextResponse.json([])
    }

    if (prof === 'camilla' || prof === 'giacomo') {
      const nomeTarget   = prof === 'camilla' ? 'Camilla' : 'Giacomo'
      const emailTarget  = (resolveEmail(nomeTarget) ?? '').toLowerCase()
      const filtrati = appuntamenti.filter((a) => {
        if (a.professionista === nomeTarget) return true
        if (emailTarget && (a.guests ?? '').toLowerCase().includes(emailTarget)) return true
        return false
      })
      return NextResponse.json(filtrati)
    }

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
    } = body

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

    // ── Google Calendar: professionista principale + guest professionisti ────────
    const calendarEventsMap: Record<string, string> = {}

    // Professionista principale
    try {
      const eventId = await creaEventoCalendar(appData, getCalendarIdForProfessionista(prof), prof)
      if (eventId) calendarEventsMap[prof.toLowerCase()] = eventId
    } catch (err) {
      console.error('Errore creazione evento Google Calendar (professionista principale):', err)
    }

    // Guest professionisti
    for (const g of guestList.filter((g) => PROFESSIONISTI.has(g) && g !== prof)) {
      try {
        const eventId = await creaEventoCalendar(appData, getCalendarIdForProfessionista(g), prof)
        if (eventId) calendarEventsMap[g.toLowerCase()] = eventId
      } catch (err) {
        console.error(`Errore creazione evento Google Calendar (guest ${g}):`, err)
      }
    }

    const gcalIdToStore = Object.keys(calendarEventsMap).length > 0
      ? JSON.stringify(calendarEventsMap)
      : ''

    // ── Airtable ──────────────────────────────────────────────────────────────
    const appuntamento = await creaAppuntamento({
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
    })

    try {
      await creaProssimoAppuntamento(appuntamento)
    } catch (err) {
      console.error('Errore Prossimi Appuntamenti (creazione):', err)
    }

    // ── Email .ics: tutti i guest ─────────────────────────────────────────────
    for (const email of guestEmails) {
      try {
        await inviaInvitoCalendario(
          { cliente_nome, cliente_telefono: cliente_telefono ?? '', note: note ?? '', data, ora_inizio, ora_fine, professionistaNome: prof, icsUid, icsSequence: 0 },
          email
        )
      } catch (err) {
        console.error(`Errore invio .ics a ${email}:`, err)
      }
    }

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
    let orarioCambiato = false
    try {
      const corrente = await getAppuntamentoById(id)
      orarioCambiato =
        (datiAggiornamento.data !== undefined && datiAggiornamento.data !== corrente.data) ||
        (datiAggiornamento.ora_inizio !== undefined && datiAggiornamento.ora_inizio !== corrente.ora_inizio) ||
        (datiAggiornamento.ora_fine !== undefined && datiAggiornamento.ora_fine !== corrente.ora_fine)
    } catch (err) {
      console.warn('Impossibile leggere record corrente per confronto orari:', err)
    }

    // ── Google Calendar: aggiorna eventi in tutti i calendari salvati ─────────
    const entries = parseCalendarEvents(google_calendar_event_id)
    for (const entry of entries) {
      try {
        await aggiornaEventoCalendar(entry.eventId, entry.calendarId, datiAggiornamento)
      } catch (err) {
        console.error(`Errore aggiornamento calendario ${entry.nome}:`, err)
      }
    }

    const nuovaSequence = (ics_sequence ?? 0) + 1
    const reminderReset = orarioCambiato ? { reminder_sent: false, reminder_sent_at: '' } : {}

    const appuntamento = await aggiornaAppuntamento(id, {
      ...datiAggiornamento,
      ...reminderReset,
      google_calendar_event_id,
      ics_sequence: nuovaSequence,
    })

    const primaryEntry = entries[0]
    if (primaryEntry?.eventId) {
      try {
        await aggiornaProssimoAppuntamentoByGcalId(primaryEntry.eventId, {
          ...datiAggiornamento,
          ...reminderReset,
          ics_sequence: nuovaSequence,
        })
      } catch (err) {
        console.error('Errore Prossimi Appuntamenti (aggiornamento):', err)
      }
    }

    // ── Email .ics aggiornato a tutti i guest ─────────────────────────────────
    if (ics_uid && guestsField) {
      const guestEmails: string[] = typeof guestsField === 'string'
        ? guestsField.split(',').map((e: string) => e.trim()).filter(Boolean)
        : []
      for (const email of guestEmails) {
        try {
          await inviaModificaCalendario(
            {
              cliente_nome: datiAggiornamento.cliente_nome ?? '',
              cliente_telefono: datiAggiornamento.cliente_telefono ?? '',
              note: datiAggiornamento.note ?? '',
              data: datiAggiornamento.data ?? '',
              ora_inizio: datiAggiornamento.ora_inizio ?? '',
              ora_fine: datiAggiornamento.ora_fine ?? '',
              professionistaNome: profField ?? '',
              icsUid: ics_uid,
              icsSequence: nuovaSequence,
            },
            email
          )
        } catch (err) {
          console.error(`Errore invio modifica .ics a ${email}:`, err)
        }
      }
    }

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

    // ── Google Calendar: cancella eventi in tutti i calendari salvati ─────────
    const entries = parseCalendarEvents(gcalId ?? undefined)
    for (const entry of entries) {
      try {
        await eliminaEventoCalendar(entry.eventId, entry.calendarId)
      } catch (err) {
        console.error(`Errore cancellazione calendario ${entry.nome}:`, err)
      }
    }

    await eliminaAppuntamento(id)

    const primaryEntry = entries[0]
    if (primaryEntry?.eventId) {
      try {
        await eliminaProssimoAppuntamentoByGcalId(primaryEntry.eventId)
      } catch (err) {
        console.error('Errore Prossimi Appuntamenti (eliminazione):', err)
      }
    }

    // ── Email .ics cancellazione a tutti i guest ──────────────────────────────
    if (icsUid && guestsParam) {
      const guestEmails = guestsParam.split(',').map((e) => e.trim()).filter(Boolean)
      for (const email of guestEmails) {
        try {
          await inviaCancellazioneCalendario(
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
        } catch (err) {
          console.error(`Errore invio cancellazione .ics a ${email}:`, err)
        }
      }
    }

    return NextResponse.json({ successo: true })
  } catch (error) {
    console.error('Errore DELETE /api/appuntamenti:', error)
    return NextResponse.json({ errore: "Impossibile cancellare l'appuntamento" }, { status: 500 })
  }
}
