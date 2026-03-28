# ADR-0007: XAUt0 (Tether Gold) como Feature de Oro Digital

## Estado

Aceptado

## Fecha

2025-03-25

## Contexto

Los usuarios colombianos tienen alta demanda de oro como reserva de valor,
especialmente en contextos de inflación. XAUt0 es Tether Gold bridgeado a
Celo, respaldado 1:1 por oro físico en bóvedas suizas.

TuCOP quiere ofrecer compra/venta de oro digital directamente en la app.

## Opciones Consideradas

1. **Solo información**: Mostrar precio del oro sin trading.
   Problema: No agrega valor real.

2. **DEX externo**: Enviar usuarios a Uniswap/etc para swap.
   Problema: UX fragmentada, usuarios se pierden.

3. **Integración nativa**: Swap USDT ↔ XAUt0 en la app.
   Requiere: Quote provider, UI custom, price alerts.

4. **Staking de oro**: Yield farming con XAUt0.
   Problema: No hay pools de liquidez suficientes.

## Decisión

Implementar **compra/venta nativa de XAUt0** usando USDT como par principal.

Arquitectura:

- Quote provider: Squid Router (cross-chain aggregator)
- Precio: CoinGecko API para display
- Alertas: Sistema local de price alerts
- Redux slice: `gold` para estado

## Consecuencias

### Positivas

- Nuevo producto diferenciador para TuCOP
- UX nativa sin salir de la app
- Atractivo para usuarios que buscan reserva de valor
- Preparación para futuros productos DeFi con oro

### Negativas

- Liquidez de XAUt0 en Celo es limitada
- Spreads pueden ser altos en volúmenes grandes
- Requiere educación al usuario sobre oro tokenizado

## Referencias

- [Tether Gold](https://gold.tether.to/)
- [XAUt0 on Celo](https://celoscan.io/token/0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff)
- `tasks/plans/xaut0-digital-gold.md` - Plan completo
- `src/gold/` - Implementación
