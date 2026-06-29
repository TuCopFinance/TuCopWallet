import { TransactionReceipt, encodeEventTopics, keccak256, toBytes, toHex } from 'viem'
import { fondoCOPmMVPAbi } from 'src/earn/neeru/abi'
import { FONDO_COPM_MVP_ADDRESS } from 'src/earn/neeru/constants'
import { parseDepositEvent } from 'src/earn/neeru/eventParsing'

const CONTRACT = FONDO_COPM_MVP_ADDRESS as `0x${string}`
const DEPOSITOR = ('0x' + 'a'.repeat(40)) as `0x${string}`
const POSITION_ID = BigInt(42)
const TRANCHE = 1
const PRINCIPAL = BigInt('10000000000000000000000') // 10000 * 1e18
const DAILY_RATE_RAY = BigInt('1000331300000000000000000000')

type Log = TransactionReceipt['logs'][number]

function buildDepositLog(): Log {
  const topics = encodeEventTopics({
    abi: fondoCOPmMVPAbi,
    eventName: 'Deposit',
    args: { depositor: DEPOSITOR, positionId: POSITION_ID },
  })
  const trancheBytes = toBytes(TRANCHE, { size: 32 })
  const principalBytes = toBytes(PRINCIPAL, { size: 32 })
  const dailyRateBytes = toBytes(DAILY_RATE_RAY, { size: 32 })
  const data = ('0x' +
    Buffer.from([...trancheBytes, ...principalBytes, ...dailyRateBytes]).toString(
      'hex'
    )) as `0x${string}`
  return {
    address: CONTRACT,
    topics: [...topics] as [`0x${string}`, ...`0x${string}`[]],
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
  it('returns parsed fields when the Deposit log is present', () => {
    const receipt = buildReceipt([buildDepositLog()])
    const result = parseDepositEvent(receipt, CONTRACT)
    expect(result).not.toBeNull()
    expect(result?.contractPositionId).toBe(POSITION_ID.toString())
    expect(result?.principal).toBe(PRINCIPAL.toString())
    expect(result?.tranche).toBe(TRANCHE)
    expect(result?.dailyRateRay).toBe(DAILY_RATE_RAY.toString())
  })

  it('returns null when no logs are emitted by the contract', () => {
    const stranger = ('0x' + 'c'.repeat(40)) as `0x${string}`
    const log = { ...buildDepositLog(), address: stranger }
    const receipt = buildReceipt([log])
    expect(parseDepositEvent(receipt, CONTRACT)).toBeNull()
  })

  it('returns null when logs exist but none match the Deposit signature', () => {
    const noiseTopic = keccak256(toHex('NotDeposit()'))
    const log: Log = {
      ...buildDepositLog(),
      topics: [noiseTopic],
      data: '0x' as `0x${string}`,
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
