import { tucopRampFetch } from 'src/tucopramp/client'
import { Bank, BanksResponse } from 'src/tucopramp/types'

// Public endpoint: no wallet signature required. The consumer key is injected
// server-side by the backend proxy (Pattern B), so wallet-side we send zero
// auth headers.
export async function getBanks(): Promise<Bank[]> {
  const response = await tucopRampFetch<BanksResponse>({
    method: 'GET',
    upstreamPath: '/v1/p2p/banks',
    skipWalletAuth: true,
  })
  return response.banks
}
