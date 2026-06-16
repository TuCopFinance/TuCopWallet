<!-- markdownlint-disable MD032 MD040 MD060 -->

# Wallet Robustness Initiative — Plan 04: Track D (Stack Hygiene + Sepolia Removal + Valora Migration)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the wallet's stack debt (ethers v5 removal, husky upgrade, prettier/lint config), remove all Celo Sepolia / testnet support from the codebase, accelerate the Valora API migration roadmap, and relocate hardcoded API keys to the project's own backend.

**Architecture:** Series of independent feature PRs against `Development`. Each PR is reviewable on its own. No new abstractions introduced; this is removal, replacement, and clean-up work. Backend (api-wallet-tucop on Railway) gets two new proxy endpoints for hidden API keys.

**Tech Stack:** viem 2.x, @mento-protocol/mento-sdk 3.x, Node ≥20.17.0, Foundry (already in repo per bootstrap PR), Express (api-wallet-tucop backend), Redis (for backend cache).

**Source spec:** [docs/specs/2026-06-15-wallet-robustness-initiative-design.md](../specs/2026-06-15-wallet-robustness-initiative-design.md) sections 9.1–9.7 and locked decisions #3, #8, #11, #12.

**Source spike:** [docs/spikes/s2-ethers-v5-deps.md](../spikes/s2-ethers-v5-deps.md) (PASS) — confirms ethers v5 is removable with one file rewrite plus one dep bump.

**Git workflow:** branches `feature/wri-<short>` off `Development`. Full automation per locked decision (commit, push, PR, auto-merge on green CI). NEVER --no-verify. NEVER force-push. Conventional commits in English. Per locked decision #11, NEVER mention or use Sepolia/Alfajores/testnet outside the removal context itself.

---

## Task 1: Sepolia / testnet codebase removal (per locked decision #12)

This is the biggest single PR of Track D. It removes all Celo Sepolia / testnet artifacts from the codebase. Production behavior on mainnet is unchanged.

**Files (this is a removal task; expect deletions to dominate):**

- Modify: `src/web3/networkConfig.ts` (remove `celo-sepolia` network entry and all token entries scoped to it)
- Delete: `.env.testnet`, `.env.testnetdev`
- Modify: `package.json` (remove `dev:android:testnet*`, `dev:ios:testnet*` scripts)
- Delete: `ios/MobileStack.xcodeproj/xcshareddata/xcschemes/MobileStack-testnetdev.xcscheme`
- Delete: `ios/MobileStack.xcodeproj/xcshareddata/xcschemes/MobileStack-testnet.xcscheme`
- Modify: `android/app/build.gradle` (remove `testnet` and `testnetdev` build flavors)
- Delete: `android/app/src/testnet/` and `android/app/src/testnetdev/` (if they exist as flavor-specific manifests)
- Modify: `.github/workflows/*.yml` (remove testnet-target jobs)
- Modify: `detox.config.js` (remove testnet configurations)
- Modify: `CLAUDE.md`, `.claude/rules/ios-build.md`, `.claude/rules/android-build.md`, `README.md` (reflect mainnet-only)
- Modify: any test files scoped to a Sepolia token ID (rewrite to mainnet or delete redundant)
- Modify: locales (scrub `testnet` / `Sepolia` strings if present)

- [ ] **Step 1: Branch and survey scope**

```bash
git checkout Development && git pull
git checkout -b feature/wri-remove-sepolia
mkdir -p .wri-scratch
grep -rin "sepolia\|alfajores\|testnet" src/ ios/ android/ .github/ docs/ locales/ package.json detox.config.js > .wri-scratch/sepolia-survey.txt 2>/dev/null || true
wc -l .wri-scratch/sepolia-survey.txt
```

Expected: a count of lines that will be touched. Use this as the baseline for the verification step at the end.

- [ ] **Step 2: Remove `celo-sepolia` network from `src/web3/networkConfig.ts`**

Open `src/web3/networkConfig.ts`. Locate the `NetworkId` enum and the network definitions array. Remove the `'celo-sepolia'` enum member, the network config block for celo-sepolia, and any token list entries that have addresses prefixed `celo-sepolia:`. Confirm no other file imports `NetworkId.CeloSepolia` or equivalent constant.

