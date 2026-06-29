// Minimal ABI for FondoCOPmMVP. The wallet only needs read paths for
// defense-in-depth on the close signature; all writes are built by the
// backend via hooks-api triggerShortcut.
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
  { type: 'error', name: 'InterestPoolLow', inputs: [] },
  { type: 'error', name: 'AlreadyClosed', inputs: [] },
  { type: 'error', name: 'NotOwner', inputs: [] },
] as const
