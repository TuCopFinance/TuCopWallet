import networkConfig from 'src/web3/networkConfig'

export const ALLOWED_TOKEN_IDS = new Set([
  // networkConfig.celoTokenId,
  networkConfig.copmTokenId, // COPm - shown as "Pesos"
  networkConfig.usdtTokenId, // USDT - shown as "Dólares"
  networkConfig.xaut0TokenId, // XAUt0 - shown as "Oro"
])
