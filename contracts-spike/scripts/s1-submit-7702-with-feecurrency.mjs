// S1: Submit an EIP-7702 (tx type 0x04) authorization on Celo mainnet
// with CIP-64 feeCurrency = USDm or COPm.
//
// Usage:
//   node scripts/s1-submit-7702-with-feecurrency.mjs <BATCH_EXECUTOR_ADDR> <USDm|COPm>
//
// Goal: confirm whether Celo nodes accept tx 0x04 with feeCurrency != CELO,
// and whether gas is debited from the ERC-20 instead of CELO.

import { createWalletClient, createPublicClient, http, encodeFunctionData, parseAbi } from 'viem'
import { celo } from 'viem/chains'
import { mnemonicToAccount } from 'viem/accounts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MNEMONIC_PATH = resolve(process.cwd(), '..', 'docs', 'spikes', '.mnemonic.txt')
const SPIKE_MNEMONIC = readFileSync(MNEMONIC_PATH, 'utf8').trim()
const BATCH_EXECUTOR = process.argv[2]
const FEE_CURRENCY = process.argv[3] // 'USDm' | 'COPm'

if (!BATCH_EXECUTOR || !FEE_CURRENCY) {
  console.error('Usage: node scripts/s1-submit-7702-with-feecurrency.mjs <BATCH_EXECUTOR_ADDR> <USDm|COPm>')
  process.exit(1)
}

// Lowercase for downstream RPC calls (avoid checksum issues on raw eth_call)
const USDM = '0x765de816845861e75a25fca122bb6898b8b1282a'
const COPM = '0x8a567e2ae79ca692bd748ab832081c45de4041ea'

const account = mnemonicToAccount(SPIKE_MNEMONIC)
const publicClient = createPublicClient({ chain: celo, transport: http() })
const walletClient = createWalletClient({ account, chain: celo, transport: http() })

const feeCurrencyAddress = FEE_CURRENCY === 'USDm' ? USDM : COPM

console.log('================================================================')
console.log('S1: submitting EIP-7702 tx (type 0x04) with CIP-64 feeCurrency')
console.log('================================================================')
console.log('Account:           ', account.address)
console.log('Delegating to:     ', BATCH_EXECUTOR)
console.log('FeeCurrency token: ', FEE_CURRENCY)
console.log('FeeCurrency addr:  ', feeCurrencyAddress)

// Helpers to fetch raw balances via RPC (avoid viem checksum issues)
const ERC20_BALANCE_OF = '0x70a08231' // balanceOf(address)
function pad32(addrLower) {
  return addrLower.replace(/^0x/, '').padStart(64, '0')
}
async function rawBalance(tokenLower, holderLower) {
  const data = ERC20_BALANCE_OF + pad32(holderLower)
  const r = await fetch('https://forno.celo.org', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: tokenLower, data }, 'latest'],
    }),
  })
  const j = await r.json()
  return BigInt(j.result)
}
async function rawCeloBalance(holderLower) {
  const r = await fetch('https://forno.celo.org', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'eth_getBalance',
      params: [holderLower, 'latest'],
    }),
  })
  const j = await r.json()
  return BigInt(j.result)
}

const addrLower = account.address.toLowerCase()
const preCelo = await rawCeloBalance(addrLower)
const preUsdm = await rawBalance(USDM, addrLower)
const preCopm = await rawBalance(COPM, addrLower)
console.log('--- Pre-balances ---')
console.log('CELO: ', preCelo.toString())
console.log('USDm: ', preUsdm.toString())
console.log('COPm: ', preCopm.toString())

// 1. Sign EIP-7702 authorization to delegate THIS EOA -> BatchExecutor
const authorization = await walletClient.signAuthorization({
  account,
  contractAddress: BATCH_EXECUTOR,
  // The user is delegating their OWN EOA, so executor is the same account.
  // viem will use the wallet's chainId + an incremented nonce by default for self-exec.
  executor: 'self',
})
console.log('--- Authorization signed ---')
console.log('chainId:', authorization.chainId)
console.log('nonce:  ', authorization.nonce)
console.log('addr:   ', authorization.address ?? authorization.contractAddress)

