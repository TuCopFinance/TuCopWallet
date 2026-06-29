// Control test: submit EIP-7702 (tx type 0x04) WITHOUT feeCurrency.
// Confirms that 7702 itself works on Celo mainnet, paying gas in CELO.
// This isolates the "does CIP-64 + 0x04 unify?" question.

import { createWalletClient, createPublicClient, http, encodeFunctionData, parseAbi } from 'viem'
import { celo } from 'viem/chains'
import { mnemonicToAccount } from 'viem/accounts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MNEMONIC_PATH = resolve(process.cwd(), '..', 'docs', 'spikes', '.mnemonic.txt')
const SPIKE_MNEMONIC = readFileSync(MNEMONIC_PATH, 'utf8').trim()
const BATCH_EXECUTOR = process.argv[2]

if (!BATCH_EXECUTOR) {
  console.error('Usage: node scripts/s1-submit-7702-celo-gas.mjs <BATCH_EXECUTOR_ADDR>')
  process.exit(1)
}

const USDM = '0x765de816845861e75a25fca122bb6898b8b1282a'
const account = mnemonicToAccount(SPIKE_MNEMONIC)
const publicClient = createPublicClient({ chain: celo, transport: http() })
const walletClient = createWalletClient({ account, chain: celo, transport: http() })

console.log('Account:        ', account.address)
console.log('Delegating to:  ', BATCH_EXECUTOR)
console.log('Fee currency:   CELO (no feeCurrency override)')

const addrLower = account.address.toLowerCase()
const balanceOfCalldata = '0x70a08231' + addrLower.replace(/^0x/, '').padStart(64, '0')

const authorization = await walletClient.signAuthorization({
  account,
  contractAddress: BATCH_EXECUTOR,
  executor: 'self',
})
console.log('Auth signed: chainId=', authorization.chainId, 'nonce=', authorization.nonce)

const calldata = encodeFunctionData({
  abi: parseAbi(['function execute((address target, uint256 value, bytes data)[] calls)']),
  functionName: 'execute',
  args: [[{ target: USDM, value: 0n, data: balanceOfCalldata }]],
})

try {
  const hash = await walletClient.sendTransaction({
    account,
    to: account.address,
    data: calldata,
    authorizationList: [authorization],
  })
  console.log('Tx submitted:', hash)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log('Status:', receipt.status, 'type:', receipt.type, 'gasUsed:', receipt.gasUsed.toString())

  await new Promise((r) => setTimeout(r, 5000))
  const r = await fetch('https://forno.celo.org', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [addrLower, 'latest'] }),
  })
  const code = (await r.json()).result
  console.log('Wallet code after tx:', code)
  console.log('Has 7702 delegation? (prefix ef0100)', code.startsWith('0xef0100'))

  // Also check the raw tx envelope
  const r2 = await fetch('https://forno.celo.org', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [hash] }),
  })
  const tx = (await r2.json()).result
  console.log('Tx type:', tx.type, 'authList:', tx.authorizationList ? tx.authorizationList.length : 'null')
} catch (err) {
  console.error('FAILED:', err?.shortMessage || err?.message || String(err))
  process.exit(2)
}
