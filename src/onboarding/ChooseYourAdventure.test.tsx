import { fireEvent, render } from '@testing-library/react-native'
import * as React from 'react'
import 'react-native'
import { Provider } from 'react-redux'
import AppAnalytics from 'src/analytics/AppAnalytics'
import { OnboardingEvents } from 'src/analytics/Events'
import { FiatExchangeFlow } from 'src/fiatExchanges/utils'
import {
  navigate,
  navigateHome,
  navigateHomeAndThenToScreen,
} from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import ChooseYourAdventure from 'src/onboarding/ChooseYourAdventure'
import { AdventureCardName } from 'src/onboarding/types'
import { createMockStore } from 'test/utils'
import { mockAccount, mockAccount2 } from 'test/values'

describe('ChooseYourAdventure', () => {
  // With LearnPoints removed, the shuffled order for mockAccount is: add, profile, earn
  const orderOptions = [
    {
      address: mockAccount,
      testIDs: [
        'AdventureCard/0/chooseYourAdventure.options.add',
        'AdventureCard/1/chooseYourAdventure.options.profile',
        'AdventureCard/2/chooseYourAdventure.options.earn',
      ],
    },
    {
      address: mockAccount2,
      testIDs: [
        'AdventureCard/0/chooseYourAdventure.options.profile',
        'AdventureCard/1/chooseYourAdventure.options.earn',
        'AdventureCard/2/chooseYourAdventure.options.add',
      ],
    },
  ]

  const expectedCardOrder = [
    AdventureCardName.Add,
    AdventureCardName.Profile,
    AdventureCardName.Earn,
  ]

  const store = createMockStore({
    web3: {
      account: mockAccount,
    },
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each(orderOptions)(
    'shows the elements in a random order seeded by walletAddress',
    ({ address, testIDs }) => {
      const store = createMockStore({
        web3: {
          account: address,
        },
      })
      const { getByTestId } = render(
        <Provider store={store}>
          <ChooseYourAdventure />
        </Provider>
      )
      testIDs.forEach((id) => {
        expect(getByTestId(id)).toBeTruthy()
      })
    }
  )

  it('navigates to the correct screen for add', () => {
    const { getByTestId } = render(
      <Provider store={store}>
        <ChooseYourAdventure />
      </Provider>
    )
    fireEvent.press(getByTestId('AdventureCard/0/chooseYourAdventure.options.add'))
    expect(navigateHome).toHaveBeenLastCalledWith()
    expect(navigate).toHaveBeenCalledWith(Screens.FiatExchangeCurrencyBottomSheet, {
      flow: FiatExchangeFlow.CashIn,
    })
    expect(AppAnalytics.track).toHaveBeenLastCalledWith(OnboardingEvents.cya_button_press, {
      position: 1,
      cardName: AdventureCardName.Add,
      cardOrder: expectedCardOrder,
    })
  })

  it('navigates to the correct screen for profile', () => {
    const { getByTestId } = render(
      <Provider store={store}>
        <ChooseYourAdventure />
      </Provider>
    )
    fireEvent.press(getByTestId('AdventureCard/1/chooseYourAdventure.options.profile'))
    expect(navigateHomeAndThenToScreen).toHaveBeenLastCalledWith(Screens.Profile)
    expect(AppAnalytics.track).toHaveBeenLastCalledWith(OnboardingEvents.cya_button_press, {
      position: 2,
      cardName: AdventureCardName.Profile,
      cardOrder: expectedCardOrder,
    })
  })

  it('navigates to the correct screen for earn', () => {
    const { getByTestId } = render(
      <Provider store={store}>
        <ChooseYourAdventure />
      </Provider>
    )

    fireEvent.press(getByTestId('AdventureCard/2/chooseYourAdventure.options.earn'))
    expect(navigateHomeAndThenToScreen).toHaveBeenLastCalledWith(Screens.EarnInfoScreen)
    expect(AppAnalytics.track).toHaveBeenLastCalledWith(OnboardingEvents.cya_button_press, {
      position: 3,
      cardName: AdventureCardName.Earn,
      cardOrder: expectedCardOrder,
    })
  })

  it('navigates to the correct screen for later', () => {
    const { getByTestId } = render(
      <Provider store={store}>
        <ChooseYourAdventure />
      </Provider>
    )
    fireEvent.press(getByTestId('ChooseYourAdventure/Later'))
    expect(navigateHome).toHaveBeenLastCalledWith()
    expect(AppAnalytics.track).toHaveBeenLastCalledWith(OnboardingEvents.cya_later, {
      cardOrder: expectedCardOrder,
    })
  })
})
