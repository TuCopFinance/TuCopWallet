import {
  MAX_ACCOUNT_NUMBER_LENGTH,
  MAX_CEDULA_LENGTH,
  MAX_NAME_LENGTH,
  detectBreBKeyKind,
  isValidBankAccountNumber,
  isValidBreBKey,
  isValidEmail,
  isValidPersonName,
  sanitizeDigits,
  sanitizePersonName,
} from 'src/tucopramp/validation'

describe('isValidEmail', () => {
  it.each([
    ['juan@tucop.xyz', true],
    ['juan.pablo+ramp@sub.tucop.xyz', true],
    ['a@b.co', true],
    ['', false],
    ['   ', false],
    ['no-at-sign', false],
    ['no@dot', false],
    ['@nodomain.com', false], // matches [^\s@]+ requires at least 1
    ['nolocal@', false],
    ['spaces in@address.com', false],
    ['double@@dot.com', false],
    ['ok@but.', false],
  ])('%s -> %s', (input, expected) => {
    expect(isValidEmail(input)).toBe(expected)
  })

  it('rejects addresses longer than 254 chars', () => {
    expect(isValidEmail('a'.repeat(250) + '@x.co')).toBe(false)
  })
})

describe('sanitizePersonName', () => {
  it('strips digits, emojis and punctuation but keeps letters + space + hyphen + apostrophe', () => {
    expect(sanitizePersonName('Juan1 Pablo!')).toBe('Juan Pablo')
    expect(sanitizePersonName('María-José')).toBe('María-José')
    expect(sanitizePersonName("d'Angelo")).toBe("d'Angelo")
    expect(sanitizePersonName('Ana 😀 Sofía')).toBe('Ana  Sofía')
    expect(sanitizePersonName('Núñez_2026')).toBe('Núñez')
  })

  it(`truncates to ${MAX_NAME_LENGTH} chars`, () => {
    expect(sanitizePersonName('a'.repeat(MAX_NAME_LENGTH + 20))).toHaveLength(MAX_NAME_LENGTH)
  })

  it('is empty-safe', () => {
    expect(sanitizePersonName('')).toBe('')
  })
})

describe('isValidPersonName', () => {
  it.each([
    ['Juan Pablo', true],
    ['María-José', true],
    ["d'Angelo", true],
    ['Núñez', true],
    ['', false],
    ['   ', false],
    ['Juan1', false], // has a digit
    ['Ana 😀', false], // has emoji
    ['Ana_Sofia', false], // underscore not allowed
  ])('%s -> %s', (input, expected) => {
    expect(isValidPersonName(input)).toBe(expected)
  })
})

describe('sanitizeDigits', () => {
  it('strips non-digits and truncates', () => {
    expect(sanitizeDigits('1023-456-789', 20)).toBe('1023456789')
    expect(sanitizeDigits('CC 12.345.678', 10)).toBe('12345678')
    expect(sanitizeDigits('abcdefgh', 10)).toBe('')
    expect(sanitizeDigits('99999999999', 5)).toBe('99999')
  })
})

describe('isValidBankAccountNumber', () => {
  it.each([
    ['1234', true],
    ['12345678901', true],
    ['1'.repeat(MAX_ACCOUNT_NUMBER_LENGTH), true],
    ['123', false], // under min
    ['1'.repeat(MAX_ACCOUNT_NUMBER_LENGTH + 1), false], // over max
    ['1234abc', false],
    ['   ', false],
    ['', false],
  ])('%s -> %s', (input, expected) => {
    expect(isValidBankAccountNumber(input)).toBe(expected)
  })
})

describe('detectBreBKeyKind', () => {
  it.each([
    ['1023456789', 'cedula'],
    ['123456', 'cedula'],
    ['3001234567', 'celular'],
    ['+573001234567', 'celular'],
    ['57 300 123 4567', 'celular'], // spaces stripped
    ['juan@tucop.xyz', 'email'],
    ['@juanp', 'alias'],
    ['@juan.p_2026-99', 'alias'],
    ['', null],
    ['not a key', null],
    ['3123', null], // too short for celular, too short for cedula
    ['@!bad-chars!', null],
    ['1234567890123', null], // too long for cedula, wrong prefix for celular
  ])('%s -> %s', (input, expected) => {
    expect(detectBreBKeyKind(input)).toBe(expected)
  })
})

describe('isValidBreBKey', () => {
  it.each([
    ['1023456789', true],
    ['3001234567', true],
    ['juan@tucop.xyz', true],
    ['@juanp', true],
    ['ab', false], // under 3 chars
    ['a'.repeat(101), false], // over 100 chars
    ['not a key', false],
    ['', false],
  ])('%s -> %s', (input, expected) => {
    expect(isValidBreBKey(input)).toBe(expected)
  })
})

describe('MAX_CEDULA_LENGTH', () => {
  it('exports 10', () => {
    expect(MAX_CEDULA_LENGTH).toBe(10)
  })
})
