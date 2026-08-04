import fetchMock from 'jest-fetch-mock'
import { adaptNeeruMeta } from 'src/earn/neeru/api'
import { NEERU_META_HARDCODED_FALLBACK } from 'src/earn/neeru/configSelectors'
import { NeeruMeta } from 'src/earn/neeru/types'

// Gate the whole suite behind an env var so local `yarn test` runs offline
// stay green. CI opts in via NEERU_LIVE_META_CHECK=1 on the drift-check job.
// This is the poison-pill guardrail agreed with backend on 2026-07-25: any
// drift between the hardcoded fallback and live /meta blocks merge.
const RUN_LIVE = process.env.NEERU_LIVE_META_CHECK === '1'
const describeLive = RUN_LIVE ? describe : describe.skip

const BACKEND_BASE_URL =
  process.env.NEERU_LIVE_META_BASE_URL ?? 'https://tucop-backend-production.up.railway.app'
// Matches the wallet-side NEERU_FETCH_TIMEOUT_MS bump (45s) so the drift
// check tolerates the backend's occasional cold-response tail
// (Railway container spin-up + DB pool warm on first hit after idle can
// stretch to 20-30s). Below this the CI job flakes on cold cache runs.
const FETCH_TIMEOUT_MS = 45_000

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    // Use node's native fetch directly (bypassing jest-fetch-mock) so the
    // request actually hits the network. Casting the type since Node 18+
    // exposes fetch on globalThis under the standard Fetch API shape.
    const nativeFetch = (globalThis as unknown as { fetch: typeof fetch }).fetch
    return await nativeFetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

describeLive('Neeru meta drift check (live backend)', () => {
  // 2 backend calls in beforeAll, so allow 2x the per-fetch timeout + margin.
  jest.setTimeout(FETCH_TIMEOUT_MS * 2 + 10_000)

  let liveMetaAdapted: NeeruMeta
  let liveCatalogue: any

  beforeAll(async () => {
    // jest_setup replaces globalThis.fetch with jest-fetch-mock. Disable so
    // the beforeAll hits the real backend; only this suite opts back in.
    fetchMock.disableMocks()

    const metaRes = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/meta/contracts/neeru`)
    if (!metaRes.ok) {
      throw new Error(`/meta returned ${metaRes.status} ${metaRes.statusText}`)
    }
    const rawMeta = await metaRes.json()
    // Route the live response through the same adapter every consumer uses,
    // so the assertions compare the opaque internal projection byte-for-byte
    // and the semantic backend names never appear in this file.
    liveMetaAdapted = adaptNeeruMeta(rawMeta)

    const catRes = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/earn/neeru/catalogue`)
    if (!catRes.ok) {
      throw new Error(`/catalogue returned ${catRes.status} ${catRes.statusText}`)
    }
    const catBody = await catRes.json()
    liveCatalogue = catBody.data
  })

  afterAll(() => {
    fetchMock.enableMocks()
  })

  it('proxyAddress matches live /meta (adapter-normalised, byte for byte)', () => {
    expect(liveMetaAdapted.proxyAddress).toBe(NEERU_META_HARDCODED_FALLBACK.proxyAddress)
  })

  it('primary event topic0 matches live /meta byte for byte', () => {
    expect(liveMetaAdapted.events.primary.topic0).toBe(
      NEERU_META_HARDCODED_FALLBACK.events.primary.topic0
    )
  })

  it('primary event dataSchema is structurally identical to live /meta', () => {
    const liveSchema = liveMetaAdapted.events.primary.dataSchema
    const localSchema = NEERU_META_HARDCODED_FALLBACK.events.primary.dataSchema
    expect(liveSchema).toHaveLength(localSchema.length)
    for (let i = 0; i < liveSchema.length; i++) {
      expect(liveSchema[i].type).toBe(localSchema[i].type)
    }
  })

  it('all three error selectors match live /meta byte for byte', () => {
    expect(liveMetaAdapted.errorSelectors.e1).toBe(NEERU_META_HARDCODED_FALLBACK.errorSelectors.e1)
    expect(liveMetaAdapted.errorSelectors.e2).toBe(NEERU_META_HARDCODED_FALLBACK.errorSelectors.e2)
    expect(liveMetaAdapted.errorSelectors.e3).toBe(NEERU_META_HARDCODED_FALLBACK.errorSelectors.e3)
  })

  it('depositToken.address matches live /meta byte for byte', () => {
    expect(liveMetaAdapted.depositToken.address).toBe(
      NEERU_META_HARDCODED_FALLBACK.depositToken.address
    )
  })

  it('catalogue exposes the 4 expected category IDs (structural, no rate assertion)', () => {
    const ids = liveCatalogue.categories.map((c: { id: number }) => c.id).sort()
    // Rates fluctuate operationally so we only validate the structural shape:
    // the same 4 categories that the wallet hardcodes exist upstream. Retunes
    // do not fail this check; adding or removing a category does.
    expect(ids).toEqual([0, 1, 2, 3])
  })

  it('catalogue category lock periods (secs) are the 4 expected buckets', () => {
    const secsByCategory = new Map<number, string>(
      liveCatalogue.categories.map((c: { id: number; secs: string }) => [c.id, c.secs])
    )
    expect(secsByCategory.get(0)).toBe('0')
    expect(secsByCategory.get(1)).toBe(String(30 * 86400))
    expect(secsByCategory.get(2)).toBe(String(60 * 86400))
    expect(secsByCategory.get(3)).toBe(String(90 * 86400))
  })
})
