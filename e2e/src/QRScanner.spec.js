import { reloadReactNative } from './utils/retries'
import { quickOnboarding, waitForElementByIdAndTap, waitForElementId } from './utils/utils'
import { DEFAULT_RECIPIENT_ADDRESS } from './utils/consts'

describe('Given QR Scanner', () => {
  beforeAll(async () => {
    await quickOnboarding()
  })

  describe('When opening QR scanner', () => {
    it('Then should display QR code', async () => {
      await reloadReactNative()
      await waitForElementByIdAndTap('Tab/Home')
      await waitForElementByIdAndTap('FlatCard/ReceiveMoney')
      await waitForElementId('QRCode')
      await expect(element(by.id('QRCode'))).toBeVisible()
    })

    it('Then should be able to toggle camera', async () => {
      await waitForElementId('Scan')
      await element(by.id('Scan')).tap()
      await waitForElementId('CameraScanInfo')
      await expect(element(by.id('CameraScanInfo'))).toBeVisible()
    })

    it('Then should be able to toggle to QR code', async () => {
      await waitForElementId('My Code')
      await element(by.id('My Code')).tap()
      await waitForElementId('QRCode')
      await expect(element(by.id('QRCode'))).toBeVisible()
    })

    it('Then should be able to close QR code scanner', async () => {
      await waitForElementId('Times')
      await element(by.id('Times')).tap()
      await waitForElementByIdAndTap('Tab/Home')
      await waitForElementId('FlatCard/SendMoney')
      await expect(element(by.id('FlatCard/SendMoney'))).toBeVisible()
    })
  })

  describe("When 'scanning' QR", () => {
    beforeEach(async () => {
      await reloadReactNative()
      await waitForElementByIdAndTap('Tab/Home')
      await waitForElementId('FlatCard/ReceiveMoney')
      await element(by.id('FlatCard/ReceiveMoney')).tap()
      await waitForElementId('Scan')
      await element(by.id('Scan')).tap()
      await waitForElementId('CameraScanInfo')
      await element(by.id('CameraScanInfo')).tap()
    })

    it('Then should be able to handle Mento pay QR', async () => {
      await waitForElementId('ManualInput')
      await element(by.id('ManualInput')).replaceText(
        `mento://wallet/pay?address=${DEFAULT_RECIPIENT_ADDRESS}`
      )
      await waitForElementId('ManualSubmit')
      await element(by.id('ManualSubmit')).tap()

      await waitForElementId('SendEnterAmount/AmountOptions')
      await element(by.text('Done')).tap() // dismiss the keyboard to reveal the proceed button
      await expect(element(by.id('SendEnterAmount/ReviewButton'))).toBeVisible()
    })

    it('Then should handle address only QR', async () => {
      await waitForElementId('ManualInput')
      await element(by.id('ManualInput')).replaceText(`${DEFAULT_RECIPIENT_ADDRESS}`)
      await waitForElementId('ManualSubmit')
      await element(by.id('ManualSubmit')).tap()

      await waitForElementId('SendEnterAmount/AmountOptions')
      await element(by.text('Done')).tap() // dismiss the keyboard to reveal the proceed button
      await expect(element(by.id('SendEnterAmount/ReviewButton'))).toBeVisible()
    })

    it.todo('Then should be able to wc QR')
  })
})
