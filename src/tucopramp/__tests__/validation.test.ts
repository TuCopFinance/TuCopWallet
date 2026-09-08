import {
  DOCUMENT_TYPES,
  MAX_DOCUMENT_LENGTH,
  getDocumentAutoCapitalize,
  getDocumentKeyboardType,
  isValidDocument,
  sanitizeDocument,
} from 'src/tucopramp/limits'
import {
  MAX_ACCOUNT_NUMBER_LENGTH,
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

describe('DOCUMENT_TYPES', () => {
  it('exposes the 6 openapi enum values', () => {
    expect(DOCUMENT_TYPES).toEqual(['CC', 'CE', 'TI', 'NUIP', 'NIT', 'PAS'])
  })

  it('MAX_DOCUMENT_LENGTH matches the openapi cedula.maxLength cap (20)', () => {
    expect(MAX_DOCUMENT_LENGTH).toBe(20)
  })
})

describe('isValidDocument', () => {
  describe('CC (Cedula Ciudadania) - historic 1-10 digit range', () => {
    it.each([
      ['1', true], // historic FIX: server accepts single digit
      ['4321', true], // old-cedula pre-6-digit-reform, previously rejected
      ['12', true],
      ['1023456789', true],
      ['12345678901', false], // 11 digits, over max
      ['', false],
      ['12a34', false],
    ])('%s -> %s', (input, expected) => {
      expect(isValidDocument('CC', input)).toBe(expected)
    })
  })

  describe('CE (Cedula Extranjeria) - 1-10 digits', () => {
    it.each([
      ['1', true],
      ['1023456789', true],
      ['12345678901', false],
      ['', false],
    ])('%s -> %s', (input, expected) => {
      expect(isValidDocument('CE', input)).toBe(expected)
    })
  })

  describe('TI (Tarjeta Identidad) - 10 or 11 digits', () => {
    it.each([
      ['1234567890', true],
      ['12345678901', true],
      ['123456789', false], // 9 digits, under min
      ['123456789012', false], // 12 digits, over max
      ['', false],
    ])('%s -> %s', (input, expected) => {
      expect(isValidDocument('TI', input)).toBe(expected)
    })
  })

  describe('NUIP - exactly 10 digits', () => {
    it.each([
      ['1023456789', true],
      ['123456789', false],
      ['12345678901', false],
    ])('%s -> %s', (input, expected) => {
      expect(isValidDocument('NUIP', input)).toBe(expected)
    })
  })

  describe('NIT - 9 digits, optionally + "-" + 1 check digit', () => {
    it.each([
      ['890903938', true],
      ['890903938-8', true],
      ['890903938-0', true],
      ['8909039388', false], // 10 digits pasted without hyphen, server rejects
      ['890903938-', false], // trailing hyphen, no check digit
      ['89090393-8', false], // 8 digits base + hyphen + check, under 9
      ['890903938-88', false], // 2-digit check
      ['', false],
    ])('%s -> %s', (input, expected) => {
      expect(isValidDocument('NIT', input)).toBe(expected)
    })
  })

  describe('PAS (Passport) - 5-20 alphanumeric', () => {
    it.each([
      ['AB123456', true],
      ['12345', true], // 5 digits, still passport-shaped per spec
      ['A1', false], // under 5
      ['A'.repeat(21), false], // over 20
      ['AB-12', false], // hyphen not allowed
      ['AB 12345', false], // space not allowed
      ['', false],
    ])('%s -> %s', (input, expected) => {
      expect(isValidDocument('PAS', input)).toBe(expected)
    })
  })
})

describe('sanitizeDocument', () => {
  it('CC: strips non-digits and truncates to 10', () => {
    expect(sanitizeDocument('CC', '1.023.456.789')).toBe('1023456789')
    expect(sanitizeDocument('CC', '99999999999999')).toBe('9999999999')
    expect(sanitizeDocument('CC', 'CC 4321')).toBe('4321')
  })

  it('TI: strips non-digits and truncates to 11', () => {
    expect(sanitizeDocument('TI', '12345678901234')).toBe('12345678901')
  })

  it('NUIP: strips non-digits and truncates to 10', () => {
    expect(sanitizeDocument('NUIP', 'NUIP-1023456789')).toBe('1023456789')
  })

  it('NIT: keeps at most one trailing hyphen + 1 check digit', () => {
    expect(sanitizeDocument('NIT', '890903938')).toBe('890903938')
    expect(sanitizeDocument('NIT', '890903938-8')).toBe('890903938-8')
    expect(sanitizeDocument('NIT', '890.903.938-8')).toBe('890903938-8')
    // Only one hyphen tolerated (last one wins)
    expect(sanitizeDocument('NIT', '890-903-938-8')).toBe('890903938-8')
    // Extra digits after hyphen collapse to 1
    expect(sanitizeDocument('NIT', '890903938-88')).toBe('890903938-8')
    // Base gets capped at 9 digits
    expect(sanitizeDocument('NIT', '89090393812345')).toBe('890903938')
    expect(sanitizeDocument('NIT', '890903938-abc')).toBe('890903938')
  })

  it('PAS: alphanumeric, uppercase, truncated to 20', () => {
    expect(sanitizeDocument('PAS', 'ab123456')).toBe('AB123456')
    expect(sanitizeDocument('PAS', 'AB-123.456')).toBe('AB123456')
    expect(sanitizeDocument('PAS', 'a'.repeat(30))).toBe('A'.repeat(20))
  })
})

describe('getDocumentKeyboardType', () => {
  it.each([
    ['CC', 'numeric'],
    ['CE', 'numeric'],
    ['TI', 'numeric'],
    ['NUIP', 'numeric'],
    ['NIT', 'default'], // needs hyphen
    ['PAS', 'default'], // needs letters
  ] as const)('%s -> %s', (type, expected) => {
    expect(getDocumentKeyboardType(type)).toBe(expected)
  })
})

describe('getDocumentAutoCapitalize', () => {
  it('PAS uses characters, everything else none', () => {
    expect(getDocumentAutoCapitalize('PAS')).toBe('characters')
    expect(getDocumentAutoCapitalize('CC')).toBe('none')
    expect(getDocumentAutoCapitalize('NIT')).toBe('none')
  })
})
