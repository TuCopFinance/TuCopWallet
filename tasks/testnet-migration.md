# Task: Migrate Testnet from Alfajores to Celo Sepolia

**Branch**: `refactor/celo-sepolia-migration`
**Priority**: High
**Depends on**: Ideally done after or together with `schemas-rename`

## Goal

Migrate the testnet configuration from Alfajores (chain ID 44787, deprecated) to Celo Sepolia (chain ID 11142220).

## Reference

- Celo Sepolia docs: https://docs.celo.org/tooling/testnets/celo-sepolia
- Chain ID: 11142220
- Explorer: https://sepolia.celoscan.io/
- Faucet: https://faucet.celo.org/celo-sepolia
- Faucet (Google Cloud): https://cloud.google.com/application/web3/faucet/celo/sepolia
- Mainnet (no changes): Chain ID 42220, RPC `https://forno.celo.org/`, Explorer `https://celoscan.io`

## Tasks

### Core Network Config

- [ ] `src/viem/celoGasConfig.ts` (line 5): Rename `CELO_ALFAJORES_ID = 44787` -> `CELO_SEPOLIA_ID = 11142220`
- [ ] `src/viem/celoGasConfig.ts` (lines 58, 69): Update all references to `CELO_ALFAJORES_ID`
- [ ] `src/config.ts` (line 70): Update RPC URL `'https://alfajores-forno.celo-testnet.org/'` -> Celo Sepolia RPC URL (TBD — check docs)
- [ ] `src/web3/networkConfig.ts` (line 333): Update `chainId: 44787` -> `chainId: 11142220`
- [ ] `src/web3/networkConfig.ts` (line 341): Update `networkId: '44787'` -> `networkId: '11142220'`
- [ ] `src/web3/networkConfig.ts` (line 664): Update `'eip155:44787'` -> `'eip155:11142220'`

### NetworkId Enum

- [ ] `src/transactions/types.ts` (line 18): Rename `'celo-alfajores' = 'celo-alfajores'` -> `'celo-sepolia' = 'celo-sepolia'`
- [ ] Search and replace ALL references to `NetworkId['celo-alfajores']` -> `NetworkId['celo-sepolia']` across src/
- [ ] `src/shared/conts.ts` (line 4): Update `'Celo Alfajores'` -> `'Celo Sepolia'`

### Explorer URLs

- [ ] `src/web3/networkConfig.ts` (line 555): Update `CELOSCAN_BASE_URL_ALFAJORES = 'https://alfajores.celoscan.io'` -> `CELOSCAN_BASE_URL_SEPOLIA = 'https://sepolia.celoscan.io'`
- [ ] `src/web3/networkConfig.ts` (line 584): Update NFT explorer URL `'https://explorer.celo.org/alfajores/token/'` -> Celo Sepolia NFT explorer (TBD)
- [ ] `src/nfts/NftsInfoCarousel.tsx` (lines 126, 153): Update `NetworkId['celo-alfajores']` references
- [ ] `src/transactions/feed/TransactionDetails.tsx` (line 68): Update `NetworkId['celo-alfajores']` reference

### Viem Chain Import

- [ ] `src/web3/networkConfig.ts` (line 20): Update `import { celoAlfajores }` -> `import { celoSepolia }` from viem/chains
- [ ] `src/web3/networkConfig.ts` (line 403): Update `[Network.Celo]: celoAlfajores` -> `[Network.Celo]: celoSepolia`
- [ ] Verify `celoSepolia` exists in viem/chains — if not, define custom chain

### Staging API URLs

- [ ] `src/web3/networkConfig.ts` (line 166): Update `'https://api.alfajores.valora.xyz'` — determine new staging URL or keep as-is if still valid
- [ ] `src/web3/networkConfig.ts` (line 169): Update `'https://blockchain-api-dot-celo-mobile-alfajores.appspot.com'` — determine new URL
- [ ] `src/web3/networkConfig.ts` (lines 359, 372): Update other `celo-mobile-alfajores` URLs in sentryTracingUrls
- [ ] `src/firebase/remoteConfigValuesDefaults.e2e.ts` (line 17): Update `'https://us-central1-celo-mobile-alfajores.cloudfunctions.net/dappList'`