Run `yarn build:ts` to catch any references. Fix every reference by either removing it or changing it to a mainnet equivalent. Common references will be in: `src/web3/utils.ts`, `src/tokens/*`, `src/transactions/*`, RTK Query keys, Statsig dynamic config defaults.

- [ ] **Step 3: Delete env files**

```bash
git rm .env.testnet .env.testnetdev 2>/dev/null || true
```

Confirm none of the build scripts read them.

- [ ] **Step 4: Remove testnet scripts from package.json**

Open `package.json`. Delete every script whose key starts with `dev:android:testnet`, `dev:ios:testnet`, `build:testnet`. Save.

- [ ] **Step 5: Delete iOS testnet schemes**

```bash
git rm ios/MobileStack.xcodeproj/xcshareddata/xcschemes/MobileStack-testnetdev.xcscheme
git rm ios/MobileStack.xcodeproj/xcshareddata/xcschemes/MobileStack-testnet.xcscheme
```

- [ ] **Step 6: Remove Android testnet flavors**

Open `android/app/build.gradle`. In the `productFlavors {}` block, delete `testnet { ... }` and `testnetdev { ... }`. Also delete any `flavorDimensions` config that exists solely for testnet.

```bash
git rm -r android/app/src/testnet android/app/src/testnetdev 2>/dev/null || true
```

- [ ] **Step 7: Remove testnet CI jobs**

For each file under `.github/workflows/`, open and remove any job entry, matrix entry, or step explicitly referencing testnet, alfajores, or sepolia (case-insensitive). Run `yamllint .github/workflows/*.yml` if installed (acceptable failure: tool not installed).

- [ ] **Step 8: Update Detox config**

Open `detox.config.js`. Remove any `apps`, `devices`, or `configurations` entries scoped to testnet. Save.

- [ ] **Step 9: Update project docs**

Open each of:

- `CLAUDE.md`
- `.claude/rules/ios-build.md`
- `.claude/rules/android-build.md`
- `README.md`

Replace any reference to "4 schemes" with "2 schemes (mainnet, mainnetdev)". Replace any reference to "testnet" or "Sepolia" with mainnet equivalents. Save.

- [ ] **Step 10: Scrub locales**

```bash
grep -rin "testnet\|sepolia" locales/ > .wri-scratch/sepolia-in-locales.txt
```

If non-empty, open each file and rewrite the string. If empty, no action.

- [ ] **Step 11: Verify**

```bash
yarn build:ts && yarn lint
grep -rin "sepolia\|alfajores\|testnet" src/ ios/ android/ .github/ docs/ locales/ package.json detox.config.js 2>/dev/null | grep -v "locked decision #11\|locked decision #12\|removal" || echo "VERIFIED: zero references remain"
```

Expected: builds pass, lint passes, the grep returns empty (or only contains references to the rule decisions themselves).

- [ ] **Step 12: Commit, push, PR, auto-merge on green**

```bash
git add -A
git commit -m "chore(networks): remove Celo Sepolia and testnet build flavors"
git push -u origin feature/wri-remove-sepolia
export GH_TOKEN="$(security find-generic-password -a tucop-finance-classic -s GITHUB_TOKEN -w)"
gh pr create --base Development --title "chore(networks): remove Celo Sepolia and testnet build flavors" --body "Per locked decision #12. App now ships mainnet-only. Removes:

- celo-sepolia network from src/web3/networkConfig.ts
- .env.testnet, .env.testnetdev
- testnet/testnetdev iOS schemes and Android flavors
- testnet CI workflow jobs
- testnet Detox configurations
- testnet references in CLAUDE.md, README.md, .claude/rules/

Verified: grep -rin 'sepolia|alfajores|testnet' in src/ ios/ android/ .github/ docs/ locales/ returns zero results outside the locked-decision rule text."
gh pr merge --auto --squash --delete-branch
```

---

## Task 2: ethers v5 removal (per S2 PASS verdict)

**Files:**

- Modify: `e2e/scripts/fund-e2e-accounts.ts` (rewrite from ethers v5 → viem)
- Modify: `package.json` (bump `@mento-protocol/mento-sdk` from `^0.2.3` to `^3.2.8`, remove `ethers` from `devDependencies`)
- Modify: `yarn.lock` (regenerated)

- [ ] **Step 1: Branch and capture baseline**

```bash
git checkout Development && git pull
git checkout -b feature/wri-remove-ethers-v5
yarn why ethers > .wri-scratch/ethers-baseline.txt
```

