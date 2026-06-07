import { NextRequest, NextResponse } from 'next/server'

const USER_AGENT = 'CamillaAppuntamenti/1.0 (contact@studioghisleni.it)'
const TIMEOUT_MS = 5000

interface PhotonResp {
  features?: Array<{
    properties?: Record<string, unknown>
  }>
}

interface NominatimResult {
  display_name?: string
  address?: {
    road?: string
    house_number?: string
    city?: string
    town?: string
    village?: string
    municipality?: string
    postcode?: string
    state?: string
    county?: string
    country_code?: string
  }
}

// ─── Photon ──────────────────────────────────────────────────────────────────

async function chiamaPhoton(q: string): Promise<PhotonResp | null> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=it&limit=5&bbox=6.6,35.5,18.5,47.1`
  console.log('[address-search] → Photon:', url)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    console.log('[address-search] Photon status:', res.status)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn('[address-search] Photon non-OK body:', body.slice(0, 300))
      return null
    }
    const data = (await res.json()) as PhotonResp
    console.log('[address-search] Photon features:', data.features?.length ?? 0)
    return data
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.warn('[address-search] Photon errore:', msg)
    return null
  }
}

// ─── Nominatim (fallback) ────────────────────────────────────────────────────

async function chiamaNominatim(q: string): Promise<PhotonResp | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=it&limit=5&addressdetails=1`
  console.log('[address-search] → Nominatim:', url)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    console.log('[address-search] Nominatim status:', res.status)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn('[address-search] Nominatim non-OK body:', body.slice(0, 300))
      return null
    }
    const data = (await res.json()) as NominatimResult[]
    console.log('[address-search] Nominatim risultati:', data.length)

    // Normalizza Nominatim → formato Photon-like che il frontend già sa parsare
    const features = data.map((r) => {
      const a = r.address ?? {}
      const city = a.city ?? a.town ?? a.village ?? a.municipality ?? ''
      return {
        properties: {
          name: r.display_name,
          street: a.road ?? '',
          housenumber: a.house_number ?? '',
          city,
          postcode: a.postcode ?? '',
          state: a.state ?? a.county ?? '',
          countrycode: (a.country_code ?? '').toUpperCase(),
        },
      }
    })
    return { features }
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    console.error('[address-search] Nominatim errore:', msg)
    return null
  }
}

// ─── Endpoint ────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  if (q.length < 3) {
    return NextResponse.json({ features: [] })
  }

  // Prova Photon, poi fallback su Nominatim
  let data = await chiamaPhoton(q)
  if (!data || !data.features || data.features.length === 0) {
    console.log('[address-search] Photon vuoto o KO — fallback a Nominatim')
    data = await chiamaNominatim(q)
  }

  if (!data) {
    return NextResponse.json(
      { errore: 'Entrambi i servizi di geocoding non rispondono', features: [] },
      { status: 502 },
    )
  }

  return NextResponse.json(data)
}
