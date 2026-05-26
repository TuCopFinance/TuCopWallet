// Source: verified contract at https://celoscan.io/address/0x947c6db1569edc9fd37b017b791ca0f008ab4946#code
// Fetched via Etherscan V2 API on 2026-05-25. Replaces the previous hand-written subset
// whose SubsidyClaimed signature did not match what the deployed contract actually emits.

const ReFiColombiaSubsidies = {
  abi: [
    {
      inputs: [{ internalType: 'address', name: 'tokenAddress', type: 'address' }],
      stateMutability: 'nonpayable',
      type: 'constructor',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'address', name: 'beneficiaryAddress', type: 'address' },
      ],
      name: 'BeneficiaryAdded',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'address', name: 'beneficiaryAddress', type: 'address' },
      ],
      name: 'BeneficiaryRemoved',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [{ indexed: false, internalType: 'uint256', name: 'interval', type: 'uint256' }],
      name: 'ClaimIntervalSet',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [{ indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' }],
      name: 'ClaimableAmountSet',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
        { indexed: false, internalType: 'uint256', name: 'contractBalance', type: 'uint256' },
      ],
      name: 'FundsAdded',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: false, internalType: 'uint256', name: 'amountWithdrawed', type: 'uint256' },
      ],
      name: 'FundsWithdrawed',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'address', name: 'previousOwner', type: 'address' },
        { indexed: true, internalType: 'address', name: 'newOwner', type: 'address' },
      ],
      name: 'OwnershipTransferred',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: 'address', name: 'beneficiaryAddress', type: 'address' },
        { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
        { indexed: false, internalType: 'uint256', name: 'contractBalance', type: 'uint256' },
      ],
      name: 'SubsidyClaimed',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [{ indexed: false, internalType: 'address', name: 'tokenAddress', type: 'address' }],
      name: 'TokenAddressSet',
      type: 'event',
    },
    {
      inputs: [{ internalType: 'address', name: '_beneficiaryAddress', type: 'address' }],
      name: 'addBeneficiary',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'uint256', name: '_amount', type: 'uint256' }],
      name: 'addFunds',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: '', type: 'address' }],
      name: 'addressToUser',
      outputs: [
        { internalType: 'bool', name: 'isBeneficiary', type: 'bool' },
        { internalType: 'uint256', name: 'lastClaimTimestamp', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'claimSubsidy',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: '_beneficiaryAddress', type: 'address' }],
      name: 'isBeneficiary',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'owner',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: '_beneficiaryAddress', type: 'address' }],
      name: 'removeBeneficiary',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'renounceOwnership',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'uint256', name: '_interval', type: 'uint256' }],
      name: 'setClaimInterval',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'uint256', name: '_amount', type: 'uint256' }],
      name: 'setClaimableAmount',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: '_tokenAddress', type: 'address' }],
      name: 'setTokenAddress',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'subsidyClaimInterval',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'subsidyClaimableAmount',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'token',
      outputs: [{ internalType: 'contract IERC20', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
      name: 'transferOwnership',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'uint256', name: '_amountWithdrawed', type: 'uint256' }],
      name: 'withdrawFunds',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
} as const

export default ReFiColombiaSubsidies
