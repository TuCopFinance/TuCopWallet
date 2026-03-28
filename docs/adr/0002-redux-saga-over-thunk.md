# ADR-0002: Redux Saga sobre Redux Thunk

## Estado

Aceptado (Heredado)

## Fecha

2023-01-01 (decisión original de Valora/MobileStack)

## Contexto

La aplicación requiere manejo complejo de efectos secundarios: llamadas API,
transacciones blockchain, sincronización de estado, retry logic, y flujos
de usuario multi-paso.

Esta decisión fue heredada del proyecto base (Valora → MobileStack → TuCOP)
pero se mantiene por sus beneficios.

## Opciones Consideradas

1. **Redux Thunk**: Simple, menos boilerplate, pero difícil de testear y
   manejar flujos complejos.

2. **Redux Saga**: Generadores, efectos declarativos, fácil testing,
   manejo de concurrencia, pero curva de aprendizaje.

3. **Redux Toolkit Query (RTK Query)**: Para data fetching, pero no cubre
   todos los casos de uso (transacciones, flows complejos).

## Decisión

Mantener **Redux Saga** para manejo de side effects.

Justificación:

- Flujos de transacciones blockchain requieren retry, timeout, rollback
- Testing de sagas es predecible con `redux-saga-test-plan`
- Efectos como `takeLatest`, `race`, `fork` son esenciales para UX
- Base de código existente ya usa sagas extensivamente

## Consecuencias

### Positivas

- Control granular sobre flujos async complejos
- Testing determinístico de side effects
- Cancelación y race conditions bien manejados
- Patrones establecidos en el codebase (fácil onboarding)

### Negativas

- Más boilerplate que thunks simples
- Curva de aprendizaje para generadores
- Debugging puede ser complejo

## Referencias

- [Redux Saga Documentation](https://redux-saga.js.org/)
- `src/redux/sagas.ts` - Root saga
- `src/send/saga.ts` - Ejemplo de saga compleja
- `src/tokens/saga.ts` - Ejemplo de data fetching
