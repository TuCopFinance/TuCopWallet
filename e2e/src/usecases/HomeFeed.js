import jestExpect from 'expect'
import { waitForElementId, waitForElementByIdAndTap } from '../utils/utils'
import { sleep } from '../../../src/utils/sleep'

export default HomeFeed = () => {
  it('should show correct information on tap of feed item', async () => {
    // Load Activity Tab
    await waitForElementByIdAndTap('Tab/Activity')
    await waitForElementId('TabActivity')

    const items = await element(by.id('TransferFeedItem')).getAttributes()

    // Tap top TransferFeedItem
    await element(by.id('TransferFeedItem')).atIndex(0).tap()

    // Assert on text based on elements returned earlier
    const address = items.elements[0].label.split(' ')[0]
    await expect(element(by.text(address)).atIndex(0)).toBeVisible()

    const amount = items.elements[0].label.match(/(\d+\.\d+)/)[1]
    await expect(element(by.text(`$${amount}`)).atIndex(0)).toBeVisible()
  })

  it('should load more items on scroll', async () => {
    // Tap back button if present form previous test
    try {
      await element(by.id('BackChevron')).tap()
    } catch {}

    await waitForElementId('TabActivity')
    const startingItems = await element(by.id('TransferFeedItem')).getAttributes()

    // Scroll to bottom - Android will scroll forever so we set a static value
    await element(by.id('TabActivity/SectionList')).scroll(5000, 'down')
    await sleep(5000)

    // Compare initial number of items to new number of items after scroll
    const endingItems = await element(by.id('TransferFeedItem')).getAttributes()
    jestExpect(endingItems.elements.length).toBeGreaterThan(startingItems.elements.length)
  })
}
