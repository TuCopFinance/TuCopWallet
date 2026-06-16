import { createWalletClient, createPublicClient, http, encodeFunctionData, parseAbi, zeroAddress } from 'viem'
import { celo } from 'viem/chains'
import { mnemonicToAccount } from 'viem/accounts'
import { readFileSync } from 'node:fs'

const MNEMONIC = readFileSync('docs/spikes/.mnemonic.txt', 'utf8').trim()
const account = mnemonicToAccount(MNEMONIC)
const publicClient = createPublicClient({ chain: celo, transport: http('https://forno.celo.org') })
const walletClient = createWalletClient({ account, chain: celo, transport: http('https://forno.celo.org') })

const CELO_ERC20 = '0x471EcE3750Da237f93B8E339c536989b8978a438'
const USDM = '0x765DE816845861e75A25fCA122bb6898B8B1282a'
const COPM = '0x8a567e2aE79CA692Bd748aB832081C45de4041eA'

const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
])

async function getQuote(sellToken, buyToken, sellAmountWei) {
  const params = new URLSearchParams({
    sellToken,
    buyToken,
    sellAmount: sellAmountWei.toString(),
    sellNetworkId: 'celo-mainnet',
    buyNetworkId: 'celo-mainnet',
    sellIsNative: 'false',
    buyIsNative: 'false',
    userAddress: account.address,
    slippagePercentage: '0.5',
  })
  const res = await fetch(`https://api.mainnet.valora.xyz/getSwapQuote?${params}`)
  if (!res.ok) throw new Error(`Quote failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function swap(label, buyToken, sellAmountWei) {
  console.log(`\n=== ${label} ===`)
  console.log(`Selling ${sellAmountWei} wei CELO for ${buyToken}`)
  const quote = await getQuote(CELO_ERC20, buyToken, sellAmountWei)
  if (!quote.unvalidatedSwapTransaction) {
    console.error('No quote available')
    console.error(JSON.stringify(quote, null, 2).slice(0, 500))
    return
  }
  const tx = quote.unvalidatedSwapTransaction
  console.log('Provider:', quote.details?.swapProvider)
  console.log('Expected buy amount:', tx.buyAmount)
  console.log('Allowance target:', tx.allowanceTarget)
  console.log('Swap target:', tx.to)

  // Approve if needed
  if (tx.allowanceTarget && tx.allowanceTarget !== zeroAddress) {
    const current = await publicClient.readContract({
      address: CELO_ERC20,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account.address, tx.allowanceTarget],
    })
    const required = BigInt(tx.sellAmount)
    if (current < required) {
      console.log(`Approving ${required} CELO to ${tx.allowanceTarget}...`)
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [tx.allowanceTarget, required],
      })
      const approveHash = await walletClient.sendTransaction({
        account,
        to: CELO_ERC20,
        data: approveData,
      })
      console.log('Approve tx:', approveHash)
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
      console.log('Approve status:', approveReceipt.status)
    } else {
      console.log('Allowance already sufficient')
    }
  }

  // Submit swap
  const swapHash = await walletClient.sendTransaction({
    account,
    to: tx.to,
    data: tx.data,
    value: BigInt(tx.value || 0),
    gas: BigInt(tx.gas) * 2n,
  })
  console.log('Swap tx:', swapHash)
  const receipt = await publicClient.waitForTransactionReceipt({ hash: swapHash })
  console.log('Swap status:', receipt.status, 'gasUsed:', receipt.gasUsed)

  // Verify new balance
  const newBalance = await publicClient.readContract({
    address: buyToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  })
  console.log(`New ${buyToken} balance:`, newBalance.toString())
}

const TEN_CELO = 10_000000000000000000n  // 10 * 10^18

await swap('CELO -> USDm', USDM, TEN_CELO)
await swap('CELO -> COPm', COPM, TEN_CELO)

console.log('\n=== Final balances ===')
const finalCelo = await publicClient.getBalance({ address: account.address })
const finalUsdm = await publicClient.readContract({ address: USDM, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] })
const finalCopm = await publicClient.readContract({ address: COPM, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] })
console.log(`CELO: ${Number(finalCelo) / 1e18}`)
console.log(`USDm: ${Number(finalUsdm) / 1e18}`)
console.log(`COPm: ${Number(finalCopm) / 1e18}`)
