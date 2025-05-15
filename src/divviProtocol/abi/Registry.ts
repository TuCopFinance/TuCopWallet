import { Abi } from 'viem'

export const DivviRegistryAbi: Abi = [
  {
    inputs: [
      {
        internalType: 'string',
        name: 'divviId',
        type: 'string',
      },
      {
        internalType: 'string',
        name: 'campaignId',
        type: 'string',
      },
    ],
    name: 'registerReferral',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const
