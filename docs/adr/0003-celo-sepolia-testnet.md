# ADR-0003: Celo Sepolia como Testnet (Deprecar Alfajores)

## Estado

Aceptado

## Fecha

2025-03-15

## Contexto

Celo migró a L2 (marzo 2025) y la testnet oficial cambió de Alfajores
(chain ID 44787) a Celo Sepolia (chain ID 44220). Alfajores fue deprecada
oficialmente por la Celo Foundation.

TuCOP usaba Alfajores para desarrollo y testing. Necesitábamos migrar
toda la infraestructura de testnet.

## Opciones Consideradas

1. **Mantener Alfajores**: Seguir usando la testnet legacy mientras funcione.
   Riesgo: podría dejar de funcionar sin aviso.

2. **Migrar a Celo Sepolia**: Adoptar la nueva testnet oficial.
   Requiere: actualizar configs, RPC endpoints, faucets, tests.

3. **Solo mainnet**: Eliminar testnet del workflow.
   Problema: imposible testear sin tokens reales.

## Decisión

Migrar completamente a **Celo Sepolia** y eliminar todas las referencias
a Alfajores.

Cambios realizados:

- Chain ID: 44787 → 44220
- RPC: alfajores-forno.celo-testnet.org → celo-sepolia.infura.io
- Explorer: alfajores.celoscan.io → celo-sepolia.blockscout.com
- iOS Schemes: alfajores → testnet
- Android Flavors: alfajores → sepoliaTestnet
- .env files: .env.alfajores → .env.testnet

## Consecuencias

### Positivas

- Alineados con infraestructura oficial de Celo
- Testnet más estable y mantenida
- Mejor soporte de tooling (explorers, faucets)
- Preparados para futuras actualizaciones de Celo L2

### Negativas

- Esfuerzo de migración (configs, tests, docs)
- Tokens de test en Alfajores perdidos
- Algunos servicios third-party aún no soportan Sepolia

## Referencias

- [Celo Sepolia Docs](https://docs.celo.org/tooling/testnets/celo-sepolia)
- [Celo L2 Migration](https://docs.celo.org/cel2)
- PR #XX - Migración completa
- `src/web3/networkConfig.ts` - Configuración de redes
