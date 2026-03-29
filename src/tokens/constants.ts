import networkConfig from 'src/web3/networkConfig'

export const ALLOWED_TOKEN_IDS = new Set([
  // networkConfig.celoTokenId,
  // networkConfig.cusdTokenId,
  networkConfig.copmTokenId,
  networkConfig.usdtTokenId,
  // XAUt0 is handled separately in the gold module, not in main token list
])
