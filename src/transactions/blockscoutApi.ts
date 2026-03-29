import {
  NetworkId,
  TokenExchange,
  TokenTransaction,
  TokenTransactionTypeV2,
  TokenTransfer,
  TransactionStatus,
} from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import networkConfig from 'src/web3/networkConfig'

const TAG = 'transactions/blockscoutApi'

// Blockscout API base URL for Celo mainnet
const BLOCKSCOUT_API_BASE = 'https://celo.blockscout.com/api/v2'

// System contracts to ignore (internal transfers, fees, etc)
const SYSTEM_CONTRACTS = new Set([
  '0xcd437749e43a154c07f3553504c68fbfd56b8778', // Swap router/FeeHandler
  '0x4200000000000000000000000000000000000011', // L2 gas fee
  '0x0000000000000000000000000000000000000000', // Null address (mints/burns)
])

// Tokens we care about
const MAIN_TOKENS = new Set(['COPm', 'USDT', 'XAUt0', 'USDC', 'USDm', 'CELO'])

interface BlockscoutTransfer {
  transaction_hash: string
  method: string | null
  timestamp: string
  block_number: number
  from: { hash: string }
  to: { hash: string }
  token: {
    address_hash: string
    symbol: string
    decimals: string
    name: string
  }
  total: {
    value: string
    decimals: string
  }
}

interface BlockscoutResponse {
  items: BlockscoutTransfer[]
  next_page_params?: {
    index: number
    block_number: number
  }
}

interface FetchResult {
  transactions: TokenTransaction[]
  nextCursor: string | null
}

/**
 * Fetch all token transfers from Blockscout for a given address.
 * This supplements the Valora backend to show XAUt0 (gold) and other tokens
 * that aren't indexed by Valora.
 */
