// ABI fragment for the BatchExecutor contract that the EOA delegates to via
// EIP-7702. The contract exposes a single entrypoint `execute(Call[])` that
// loops through the inner calls and runs them under the EOA's authority. See
// the Track C spike outcome doc + contracts-spike/scripts/s1-* for the live
// pattern validated on Celo mainnet.
export const BATCH_EXECUTOR_ABI = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
] as const
