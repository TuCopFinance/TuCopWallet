interface SentryTransactionInfo {
  name: string
  op: string
}

// Only spans that are actually started/finished today. The previous enum
// declared 8 more transactions (FetchBalances, SendPayment, PincodeEnter,
// WalletConnectConnection, ...) but no callsite ever created them, so
// keeping them here signaled coverage that did not exist. Bring back
// entries only alongside the startTransaction / finishTransaction call
// that uses them.
export enum SentryTransaction {
  app_init_saga = 'AppInitSaga',
}

type values = (typeof SentryTransaction)[keyof typeof SentryTransaction]

export const SentryTransactions: Record<values, SentryTransactionInfo> = {
  AppInitSaga: {
    name: 'App Init Saga',
    op: 'app_init_saga',
  },
}
