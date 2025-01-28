import networkConfig from 'src/web3/networkConfig'

export const ALLOWED_TOKEN_IDS = new Set([
  networkConfig.celoTokenId,
  networkConfig.cusdTokenId,
  networkConfig.ccopTokenId,
  networkConfig.usdtTokenId,
])
