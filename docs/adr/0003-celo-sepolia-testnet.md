# ADR-0003: Celo Sepolia as the testnet (deprecate Alfajores)

## Status

Accepted

## Date

2025-03-15

## Context

Celo migrated to L2 (March 2025) and the official testnet changed from Alfajores (chain ID 44787) to Celo Sepolia (chain ID 44220). Alfajores was officially deprecated by the Celo Foundation.

TuCOP used Alfajores for development and testing. We needed to migrate the entire testnet infrastructure.

## Options considered

1. **Keep Alfajores**: Continue using the legacy testnet while it works.
   Risk: it could stop working without notice.

2. **Migrate to Celo Sepolia**: Adopt the new official testnet.
   Requires: updating configs, RPC endpoints, faucets, tests.

3. **Mainnet only**: Drop the testnet from the workflow.
   Problem: impossible to test without real tokens.

## Decision

Fully migrate to **Celo Sepolia** and remove all Alfajores references.

Changes made:

- Chain ID: 44787 -> 44220
- RPC: `alfajores-forno.celo-testnet.org` -> `celo-sepolia.infura.io`
- Explorer: `alfajores.celoscan.io` -> `celo-sepolia.blockscout.com`
- iOS schemes: `alfajores` -> `testnet`
- Android flavors: `alfajores` -> `sepoliaTestnet`
- .env files: `.env.alfajores` -> `.env.testnet`

## Consequences

### Positive

- Aligned with official Celo infrastructure
- More stable and maintained testnet
- Better tooling support (explorers, faucets)
- Ready for future Celo L2 updates

### Negative

- Migration effort (configs, tests, docs)
- Lost test tokens on Alfajores
- Some third-party services still do not support Sepolia

## References

- [Celo Sepolia Docs](https://docs.celo.org/tooling/testnets/celo-sepolia)
- [Celo L2 Migration](https://docs.celo.org/cel2)
- `src/web3/networkConfig.ts` - Network configuration
