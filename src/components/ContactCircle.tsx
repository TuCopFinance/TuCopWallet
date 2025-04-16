import * as React from 'react'
import { Image, StyleSheet, Text, View, ViewStyle } from 'react-native'
import User from 'src/icons/User'
import { Recipient } from 'src/recipients/recipient'
import Colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'

interface Props {
  style?: ViewStyle
  size?: number
  recipient: Recipient
  backgroundColor?: Colors
  foregroundColor?: Colors
  borderColor?: Colors
  DefaultIcon?: React.ComponentType<{ foregroundColor?: Colors; backgroundColor?: Colors }>
}

const DEFAULT_ICON_SIZE = 40

const getNameInitial = (name: string) => name.charAt(0).toLocaleUpperCase()

function ContactCircle({
  size: iconSize = DEFAULT_ICON_SIZE,
  recipient,
  style,
  backgroundColor = Colors.white,
  foregroundColor = Colors.primary,
  borderColor = Colors.primary,
  DefaultIcon = ({ foregroundColor }) => <User color={foregroundColor} />,
}: Props) {
  const renderThumbnail = () => {
    if (recipient.thumbnailPath) {
      return (
        <Image
          source={{ uri: recipient.thumbnailPath }}
          style={[
            styles.image,
            { height: iconSize, width: iconSize, borderRadius: iconSize / 2.0 },
          ]}
          resizeMode={'cover'}
        />
      )
    }

    const fontColor = foregroundColor
    if (recipient.name) {
      const initial = getNameInitial(recipient.name)
      return (
        <Text
          allowFontScaling={false}
          style={[
            typeScale.labelMedium,
            { fontSize: iconSize / 2.0, color: fontColor, lineHeight: iconSize / 1.5 },
          ]}
        >
          {initial.toLocaleUpperCase()}
        </Text>
      )
    }

    return <DefaultIcon foregroundColor={foregroundColor} backgroundColor={backgroundColor} />
  }

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.icon,
          {
            backgroundColor,
            height: iconSize,
            width: iconSize,
            borderRadius: iconSize / 2,
          },
          borderColor && {
            borderColor,
            borderWidth: 1,
          },
        ]}
      >
        {renderThumbnail()}
      </View>
    </View>
  )
}

export default ContactCircle

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    margin: 'auto',
    alignSelf: 'center',
  },
})
