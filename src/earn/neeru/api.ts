import { NeeruPositionsResponse } from 'src/earn/neeru/types'
import { fetchWithTimeout } from 'src/utils/fetchWithTimeout'

const NEERU_FETCH_TIMEOUT_MS = 15_000

export async function fetchNeeruPositions({
  baseUrl,
  walletAddress,
}: {
  baseUrl: string
  walletAddress: string
}): Promise<NeeruPositionsResponse> {
  const url = new URL('/api/earn/neeru/positions', baseUrl)
  url.searchParams.set('address', walletAddress)
  const response = await fetchWithTimeout(url.toString(), null, NEERU_FETCH_TIMEOUT_MS)
  if (!response.ok) {
    throw new Error(`fetchNeeruPositions failed: ${response.status} ${response.statusText}`)
  }
  const body = await response.json()
  return body.data as NeeruPositionsResponse
}