### Token Contract Addresses

- [ ] Verify COPm token exists on Celo Sepolia — if not, deploy or remove testnet token config
- [ ] Verify cUSD, cEUR, cREAL token addresses on Celo Sepolia
- [ ] Update `COPM_TOKEN_ID_STAGING` and other `*_TOKEN_ID_STAGING` constants in `src/web3/networkConfig.ts` (lines 145-163)

### Redux Migrations

- [ ] `src/redux/migrations.ts` (lines 1676, 1694): Update `NetworkId['celo-alfajores']` fallbacks
- [ ] Add new migration to handle existing persisted state with old `celo-alfajores` NetworkId -> `celo-sepolia`
- [ ] Increment migration version

### Feature Code

- [ ] `src/fiatExchanges/SelectProvider.tsx` (line 404): Update `NetworkId['celo-alfajores']` check

### Test Files (~30+ files)

- [ ] Update all `44787` chain ID references in test files
- [ ] Update all `'eip155:44787'` references in test files
- [ ] Update all `celoAlfajores` viem chain imports in test files
- [ ] Update `NetworkId['celo-alfajores']` references in test files
- [ ] Key test files:
  - `src/walletConnect/saga.test.ts` (~25 references)
  - `src/walletConnect/request.test.ts` (~8 references)
  - `src/walletConnect/screens/SessionRequest.test.tsx` (~5 references)
  - `src/walletConnect/screens/ActionRequest.test.tsx` (~4 references)
  - `src/keylessBackup/index.test.ts` (~5 references)
  - `src/viem/getLockableWallet.test.ts` (1 reference)
  - `src/swap/SwapScreen.test.tsx` (1 reference)
  - `src/earn/hooks.test.tsx` (2 references)
  - `src/web3/networkConfig.test.ts` (verify mappings)
  - `test/schemas.ts`, `test/values.ts` (mock data)
  - `test/RootStateSchema.json` (state schema)

### E2E Tests

- [ ] `e2e/src/usecases/WalletConnectV2.js`: Update `'eip155:42220'` references if testing on testnet
- [ ] `e2e/scripts/fund-e2e-accounts.ts`: Update RPC if needed for testnet funding

## Verification

- [ ] `npx tsc --noEmit` passes
- [ ] `yarn test` passes (or only pre-existing failures)
- [ ] App connects to Celo Sepolia testnet successfully
- [ ] Transactions can be sent on Celo Sepolia
- [ ] Block explorer links open correct sepolia.celoscan.io URLs
- [ ] WalletConnect sessions use correct chain ID
- [ ] Mainnet still works correctly (no regressions)

## Open Questions

1. **Celo Sepolia RPC URL**: What is the official Forno-equivalent RPC for Celo Sepolia? Check https://docs.celo.org/tooling/testnets/celo-sepolia
2. **Token contracts**: Are COPm, cUSD, cEUR, cREAL deployed on Celo Sepolia? If not, who deploys them?
3. **Staging APIs**: Are `api.alfajores.valora.xyz` and `celo-mobile-alfajores.appspot.com` still running? Do they have Celo Sepolia equivalents?
4. **viem/chains**: Does the `viem` package include `celoSepolia` chain config? If not, we need a custom chain definition.
5. **NFT Explorer**: What's the Celo Sepolia equivalent of `explorer.celo.org/alfajores/token/`?

## Notes

- Alfajores deprecation was planned for September 2025 — the testnet may already be offline
- All contracts need fresh deployment on Celo Sepolia (no state inheritance)
- This is a breaking change for anyone using testnet builds — coordinate with team
- Redux migration is needed to handle persisted state with old `celo-alfajores` NetworkId
