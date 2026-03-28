import { getLocalCurrencyCode } from 'src/localCurrency/selectors'

describe(getLocalCurrencyCode, () => {
  describe('when no preferred currency is set', () => {
    it('returns the default COP for a country whose currency is not supported', () => {
      const state: any = {
        account: { e164PhoneNumber: '+231881551952' },
        localCurrency: { preferredCurrencyCode: undefined },
      }
      // LRD (Liberian Dollar) was removed from supported currencies, so fallback to COP
      expect(getLocalCurrencyCode(state)).toEqual('COP')
    })

    it('returns USD for US phone numbers', () => {
      const state: any = {
        account: { e164PhoneNumber: '+14155552671' },
        localCurrency: { preferredCurrencyCode: undefined },
      }
      expect(getLocalCurrencyCode(state)).toEqual('USD')
    })

    it('returns COP for CA phone numbers (CAD not supported)', () => {
      const state: any = {
        account: { e164PhoneNumber: '+18192216929' },
        localCurrency: { preferredCurrencyCode: undefined },
      }
      // CAD is not a supported currency, so fallback to COP
      expect(getLocalCurrencyCode(state)).toEqual('COP')
    })
  })

  describe('when a preferred currency is set', () => {
    it('returns the preferred currency', () => {
      const state: any = {
        account: { e164PhoneNumber: '+231881551952' },
        localCurrency: { preferredCurrencyCode: 'COP' },
      }
      expect(getLocalCurrencyCode(state)).toEqual('COP')
    })

    it('returns USD when USD is the preferred currency', () => {
      const state: any = {
        account: { e164PhoneNumber: '+14155552671' },
        localCurrency: { preferredCurrencyCode: 'USD' },
      }
      expect(getLocalCurrencyCode(state)).toEqual('USD')
    })
  })
})
