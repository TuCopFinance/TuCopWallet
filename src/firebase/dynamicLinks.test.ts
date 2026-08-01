import { createJumpstartLink, FirebaseDisabledError } from 'src/firebase/dynamicLinks'
import * as config from 'src/config'
import { getDynamicConfigParams } from 'src/statsig'
import { StatsigDynamicConfigs } from 'src/statsig/types'
import { NetworkId } from 'src/transactions/types'

const mockBuildLink = jest.fn()
jest.mock('@react-native-firebase/dynamic-links', () => () => ({
  buildLink: () => mockBuildLink(),
}))
jest.mock('src/statsig')

describe('dynamic links', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(config as any).FIREBASE_ENABLED = true
  })

  it('should create the jumpstart link', async () => {
    jest.mocked(getDynamicConfigParams).mockImplementation(({ configName }) => {
      if (configName === StatsigDynamicConfigs.APP_CONFIG) {
        return {
          links: {
            web: 'https://celo.org/',
          },
        }
      }
      return {} as any
    })

    const mockBaseLink =
      'https://example.com/?ibi=co%2Eclabs%2Eappname%2Edev&isi=1520414263&apn=co%2Eclabs%2Eappname%2Edev&link='
    mockBuildLink.mockResolvedValue(`${mockBaseLink}https%3A%2F%2Fcelo%2Eorg`)

    const result = await createJumpstartLink('0xprivateKey', NetworkId['celo-mainnet'])

    expect(result).toEqual(
      `${mockBaseLink}https%3A%2F%2Fcelo%2Eorg%2Fjumpstart%2F0xprivateKey%2Fcelo%2Dmainnet`
    )
  })

  it('throws FirebaseDisabledError when Firebase is disabled', async () => {
    ;(config as any).FIREBASE_ENABLED = false
    await expect(
      createJumpstartLink('0xprivateKey', NetworkId['celo-mainnet'])
    ).rejects.toBeInstanceOf(FirebaseDisabledError)
    // Firebase SDK must not be invoked when the flag is off, so the private
    // key never reaches the native module.
    expect(mockBuildLink).not.toHaveBeenCalled()
  })
})
