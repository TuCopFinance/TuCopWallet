import { reducer as account } from 'src/account/reducer'
import { reducer as alert } from 'src/alert/reducer'
import bucksPayReducer from 'src/buckspay/slice'
import goldReducer from 'src/gold/slice'
import { appReducer as app } from 'src/app/reducers'
import dappsReducer from 'src/dapps/slice'
import dollarsSpendReducer from 'src/dollarsSpend/slice'
import earnReducer from 'src/earn/slice'
import neeruReducer from 'src/earn/neeru/slice'
import { reducer as fiatExchanges } from 'src/fiatExchanges/reducer'
import fiatConnectReducer from 'src/fiatconnect/slice'
import { homeReducer as home } from 'src/home/reducers'
import i18nReducer from 'src/i18n/slice'
import { reducer as identity } from 'src/identity/reducer'
import { reducer as imports } from 'src/import/reducer'
import jumpstartReducer from 'src/jumpstart/slice'
import keylessBackupReducer from 'src/keylessBackup/slice'
import { reducer as localCurrency } from 'src/localCurrency/reducer'
import { reducer as networkInfo } from 'src/networkInfo/reducer'
import nftsReducer from 'src/nfts/slice'
import pointsReducer from 'src/points/slice'
import positionsReducer from 'src/positions/slice'
import priceHistoryReducer from 'src/priceHistory/slice'
import { recipientsReducer as recipients } from 'src/recipients/reducer'
import { sendReducer as send } from 'src/send/reducers'
import swapReducer from 'src/swap/slice'
import tokenReducer from 'src/tokens/slice'
import { transactionInFlightReducer } from 'src/lib/useTransactionInFlight'
import transactionsReducer from 'src/transactions/slice'
import { sentTransactionLogReducer } from 'src/viem/sentTransactionLog'
import { reducer as walletConnect } from 'src/walletConnect/reducer'
import { reducer as web3 } from 'src/web3/reducer'
import wriFeeAdapterBootstrapReducer from 'src/wri/feeAdapterBootstrap/slice'

export const reducersList = {
  app,
  i18n: i18nReducer,
  networkInfo,
  alert,
  send,
  home,
  transactions: transactionsReducer,
  web3,
  identity,
  account,
  recipients,
  localCurrency,
  imports,
  fiatExchanges,
  walletConnect,
  tokens: tokenReducer,
  dapps: dappsReducer,
  dollarsSpend: dollarsSpendReducer,
  fiatConnect: fiatConnectReducer,
  swap: swapReducer,
  positions: positionsReducer,
  keylessBackup: keylessBackupReducer,
  nfts: nftsReducer,
  priceHistory: priceHistoryReducer,
  jumpstart: jumpstartReducer,
  points: pointsReducer,
  earn: earnReducer,
  neeru: neeruReducer,
  buckspay: bucksPayReducer,
  gold: goldReducer,
  transactionInFlight: transactionInFlightReducer,
  sentTransactionLog: sentTransactionLogReducer,
  wriFeeAdapterBootstrap: wriFeeAdapterBootstrapReducer,
} as const
