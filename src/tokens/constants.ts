import networkConfig from 'src/web3/networkConfig'

const allowedTokenIds = [
  // networkConfig.celoTokenId,
  networkConfig.copmTokenId, // COPm - shown as "Pesos"
  networkConfig.usdtTokenId, // USDT - shown as "Dolares"
  networkConfig.usdcTokenId, // USDC - shown as "Dolares"
  networkConfig.usdmTokenId, // USDm (cUSD contract) - shown as "Dolares"
  networkConfig.xaut0TokenId, // XAUt0 - shown as "Oro"
]

// USAT only when present (Celo mainnet only for V1)
if (networkConfig.usatTokenId) {
  allowedTokenIds.push(networkConfig.usatTokenId)
}

export const ALLOWED_TOKEN_IDS = new Set(allowedTokenIds)
