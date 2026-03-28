# Blockchain Integration

## Overview

TuCOP Wallet interacts with the Celo blockchain (L2) using **Viem** as the
primary web3 library. The wallet supports Celo Mainnet and Celo Sepolia testnet.

## Network Configuration

Location: `src/web3/networkConfig.ts`

### Networks

| Network      | Chain ID | RPC                    | Explorer                    |
| ------------ | -------- | ---------------------- | --------------------------- |
| Celo Mainnet | 42220    | forno.celo.org         | celoscan.io                 |
| Celo Sepolia | 44220    | celo-sepolia.infura.io | celo-sepolia.blockscout.com |

### Token Configuration

```typescript
// Token ID format
const tokenId = `${networkId}:${contractAddress.toLowerCase()}`

// Examples
const COPM_MAINNET = 'celo-mainnet:0x8a567e2ae79ca692bd748ab832081c45de4041ea'
const USDT_MAINNET = 'celo-mainnet:0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e'
```

---

## Viem Integration

Location: `src/viem/`

### Client Setup

```typescript
// src/viem/index.ts
import { createPublicClient, createWalletClient, http } from 'viem'
import { celo, celoAlfajores } from 'viem/chains'

export const publicClient = createPublicClient({
  chain: celo,
  transport: http('https://forno.celo.org'),
})

export const walletClient = createWalletClient({
  chain: celo,
  transport: http('https://forno.celo.org'),
})
```

### Gas Estimation (Celo L2)

Location: `src/viem/celoGasConfig.ts`

Celo L2 uses EIP-4337 style gas estimation:

```typescript
export async function estimateGas(tx: TransactionRequest) {
  // Celo L2 supports fee currencies (pay gas in stablecoins)
  const gasEstimate = await publicClient.estimateGas({
    ...tx,
    feeCurrency: USDT_ADDRESS, // Optional: pay in USDT
  })

  return gasEstimate
}
```

### Fee Currencies

Celo allows paying gas in stablecoins:

```typescript
const FEE_CURRENCIES = [
  CELO_ADDRESS, // Native (default)
  USDT_ADDRESS, // Pay in USDT
  COPM_ADDRESS, // Pay in COPm
  USDM_ADDRESS, // Pay in USDm
]
```

---

## Wallet Management

Location: `src/web3/`

### Key Storage

Private keys are stored securely using:

- iOS: Keychain Services
- Android: Encrypted SharedPreferences + Keystore

```typescript
// src/storage/keychain.ts
export async function getPrivateKey(): Promise<string> {
  return await Keychain.getGenericPassword('wallet_key')
}

export async function setPrivateKey(key: string): Promise<void> {
  await Keychain.setGenericPassword('wallet_key', key)
}
```

### Account Derivation

```typescript
// BIP-39 mnemonic to account
import { mnemonicToAccount } from 'viem/accounts'

const account = mnemonicToAccount(mnemonic, {
  addressIndex: 0,
  path: "m/44'/52752'/0'/0/0", // Celo derivation path
})
```

---

## Token Operations

### Reading Balances

```typescript
// src/tokens/saga.ts
export function* fetchTokenBalances() {
  const address = yield select(walletAddressSelector)

  const balances = yield call(publicClient.multicall, {
    contracts: tokens.map((token) => ({
      address: token.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    })),
  })

  yield put(setBalances(balances))
}
```

### Sending Tokens

```typescript
// src/send/saga.ts
export function* sendTokenSaga(action: SendAction) {
  const { to, amount, tokenId } = action.payload

  // Get token info
  const token = yield select(tokenByIdSelector(tokenId))

  // Prepare transaction
  const tx = {
    to: token.address,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to, parseUnits(amount, token.decimals)],
    }),
  }

  // Estimate gas
  const gas = yield call(estimateGas, tx)

  // Sign and send
  const hash = yield call(signAndSendTransaction, { ...tx, gas })

  yield put(transactionSent({ hash, ...action.payload }))
}
```

---

## Contract ABIs

Location: `src/abis/`

Common ABIs:

- `erc20.json` - Standard ERC-20 token
- `stableToken.json` - Mento stablecoin extensions
- `uniswapV2.json` - DEX interactions

### Using ABIs

```typescript
import erc20Abi from 'src/abis/erc20.json'
import { getContract } from 'viem'

const tokenContract = getContract({
  address: tokenAddress,
  abi: erc20Abi,
  publicClient,
})

const balance = await tokenContract.read.balanceOf([userAddress])
```

---

## Transaction Types

### Simple Transfer

```typescript
// Native CELO transfer
const tx = {
  to: recipientAddress,
  value: parseEther('1.0'),
}
```

### ERC-20 Transfer

```typescript
const tx = {
  to: tokenAddress,
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [recipientAddress, amount],
  }),
}
```

### Approve + Swap

```typescript
// 1. Approve DEX to spend tokens
const approveTx = {
  to: tokenAddress,
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [dexAddress, amount],
  }),
}

// 2. Execute swap
const swapTx = {
  to: dexAddress,
  data: encodeFunctionData({
    abi: dexAbi,
    functionName: 'swap',
    args: [tokenIn, tokenOut, amount, minAmountOut],
  }),
}
```

---

## WalletConnect

Location: `src/walletConnect/`

WalletConnect v2 integration for DApp connectivity:

```typescript
// Initialize WalletConnect
import { WalletConnectClient } from '@walletconnect/client'

const client = await WalletConnectClient.init({
  projectId: WALLETCONNECT_PROJECT_ID,
  metadata: {
    name: 'TuCOP Wallet',
    description: 'Colombian crypto wallet',
    url: 'https://tucop.co',
    icons: ['https://tucop.co/icon.png'],
  },
})

// Handle session proposals
client.on('session_proposal', async (proposal) => {
  // Show approval screen to user
  navigation.navigate(Screens.WalletConnectRequest, { proposal })
})
```

---

## Price Feeds

### CoinGecko Integration

```typescript
// src/tokens/saga.ts
const COINGECKO_API = 'https://api.coingecko.com/api/v3'

export async function fetchPrices(tokenIds: string[]) {
  const response = await fetch(
    `${COINGECKO_API}/simple/price?ids=${tokenIds.join(',')}&vs_currencies=usd,cop`
  )
  return response.json()
}
```

### Token Price Mapping

```typescript
const COINGECKO_IDS = {
  'celo-mainnet:0x471ece37...': 'celo',
  'celo-mainnet:0x48065fbb...': 'tether',
  'celo-mainnet:0xaf37e8b6...': 'tether-gold',
}
```

---

## Error Handling

### Transaction Errors

```typescript
try {
  const hash = await sendTransaction(tx)
} catch (error) {
  if (error.code === 'INSUFFICIENT_FUNDS') {
    yield put(setError('Insufficient balance'))
  } else if (error.code === 'USER_REJECTED') {
    yield put(setError('Transaction cancelled'))
  } else {
    Logger.error('Transaction', 'Send failed', error)
    yield put(setError('Transaction failed'))
  }
}
```

### Network Errors

```typescript
// Retry logic with exponential backoff
async function fetchWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await delay(1000 * Math.pow(2, i))
    }
  }
}
```

---

## Best Practices

1. **Always estimate gas** - Never hardcode gas limits
2. **Use multicall** - Batch RPC calls when possible
3. **Handle all errors** - Transaction failures, network issues
4. **Validate addresses** - Check format before sending
5. **Show confirmations** - Always confirm before signing
6. **Log transactions** - Track for debugging and support
7. **Use fee currencies** - Let users pay gas in stablecoins
