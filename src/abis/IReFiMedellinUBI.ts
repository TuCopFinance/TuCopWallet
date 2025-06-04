const ReFiMedellinUBI = {
  abi: [
    {
      inputs: [
        {
          internalType: 'address',
          name: 'beneficiary',
          type: 'address',
        },
      ],
      name: 'isbeneficiary',
      outputs: [
        {
          internalType: 'bool',
          name: '',
          type: 'bool',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'claimsubsidy',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'beneficiary',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
      ],
      name: 'SubsidyClaimed',
      type: 'event',
    },
  ],
} as const

export default ReFiMedellinUBI
