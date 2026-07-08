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

// Use TuCop backend Blockscout passthrough so the API key stays on the server.
const BLOCKSCOUT_API_BASE = networkConfig.blockscoutProxyBase

// System contracts to ignore (internal transfers, fees, etc)
const SYSTEM_CONTRACTS = new Set([
  '0xcd437749e43a154c07f3553504c68fbfd56b8778', // Swap router/FeeHandler
  '0x4200000000000000000000000000000000000011', // L2 gas fee
  '0x0000000000000000000000000000000000000000', // Null address (mints/burns)
])

// Tokens we care about, keyed by canonical contract address (lowercase). Symbol
// matching was fragile: Blockscout mirrors on-chain ERC20 `symbol()` output
// verbatim, so USDm arrives as `CUSD` (all caps, its Mento contract symbol),
// USDT sometimes as `USD₮`, and any future rebrand can silently drop a leg
// from the atomic 7702 batch classifier. Address is the canonical identity.
const MAIN_TOKEN_ADDRESSES = new Set(
  [
    networkConfig.copmTokenId,
    networkConfig.usdtTokenId,
    networkConfig.usdcTokenId,
    networkConfig.usdmTokenId,
    networkConfig.usatTokenId,
    networkConfig.xaut0TokenId,
    networkConfig.celoTokenId,
  ]
    .filter(Boolean)
    .map((tokenId) => tokenId.split(':')[1]?.toLowerCase())
    .filter(Boolean)
)

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

  // Calculate net amounts per token, keyed by contract address (canonical).
  // Using symbol as the key silently merges tokens with the same symbol from
  // different contracts (or, worse, silently drops a leg when the symbol has
  // an aliased casing like USDm-contract returning `CUSD`).
  const outAmounts: Record<string, { value: number; tokenId: string; symbol: string }> = {}
  const inAmounts: Record<string, { value: number; tokenId: string; symbol: string }> = {}

  for (const transfer of meaningfulTransfers) {
    const tokenAddress = transfer.token.address_hash.toLowerCase()
    if (!MAIN_TOKEN_ADDRESSES.has(tokenAddress)) continue

    const symbol = transfer.token.symbol
    const decimals = parseInt(transfer.token.decimals, 10)
    const value = parseFloat(transfer.total.value) / Math.pow(10, decimals)
    const tokenId = `${networkConfig.defaultNetworkId}:${tokenAddress}`

    const from = transfer.from.hash.toLowerCase()
    const to = transfer.to.hash.toLowerCase()

    if (from === userAddress) {
      if (!outAmounts[tokenAddress]) {
        outAmounts[tokenAddress] = { value: 0, tokenId, symbol }
      }
      outAmounts[tokenAddress].value += value
    } else if (to === userAddress) {
      if (!inAmounts[tokenAddress]) {
        inAmounts[tokenAddress] = { value: 0, tokenId, symbol }
      }
      inAmounts[tokenAddress].value += value
    }
  }

  const outTokens = Object.keys(outAmounts)
  const inTokens = Object.keys(inAmounts)

  // Determine transaction type
  if (outTokens.length > 0 && inTokens.length > 0) {
    // SWAP: tokens going out and coming in.
    //
    // EIP-7702 atomic batches from the WRI dollarsSpend flow move multiple
    // dollar-family stablecoins (USDm + USDC + USDT) out of the user's EOA in
    // one tx. Blockscout's Transfer log surfaces every leg, but naively
    // picking outTokens[0] shows a single-leg swap of one of the three legs
    // (whichever came back first from Blockscout, non-deterministic) and hides
    // the other two. That misrepresents the amount ("-0.91 Dolares" for what
    // was actually a $3 swap) and stops SwapFeedItem from switching to the
    // multi-leg "N monedas a Pesos" subtitle.
    //
    // When there is more than one outgoing token, mirror the TuCop indexer
    // shape: keep outAmount as the largest USD leg for backwards compatibility
    // and populate fromTokenAmounts with every leg. SwapFeedItem uses
    // fromTokenAmounts.length > 1 to render the aggregate copy.
    const outTokenList = outTokens.map((symbol) => outAmounts[symbol])
    const inToken = inAmounts[inTokens[0]]
    const primaryOut =
      outTokenList.length > 1
        ? outTokenList.reduce((a, b) => (b.value > a.value ? b : a))
        : outTokenList[0]

    const exchange: TokenExchange = {
      networkId: NetworkId['celo-mainnet'],
      type: TokenTransactionTypeV2.SwapTransaction,
      transactionHash: txHash,
      timestamp,
      block,
      outAmount: {
        value: primaryOut.value.toString(),
        tokenId: primaryOut.tokenId,
      },
      inAmount: {
        value: inToken.value.toString(),
        tokenId: inToken.tokenId,
      },
      ...(outTokenList.length > 1 && {
        fromTokenAmounts: outTokenList.map((o) => ({
          value: o.value.toString(),
          tokenId: o.tokenId,
        })),
      }),
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
