import { TransactionReceipt, encodeAbiParameters, keccak256, pad, toBytes, toHex } from 'viem'
import { NEERU_CONTRACT_ADDRESS, NEERU_DEPOSIT_TOPIC0 } from 'src/earn/neeru/constants'
import { parseDepositEvent } from 'src/earn/neeru/eventParsing'

const CONTRACT = NEERU_CONTRACT_ADDRESS
const DEPOSITOR = ('0x' + 'a'.repeat(40)) as `0x${string}`
const POSITION_ID = BigInt(42)
const CATEGORY = 1
const AMOUNT = BigInt('10000000000000000000000') // 10000 * 1e18
const RATE_VALUE = BigInt('1000331300000000000000000000')

type Log = TransactionReceipt['logs'][number]

function buildDepositLog(): Log {
  const data = encodeAbiParameters(
    [{ type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }],
    [CATEGORY, AMOUNT, RATE_VALUE]
  )
  return {
    address: CONTRACT,
    topics: [
      NEERU_DEPOSIT_TOPIC0,
      pad(DEPOSITOR, { size: 32 }),
      pad(toHex(POSITION_ID), { size: 32 }),
    ] as [`0x${string}`, ...`0x${string}`[]],
    data,
    blockHash: ('0x' + '1'.repeat(64)) as `0x${string}`,
    blockNumber: BigInt(70_750_000),
    logIndex: 0,
    transactionHash: ('0x' + 'b'.repeat(64)) as `0x${string}`,
    transactionIndex: 0,
    removed: false,
  }
}

function buildReceipt(logs: Log[]): TransactionReceipt {
  return {
    blockHash: ('0x' + '1'.repeat(64)) as `0x${string}`,
    blockNumber: BigInt(70_750_000),
    contractAddress: null,
    cumulativeGasUsed: BigInt(0),
    effectiveGasPrice: BigInt(0),
    from: DEPOSITOR,
    gasUsed: BigInt(0),
    logs,
    logsBloom: ('0x' + '0'.repeat(512)) as `0x${string}`,
    status: 'success',
    to: CONTRACT,
    transactionHash: ('0x' + 'b'.repeat(64)) as `0x${string}`,
    transactionIndex: 0,
    type: 'eip1559',
  }
}

describe('parseDepositEvent', () => {
  it('returns parsed fields when the deposit log is present', () => {
    const receipt = buildReceipt([buildDepositLog()])
    const result = parseDepositEvent(receipt, CONTRACT)
    expect(result).not.toBeNull()
    expect(result?.contractPositionId).toBe(POSITION_ID.toString())
    expect(result?.amount).toBe(AMOUNT.toString())
    expect(result?.category).toBe(CATEGORY)
    expect(result?.rateValue).toBe(RATE_VALUE.toString())
  })

  it('returns null when no logs are emitted by the contract', () => {
    const stranger = ('0x' + 'c'.repeat(40)) as `0x${string}`
    const log = { ...buildDepositLog(), address: stranger }
    const receipt = buildReceipt([log])
    expect(parseDepositEvent(receipt, CONTRACT)).toBeNull()
  })

  it('returns null when logs exist but the topic0 does not match', () => {
    const noiseTopic = keccak256(toBytes('SomeOtherEvent()'))
    const log: Log = {
      ...buildDepositLog(),
      topics: [noiseTopic] as [`0x${string}`, ...`0x${string}`[]],
    }
    const receipt = buildReceipt([log])
    expect(parseDepositEvent(receipt, CONTRACT)).toBeNull()
  })

  it('lowercases the contract address before filtering', () => {
    const receipt = buildReceipt([buildDepositLog()])
    const upper = CONTRACT.toUpperCase().replace('0X', '0x') as `0x${string}`
    const result = parseDepositEvent(receipt, upper)
    expect(result).not.toBeNull()
  })
})
