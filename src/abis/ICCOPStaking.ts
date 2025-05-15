const cCOPStaking = {
  abi: [
    {
      inputs: [
        {
          internalType: 'address',
          name: '_cCOP',
          type: 'address',
        },
        {
          internalType: 'address',
          name: '_developerWallet',
          type: 'address',
        },
      ],
      stateMutability: 'nonpayable',
      type: 'constructor',
    },
    {
      inputs: [],
      name: 'ExceedsStakingLimit',
      type: 'error',
    },
    {
      inputs: [],
      name: 'InvalidDuration',
      type: 'error',
    },
    {
      inputs: [],
      name: 'InvalidParameter',
      type: 'error',
    },
    {
      inputs: [],
      name: 'InvalidStakeIndex',
      type: 'error',
    },
    {
      inputs: [],
      name: 'InvalidStakingPeriod',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'owner',
          type: 'address',
        },
      ],
      name: 'OwnableInvalidOwner',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'account',
          type: 'address',
        },
      ],
      name: 'OwnableUnauthorizedAccount',
      type: 'error',
    },
    {
      inputs: [],
      name: 'ReentrancyGuardReentrantCall',
      type: 'error',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'token',
          type: 'address',
        },
      ],
      name: 'SafeERC20FailedOperation',
      type: 'error',
    },
    {
      inputs: [],
      name: 'StakeAlreadyClaimed',
      type: 'error',
    },
    {
      inputs: [],
      name: 'StakePeriodEnded',
      type: 'error',
    },
    {
      inputs: [],
      name: 'StakeStillLocked',
      type: 'error',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'developer',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
      ],
      name: 'DeveloperFeesPaid',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'oldWallet',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'newWallet',
          type: 'address',
        },
      ],
      name: 'DeveloperWalletUpdated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'user',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'originalAmount',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'penalty',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'withdrawnAmount',
          type: 'uint256',
        },
      ],
      name: 'EarlyWithdrawn',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'oldGovernance',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'newGovernance',
          type: 'address',
        },
      ],
      name: 'GovernanceUpdated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'previousOwner',
          type: 'address',
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'newOwner',
          type: 'address',
        },
      ],
      name: 'OwnershipTransferred',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'uint256',
          name: 'newPenalty',
          type: 'uint256',
        },
      ],
      name: 'PenaltyUpdated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'uint256',
          name: 'rate30',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'rate60',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'rate90',
          type: 'uint256',
        },
      ],
      name: 'RatesUpdated',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'user',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'duration',
          type: 'uint256',
        },
      ],
      name: 'Staked',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'address',
          name: 'user',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'rewards',
          type: 'uint256',
        },
      ],
      name: 'Withdrawn',
      type: 'event',
    },
    {
      inputs: [],
      name: 'MAX_STAKE_30',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'MAX_STAKE_60',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'MAX_STAKE_90',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'cCOP',
      outputs: [
        {
          internalType: 'contract IERC20',
          name: '',
          type: 'address',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          components: [
            {
              internalType: 'uint256',
              name: 'amount',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'startTime',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'endTime',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'duration',
              type: 'uint256',
            },
            {
              internalType: 'bool',
              name: 'claimed',
              type: 'bool',
            },
          ],
          internalType: 'struct cCOPStaking.Stake',
          name: '_stake',
          type: 'tuple',
        },
      ],
      name: 'calculateRewards',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'developerWallet',
      outputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '_stakeIndex',
          type: 'uint256',
        },
      ],
      name: 'earlyWithdraw',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'earlyWithdrawalPenalty',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '_duration',
          type: 'uint256',
        },
      ],
      name: 'getMaxStakeAmount',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'pure',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_user',
          type: 'address',
        },
        {
          internalType: 'uint256',
          name: '_offset',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: '_limit',
          type: 'uint256',
        },
      ],
      name: 'getTotalActiveStakesPaginated',
      outputs: [
        {
          internalType: 'uint256',
          name: 'activeStakes',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_user',
          type: 'address',
        },
      ],
      name: 'getUserStakes',
      outputs: [
        {
          components: [
            {
              internalType: 'uint256',
              name: 'amount',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'startTime',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'endTime',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'duration',
              type: 'uint256',
            },
            {
              internalType: 'bool',
              name: 'claimed',
              type: 'bool',
            },
          ],
          internalType: 'struct cCOPStaking.Stake[]',
          name: '',
          type: 'tuple[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_user',
          type: 'address',
        },
        {
          internalType: 'uint256',
          name: '_offset',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: '_limit',
          type: 'uint256',
        },
      ],
      name: 'getUserStakesPaginated',
      outputs: [
        {
          components: [
            {
              internalType: 'uint256',
              name: 'amount',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'startTime',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'endTime',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'duration',
              type: 'uint256',
            },
            {
              internalType: 'bool',
              name: 'claimed',
              type: 'bool',
            },
          ],
          internalType: 'struct cCOPStaking.Stake[]',
          name: '',
          type: 'tuple[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'governance',
      outputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'owner',
      outputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address',
        },
      ],
      stateMutability: 'view',
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
      inputs: [
        {
          internalType: 'uint256',
          name: '_amount',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: '_duration',
          type: 'uint256',
        },
      ],
      name: 'stake',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '',
          type: 'address',
        },
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      name: 'stakes',
      outputs: [
        {
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'startTime',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'endTime',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'duration',
          type: 'uint256',
        },
        {
          internalType: 'bool',
          name: 'claimed',
          type: 'bool',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'stakingRate30Days',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'stakingRate60Days',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'stakingRate90Days',
      outputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '_daysThreshold',
          type: 'uint256',
        },
      ],
      name: 'sweepUnclaimedTokens',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: 'newOwner',
          type: 'address',
        },
      ],
      name: 'transferOwnership',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_newWallet',
          type: 'address',
        },
      ],
      name: 'updateDeveloperWallet',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '_newPenalty',
          type: 'uint256',
        },
      ],
      name: 'updateEarlyWithdrawalPenalty',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'address',
          name: '_newGovernance',
          type: 'address',
        },
      ],
      name: 'updateGovernance',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '_rate30',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: '_rate60',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: '_rate90',
          type: 'uint256',
        },
      ],
      name: 'updateStakingRates',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '_stakeIndex',
          type: 'uint256',
        },
      ],
      name: 'withdraw',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
} as const

export default cCOPStaking
