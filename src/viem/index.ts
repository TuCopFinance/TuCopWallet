import {
  ALCHEMY_ARBITRUM_API_KEY,
  ALCHEMY_BASE_API_KEY,
  ALCHEMY_ETHEREUM_API_KEY,
  ALCHEMY_OPTIMISM_API_KEY,
  ALCHEMY_POLYGON_POS_API_KEY,
} from 'src/config'
import { Network } from 'src/transactions/types'
import networkConfig from 'src/web3/networkConfig'
import { PublicClient, Transport, createPublicClient, http } from 'viem'

export const INTERNAL_RPC_SUPPORTED_NETWORKS = [Network.Arbitrum] as const

export const viemTransports: Record<Network, Transport> = {
  [Network.Celo]: http(
    'https://celo-mainnet.core.chainstack.com/ebf11308d0727573a6abe298515f9fa9',
    {
      fetchOptions: {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    }
  ),
  [Network.Ethereum]: http(networkConfig.alchemyRpcUrl[Network.Ethereum], {
    fetchOptions: {
      headers: {
        Authorization: `Bearer ${ALCHEMY_ETHEREUM_API_KEY}`,
      },
    },
  }),
  [Network.Arbitrum]: http(networkConfig.alchemyRpcUrl[Network.Arbitrum], {
    fetchOptions: {
      headers: {
        Authorization: `Bearer ${ALCHEMY_ARBITRUM_API_KEY}`,
      },
    },
  }),
  [Network.Optimism]: http(networkConfig.alchemyRpcUrl[Network.Optimism], {
    fetchOptions: {
      headers: {
        Authorization: `Bearer ${ALCHEMY_OPTIMISM_API_KEY}`,
      },
    },
  }),
  [Network.PolygonPoS]: http(networkConfig.alchemyRpcUrl[Network.PolygonPoS], {
    fetchOptions: {
      headers: {
        Authorization: `Bearer ${ALCHEMY_POLYGON_POS_API_KEY}`,
      },
    },
  }),
  [Network.Base]: http(networkConfig.alchemyRpcUrl[Network.Base], {
    fetchOptions: {
      headers: {
        Authorization: `Bearer ${ALCHEMY_BASE_API_KEY}`,
      },
    },
  }),
}

export const appViemTransports = {
  [Network.Arbitrum]: http(networkConfig.internalRpcUrl.arbitrum),
} satisfies Record<(typeof INTERNAL_RPC_SUPPORTED_NETWORKS)[number], Transport>

export const publicClient = {
  [Network.Celo]: createPublicClient({
    chain: networkConfig.viemChain.celo,
    transport: http('https://celo-mainnet.core.chainstack.com/ebf11308d0727573a6abe298515f9fa9', {
      fetchOptions: {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    }),
  }),
  [Network.Ethereum]: createPublicClient({
    chain: networkConfig.viemChain.ethereum,
    transport: viemTransports[Network.Ethereum],
  }),
  [Network.Arbitrum]: createPublicClient({
    chain: networkConfig.viemChain.arbitrum,
    transport: viemTransports[Network.Arbitrum],
  }),
  [Network.Optimism]: createPublicClient({
    chain: networkConfig.viemChain.optimism,
    transport: viemTransports[Network.Optimism],
  }),
  [Network.PolygonPoS]: createPublicClient({
    chain: networkConfig.viemChain['polygon-pos'],
    transport: viemTransports[Network.PolygonPoS],
  }),
  [Network.Base]: createPublicClient({
    chain: networkConfig.viemChain.base,
    transport: viemTransports[Network.Base],
  }),
}

export const appPublicClient = {
  [Network.Arbitrum]: createPublicClient({
    chain: networkConfig.viemChain.arbitrum,
    transport: appViemTransports[Network.Arbitrum],
  }),
} satisfies Record<(typeof INTERNAL_RPC_SUPPORTED_NETWORKS)[number], PublicClient>
