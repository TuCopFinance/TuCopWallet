import { opaqueAccountId, scrubDeep, scrubSensitiveStrings, scrubString } from 'src/sentry/piiScrub'

const ADDR = '0xFEF5A1A2b3754A2F53161EaaAcb3EB889F004d4a'
const TX_HASH = '0xd27f9fc463ffd527e379f9f6fb78220cc8e19917b026cc6fbe97e72717a1e43f'
const AMOUNT_WEI = '10000000000000000000000'

describe('scrubString', () => {
  it('replaces a single EVM address', () => {
    expect(scrubString(`from ${ADDR} sent`)).toBe('from <addr> sent')
  })

  it('replaces every EVM address in a sentence', () => {
    const line = `${ADDR} -> ${ADDR.toLowerCase()} on tx ${TX_HASH}`
    expect(scrubString(line)).toBe('<addr> -> <addr> on tx <hash>')
  })

  it('replaces a 64-char tx hash without falsely matching the 40-char address inside it', () => {
    expect(scrubString(`hash=${TX_HASH}`)).toBe('hash=<hash>')
  })

  it('replaces large wei amounts', () => {
    expect(scrubString(`amount=${AMOUNT_WEI}`)).toBe('amount=<amount>')
  })

  it('leaves ordinary text and short numbers alone', () => {
    expect(scrubString('gas 21000 used, category 3, 30 days')).toBe(
      'gas 21000 used, category 3, 30 days'
    )
  })

  it('does not truncate short hex that is not a full address (backend selector debugging remains readable)', () => {
    expect(scrubString('revert selector 0x2648b779')).toBe('revert selector 0x2648b779')
  })
})

describe('scrubDeep', () => {
  it('walks nested objects and arrays, scrubbing every string leaf', () => {
    const input = {
      message: `deposit from ${ADDR}`,
      breadcrumbs: [
        { level: 'info', data: { txHash: TX_HASH, amount: AMOUNT_WEI } },
        { level: 'warn', data: { unrelated: 'ok', addressList: [ADDR, ADDR.toLowerCase()] } },
      ],
      tags: { user: ADDR },
      untouched: { count: 3, flag: true, ratio: 0.5 },
    }
    const out = scrubDeep(input)
    expect(out.message).toBe('deposit from <addr>')
    expect(out.breadcrumbs[0].data.txHash).toBe('<hash>')
    expect(out.breadcrumbs[0].data.amount).toBe('<amount>')
    expect(out.breadcrumbs[1].data.addressList).toEqual(['<addr>', '<addr>'])
    expect(out.tags.user).toBe('<addr>')
    // primitives untouched
    expect(out.untouched).toEqual({ count: 3, flag: true, ratio: 0.5 })
  })

  it('preserves null and undefined leaves', () => {
    expect(scrubDeep({ a: null, b: undefined, c: 'plain' })).toEqual({
      a: null,
      b: undefined,
      c: 'plain',
    })
  })
})

describe('scrubSensitiveStrings', () => {
  it('returns null when input is null (Sentry drops the payload)', () => {
    expect(scrubSensitiveStrings(null)).toBeNull()
  })

  it('returns null if scrubbing throws so partial data never leaves the device', () => {
    const circular: any = { x: null }
    circular.x = circular
    // scrubDeep would blow the stack; scrubSensitiveStrings swallows and returns null.
    expect(scrubSensitiveStrings(circular)).toBeNull()
  })

  it('scrubs a Sentry-shaped event including exception message and breadcrumbs', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: `send failed for ${ADDR}, tx ${TX_HASH}, amount ${AMOUNT_WEI}`,
          },
        ],
      },
      breadcrumbs: [{ category: 'saga', message: `dispatched from ${ADDR}` }],
      extra: { originalAmount: AMOUNT_WEI },
    }
    const scrubbed = scrubSensitiveStrings(event) as typeof event
    expect(scrubbed.exception.values[0].value).toBe(
      'send failed for <addr>, tx <hash>, amount <amount>'
    )
    expect(scrubbed.breadcrumbs[0].message).toBe('dispatched from <addr>')
    expect(scrubbed.extra.originalAmount).toBe('<amount>')
  })
})

describe('opaqueAccountId', () => {
  it('is deterministic for the same address regardless of case', () => {
    const a = opaqueAccountId(ADDR)
    const b = opaqueAccountId(ADDR.toLowerCase())
    expect(a).toBe(b)
  })

  it('differs for different addresses', () => {
    const other = '0x1111111111111111111111111111111111111111'
    expect(opaqueAccountId(ADDR)).not.toBe(opaqueAccountId(other))
  })

  it('returns a fixed-length hex id', () => {
    expect(opaqueAccountId(ADDR)).toHaveLength(16)
    expect(opaqueAccountId(ADDR)).toMatch(/^[0-9a-f]{16}$/)
  })

  it('does not leak the address in the id itself', () => {
    const id = opaqueAccountId(ADDR)
    expect(id).not.toContain(ADDR.slice(2, 12).toLowerCase())
  })
})
