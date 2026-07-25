import { Address, TransactionReceipt, decodeAbiParameters, hexToBigInt } from 'viem'
import { DEPOSIT_EVENT_DATA_SCHEMA } from 'src/earn/neeru/abi'
import { NEERU_DEPOSIT_TOPIC0 } from 'src/earn/neeru/constants'

interface ParsedDepositEvent {
  contractPositionId: string
  amount: string
  category: number
  rateValue: string
}

// Parses the earn-vault Deposit event from a transaction receipt. Filters
// by contract address so unrelated logs in the same receipt are ignored,
// and by topic0 so only the target event decodes. Returns null when no
// matching log is present or the payload does not decode, so callers can
// fall back to the normal backend-fetch flow without throwing.
export function parseDepositEvent(
  receipt: TransactionReceipt,
  contractAddress: Address
): ParsedDepositEvent | null {
  const normalizedAddr = contractAddress.toLowerCase()
  const normalizedTopic0 = NEERU_DEPOSIT_TOPIC0.toLowerCase()
  const log = receipt.logs.find(
    (l) =>
      l.address.toLowerCase() === normalizedAddr && l.topics[0]?.toLowerCase() === normalizedTopic0
  )
  if (!log) return null
  if (!log.topics[2]) return null

  try {
    const [categoryRaw, amountRaw, rateRaw] = decodeAbiParameters(
      DEPOSIT_EVENT_DATA_SCHEMA,
      log.data
    ) as [number, bigint, bigint, bigint]
    return {
      contractPositionId: hexToBigInt(log.topics[2]).toString(),
      amount: amountRaw.toString(),
      category: Number(categoryRaw),
      rateValue: rateRaw.toString(),
    }
  } catch {
    return null
  }
}
