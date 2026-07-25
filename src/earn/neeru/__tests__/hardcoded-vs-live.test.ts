import fetchMock from 'jest-fetch-mock'
import { NEERU_META_HARDCODED_FALLBACK } from 'src/earn/neeru/configSelectors'

// Gate the whole suite behind an env var so local `yarn test` runs offline
// stay green. CI opts in via NEERU_LIVE_META_CHECK=1 on the drift-check job.
// This is the poison-pill guardrail agreed with backend on 2026-07-25: any
// drift between the hardcoded fallback and live /meta blocks merge.
const RUN_LIVE = process.env.NEERU_LIVE_META_CHECK === '1'
const describeLive = RUN_LIVE ? describe : describe.skip

const BACKEND_BASE_URL =
  process.env.NEERU_LIVE_META_BASE_URL ?? 'https://tucop-backend-production.up.railway.app'
const FETCH_TIMEOUT_MS = 15_000

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
  jest.setTimeout(FETCH_TIMEOUT_MS + 5_000)

  let liveMeta: any
  let liveCatalogue: any

  beforeAll(async () => {
    // jest_setup replaces globalThis.fetch with jest-fetch-mock. Disable so
    // the beforeAll hits the real backend; only this suite opts back in.
    fetchMock.disableMocks()

    const metaRes = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/meta/contracts/neeru`)
    if (!metaRes.ok) {
      throw new Error(`/meta returned ${metaRes.status} ${metaRes.statusText}`)
    }
    liveMeta = await metaRes.json()

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

  it('proxyAddress matches live /meta byte for byte', () => {
    expect(liveMeta.proxyAddress.toLowerCase()).toBe(
      NEERU_META_HARDCODED_FALLBACK.proxyAddress.toLowerCase()
    )
  })

  it('primary event topic0 matches live /meta byte for byte', () => {
    expect(liveMeta.events.primary.topic0.toLowerCase()).toBe(
      NEERU_META_HARDCODED_FALLBACK.events.primary.topic0.toLowerCase()
    )
  })

  it('primary event dataSchema is structurally identical to live /meta', () => {
    const liveSchema = liveMeta.events.primary.dataSchema
    const localSchema = NEERU_META_HARDCODED_FALLBACK.events.primary.dataSchema
    expect(liveSchema).toHaveLength(localSchema.length)
    for (let i = 0; i < liveSchema.length; i++) {
      expect(liveSchema[i].type).toBe(localSchema[i].type)
    }
  })

  it('errorSelectors match live /meta byte for byte (3 selectors)', () => {
    expect(liveMeta.errorSelectors.e1.toLowerCase()).toBe(
      NEERU_META_HARDCODED_FALLBACK.errorSelectors.e1.toLowerCase()
    )
    expect(liveMeta.errorSelectors.e2.toLowerCase()).toBe(
      NEERU_META_HARDCODED_FALLBACK.errorSelectors.e2.toLowerCase()
    )
    expect(liveMeta.errorSelectors.e3.toLowerCase()).toBe(
      NEERU_META_HARDCODED_FALLBACK.errorSelectors.e3.toLowerCase()
    )
  })

  it('depositToken.address matches live /meta byte for byte', () => {
    expect(liveMeta.depositToken.address.toLowerCase()).toBe(
      NEERU_META_HARDCODED_FALLBACK.depositToken.address.toLowerCase()
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
