import { ChainId, deadlineFromMinutes, Mento } from '@mento-protocol/mento-sdk'
import dotenv from 'dotenv'
import {
  Address,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  getAddress,
  Hex,
  http,
  parseUnits,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celo } from 'viem/chains'
import {
  E2E_TEST_FAUCET,
  E2E_TEST_WALLET,
  E2E_TEST_WALLET_SECURE_SEND,
  REFILL_TOKENS,
} from './consts'
import { checkBalance, getCeloTokensBalance } from './utils'

const RPC_URL = 'https://forno.celo.org/'

const publicClient = createPublicClient({ chain: celo, transport: http(RPC_URL) })

dotenv.config({ path: `${__dirname}/../.env` })

const valoraTestFaucetSecret = process.env['E2E_TEST_FAUCET_SECRET']!

interface Token {
  symbol: string
  address: Address // Mento expects address to be in checksum format, or else it won't find the trading pair
  decimals: number
}

const CELO: Token = {
  symbol: 'CELO',
  address: getAddress('0x471ece3750da237f93b8e339c536989b8978a438'),
  decimals: 18,
}
const CUSD: Token = {
  symbol: 'cUSD',
  address: getAddress('0x765de816845861e75a25fca122bb6898b8b1282a'),
  decimals: 18,
}
const CEUR: Token = {
  symbol: 'cEUR',
  address: getAddress('0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73'),
  decimals: 18,
}
const TOKENS_BY_SYMBOL: Record<string, Token> = {
  CELO,
  cUSD: CUSD,
  cEUR: CEUR,
}

