# ADR-0005: BucksPay como Offramp Nativo para Colombia

## Estado

Aceptado

## Fecha

2025-02-01

## Contexto

Los usuarios colombianos necesitan convertir COPm (Mento stablecoin) a COP
en cuentas bancarias colombianas. Las opciones existentes (Ramp, Simplex)
no soportan Colombia o tienen fees muy altos.

BucksPay es un servicio colombiano que ofrece conversión COPm → COP con
transferencia bancaria directa.

## Opciones Consideradas

1. **Solo exchanges externos**: Dirigir usuarios a Binance P2P, etc.
   Problema: UX fragmentada, muchos pasos, usuarios se pierden.

2. **FiatConnect genérico**: Usar protocolo estándar.
   Problema: Ningún proveedor FiatConnect soporta Colombia.

3. **BucksPay integración nativa**: API directa en la app.
   Requiere: Pantallas custom, manejo de estado, webhooks.

4. **WebView a BucksPay**: Cargar su web en la app.
   Problema: UX pobre, no podemos trackear estado.

## Decisión

Implementar **integración nativa con BucksPay API** como offramp principal
para usuarios colombianos.

Flujo:

1. Usuario ingresa monto en COPm
2. Selecciona banco y cuenta destino
3. Confirma transacción (firma con wallet)
4. App envía COPm a BucksPay hot wallet
5. BucksPay procesa y envía COP al banco
6. Webhooks actualizan estado en tiempo real

## Consecuencias

### Positivas

- UX nativa y fluida para usuarios colombianos
- Fees competitivos (~1.5%)
- Transferencia misma día (ACH Colombia)
- Control total sobre el flujo y UX

### Negativas

- Dependencia de un solo proveedor
- Requiere mantener integración custom
- Backend proxy necesario para webhooks

## Referencias

- [BucksPay API Docs](docs/buckspay-api.md)
- `src/buckspay/` - Implementación
- `docs/buckspay-implementation.md` - Arquitectura detallada
