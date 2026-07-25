import { Address, TransactionReceipt, decodeAbiParameters, hexToBigInt } from 'viem'
import { NeeruMetaDataSchemaSlot } from 'src/earn/neeru/types'

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
//
// The contract address, topic0, and data schema are injected from the
// caller (typically via neeruMetaSelector) rather than read from static
// constants so runtime state can override the hardcoded fallback when the
// backend meta endpoint is reachable.
export function parseDepositEvent(
  receipt: TransactionReceipt,
  contractAddress: Address,
  topic0: `0x${string}`,
  dataSchema: readonly NeeruMetaDataSchemaSlot[]
): ParsedDepositEvent | null {
  const normalizedAddr = contractAddress.toLowerCase()
  const normalizedTopic0 = topic0.toLowerCase()
  const log = receipt.logs.find(
    (l) =>
      l.address.toLowerCase() === normalizedAddr && l.topics[0]?.toLowerCase() === normalizedTopic0
  )
  if (!log) return null
  if (!log.topics[2]) return null

  try {
    const [categoryRaw, amountRaw, rateRaw] = decodeAbiParameters(dataSchema, log.data) as [
      number,
      bigint,
      bigint,
      bigint,
    ]
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
