# ADR-0002: Redux Saga over Redux Thunk

## Status

Accepted (Inherited)

## Date

2023-01-01 (original decision from Valora / MobileStack)

## Context

The application requires complex side-effect management: API calls, blockchain transactions, state synchronization, retry logic, and multi-step user flows.

This decision was inherited from the base project (Valora -> MobileStack -> TuCOP) but is preserved for its benefits.

## Options considered

1. **Redux Thunk**: Simple, less boilerplate, but hard to test and to manage complex flows.

2. **Redux Saga**: Generators, declarative effects, easy testing, concurrency control, but learning curve.

3. **Redux Toolkit Query (RTK Query)**: For data fetching, but does not cover all our use cases (transactions, complex flows).

## Decision

Keep **Redux Saga** for side-effect management.

Rationale:

- Blockchain transaction flows need retry, timeout, rollback
- Saga testing is predictable with `redux-saga-test-plan`
- Effects like `takeLatest`, `race`, `fork` are essential to the UX
- The existing codebase already uses sagas extensively

## Consequences

### Positive

- Granular control over complex async flows
- Deterministic testing of side effects
- Cancellation and race conditions handled well
- Established patterns in the codebase (easy onboarding)

### Negative

- More boilerplate than plain thunks
- Learning curve for generators
- Debugging can be complex

## References

- [Redux Saga Documentation](https://redux-saga.js.org/)
- `src/redux/sagas.ts` - Root saga
- `src/send/saga.ts` - Example of a complex saga
- `src/tokens/saga.ts` - Example of data fetching
