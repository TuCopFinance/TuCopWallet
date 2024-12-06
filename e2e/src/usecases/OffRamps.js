import { launchApp, reloadReactNative } from '../utils/retries'
import { waitForElementId, waitForElementByIdAndTap } from '../utils/utils'

export default offRamps = () => {
  beforeAll(async () => {
    await launchApp()
  })
  beforeEach(async () => {
    await reloadReactNative()
    await waitForElementByIdAndTap('Tab/Home')
    await waitForElementByIdAndTap('FlatCard/Withdraw')
  })

  describe('When Withdrawing', () => {
    // Verify that some exchanges are displayed not the exact total as this could change
    // Maybe use total in the future
    it.each`
      token     | exchanges
      ${'cUSD'} | ${{ total: 5, minExpected: 1 }}
    `(
      'Then should display at least $exchanges.minExpected $token exchange(s)',
      async ({ token, exchanges }) => {
        await waitForElementId(`BottomSheet${token}Symbol`)
        await element(by.id(`BottomSheet${token}Symbol`)).tap()

        await waitForElementId('FiatExchangeInput')
        await element(by.id('FiatExchangeInput')).replaceText('2')
        await element(by.id('FiatExchangeNextButton')).tap()
        await expect(element(by.text('Select Withdraw Method'))).toBeVisible()
        await waitForElementId('Exchanges')
        await element(by.id('Exchanges')).tap()
        await waitForElementId('SendBar')
        // Exchanges start at index 0
        await waitForElementId(`provider-${exchanges.minExpected - 1}`)
      }
    )

    it('Then Send To Address', async () => {
      const randomAmount = `${(Math.random() * 10 ** -1).toFixed(3)}`
      await waitForElementId(`BottomSheetcUSDSymbol`)
      await element(by.id(`BottomSheetcUSDSymbol`)).tap()

      await waitForElementId('FiatExchangeInput')
      await element(by.id('FiatExchangeInput')).replaceText(`${randomAmount}`)
      await element(by.id('FiatExchangeNextButton')).tap()
      await waitForElementId('Exchanges')
      await element(by.id('Exchanges')).tap()
      await element(by.id('SendBar')).tap()
      await waitFor(element(by.id('SendSelectRecipientSearchInput')))
        .toBeVisible()
        .withTimeout(10 * 1000)
      // Send e2e test should cover the rest of this flow
    })
  })
}
