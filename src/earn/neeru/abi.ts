// Minimal ABI for FondoCOPmMVP. The wallet only needs read paths for
// defense-in-depth on the close signature; all writes are built by the
// backend via hooks-api triggerShortcut. The Deposit event is consumed
// by the optimistic-UI saga to render a position immediately after a
// successful deposit, before the backend indexer surfaces it.
export const fondoCOPmMVPAbi = [
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'tranche', type: 'uint8' },
      { name: 'closed', type: 'bool' },
      { name: 'principal', type: 'uint256' },
      { name: 'startTs', type: 'uint256' },
      { name: 'maturityTs', type: 'uint256' },
      { name: 'lastAccrualTs', type: 'uint256' },
      { name: 'dailyRateRay', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'previewAccruedInterest',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'tranche', type: 'uint8', indexed: false },
      { name: 'principal', type: 'uint256', indexed: false },
      { name: 'dailyRateRay', type: 'uint256', indexed: false },
    ],
  },
  { type: 'error', name: 'InterestPoolLow', inputs: [] },
  { type: 'error', name: 'AlreadyClosed', inputs: [] },
  { type: 'error', name: 'NotOwner', inputs: [] },
] as const
