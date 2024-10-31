import * as React from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg'

interface Props {
  size?: number
  color?: string
  style?: ViewStyle
  testID?: string
}

export default function Logo({ style, size = 32, color = '#02010A', testID }: Props) {
  return (
    <View testID={testID} style={[styles.container, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <G clipPath="url(#clip0_3069_67395)">
          <Path
            d="M8.17236 8.17594V4.12915H14.0448C17.36 4.12915 19.8225 6.50961 19.8225 9.84226V15.7458H15.797V10.7944C15.797 9.12812 14.7552 8.17594 13.0977 8.17594H8.17236Z"
            fill={color}
          />
          <Path
            d="M15.7971 19.7927V15.7459H10.8719C9.21434 15.7459 8.17245 14.7937 8.17245 13.1274V8.17603H4.14697V14.0796C4.14697 17.4122 6.60962 19.7927 9.92471 19.7927H15.7971Z"
            fill={color}
          />
        </G>
        <Defs>
          <ClipPath id="clip0_3069_67395">
            <Rect width={16} height={16} fill="white" transform="translate(4 4)" />
          </ClipPath>
        </Defs>
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 2,
    shadowOpacity: 1,
    shadowColor: 'rgba(46, 51, 56, 0.15)',
  },
})
