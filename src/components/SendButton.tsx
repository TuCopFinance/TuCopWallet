import React from 'react'
import { StyleProp, ViewStyle } from 'react-native'
import { Colors } from 'react-native/Libraries/NewAppScreen'
import Share from 'src/icons/Share'
import { navigate } from 'src/navigator/NavigationService'
import { Screens } from 'src/navigator/Screens'
import { TopBarIconButtonV2 } from 'src/navigator/TopBarIconButtonV2'
import { useCCOP } from 'src/tokens/hooks'

interface Props {
  style?: StyleProp<ViewStyle>
  size?: number
  testID?: string
}

export default function SendButton({ testID, size = 23, style }: Props) {
  const cCCOPToken: any = useCCOP()

  const onPress = () => {
    navigate(Screens.SendSelectRecipient, {
      defaultTokenIdOverride: cCCOPToken.tokenId,
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
