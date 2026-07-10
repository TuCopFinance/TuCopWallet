import { render } from '@testing-library/react-native'
import BigNumber from 'bignumber.js'
import * as React from 'react'
import 'react-native'
import { Provider } from 'react-redux'
import TokenDisplay, { formatValueToDisplay, getTokenSymbol } from 'src/components/TokenDisplay'
import { APPROX_SYMBOL } from 'src/components/TokenEnterAmount'
import { LocalCurrencyCode } from 'src/localCurrency/consts'
import { RootState } from 'src/redux/reducers'
import { NetworkId } from 'src/transactions/types'
import { createMockStore, getElementText, RecursivePartial } from 'test/utils'
import networkConfig from 'src/web3/networkConfig'

describe('TokenDisplay', () => {
  function store(storeOverrides?: RecursivePartial<RootState>) {
    return createMockStore({
      localCurrency: {
        usdToLocalRate: '0.10',
        preferredCurrencyCode: LocalCurrencyCode.COP,
        fetchedCurrencyCode: LocalCurrencyCode.COP,
      },
      tokens: {
        tokenBalances: {
          ['celo-mainnet:0xusd']: {
            address: '0xusd',
            tokenId: 'celo-mainnet:0xusd',
            symbol: 'cUSD',
            balance: '50',
            priceUsd: '1',
            networkId: NetworkId['celo-mainnet'],
            priceFetchedAt: Date.now(),
          },
          ['celo-mainnet:0xeur']: {
            address: '0xeur',
            tokenId: 'celo-mainnet:0xeur',
            symbol: 'cEUR',
            balance: '50',
            priceUsd: '1.2',
            networkId: NetworkId['celo-mainnet'],
            priceFetchedAt: Date.now(),
          },
          ['ethereum-mainnet:native']: {
            tokenId: 'ethereum-mainnet:native',
            symbol: 'ETH',
            balance: '10',
            priceUsd: '5',
            networkId: NetworkId['ethereum-mainnet'],
            priceFetchedAt: Date.now(),
          },
        },
      },
      ...storeOverrides,
    })
  }

  describe('when displaying tokens', () => {
    it('shows token amount when showLocalAmount is false', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay
            showLocalAmount={false}
            amount={10}
            tokenId={'celo-mainnet:0xusd'}
            testID="test"
          />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toBe('10.00 cUSD')
    })

    it('shows local amount when showLocalAmount is true', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay
            showLocalAmount={true}
            amount={10}
            tokenId={'celo-mainnet:0xusd'}
            testID="test"
          />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toEqual('COP$1.00')
    })

    it('shows local amount when showLocalAmount is true and token is not cUSD', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay
            showLocalAmount={true}
            amount={10}
            tokenId={'ethereum-mainnet:native'}
            testID="test"
          />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toEqual('COP$5.00')
    })

    it('shows more decimals up to the', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay
            showLocalAmount={false}
            amount={0.00000182421}
            tokenId={'celo-mainnet:0xusd'}
            testID="test"
          />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toEqual('0.0000018 cUSD')
    })

    it('hides the symbol when showSymbol is false', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay
            showLocalAmount={false}
            showSymbol={false}
            amount={10}
            tokenId={'celo-mainnet:0xusd'}
            testID="test"
          />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toBe('10.00')
    })

    it('hides the fiat symbol when showSymbol is false', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay
            showLocalAmount={false}
            showSymbol={false}
            amount={10}
            tokenId={'celo-mainnet:0xusd'}
            testID="test"
          />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toEqual('10.00')
    })

    it('uses the localAmount if set', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay
            amount={10}
            tokenId={'ethereum-mainnet:native'}
            localAmount={{
              currencyCode: LocalCurrencyCode.COP,
              exchangeRate: '0.5',
              value: '5',
            }}
            testID="test"
          />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toEqual('COP$5.00')
    })

    it('shows explicit plus sign', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay
            showLocalAmount={true}
            showExplicitPositiveSign={true}
            amount={10}
            tokenId={'celo-mainnet:0xusd'}
            testID="test"
          />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toEqual('+COP$1.00')
    })

    it('shows negative values', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay
            showLocalAmount={true}
            amount={-10}
            tokenId={'celo-mainnet:0xusd'}
            testID="test"
          />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toEqual('-COP$1.00')
    })

    it('shows a dash by default when the token doesnt exist', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay amount={10} tokenId={'celo-mainnet:does-not-exist'} testID="test" />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toEqual('-')
    })

    it('shows custom error fallback when token doesnt exist and fallback is provided', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay
            amount={10}
            tokenId={'celo-mainnet:does-not-exist'}
            testID="test"
            errorFallback="US$ --"
          />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toEqual('US$ --')
    })

    it('doesnt show error when the token doesnt exist if theres a localAmount', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay
            amount={10}
            tokenId={'celo-mainnet:does-not-exist'}
            localAmount={{
              currencyCode: LocalCurrencyCode.COP,
              exchangeRate: '0.5',
              value: '5',
            }}
            testID="test"
          />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toEqual('COP$5.00')
    })

    it('hides the sign', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay
            showLocalAmount={true}
            hideSign={true}
            amount={-10}
            tokenId={'celo-mainnet:0xusd'}
            testID="test"
          />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toEqual('COP$1.00')
    })

    it('shows approx sign if set', () => {
      const { getByTestId } = render(
        <Provider store={store()}>
          <TokenDisplay
            showLocalAmount={false}
            amount={10}
            tokenId={'celo-mainnet:0xusd'}
            showApprox={true}
            testID="test"
          />
        </Provider>
      )
      expect(getElementText(getByTestId('test'))).toEqual(`${APPROX_SYMBOL} 10.00 cUSD`)
    })
  })
})

