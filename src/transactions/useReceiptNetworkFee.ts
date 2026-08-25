import BigNumber from 'bignumber.js'
import { useEffect, useState } from 'react'
import { useSelector } from 'src/redux/hooks'
import { nativeFeeCurrencySelector, tokensByIdSelector } from 'src/tokens/selectors'
import { Fee, FeeType, NetworkId } from 'src/transactions/types'
import Logger from 'src/utils/Logger'
import { publicClient } from 'src/viem'
import { networkIdToNetwork } from 'src/web3/networkConfig'

const TAG = 'transactions/useReceiptNetworkFee'

// Reads gasUsed * effectiveGasPrice off-chain and hydrates a Fee entry so the
// tx-detail screen can render a "Network fee" row even when the upstream
// indexer (Valora legacy feed OR the TuCop backend indexer while it lags /
// while a wallet is not in the watched-address set) did not surface a
// SecurityFee for the tx. Fee currency is picked from the tx envelope's
// `feeCurrency` field (CIP-64 stable address) if present, else the native
// gas token for the network (CELO for Celo mainnet).
//
// Runs one RPC call on mount + memoizes the result; returns { fee, loading,
// error } so callers can render a skeleton or fall back to hiding the row
// when the RPC is unreachable. Does NOT retry — if the RPC is down the tx
// detail can survive without the row.
export function useReceiptNetworkFee({
  transactionHash,
  networkId,
  skip,
}: {
  transactionHash: string
  networkId: NetworkId
  // When the upstream feed already supplied a SecurityFee we do not want
  // to double-fetch the receipt. Callers pass `skip: true` in that case.
  skip: boolean
}): { fee: Fee | null; loading: boolean; error: Error | null } {
  const [fee, setFee] = useState<Fee | null>(null)
  const [loading, setLoading] = useState<boolean>(!skip)
  const [error, setError] = useState<Error | null>(null)

  // Native fee currency (CELO on Celo mainnet). CELO is deliberately excluded
  // from ALLOWED_TOKEN_IDS so a plain tokensById lookup would miss it; the
  // selector synthesizes an entry from state.tokens.nativeCeloBalance for us.
  const nativeFeeCurrency = useSelector((state) => nativeFeeCurrencySelector(state, networkId))
  // CIP-64 fee currencies (USDm, COPm, USDC, USDT, etc). Keyed by address so
  // we can pair the tx envelope's `feeCurrency` value (a bare address) with a
  // known TokenBalance for the display.
  const tokensById = useSelector((state) => tokensByIdSelector(state, [networkId]))

  useEffect(() => {
    if (skip) {
      setLoading(false)
      return
    }
    if (!transactionHash) return

    const network = networkIdToNetwork[networkId]
    if (!network) {
      setError(new Error(`No public client for networkId ${networkId}`))
      setLoading(false)
      return
    }
    const client = publicClient[network]
    if (!client) {
      setError(new Error(`No public client for network ${network}`))
      setLoading(false)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const [receipt, tx] = await Promise.all([
          client.getTransactionReceipt({
            hash: transactionHash as `0x${string}`,
          }),
          client.getTransaction({ hash: transactionHash as `0x${string}` }),
        ])
        if (cancelled) return

        const gasUsed = new BigNumber(receipt.gasUsed.toString())
        const effectiveGasPrice = new BigNumber(receipt.effectiveGasPrice.toString())
        const feeWei = gasUsed.multipliedBy(effectiveGasPrice)

        // CIP-64 tx (type 0x7b) has a `feeCurrency` field pointing at the
        // adapter address for the stable used to pay gas. Native gas leaves
        // it null/undefined.
        const feeCurrencyAddress = (tx as { feeCurrency?: string | null }).feeCurrency
        let feeToken = nativeFeeCurrency
        let decimals = 18
        if (feeCurrencyAddress) {
          const matched = Object.values(tokensById).find(
            (tok) => tok?.address?.toLowerCase() === feeCurrencyAddress.toLowerCase()
          )
          if (matched) {
            feeToken = matched
            decimals = matched.decimals
          } else {
            // Unknown CIP-64 fee currency (never in the app's token list).
            // Bail rather than mislabel — a phantom "Unknown" row is worse
            // than no row.
            Logger.warn(TAG, 'Unknown CIP-64 fee currency address', {
              feeCurrencyAddress,
              transactionHash,
            })
            setLoading(false)
            return
          }
        } else if (nativeFeeCurrency) {
          decimals = nativeFeeCurrency.decimals
        }

        if (!feeToken) {
          setLoading(false)
          return
        }

        const feeValue = feeWei.shiftedBy(-decimals)

        setFee({
          type: FeeType.SecurityFee,
          amount: {
            value: feeValue.toString(),
            tokenId: feeToken.tokenId,
            tokenAddress: feeToken.address ?? undefined,
          },
        })
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        const asError = err instanceof Error ? err : new Error(String(err))
        Logger.warn(TAG, 'Failed to fetch receipt for network fee', {
          transactionHash,
          error: asError.message,
        })
        setError(asError)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [skip, transactionHash, networkId, nativeFeeCurrency, tokensById])

  return { fee, loading, error }
}
