# ADR-0001: Usar Viem en lugar de Ethers.js

## Estado

Aceptado

## Fecha

2024-01-15

## Contexto

TuCOP Wallet necesita interactuar con la blockchain Celo para transacciones,
consultas de balance, y firma de mensajes. Las dos opciones principales en el
ecosistema son Ethers.js (v5/v6) y Viem.

La wallet fue heredada de Valora/MobileStack que usaba una mezcla de
contractkit (deprecated) y ethers. Necesitábamos modernizar y unificar.

## Opciones Consideradas

1. **Ethers.js v6**: Biblioteca establecida, amplia documentación, pero bundle
   size grande y cambios breaking de v5 a v6.

2. **Viem**: Biblioteca moderna, tree-shakeable, TypeScript-first, mejor
   performance, soporte nativo para Celo.

3. **Wagmi + Viem**: Stack completo para React, pero orientado a web apps,
   overhead para mobile.

## Decisión

Usar **Viem** como biblioteca principal para interacciones blockchain.

Justificación:

- 35% menos bundle size que ethers.js
- TypeScript nativo con inferencia completa
- Soporte específico para Celo L2 (fee currency, gas estimation)
- Tree-shaking efectivo (solo importamos lo que usamos)
- Mantenimiento activo por el equipo de Wagmi/Paradigm

## Consecuencias

### Positivas

- Mejor performance en dispositivos móviles
- Tipos más estrictos reducen bugs en runtime
- Código más limpio y modular
- Mejor soporte para Celo-specific features (fee currencies)

### Negativas

- Curva de aprendizaje para devs familiarizados con ethers
- Menos ejemplos/tutoriales disponibles (comunidad más pequeña)
- Algunos patrones de ethers no tienen equivalente directo

## Referencias

- [Viem Documentation](https://viem.sh/)
- [Viem vs Ethers comparison](https://viem.sh/docs/introduction.html#comparison-to-ethers)
- `src/viem/` - Implementación actual
