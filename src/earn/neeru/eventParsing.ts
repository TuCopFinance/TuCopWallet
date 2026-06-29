import { Address, TransactionReceipt, parseEventLogs } from 'viem'
import { NULL_ABI } from 'src/earn/neeru/abi'

interface ParsedDepositEvent {
  contractPositionId: string
  principal: string
  tranche: number
  rateValue: string
}

// Parses the Deposit event emitted by FondoCOPmMVP from a transaction
// receipt's logs. Filters by the contract address so unrelated logs in
// the same receipt are ignored. Returns null if no matching event is
// found (e.g. wrong receipt, ABI drift), so callers can fall back to
// the normal backend-fetch flow without throwing.
export function parseDepositEvent(
  receipt: TransactionReceipt,
  contractAddress: Address
): ParsedDepositEvent | null {
  const normalized = contractAddress.toLowerCase()
  const relevantLogs = receipt.logs.filter((log) => log.address.toLowerCase() === normalized)
  if (relevantLogs.length === 0) return null

  const events = parseEventLogs({
    abi: NULL_ABI,
    eventName: 'Deposit',
    logs: relevantLogs,
  })
  const first = events[0]
  if (!first) return null

  const { positionId, principal, tranche, rateValue } = first.args
  return {
    contractPositionId: positionId.toString(),
    principal: principal.toString(),
    tranche: Number(tranche),
    rateValue: rateValue.toString(),
  }
}
