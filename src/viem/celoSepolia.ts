import { defineChain } from 'viem'
import { celo } from 'viem/chains'

/**
 * Custom Celo Sepolia chain definition.
 * viem v2.31.0 does not include celoSepolia, so we define it here.
 * Based on https://docs.celo.org/tooling/testnets/celo-sepolia
 */
export const celoSepolia = defineChain({
  ...celo,
  id: 11142220,
  name: 'Celo Sepolia',
  network: 'celo-sepolia',
  testnet: true,
  rpcUrls: {
    default: {
      http: ['https://forno.celo-sepolia.celo-testnet.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'CeloScan',
      url: 'https://sepolia.celoscan.io',
    },
  },
})
