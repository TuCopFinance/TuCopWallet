// Workaround pattern: after a one-time 0x04 delegation tx (paid in CELO),
// can a subsequent CIP-64 tx (0x7b, no authList) call BatchExecutor.execute()
// on the delegated EOA, with feeCurrency = USDm/COPm?
//
// This is the practical Track-C pattern: pay CELO once to set delegation,
// then all batched swaps run as CIP-64 against the delegated EOA.

import { createWalletClient, createPublicClient, http, encodeFunctionData, parseAbi } from 'viem'
import { celo } from 'viem/chains'
import { mnemonicToAccount } from 'viem/accounts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MNEMONIC_PATH = resolve(process.cwd(), '..', 'docs', 'spikes', '.mnemonic.txt')
const SPIKE_MNEMONIC = readFileSync(MNEMONIC_PATH, 'utf8').trim()
const FEE_CURRENCY = process.argv[2] // 'USDm' | 'COPm'

if (!FEE_CURRENCY) {
  console.error('Usage: node scripts/s1-cip64-against-delegated-eoa.mjs <USDm|COPm>')
  process.exit(1)
}

const USDM = '0x765de816845861e75a25fca122bb6898b8b1282a'
const COPM = '0x8a567e2ae79ca692bd748ab832081c45de4041ea'

const account = mnemonicToAccount(SPIKE_MNEMONIC)
const publicClient = createPublicClient({ chain: celo, transport: http() })
const walletClient = createWalletClient({ account, chain: celo, transport: http() })

const feeCurrencyAddress = FEE_CURRENCY === 'USDm' ? USDM : COPM
const addrLower = account.address.toLowerCase()

console.log('Account (delegated):', account.address)
console.log('feeCurrency:        ', FEE_CURRENCY, feeCurrencyAddress)

// Confirm delegation is currently set on the EOA
const codeRes = await fetch('https://forno.celo.org', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [addrLower, 'latest'] }),
})
const code = (await codeRes.json()).result
console.log('EOA code:', code)
console.log('Delegated?', code.startsWith('0xef0100'))
if (!code.startsWith('0xef0100')) {
  console.error('EOA is not delegated — re-run s1-submit-7702-celo-gas.mjs first.')
  process.exit(3)
}

const balanceOfCalldata = '0x70a08231' + addrLower.replace(/^0x/, '').padStart(64, '0')
const calldata = encodeFunctionData({
  abi: parseAbi(['function execute((address target, uint256 value, bytes data)[] calls)']),
  functionName: 'execute',
  args: [[{ target: USDM, value: 0n, data: balanceOfCalldata }]],
})

async function rawCelo() {
  const r = await fetch('https://forno.celo.org', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [addrLower, 'latest'] }),
  })
  return BigInt((await r.json()).result)
}
async function rawErc20(token) {
  const r = await fetch('https://forno.celo.org', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to: token, data: balanceOfCalldata }, 'latest'],
    }),
  })
  return BigInt((await r.json()).result)
}

const preCelo = await rawCelo()
const preUsdm = await rawErc20(USDM)
const preCopm = await rawErc20(COPM)
console.log('Pre — CELO:', preCelo.toString(), 'USDm:', preUsdm.toString(), 'COPm:', preCopm.toString())

try {
  const hash = await walletClient.sendTransaction({
    account,
    to: account.address,    // calls into the delegated EOA = runs BatchExecutor.execute()
    data: calldata,
    feeCurrency: feeCurrencyAddress,  // CIP-64 envelope, type 0x7b
  })
  console.log('Tx submitted:', hash)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Status:', receipt.status, 'type:', receipt.type, 'gasUsed:', receipt.gasUsed.toString())
  for (const log of receipt.logs) {
    console.log(' log addr=', log.address, 'topic0=', log.topics[0])
  }

  await new Promise((r) => setTimeout(r, 5000))
  const postCelo = await rawCelo()
  const postUsdm = await rawErc20(USDM)
  const postCopm = await rawErc20(COPM)
  console.log('Post — CELO:', postCelo.toString(), 'USDm:', postUsdm.toString(), 'COPm:', postCopm.toString())
  console.log('Deltas — CELO:', (postCelo - preCelo).toString(), 'USDm:', (postUsdm - preUsdm).toString(), 'COPm:', (postCopm - preCopm).toString())

  const celoDelta = preCelo - postCelo
  const tokenDelta = FEE_CURRENCY === 'USDm' ? preUsdm - postUsdm : preCopm - postCopm
  if (tokenDelta > 0n && celoDelta === 0n) {
    console.log('RESULT: feeCurrency HONORED — gas paid in', FEE_CURRENCY, '(against delegated EOA)')
  } else {
    console.log('RESULT: unexpected — CELO delta', celoDelta.toString(), 'token delta', tokenDelta.toString())
  }
} catch (err) {
  console.error('FAILED:', err?.shortMessage || err?.message || String(err))
  process.exit(2)
}
