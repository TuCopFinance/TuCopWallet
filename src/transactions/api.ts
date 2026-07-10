import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { type LocalCurrencyCode } from 'src/localCurrency/consts'
import { getFeatureGate, getMultichainFeatures } from 'src/statsig'
import { StatsigFeatureGates } from 'src/statsig/types'
import { FEED_V2_INCLUDE_TYPES, type PageInfo, type TokenTransaction } from 'src/transactions/types'
import networkConfig from 'src/web3/networkConfig'

type TransactionFeedV2Response = {
  transactions: TokenTransaction[]
  pageInfo: PageInfo
}

// baseUrl is intentionally empty: each query resolves the absolute URL at call
// time so the gate flip (WRI_TX_FEED_TUCOP_V1) takes effect without a wallet
// restart. fetchBaseQuery treats an absolute URL on the request as overriding
// baseUrl, so an empty baseUrl is safe.
const baseQuery = fetchBaseQuery({
  baseUrl: '',
  headers: { Accept: 'application/json' },
})

export const transactionFeedV2Api = createApi({
  reducerPath: 'transactionFeedV2Api',
  baseQuery,
  endpoints: (builder) => ({
    transactionFeedV2: builder.query<
      TransactionFeedV2Response,
      {
        address: string
        localCurrencyCode: LocalCurrencyCode
        endCursor: PageInfo['endCursor'] | undefined
      }
    >({
      query: ({ address, localCurrencyCode, endCursor: afterCursor }) => {
        // WRI Track C feed migration: when the gate is on, route through
        // TuCop's own indexer which classifies EIP-7702 atomic batches that
        // Valora ignores (tx.from == tx.to == userEOA calling execute()).
        // Both endpoints accept the same query params and return the same
        // shape, so this is a drop-in flip — no caller changes required.
        const useTucopFeed = getFeatureGate(StatsigFeatureGates.WRI_TX_FEED_TUCOP_V1)
        const url = useTucopFeed
          ? networkConfig.wriTxFeedUrl
          : networkConfig.getWalletTransactionsUrl
        return {
          url,
          params: {
            address,
            networkIds: getMultichainFeatures().showTransfers.join(','),
            includeTypes: FEED_V2_INCLUDE_TYPES.join(','),
            localCurrencyCode,
            ...(afterCursor && { afterCursor }),
          },
        }
      },
      keepUnusedDataFor: 60, // 1 min
      transformErrorResponse: (error, meta) => {
        if (meta) {
          const params = new URL(meta.request.url).searchParams
          return {
            ...error,
            // only requests for next pages have the afterCursor search param
            hasAfterCursor: params.get('afterCursor'),
          }
        }

        return error
      },
    }),
  }),
})

export const { useTransactionFeedV2Query } = transactionFeedV2Api
