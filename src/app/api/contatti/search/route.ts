import { NextRequest, NextResponse } from 'next/server'
import { getContatti } from '@/lib/airtable'

// GET /api/contatti/search?q=query
// Usato dall'autocomplete nel form "Nuovo Appuntamento"
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') ?? ''

    if (q.length < 2) {
      return NextResponse.json([])
    }

    const contatti = await getContatti(q)
    // Restituisce max 10 risultati per l'autocomplete
    return NextResponse.json(contatti.slice(0, 10))
  } catch (error) {
    console.error('Errore GET /api/contatti/search:', error)
    return NextResponse.json(
      { errore: 'Impossibile cercare i contatti' },
      { status: 500 }
    )
  }
}
