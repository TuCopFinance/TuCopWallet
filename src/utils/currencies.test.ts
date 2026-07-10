import {
  CURRENCIES,
  CiCoCurrency,
  Currency,
  resolveCICOCurrency,
  resolveCurrency,
} from 'src/utils/currencies'

describe('currencies', () => {
  describe('Currency enum', () => {
    it('exposes USDC', () => {
      expect(Currency.USDC).toBe('USDC')
    })
    it('exposes USAT', () => {
      expect(Currency.USAT).toBe('USAT')
    })
  })

  describe('CiCoCurrency enum', () => {
    it('exposes USDC', () => {
      expect(CiCoCurrency.USDC).toBe('USDC')
    })
    it('exposes USAT', () => {
      expect(CiCoCurrency.USAT).toBe('USAT')
    })
  })

  describe('CURRENCIES', () => {
    it('has a USDC entry with $ symbol and 2 decimals', () => {
      expect(CURRENCIES[Currency.USDC]).toEqual({
        symbol: '$',
        displayDecimals: 2,
        cashTag: 'USDC',
      })
    })
    it('has a USAT entry with $ symbol and 2 decimals', () => {
      expect(CURRENCIES[Currency.USAT]).toEqual({
        symbol: '$',
        displayDecimals: 2,
        cashTag: 'USAT',
      })
    })
  })

  describe('resolveCurrency', () => {
    it('maps USDC -> Currency.USDC', () => {
      expect(resolveCurrency('USDC')).toBe(Currency.USDC)
    })
    it('maps USAT -> Currency.USAT', () => {
      expect(resolveCurrency('USAT')).toBe(Currency.USAT)
    })
    it('still maps USDT -> Currency.USDT', () => {
      expect(resolveCurrency('USDT')).toBe(Currency.USDT)
    })
  })

  describe('resolveCICOCurrency', () => {
    it('maps USDC -> CiCoCurrency.USDC (not USDT)', () => {
      expect(resolveCICOCurrency('USDC')).toBe(CiCoCurrency.USDC)
    })
    it('maps USAT -> CiCoCurrency.USAT', () => {
      expect(resolveCICOCurrency('USAT')).toBe(CiCoCurrency.USAT)
    })
  })
})