;(async () => {
  const walletsToBeFunded: Address[] = [E2E_TEST_WALLET, E2E_TEST_WALLET_SECURE_SEND]
  const walletBalances = await Promise.all(walletsToBeFunded.map(getCeloTokensBalance))
  for (let i = 0; i < walletsToBeFunded.length; i++) {
    console.log(`Initial balance for ${walletsToBeFunded[i]}:`)
    console.table(walletBalances[i])
  }

  const faucetTokenBalances = (await getCeloTokensBalance(E2E_TEST_FAUCET)) ?? {}
  console.log(`Initial balance for faucet at: ${E2E_TEST_FAUCET}:`)
  console.table(faucetTokenBalances)

  // Connect Valora E2E Test Faucet - Private Key Stored in GitHub Secrets
  const faucetAccount = privateKeyToAccount(valoraTestFaucetSecret as Hex)
  const walletClient = createWalletClient({
    account: faucetAccount,
    chain: celo,
    transport: http(RPC_URL),
  })
  const mento = await Mento.create(ChainId.CELO, RPC_URL)

  // Balance Faucet
  let totalTokenHoldings = 0 // the absolute number of faucet tokens the faucet is holding
  Object.entries(faucetTokenBalances).forEach(([tokenSymbol, tokenBalance]) => {
    if (REFILL_TOKENS.includes(tokenSymbol)) {
      totalTokenHoldings += tokenBalance
    }
  })
  const targetFaucetTokenBalance = totalTokenHoldings / REFILL_TOKENS.length

  async function sendCallParams(params: {
    to: string
    data: string
    value: string
  }): Promise<{ hash: Hex; status: 'success' | 'reverted' }> {
    const hash = await walletClient.sendTransaction({
      to: params.to as Address,
      data: params.data as Hex,
      value: BigInt(params.value),
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    return { hash, status: receipt.status }
  }

  async function swapSell(
    sellToken: Token,
    buyToken: Token,
    sellAmount: number, // in decimal
    maxSlippagePercent: number
  ) {
    try {
      const sellAmountInSmallestUnit = parseUnits(sellAmount.toString(), sellToken.decimals)
      const quoteAmountOut = await mento.quotes.getAmountOut(
        sellToken.address,
        buyToken.address,
        sellAmountInSmallestUnit
      )
      console.log(
        `Selling ${sellAmount} ${sellToken.symbol} for ~${formatUnits(
          quoteAmountOut,
          buyToken.decimals
        )} ${buyToken.symbol} with max slippage of ${maxSlippagePercent}%.`
      )

      // buildSwapTransaction returns approval (if needed) + swap in one shot
      const { approval, swap } = await mento.swap.buildSwapTransaction(
        sellToken.address,
        buyToken.address,
        sellAmountInSmallestUnit,
        faucetAccount.address,
        faucetAccount.address,
        { slippageTolerance: maxSlippagePercent, deadline: deadlineFromMinutes(5) }
      )

      if (approval) {
        const allowanceResult = await sendCallParams(approval)
        console.log(
          `Received allowance tx hash ${allowanceResult.hash} with status ${allowanceResult.status}`
        )
      }

      const swapResult = await sendCallParams(swap.params)
      console.log(`Received swap tx hash ${swapResult.hash} with status ${swapResult.status}`)
      if (swapResult.status !== 'success') {
        throw new Error(`Swap reverted. Tx hash: ${swapResult.hash}`)
      }
    } catch (err) {
      console.log(`Failed to sell ${sellToken.symbol} for ${buyToken.symbol}`, err)
    }
  }

  async function swapBuy(
    sellToken: Token,
    buyToken: Token,
    buyAmount: number, // in decimal
    maxSlippagePercent: number
  ) {
    try {
      const buyAmountInSmallestUnit = parseUnits(buyAmount.toString(), buyToken.decimals)

      // mento-sdk v3 only exposes getAmountOut (exact-input). For exact-output
      // semantics (target a specific buyAmount), estimate the required sellAmount
      // by probing the price: quote 1 unit of sellToken -> X units of buyToken,
      // then sellAmount ~= buyAmount / X. Inflate by maxSlippagePercent to cover
      // execution slippage.
      const probeAmount = parseUnits('1', sellToken.decimals)
      const probeOut = await mento.quotes.getAmountOut(
        sellToken.address,
        buyToken.address,
        probeAmount
      )
      // priceBuyPerSell (in smallest units of both tokens)
      // sellAmountSmallest = buyAmountSmallest * probeAmount / probeOut
      const estimatedSellAmount =
        (buyAmountInSmallestUnit * probeAmount) / (probeOut === 0n ? 1n : probeOut)
      const slippageNumerator = BigInt(Math.round((100 + maxSlippagePercent) * 100))
      const sellAmountWithSlippage = (estimatedSellAmount * slippageNumerator) / 10_000n

      console.log(
        `Buying ${buyAmount} ${buyToken.symbol} with ~${formatUnits(sellAmountWithSlippage, sellToken.decimals)} ${sellToken.symbol} with max slippage of ${maxSlippagePercent}%.`
      )

      const { approval, swap } = await mento.swap.buildSwapTransaction(
        sellToken.address,
        buyToken.address,
        sellAmountWithSlippage,
        faucetAccount.address,
        faucetAccount.address,
        { slippageTolerance: maxSlippagePercent, deadline: deadlineFromMinutes(5) }
      )

      if (approval) {
        const allowanceResult = await sendCallParams(approval)
        console.log(
          `Received allowance tx hash ${allowanceResult.hash} with status ${allowanceResult.status}`
        )
      }

      const swapResult = await sendCallParams(swap.params)
      console.log(`Received swap tx hash ${swapResult.hash} with status ${swapResult.status}`)
      if (swapResult.status !== 'success') {
        throw new Error(`Swap reverted. Tx hash: ${swapResult.hash}`)
      }
    } catch (err) {
      console.log(`Failed to buy ${buyToken.symbol} with ${sellToken.symbol}`, err)
    }
  }

  // Ensure that the faucet has enough balance for each refill tokens
  for (const [tokenSymbol, tokenBalance] of Object.entries(faucetTokenBalances)) {
    if (!REFILL_TOKENS.includes(tokenSymbol)) {
      continue
    }

    if (tokenBalance >= targetFaucetTokenBalance) {
      console.log(
        `${tokenSymbol} balance is ${tokenBalance}, which is higher than target ${targetFaucetTokenBalance}.`
      )
      const sellAmount = tokenBalance - targetFaucetTokenBalance
      await swapSell(
        TOKENS_BY_SYMBOL[tokenSymbol],
        tokenSymbol === 'CELO' ? CUSD : CELO,
        sellAmount,
        1
      )
    } else {
      console.log(
        `${tokenSymbol} balance is ${tokenBalance}, which is lower than target ${targetFaucetTokenBalance}.`
      )
      const buyAmount = targetFaucetTokenBalance - tokenBalance
      await swapBuy(
        tokenSymbol === 'CELO' ? CUSD : CELO,
        TOKENS_BY_SYMBOL[tokenSymbol],
        buyAmount,
        1
      )
    }
  }

  async function transferToken(
    token: Token,
    amount: string, // in decimal
    to: Address
  ): Promise<{ hash: Hex; status: 'success' | 'reverted' }> {
    const erc20TransferAbi = [
      {
        type: 'function',
        name: 'transfer',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
      },
    ] as const

    const amountInSmallestUnit = parseUnits(amount, token.decimals)
    const data = encodeFunctionData({
      abi: erc20TransferAbi,
      functionName: 'transfer',
      args: [to, amountInSmallestUnit],
    })

    const hash = await walletClient.sendTransaction({
      to: token.address,
      data,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    console.log(`Received transfer tx hash ${hash} with status ${receipt.status}`)

    if (receipt.status !== 'success') {
      throw new Error(`Transfer reverted. Tx hash: ${hash}`)
    }

    return { hash, status: receipt.status }
  }

  // Set Amount To Send
  const amountToSend = '10'

  for (let i = 0; i < walletsToBeFunded.length; i++) {
    const walletAddress = walletsToBeFunded[i]
    const walletBalance = walletBalances[i]
    for (const tokenSymbol of REFILL_TOKENS) {
      // @ts-ignore
      if (walletBalance && walletBalance[tokenSymbol] < 20) {
        console.log(`Sending ${amountToSend} ${tokenSymbol} to ${walletAddress}`)
        await transferToken(TOKENS_BY_SYMBOL[tokenSymbol], amountToSend, walletAddress)
      }
    }
  }
  console.log('Finished funding wallets.')

  // Log Balances
  console.log('E2E Test Account:', E2E_TEST_WALLET)
  console.table(await getCeloTokensBalance(E2E_TEST_WALLET))
  console.log('E2E Test Account Secure Send:', E2E_TEST_WALLET_SECURE_SEND)
  console.table(await getCeloTokensBalance(E2E_TEST_WALLET_SECURE_SEND))
  console.log('Valora Test Faucet:', E2E_TEST_FAUCET)
  console.table(await getCeloTokensBalance(E2E_TEST_FAUCET))

  await checkBalance(E2E_TEST_WALLET)
  await checkBalance(E2E_TEST_WALLET_SECURE_SEND)
})()
