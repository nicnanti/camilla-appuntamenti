import { NextRequest, NextResponse } from 'next/server'
import { getContatti, creaContatto, aggiornaContatto, eliminaContatto } from '@/lib/airtable'

// GET /api/contatti?q=ricerca
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const ricerca = searchParams.get('q') ?? undefined

    const contatti = await getContatti(ricerca)
    return NextResponse.json(contatti)
  } catch (error) {
    console.error('Errore GET /api/contatti:', error)
    return NextResponse.json(
      { errore: 'Impossibile recuperare i contatti' },
      { status: 500 }
    )
  }
}

// POST /api/contatti — aggiunge un nuovo contatto
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nome, cognome, telefono, email, dettagli, note, indirizzo, comune, provincia, gruppo } = body

    if (!nome || !cognome || !telefono) {
      return NextResponse.json(
        { errore: 'Nome, cognome e telefono sono obbligatori' },
        { status: 400 }
      )
    }

    // Campi opzionali: undefined se vuoti → omessi dal payload Airtable (no stringa vuota)
    const omitIfEmpty = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : undefined

    const contatto = await creaContatto({
      nome,
      cognome,
      telefono,
      email: email ?? '',
      dettagli:  omitIfEmpty(dettagli),
      note:      omitIfEmpty(note),
      indirizzo: omitIfEmpty(indirizzo),
      comune:    omitIfEmpty(comune),
      provincia: omitIfEmpty(provincia),
      gruppo:    omitIfEmpty(gruppo),
    })
    return NextResponse.json(contatto, { status: 201 })
  } catch (error) {
    console.error('Errore POST /api/contatti:', error)
    return NextResponse.json(
      { errore: 'Impossibile creare il contatto' },
      { status: 500 }
    )
  }
}

// PATCH /api/contatti — aggiorna un contatto (es. nota, dettagli)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...dati } = body

    if (!id) {
      return NextResponse.json({ errore: 'ID mancante' }, { status: 400 })
    }

    const contatto = await aggiornaContatto(id, dati)
    return NextResponse.json(contatto)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Errore PATCH /api/contatti:', msg)
    return NextResponse.json(
      { errore: msg },
      { status: 500 }
    )
  }
}

// DELETE /api/contatti?id=...
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ errore: 'ID mancante' }, { status: 400 })
    }

    await eliminaContatto(id)
    return NextResponse.json({ successo: true })
  } catch (error) {
    console.error('Errore DELETE /api/contatti:', error)
    return NextResponse.json(
      { errore: 'Impossibile eliminare il contatto' },
      { status: 500 }
    )
  }
}