- [ ] **Step 2: Bump mento-sdk**

Open `package.json`. Locate `"@mento-protocol/mento-sdk"` in dependencies. Change `"^0.2.3"` to `"^3.2.8"`. Save.

Run `yarn install` and capture any peer warnings to `.wri-scratch/mento-bump-output.txt`.

- [ ] **Step 3: Rewrite `e2e/scripts/fund-e2e-accounts.ts` to viem**

Open the file. Identify every `ethers.` usage. Map each to viem equivalents:

| ethers v5                               | viem                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ethers.providers.JsonRpcProvider(url)` | `createPublicClient({ transport: http(url), chain: celo })`                                |
| `new ethers.Wallet(pk, provider)`       | `createWalletClient({ account: privateKeyToAccount(pk), transport: http(), chain: celo })` |
| `wallet.sendTransaction({ to, value })` | `walletClient.sendTransaction({ to, value })`                                              |
| `ethers.utils.parseEther(s)`            | `parseEther(s)`                                                                            |
| `ethers.Contract(addr, abi, signer)`    | use viem `getContract({ address, abi, client: walletClient })`                             |

Save. Run `yarn build:ts` to catch type errors. Iterate until clean.

- [ ] **Step 4: Remove ethers from devDependencies**

Open `package.json`. Remove the `"ethers": "^5.7.2"` line from `devDependencies`. Save.

Run `yarn install` to regenerate `yarn.lock`. Confirm the lockfile no longer pins ethers v5 (`yarn why ethers` should now return "no ethers found").

- [ ] **Step 5: Verify**

```bash
yarn build:ts && yarn lint && yarn test --testPathPattern 'e2e/scripts/fund'
yarn why ethers > .wri-scratch/ethers-after.txt
diff .wri-scratch/ethers-baseline.txt .wri-scratch/ethers-after.txt | head -20
```

Expected: build, lint, e2e helper tests pass. The diff shows ethers gone from the tree.

- [ ] **Step 6: Commit, push, PR, auto-merge**

```bash
git add -A
git commit -m "chore(deps): remove ethers v5, migrate e2e helper to viem"
git push -u origin feature/wri-remove-ethers-v5
gh pr create --base Development --title "chore(deps): remove ethers v5, migrate e2e helper to viem" --body "Per spec section 9.2 and S2 PASS verdict. Removes ethers@5.7.2 from devDependencies. The single direct call site (e2e/scripts/fund-e2e-accounts.ts) is rewritten to viem. Bumps @mento-protocol/mento-sdk 0.2.3 → 3.2.8 (drops ethers internally; uses viem)."
gh pr merge --auto --squash --delete-branch
```

---

## Task 3: husky upgrade

**Files:**

- Modify: `package.json` (bump husky 3.x → 9.x)
- Modify: husky hook files (the husky v9 format differs from v3)
- Modify: `.husky/` directory (created on first install of v9)

- [ ] **Step 1: Branch and audit current hooks**

```bash
git checkout Development && git pull
git checkout -b feature/wri-husky-upgrade
yarn why husky > .wri-scratch/husky-baseline.txt
cat package.json | jq '.husky // .scripts // empty' > .wri-scratch/husky-config-old.json
```

- [ ] **Step 2: Bump husky and install v9 config**

```bash
yarn remove husky
yarn add -D husky@^9.1.7
npx husky init
```

Husky v9 creates `.husky/pre-commit` as a shell script.

- [ ] **Step 3: Port the lint-staged invocation to the new hook format**

Open `.husky/pre-commit`. Replace its content with:

```sh
#!/usr/bin/env sh
yarn lint-staged
```

Confirm `package.json` no longer has the legacy `"husky": { ... }` block (delete it if husky v3 left it behind).

- [ ] **Step 4: Verify**

Make a trivial change to a `.ts` file, attempt a test commit, and verify the pre-commit hook fires lint-staged. Revert the test change.

```bash
echo "// test" >> src/utils/Logger.ts
git add src/utils/Logger.ts
git commit -m "test: trigger husky" --dry-run
git restore --staged src/utils/Logger.ts
git restore src/utils/Logger.ts
```

- [ ] **Step 5: Commit, push, PR, auto-merge**

```bash
git add -A
git commit -m "chore(deps): upgrade husky 3.x to 9.x"
git push -u origin feature/wri-husky-upgrade
gh pr create --base Development --title "chore(deps): upgrade husky 3.x to 9.x" --body "Husky 3 has been unmaintained since 2019. v9 is the current stable. Hook config moved from package.json 'husky' block to .husky/pre-commit shell script. lint-staged invocation preserved."
gh pr merge --auto --squash --delete-branch
```

---

## Task 4: Backend — price-proxy endpoint for CoinMarketCap key (per spec 9.3 and locked decision #8)

This task touches the **api-wallet-tucop** backend repository (separate from TuCopWallet). The pattern: backend exposes a public endpoint that internally uses the secret API key. Client app calls the public endpoint, never sees the key.

> **Repository note:** This task switches workspace to the backend repo at `~/Workspaces/tucop-finance/code/api-wallet-tucop` (clone if missing). If that repo is not present locally, clone it first with `gh repo clone TuCopFinance/api-wallet-tucop ~/Workspaces/tucop-finance/code/api-wallet-tucop`.

**Files (backend repo):**

- Create: `src/routes/prices.ts` (new Express route handler)
- Modify: `src/app.ts` or equivalent (register the new route)
- Create: `src/lib/coinmarketcap.ts` (the client wrapper with key from env)
- Modify: `package.json` (add `ioredis` if not already a dep; the cache layer)
- Modify: `.env.example` (document the new `COINMARKETCAP_API_KEY` var)

- [ ] **Step 1: Switch to backend repo, branch off main**

```bash
cd ~/Workspaces/tucop-finance/code/api-wallet-tucop || gh repo clone TuCopFinance/api-wallet-tucop ~/Workspaces/tucop-finance/code/api-wallet-tucop && cd ~/Workspaces/tucop-finance/code/api-wallet-tucop
git checkout main && git pull
git checkout -b feature/wri-prices-proxy
```

- [ ] **Step 2: Write the test for the route**

Create `src/routes/prices.test.ts`:

```ts
import request from 'supertest'
import { app } from '../app'

