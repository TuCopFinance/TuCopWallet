import React from 'react'
import { StyleProp, ViewStyle } from 'react-native'
import { Colors } from 'react-native/Libraries/NewAppScreen'
import { FiatExchangeFlow } from 'src/fiatExchanges/utils'
import ShopToken from 'src/icons/ShopToken'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { TopBarIconButtonV2 } from 'src/navigator/TopBarIconButtonV2'

interface Props {
  style?: StyleProp<ViewStyle>
  size?: number
  testID?: string
}

export default function ShopTokensButton({ testID, size = 23, style }: Props) {
  const onPress = () => {
    navigate(Screens.FiatExchangeCurrencyBottomSheet, { flow: FiatExchangeFlow.CashIn })
  }

  return (
    <TopBarIconButtonV2
      icon={<ShopToken size={size} color={Colors.black} />}
      testID={testID}
      onPress={onPress}
      style={style}
    />
  )
}
