# ADR-0006: Migración de Branding cXXX → XXXm (Mento Stablecoins)

## Estado

Propuesto

## Fecha

2025-03-27

## Contexto

Mento Protocol anunció el rebranding de todas sus stablecoins de `cXXX` a
`XXXm` para reflejar su estrategia multichain. Por ejemplo:

- cCOP → COPm
- cUSD → USDm
- cEUR → EURm

Este cambio es solo de branding (los contratos y direcciones no cambian),
pero afecta cómo mostramos los tokens a los usuarios.

## Opciones Consideradas

1. **Mantener cXXX**: Ignorar el rebranding.
   Problema: Inconsistente con resto del ecosistema Celo.

2. **Migración gradual**: Mostrar ambos nombres durante transición.
   Problema: Confusión para usuarios.

3. **Migración inmediata**: Cambiar todo de una vez.
   Requiere: Actualizar UI, analytics, traducciones.

4. **Nombres amigables**: Mostrar "Pesos" y "Dólares" al usuario.
   Ya implementado parcialmente, pero necesita completar.

## Decisión

**Migración completa** a nombres `XXXm` internamente, pero mantener
**nombres amigables** en la UI:

| Token | Código interno | UI (español) | UI (inglés)     |
| ----- | -------------- | ------------ | --------------- |
| COPm  | COPm           | Pesos        | Colombian Pesos |
| USDm  | USDm           | Dólares      | Dollars         |
| USDT  | USDT           | Dólares      | Dollars         |

Regla: El usuario nunca ve "COPm" o "cCOP", solo ve "Pesos".

## Consecuencias

### Positivas

- Alineados con branding oficial de Mento
- UI más amigable para usuarios no-crypto
- Consistencia en todo el ecosistema

### Negativas

- Cambios en analytics (eventos con nombres viejos)
- Actualizar documentación y tests
- Posible confusión temporal para usuarios existentes

## Referencias

- [Mento Rebranding Proposal](https://forum.celo.org/t/mento-stablecoin-rebranding-and-strategic-evolution/12639)
- [Mento Stablecoins](https://www.mento.org/stablecoins)
- `tasks/plans/mento-rebranding-migration.md` - Plan de implementación