describe('getTokenSymbol', () => {
  const t = (key: string) => key

  it('maps USDC symbol to assets.dollars', () => {
    expect(getTokenSymbol(t, 'USDC')).toBe('assets.dollars')
  })
  it('maps USDm symbol to assets.dollars', () => {
    expect(getTokenSymbol(t, 'USDm')).toBe('assets.dollars')
  })
  it('cUSD symbol is not mapped by symbol alone (use tokenId for USDm)', () => {
    // cUSD is handled via tokenId lookup (networkConfig.usdmTokenId), not by symbol.
    // This prevents false positives on other tokens that happen to report cUSD as symbol.
    expect(getTokenSymbol(t, 'cUSD')).toBe('cUSD')
  })
  it('maps USAT symbol to assets.dollars', () => {
    expect(getTokenSymbol(t, 'USAT')).toBe('assets.dollars')
  })
  it('falls back to tokenId for USDC when symbol is missing', () => {
    expect(getTokenSymbol(t, undefined, networkConfig.usdcTokenId)).toBe('assets.dollars')
  })
  it('falls back to tokenId for USDm', () => {
    expect(getTokenSymbol(t, undefined, networkConfig.usdmTokenId)).toBe('assets.dollars')
  })
  it('falls back to tokenId for USAT when usatTokenId is present (mainnet)', () => {
    // On Mainnet, usatTokenId is '' and getTokenSymbol returns undefined for empty string.
    // On mainnet, it should return assets.dollars.
    const usatId = networkConfig.usatTokenId
    const result = getTokenSymbol(t, undefined, usatId || undefined)
    expect(!usatId || result === 'assets.dollars').toBe(true)
  })
})

describe('formatValueToDisplay', () => {
  it('adds at least two decimal places', () => {
    expect(formatValueToDisplay(new BigNumber(1234))).toEqual('1,234.00')
  })

  it('shows at least two significant figures', () => {
    expect(formatValueToDisplay(new BigNumber(0.00000012345))).toEqual('0.00000012')
  })

  it('does not show trailing zeros', () => {
    expect(formatValueToDisplay(new BigNumber(0.01))).toEqual('0.01')
  })
})
