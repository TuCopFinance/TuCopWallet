// Integration smoke for Phase 1 of the TuCOPRamp integration.
//
// Hits the real prod backend proxy at
//   https://tucop-backend-production.up.railway.app/api/tucopramp/v1/p2p/banks
// which forwards to https://api.ramp.tucop.xyz/v1/p2p/banks.
//
// Guarded by RUN_TUCOPRAMP_INTEGRATION_TESTS=1 so CI does not exercise a
// third-party production dependency on every run.
//
// Usage:
//   RUN_TUCOPRAMP_INTEGRATION_TESTS=1 yarn jest \
//     src/tucopramp/__tests__/getBanks.integration.test.ts
//
// Then ping the backend team with the run timestamp so they can correlate
// the request_id in Railway logs.

import { getBanks } from 'src/tucopramp/api'

const enabled = process.env.RUN_TUCOPRAMP_INTEGRATION_TESTS === '1'
const describeIfEnabled = enabled ? describe : describe.skip

describeIfEnabled('getBanks (integration, real prod proxy)', () => {
  it('returns the 6 expected bank rows', async () => {
    const banks = await getBanks()
    const codes = banks.map((b) => b.code).sort()
    // Assertion checks the six banks the coordinator confirmed on 2026-09-01.
    // If Ops adds banks upstream, this will fail as expected -> bump the list.
    expect(codes).toEqual(['bancolombia', 'bbva', 'bogota', 'daviplata', 'davivienda', 'nequi'])
    for (const b of banks) {
      expect(typeof b.code).toBe('string')
      expect(typeof b.display_name).toBe('string')
      expect(Array.isArray(b.supported_account_types)).toBe(true)
    }
  }, 10_000)
})
