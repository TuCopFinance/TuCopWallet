import { DetoxConstants } from 'detox'
import { launchApp } from '../utils/retries'

export default HandleNotification = () => {
  // firebase is currently not enabled for e2e tests so the below test is skipped.
  it.skip('Launch app from push notification', async () => {
    const userNotification = {
      trigger: {
        type: 'push',
      },
      title: 'From push',
      subtitle: 'Subtitle',
      body: 'Body',
      badge: 1,
      payload: {
        ou: 'https://www.mento.org',
      },
      category: 'org.mento.mobile.test',
      'content-available': 0,
      'action-identifier': 'default',
    }

    await launchApp({ userNotification })
  })

  it(':ios: Launch app and deeplink to another screen', async () => {
    await launchApp({
      userNotification: {
        trigger: {
          type: DetoxConstants.userNotificationTriggers.push,
        },
        payload: {
          wzrk_dl: 'mento://wallet/openScreen?screen=SendSelectRecipient',
        },
      },
    })

    await waitFor(element(by.id('SendSelectRecipientSearchInput')))
      .toBeVisible()
      .withTimeout(10 * 1000)
  })
}