describe('GET /api/prices/xaut', () => {
  it('returns USD price with required shape', async () => {
    const res = await request(app).get('/api/prices/xaut?vs=usd')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      symbol: 'XAUT',
      vs: 'usd',
      priceUsd: expect.any(Number),
      asOf: expect.any(String),
    })
  })

  it('rejects non-usd vs param', async () => {
    const res = await request(app).get('/api/prices/xaut?vs=cop')
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Run test, expect FAIL**

```bash
yarn test src/routes/prices.test.ts
```

Expected: route not found, 404.

- [ ] **Step 4: Implement the CoinMarketCap client**

Create `src/lib/coinmarketcap.ts`:

```ts
const CMC_BASE = 'https://pro-api.coinmarketcap.com/v2'

export async function getXautPriceUsd(): Promise<{ priceUsd: number; asOf: string }> {
  const key = process.env.COINMARKETCAP_API_KEY
  if (!key) throw new Error('COINMARKETCAP_API_KEY not set')
  const url = `${CMC_BASE}/cryptocurrency/quotes/latest?symbol=XAUT&convert=USD`
  const res = await fetch(url, { headers: { 'X-CMC_PRO_API_KEY': key } })
  if (!res.ok) throw new Error(`CMC error: ${res.status}`)
  const json = (await res.json()) as any
  const data = json.data?.XAUT?.[0]
  if (!data) throw new Error('CMC: unexpected response shape')
  return {
    priceUsd: data.quote.USD.price,
    asOf: data.quote.USD.last_updated,
  }
}
```

- [ ] **Step 5: Implement the route with Redis cache**

Create `src/routes/prices.ts`:

```ts
import { Router } from 'express'
import { getXautPriceUsd } from '../lib/coinmarketcap'
import { getRedis } from '../lib/redis' // assume an existing helper; if not, inline a memory cache for v1

const router = Router()
const CACHE_KEY = 'price:xaut:usd'
const TTL_SECONDS = 60

router.get('/api/prices/xaut', async (req, res) => {
  const vs = (req.query.vs ?? 'usd').toString().toLowerCase()
  if (vs !== 'usd') return res.status(400).json({ error: 'only vs=usd supported' })
  const cache = getRedis()
  const cached = await cache?.get(CACHE_KEY)
  if (cached) return res.json(JSON.parse(cached))
  try {
    const fresh = await getXautPriceUsd()
    const payload = { symbol: 'XAUT', vs: 'usd', priceUsd: fresh.priceUsd, asOf: fresh.asOf }
    await cache?.set(CACHE_KEY, JSON.stringify(payload), 'EX', TTL_SECONDS)
    res.json(payload)
  } catch (err) {
    res.status(502).json({ error: 'upstream price feed unavailable' })
  }
})

export default router
```

If `getRedis` doesn't exist yet in the backend, add a thin wrapper at `src/lib/redis.ts` using `ioredis` with `process.env.REDIS_URL`.

- [ ] **Step 6: Register the route**

Open `src/app.ts`. Add:

```ts
import pricesRouter from './routes/prices'
app.use(pricesRouter)
```

- [ ] **Step 7: Run test, expect PASS**

```bash
yarn test src/routes/prices.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 8: Update `.env.example`**

Add the new env vars:

```
COINMARKETCAP_API_KEY=
REDIS_URL=
```

- [ ] **Step 9: Commit, push, PR (backend repo)**

```bash
git add -A
git commit -m "feat(prices): add /api/prices/xaut proxy endpoint"
git push -u origin feature/wri-prices-proxy
gh pr create --base main --title "feat(prices): add /api/prices/xaut proxy endpoint" --body "Backend proxy that hides the CoinMarketCap API key from the client bundle. Used by TuCopWallet's gold module per WRI Plan 04 Task 4."
gh pr merge --auto --squash --delete-branch
```

- [ ] **Step 10: Set production env var on Railway**

REPORT TO USER: confirm `COINMARKETCAP_API_KEY` is set on Railway for the `api-wallet-tucop` service. The user can verify in the Railway dashboard or via `railway variables --service api-wallet-tucop`.

---

## Task 5: Switch the app to consume the price-proxy endpoint

**Files (TuCopWallet repo):**

- Modify: `src/gold/api.ts` (replace direct CoinMarketCap call with proxy call)
- Modify: `src/web3/networkConfig.ts` (add the new endpoint URL constant if not already)
- Delete: any remnant CoinMarketCap API key strings in source

- [ ] **Step 1: Switch back to TuCopWallet repo, branch**

```bash
cd /Users/0xj4an/Workspaces/tucop-finance/code/TuCopWallet
git checkout Development && git pull
git checkout -b feature/wri-app-consume-price-proxy
```

- [ ] **Step 2: Add the proxy URL to networkConfig**

Open `src/web3/networkConfig.ts`. Find the section that defines `api-wallet-tucop` URLs. Add:

```ts
const GET_XAUT_PRICE_URL = `${API_WALLET_TUCOP_URL}/api/prices/xaut?vs=usd`
```

Export it via the `networkConfig` object.

- [ ] **Step 3: Refactor `src/gold/api.ts`**

Open the file. Replace the direct CoinMarketCap call with:

```ts
import networkConfig from 'src/web3/networkConfig'

export async function getXautUsdPrice(): Promise<number> {
  const res = await fetchWithTimeout(networkConfig.getXautPriceUrl)
  if (!res.ok) throw new Error(`Price endpoint failed: ${res.status}`)
  const json = (await res.json()) as { priceUsd: number }
  return json.priceUsd
}
```

Delete the lines that hold the CoinMarketCap API key constant.

- [ ] **Step 4: Verify zero hardcoded CMC key remains**

```bash
grep -rin "coinmarketcap\|cmc_pro_api_key\|CMC_PRO\|x-cmc" src/ | head -5
```

Expected: empty.

- [ ] **Step 5: Run tests**

```bash
yarn build:ts && yarn lint
yarn test --testPathPattern 'src/gold'
```

- [ ] **Step 6: Commit, push, PR, auto-merge**

```bash
git add -A
git commit -m "feat(gold): consume backend price-proxy, remove hardcoded CMC key"
git push -u origin feature/wri-app-consume-price-proxy
gh pr create --base Development --title "feat(gold): consume backend price-proxy, remove hardcoded CMC key" --body "Switches src/gold/api.ts to call api-wallet-tucop /api/prices/xaut. Removes the hardcoded CoinMarketCap API key from the bundle. Depends on backend PR (Task 4) being deployed."
gh pr merge --auto --squash --delete-branch
```

---

## Task 6: Blockscout API key proxy (same pattern as Task 4 + 5)

The Blockscout API key at `src/web3/networkConfig.ts:367-368` is the second hardcoded key. Move it to backend.

- [ ] **Step 1: Backend repo — add proxy endpoint**

Switch to api-wallet-tucop, branch `feature/wri-blockscout-proxy`. Mirror Task 4's pattern with a new file `src/routes/blockscout.ts` that exposes the specific Blockscout calls the app uses (transaction history, address details). Set `BLOCKSCOUT_API_KEY` on Railway.

- [ ] **Step 2: App repo — consume the proxy**

Switch to TuCopWallet, branch `feature/wri-app-consume-blockscout-proxy`. Replace direct Blockscout calls in `src/web3/networkConfig.ts` and any consumer in `src/transactions/` with calls to the new backend proxy.

- [ ] **Step 3: Verify and PR per the Task 4-5 pattern**

Same verification + PR flow.

---

## Task 7: Retry + circuit breaker on critical endpoints (per spec 9.4)

**Files:**

- Modify: `src/config.ts` (extend `fetchWithTimeout` with backoff)
- Create: `src/lib/circuitBreaker.ts` (per-host circuit breaker)
- Modify: callers of `fetchWithTimeout` for critical endpoints (getSwapQuote, getTokensInfoWithPrices, OTP services, BucksPay)

- [ ] **Step 1: Branch**

```bash
git checkout Development && git pull
git checkout -b feature/wri-retry-circuit-breaker
```

- [ ] **Step 2: Write test for retry behavior**

Create `src/config.test.ts` (or extend existing):

```ts
import { fetchWithTimeout } from 'src/config'

describe('fetchWithTimeout with retry', () => {
  let mockFetch: jest.Mock

  beforeEach(() => {
    mockFetch = jest.fn()
    global.fetch = mockFetch as any
  })

  it('retries up to 3 times on 5xx', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    const res = await fetchWithTimeout('https://example.test/x')
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(res.status).toBe(200)
  })

  it('does not retry on 4xx', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 400 }))
    const res = await fetchWithTimeout('https://example.test/x')
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Run, expect FAIL**

```bash
yarn test src/config.test.ts
```

- [ ] **Step 4: Implement retry in `fetchWithTimeout`**

Open `src/config.ts`. Locate the existing `fetchWithTimeout`. Wrap the inner fetch in a retry loop:

```ts
const MAX_RETRIES = 3
const BASE_DELAY_MS = 250

export async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await Promise.race([
        fetch(url, init),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ])
      if (res.status >= 500 && attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt))
        continue
      }
      return res
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt))
    }
  }
  throw lastErr ?? new Error('fetchWithTimeout: exhausted retries')
}
```

- [ ] **Step 5: Run test, expect PASS**

```bash
yarn test src/config.test.ts
```

- [ ] **Step 6: Implement circuit breaker for critical endpoints**

Create `src/lib/circuitBreaker.ts`:

```ts
const STATE = new Map<string, { failures: number; openedAt: number | null }>()
const FAILURE_THRESHOLD = 5
const FAILURE_WINDOW_MS = 60_000
const OPEN_DURATION_MS = 30_000

export function shouldShortCircuit(host: string): boolean {
  const s = STATE.get(host)
  if (!s) return false
  if (s.openedAt && Date.now() - s.openedAt < OPEN_DURATION_MS) return true
  return false
}

export function recordFailure(host: string): void {
  const s = STATE.get(host) ?? { failures: 0, openedAt: null }
  s.failures++
  if (s.failures >= FAILURE_THRESHOLD) {
    s.openedAt = Date.now()
    s.failures = 0
  }
  STATE.set(host, s)
}

export function recordSuccess(host: string): void {
  STATE.delete(host)
}
```

Wire it into `fetchWithTimeout` after the retry loop: parse the URL host, check `shouldShortCircuit`, return synthetic 503 if open. Add `recordFailure` on 5xx / network error, `recordSuccess` on 2xx.

- [ ] **Step 7: Verify and PR**

```bash
yarn build:ts && yarn lint && yarn test src/config.test.ts
git add -A
git commit -m "feat(config): add retry and circuit breaker to fetchWithTimeout"
git push -u origin feature/wri-retry-circuit-breaker
gh pr create --base Development --title "feat(config): add retry and circuit breaker to fetchWithTimeout" --body "Per spec section 9.4. 3-attempt exponential backoff on 5xx and network errors. Per-host circuit breaker opens for 30s after 5 consecutive failures within 60s. Sentry breadcrumbs recorded on every failed attempt (in follow-up)."
gh pr merge --auto --squash --delete-branch
```

---

## Task 8: Knip dead code sweep (per spec 9.6)

- [ ] **Step 1: Branch**

```bash
git checkout Development && git pull
git checkout -b feature/wri-knip-cleanup
```

- [ ] **Step 2: Run knip**

```bash
yarn knip --no-gitignore --include dependencies > .wri-scratch/knip-report.txt 2>&1
cat .wri-scratch/knip-report.txt | head -50
```

- [ ] **Step 3: Triage the report**

For each "Unused files", "Unused dependencies", "Unused exports" entry: verify the entry is truly unused (`grep -rn <name> src/`). If genuinely unused, delete. If false positive (e.g., file referenced via dynamic require), add a knip ignore entry in `knip.json`.

- [ ] **Step 4: Re-run knip to confirm clean**

```bash
yarn knip --no-gitignore --include dependencies
```

Expected: zero or only known-false-positive findings.

- [ ] **Step 5: Verify build**

```bash
yarn build:ts && yarn lint && yarn test
```

- [ ] **Step 6: Commit, push, PR**

```bash
git add -A
git commit -m "chore: knip dead code sweep"
git push -u origin feature/wri-knip-cleanup
gh pr create --base Development --title "chore: knip dead code sweep" --body "Per spec section 9.6 closing task of Track D. Removes dead exports, files, and dependencies identified by knip."
gh pr merge --auto --squash --delete-branch
```

---

## Self-Review

### Spec coverage check

| Spec section                           | Plan task                                                 | Notes                                                                           |
| -------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 9.1 (Valora migration acceleration)    | (Linked to existing roadmap; not a new task in this plan) | Per locked decision #3, this initiative does not redesign the existing roadmap. |
| 9.2 (ethers v5 removal)                | Task 2                                                    | One file rewrite + one dep bump per S2 PASS.                                    |
| 9.3 (API key relocation)               | Task 4, 5, 6                                              | CoinMarketCap + Blockscout proxied via backend.                                 |
| 9.4 (retry / circuit breaker)          | Task 7                                                    | Implemented in `fetchWithTimeout`.                                              |
| 9.5 (Sentry breadcrumbs on failures)   | Task 7 follow-up bullet                                   | Documented as Sentry follow-up.                                                 |
| 9.6 (knip sweep)                       | Task 8                                                    | Closing task.                                                                   |
| 9.7 (Sepolia removal)                  | Task 1                                                    | Largest single PR of Track D.                                                   |
| Locked #3 (Valora roadmap integration) | All tasks reference the existing plan                     | Not duplicated here.                                                            |
| Locked #8 (backend in scope)           | Tasks 4 + 5 + 6 do backend work                           | Two backend PRs land.                                                           |
| Locked #11 (no testnet)                | Task 1 enforces removal; all tasks follow the rule        | Verification grep in Task 1 Step 11.                                            |
| Locked #12 (Sepolia codebase removal)  | Task 1                                                    | Explicit.                                                                       |

### Placeholder scan

No TBD / TODO / FIXME in steps. Bracketed strings like `[FULL_HASH]` etc. are intentional template placeholders for the implementing agent to fill from actual runs.

### Type / API consistency

`fetchWithTimeout` signature unchanged externally (still returns `Promise<Response>`). Circuit breaker is internal. `getXautUsdPrice` exported from `src/gold/api.ts` keeps the existing call-site contract (returns `Promise<number>`).

### Open concerns

- Task 4 assumes the api-wallet-tucop backend has Redis available (`getRedis()` helper). If not, the cache step degrades to no-cache; functional but more upstream cost. Worth confirming before Task 4 execution.
- Husky v3 → v9 may surface scripts in package.json that referenced the old `husky` block; verify they all moved cleanly.
- Sepolia removal interacts with the testnet Statsig dynamic configs (some may have testnet-specific keys). Step 2 catches those via grep; if any Statsig key is testnet-scoped, remove it from the dynamic config definitions in `src/statsig/constants.ts` too.