// 2. Encode the call: BatchExecutor.execute([{ target: USDm, value: 0, data: balanceOf(self) }])
//    Picking a known view fn on USDm guarantees the inner call succeeds without
//    touching state — pure no-op that the BatchExecutor's `call` will not revert on.
const balanceOfCalldata = '0x70a08231' + addrLower.replace(/^0x/, '').padStart(64, '0')
const calldata = encodeFunctionData({
  abi: parseAbi(['function execute((address target, uint256 value, bytes data)[] calls)']),
  functionName: 'execute',
  args: [
    [
      { target: USDM, value: 0n, data: balanceOfCalldata },
    ],
  ],
})

// 3. Submit tx type 0x04 with feeCurrency
try {
  const hash = await walletClient.sendTransaction({
    account,
    to: account.address,
    data: calldata,
    authorizationList: [authorization],
    feeCurrency: feeCurrencyAddress,
  })
  console.log('--- Tx submitted ---')
  console.log('Hash:', hash)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('--- Receipt ---')
  console.log('Status:    ', receipt.status)
  console.log('Block:     ', receipt.blockNumber.toString())
  console.log('GasUsed:   ', receipt.gasUsed.toString())
  console.log('EffPrice:  ', (receipt.effectiveGasPrice ?? 0n).toString())
  console.log('Type:      ', receipt.type)
  console.log('Logs count:', receipt.logs.length)
  for (const log of receipt.logs) {
    console.log(' log addr=', log.address, 'topic0=', log.topics[0])
  }

  // 4. Post-balances — wait a few seconds + several blocks for the public RPC
  //    to serve up-to-date state. (Reading immediately can race on stale snapshots.)
  await new Promise((r) => setTimeout(r, 5000))
  const postCelo = await rawCeloBalance(addrLower)
  const postUsdm = await rawBalance(USDM, addrLower)
  const postCopm = await rawBalance(COPM, addrLower)
  console.log('--- Post-balances ---')
  console.log('CELO: ', postCelo.toString(), '(delta:', (postCelo - preCelo).toString(), ')')
  console.log('USDm: ', postUsdm.toString(), '(delta:', (postUsdm - preUsdm).toString(), ')')
  console.log('COPm: ', postCopm.toString(), '(delta:', (postCopm - preCopm).toString(), ')')

  // 5. Verdict per fee-currency
  console.log('--- Verdict ---')
  const celoDelta = preCelo - postCelo
  const tokenDelta = FEE_CURRENCY === 'USDm' ? preUsdm - postUsdm : preCopm - postCopm
  console.log('CELO debited:    ', celoDelta.toString())
  console.log(FEE_CURRENCY, ' debited:', tokenDelta.toString())
  if (tokenDelta > 0n && celoDelta === 0n) {
    console.log('RESULT: feeCurrency HONORED — gas paid in', FEE_CURRENCY)
  } else if (tokenDelta === 0n && celoDelta > 0n) {
    console.log('RESULT: feeCurrency IGNORED — gas paid in CELO')
  } else if (tokenDelta > 0n && celoDelta > 0n) {
    console.log('RESULT: BOTH debited — partial honor (unexpected)')
  } else {
    console.log('RESULT: NEITHER debited — unexpected, check the tx on celoscan.io')
  }
} catch (err) {
  console.error('--- SUBMIT FAILED ---')
  console.error('Message:', err?.message || String(err))
  if (err?.cause) console.error('Cause:', err.cause?.message || String(err.cause))
  if (err?.details) console.error('Details:', err.details)
  if (err?.shortMessage) console.error('Short:', err.shortMessage)
  process.exit(2)
}
