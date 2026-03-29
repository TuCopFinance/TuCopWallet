import React from 'react'
import { StyleProp, ViewStyle } from 'react-native'
import { Colors } from 'react-native/Libraries/NewAppScreen'
import Share from 'src/icons/actions/Share'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { TopBarIconButtonV2 } from 'src/navigator/TopBarIconButtonV2'
import { useCOPm } from 'src/tokens/hooks'

interface Props {
  style?: StyleProp<ViewStyle>
  size?: number
  testID?: string
}

export default function SendButton({ testID, size = 23, style }: Props) {
  const COPmToken: any = useCOPm()

  const onPress = () => {
    navigate(Screens.SendSelectRecipient, {
      defaultTokenIdOverride: COPmToken.tokenId,
    })
  }

  return (
    <TopBarIconButtonV2
      icon={<Share size={size} color={Colors.black} />}
      testID={testID}
      onPress={onPress}
      style={style}
    />
  )
}
