// Type-only decode schema for the earn-vault Deposit event. Deliberately
// does not reference the contract by name and does not describe custom
// error signatures or read functions. See docs/policy: repo source alone
// must not let a reader reconstruct events, fields, or behavior beyond
// what raw bytecode disassembly reveals.
//
// Data-slot layout for the Deposit event log (topic[0] is the topic hash,
// topic[1] and topic[2] are the two indexed args, and this schema is used
// to decode the non-indexed args from log.data).
export const DEPOSIT_EVENT_DATA_SCHEMA = [
  { type: 'uint8' },
  { type: 'uint256' },
  { type: 'uint256' },
] as const
