import { NextRequest, NextResponse } from 'next/server'

// Proxy server-side a Photon (Komoot) per evitare problemi CORS dal browser.
// GET /api/address-search?q=via+roma
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''

  if (q.trim().length < 3) {
    return NextResponse.json({ features: [] })
  }

  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=it&limit=5&bbox=6.6,35.5,18.5,47.1`

  try {
    const res = await fetch(url, {
      // Cache breve lato Next.js per evitare di martellare Photon su digitazione veloce
      next: { revalidate: 60 },
    })
    if (!res.ok) {
      return NextResponse.json({ errore: `Photon ${res.status}` }, { status: 502 })
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[address-search] Errore Photon:', err)
    return NextResponse.json({ errore: 'Impossibile contattare il servizio di geocoding' }, { status: 502 })
  }
}
