# Task: Rename Alfajores Schemes to Testnet

**Branch**: `refactor/rename-schemes-testnet`
**Priority**: Medium
**Depends on**: Nothing (can be done independently)

## Goal

Rename all build scheme files, env files, and build config references from "alfajores" to "testnet" across iOS, Android, CI, and scripts.

## Reference

- Celo Sepolia docs: https://docs.celo.org/tooling/testnets/celo-sepolia
- Explorer: https://sepolia.celoscan.io/

## Tasks

### iOS Schemes

- [ ] Rename `MobileStack-alfajores.xcscheme` to `MobileStack-testnet.xcscheme`
- [ ] Rename `MobileStack-alfajoresdev.xcscheme` to `MobileStack-testnetdev.xcscheme`
- [ ] Update env file reference inside each scheme XML (`.env.alfajores` -> `.env.testnet`, `.env.alfajoresdev` -> `.env.testnetdev`)

### Env Files

- [ ] Rename `.env.alfajores` -> `.env.testnet`
- [ ] Rename `.env.alfajoresdev` -> `.env.testnetdev`
- [ ] Update `DEFAULT_TESTNET=alfajores` -> `DEFAULT_TESTNET=testnet` inside each file
- [ ] Update `IOS_GOOGLE_SERVICE_PLIST` references (may need to rename plist files too)

### Android (build.gradle)

- [ ] Rename product flavor `alfajores` -> `testnet` (line 237)
- [ ] Rename product flavor `alfajoresdev` -> `testnetdev` (line 240)
- [ ] Update env file mapping: `alfajores: ".env.alfajores"` -> `testnet: ".env.testnet"` (line 60)
- [ ] Update env file mapping: `alfajoresdev: ".env.alfajoresdev"` -> `testnetdev: ".env.testnetdev"` (line 59)
- [ ] Remove or update `alfajoresnightly` flavor (line 243, 58) — already unused

### Fastlane

- [ ] Rename lane `alfajores` -> `testnet` in `fastlane/Fastfile` (lines 76-77, 162-163)
- [ ] Remove or rename lane `alfajoresnightly` (lines 83-84, 169-170) — already unused

### CI Workflows (.github/workflows/)

- [ ] `android-build.yml`: Update `alfajores` references (lines 25, 43, 97, 205)
- [ ] `build-and-deploy.yml`: Update `alfajores` reference (line 20)
- [ ] `auto-build.yml`: Update `alfajores` in environment matrix (lines 108, 189)
- [ ] `release-nightly.yml`: Update `alfajoresnightly` lane references (lines 38, 48) — already disabled

### Scripts

- [ ] `scripts/key_placer.sh`: Update `celo-mobile-alfajores` references (lines 7-10)
- [ ] `scripts/push.sh`: Update comments referencing `celo-mobile-alfajores` (lines 9-10)
- [ ] `scripts/setup-ci-cd.sh`: Update `alfajores` reference (line 240)
- [ ] `.github/scripts/setAppEnv.ts`: Update comment (line 2)
- [ ] `.github/SETUP_CHECKLIST.md`: Update `.env.alfajores` reference (line 31)

### Mocks & Test Config

- [ ] `__mocks__/react-native-config.ts`: Update `DEFAULT_TESTNET: 'alfajores'` -> `'testnet'` (line 5)
- [ ] `__mocks__/secrets.json`: Update `"alfajores"` key (line 2)
- [ ] `secrets.json`: Update `"alfajores"` key (line 2) — gitignored, update locally

### Config Code

- [ ] `src/config.ts`: Update the ternary check `DEFAULT_TESTNET === 'mainnet'` — verify it still works with `'testnet'` value
- [ ] `src/web3/networkConfig.ts`: Update `Testnets.alfajores` references (line 340+ config object key)

### Documentation

- [ ] Update `README.md` scheme references
- [ ] Update `CLAUDE.md` scheme references
- [ ] Update `docs/wallet-setup.md` scheme table
- [ ] Update `fastlane/README.md` lane references

## Verification

- [ ] `npx tsc --noEmit` passes
- [ ] `yarn test` passes (or only pre-existing failures)
- [ ] iOS build with `MobileStack-testnetdev` scheme succeeds
- [ ] Android build with `testnetdev` flavor succeeds
- [ ] App launches and shows correct display name

## Notes

- This task is ONLY about renaming files/references. It does NOT change chain IDs, RPC URLs, or explorer URLs — that's the separate "testnet migration" task.
- The `DEFAULT_TESTNET` env var value changes from `'alfajores'` to `'testnet'`, which means all code checking this value must be audited.
- GoogleService plist files may need renaming too (`GoogleService-Info.alfajores.plist` etc.)
