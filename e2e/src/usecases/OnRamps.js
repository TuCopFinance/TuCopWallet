import { launchApp, reloadReactNative } from '../utils/retries'
import { isElementVisible, waitForElementId, waitForElementByIdAndTap } from '../utils/utils'

export default onRamps = () => {
  beforeAll(async () => {
    await launchApp()
  })
  beforeEach(async () => {
    await reloadReactNative()
    await waitForElementByIdAndTap('Tab/Wallet')
  })

  describe('When Add Funds selected', () => {
    it.each`
      token     | amount
      ${'cUSD'} | ${'20'}
      ${'cUSD'} | ${'2'}
      ${'cKES'} | ${'20'}
      ${'cKES'} | ${'2'}
    `('Then should display $token provider(s) for $$amount', async ({ token, amount }) => {
      await waitForElementByIdAndTap(`${token}Symbol`)
      await waitForElementByIdAndTap('TokenDetails/Action/Add')

      await waitForElementId('FiatExchangeInput')
      await element(by.id('FiatExchangeInput')).replaceText(`${amount}`)
      await element(by.id('FiatExchangeNextButton')).tap()
      await expect(element(by.text('Select Payment Method'))).toBeVisible()
      // Check IF Single Card Provider
      if (await isElementVisible('Card/singleProvider')) {
        await expect(element(by.id('Card/provider-0'))).toExist()
        await expect(element(by.id('Card/provider-1'))).not.toExist()
      }
      // Check IF Multiple Card Providers
      if (await isElementVisible('Card/numProviders')) {
        let cardProviders = await element(by.id('Card/numProviders')).getAttributes()
        numCardProviders =
          device.getPlatform() === 'ios'
            ? cardProviders.label.split(' ')[0]
            : cardProviders.text.split(' ')[0]
        // Check that the expected number of providers show
        for (let i = 0; i < numCardProviders; i++) {
          await expect(element(by.id(`Card/provider-${i}`))).toExist()
        }
      }
      // Check IF Single Bank Provider
      if (await isElementVisible('Bank/singleProvider')) {
        await expect(element(by.id('Bank/provider-0'))).toExist()
        await expect(element(by.id('Bank/provider-1'))).not.toExist()
      }
      // Check IF Multiple Bank Providers
      if (await isElementVisible('Bank/numProviders')) {
        let bankProviders = await element(by.id('Bank/numProviders')).getAttributes()
        numBankProviders =
          device.getPlatform() === 'ios'
            ? bankProviders.label.split(' ')[0]
            : bankProviders.text.split(' ')[0]
        // Check that the expected number of providers show
        for (let i = 0; i < numBankProviders; i++) {
          await expect(element(by.id(`Bank/provider-${i}`))).toExist()
        }
      }
    })
  })
}