export async function fetchAllBlockscoutTransfers({
  address,
  cursor,
}: {
  address: string
  cursor: string | null
}): Promise<FetchResult> {
  const userAddress = address.toLowerCase()
  const allTransactions: TokenTransaction[] = []
  let nextPageParams: BlockscoutResponse['next_page_params'] | null = null

  try {
    // Parse cursor if provided
    if (cursor) {
      const [index, blockNumber] = cursor.split(':')
      nextPageParams = {
        index: parseInt(index, 10),
        block_number: parseInt(blockNumber, 10),
      }
    }

    // Fetch multiple pages to get comprehensive transaction history
    let pagesLoaded = 0
    const maxPages = 5 // Limit to avoid too many requests

    do {
      let url = `${BLOCKSCOUT_API_BASE}/addresses/${address}/token-transfers?type=ERC-20`
      if (nextPageParams) {
        url += `&index=${nextPageParams.index}&block_number=${nextPageParams.block_number}`
      }

      Logger.debug(TAG, `Fetching Blockscout page ${pagesLoaded + 1}...`)
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Blockscout API error: ${response.status}`)
      }

      const data: BlockscoutResponse = await response.json()

      // Group transfers by transaction hash
      const transfersByTx = new Map<string, BlockscoutTransfer[]>()
      for (const transfer of data.items) {
        if (transfer.method === 'approve') continue // Skip approvals

        const txHash = transfer.transaction_hash
        if (!transfersByTx.has(txHash)) {
          transfersByTx.set(txHash, [])
        }
        transfersByTx.get(txHash)!.push(transfer)
      }

      // Process each transaction
      for (const [txHash, transfers] of transfersByTx) {
        const transaction = processBlockscoutTransaction(txHash, transfers, userAddress)
        if (transaction) {
          allTransactions.push(transaction)
        }
      }

      nextPageParams = data.next_page_params || null
      pagesLoaded++

      // Check if oldest transaction is more than 30 days old, stop if so
      const oldestTimestamp = data.items[data.items.length - 1]?.timestamp
      if (oldestTimestamp) {
        const oldestDate = new Date(oldestTimestamp)
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        if (oldestDate < thirtyDaysAgo) {
          break
        }
      }
    } while (nextPageParams && pagesLoaded < maxPages)

    // Create next cursor for pagination
    const nextCursor = nextPageParams
      ? `${nextPageParams.index}:${nextPageParams.block_number}`
      : null

    return {
      transactions: allTransactions,
      nextCursor,
    }
  } catch (error) {
    Logger.error(TAG, 'Error fetching from Blockscout', error)
    return { transactions: [], nextCursor: null }
  }
}

/**
 * Process a group of transfers from a single transaction into a TokenTransaction
 */
function processBlockscoutTransaction(
  txHash: string,
  transfers: BlockscoutTransfer[],
  userAddress: string
): TokenTransaction | null {
  if (transfers.length === 0) return null

  const timestamp = new Date(transfers[0].timestamp).getTime()
  const block = transfers[0].block_number.toString()

  // Filter to meaningful transfers (not system contracts)
  const meaningfulTransfers = transfers.filter((t) => {
    const from = t.from.hash.toLowerCase()
    const to = t.to.hash.toLowerCase()

    // Skip system contract transfers
    if (SYSTEM_CONTRACTS.has(from) || SYSTEM_CONTRACTS.has(to)) {
      return false
    }

    // Only transfers involving the user
    return from === userAddress || to === userAddress
  })

  if (meaningfulTransfers.length === 0) return null

  // Calculate net amounts per token
  const outAmounts: Record<string, { value: number; tokenId: string; symbol: string }> = {}
  const inAmounts: Record<string, { value: number; tokenId: string; symbol: string }> = {}

  for (const transfer of meaningfulTransfers) {
    const symbol = transfer.token.symbol
    if (!MAIN_TOKENS.has(symbol)) continue

    const decimals = parseInt(transfer.token.decimals, 10)
    const value = parseFloat(transfer.total.value) / Math.pow(10, decimals)
    const tokenAddress = transfer.token.address_hash.toLowerCase()
    const tokenId = `${networkConfig.defaultNetworkId}:${tokenAddress}`

    const from = transfer.from.hash.toLowerCase()
    const to = transfer.to.hash.toLowerCase()

    if (from === userAddress) {
      if (!outAmounts[symbol]) {
        outAmounts[symbol] = { value: 0, tokenId, symbol }
      }
      outAmounts[symbol].value += value
    } else if (to === userAddress) {
      if (!inAmounts[symbol]) {
        inAmounts[symbol] = { value: 0, tokenId, symbol }
      }
      inAmounts[symbol].value += value
    }
  }

  const outTokens = Object.keys(outAmounts)
  const inTokens = Object.keys(inAmounts)

  // Determine transaction type
  if (outTokens.length > 0 && inTokens.length > 0) {
    // SWAP: tokens going out and coming in
    const outToken = outAmounts[outTokens[0]]
    const inToken = inAmounts[inTokens[0]]

    const exchange: TokenExchange = {
      networkId: NetworkId['celo-mainnet'],
      type: TokenTransactionTypeV2.SwapTransaction,
      transactionHash: txHash,
      timestamp,
      block,
      outAmount: {
        value: outToken.value.toString(),
        tokenId: outToken.tokenId,
      },
      inAmount: {
        value: inToken.value.toString(),
        tokenId: inToken.tokenId,
      },
      fees: [],
      status: TransactionStatus.Complete,
    }

    return exchange
  } else if (inTokens.length > 0 && outTokens.length === 0) {
    // RECEIVE: only tokens coming in
    const inToken = inAmounts[inTokens[0]]

    const transfer: TokenTransfer = {
      networkId: NetworkId['celo-mainnet'],
      type: TokenTransactionTypeV2.Received,
      transactionHash: txHash,
      timestamp,
      block,
      address: meaningfulTransfers[0].from.hash,
      amount: {
        value: inToken.value.toString(),
        tokenId: inToken.tokenId,
      },
      metadata: {},
      fees: [],
      status: TransactionStatus.Complete,
    }

    return transfer
  } else if (outTokens.length > 0 && inTokens.length === 0) {
    // SEND: only tokens going out
    const outToken = outAmounts[outTokens[0]]

    const transfer: TokenTransfer = {
      networkId: NetworkId['celo-mainnet'],
      type: TokenTransactionTypeV2.Sent,
      transactionHash: txHash,
      timestamp,
      block,
      address: meaningfulTransfers[0].to.hash,
      amount: {
        value: (-outToken.value).toString(), // Negative for sent
        tokenId: outToken.tokenId,
      },
      metadata: {},
      fees: [],
      status: TransactionStatus.Complete,
    }

    return transfer
  }

  return null
}
