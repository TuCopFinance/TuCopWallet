import * as React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Shadow } from 'react-native-shadow-2'
import Touchable from 'src/components/Touchable'
import Backspace from 'src/icons/Backspace'
import Colors from 'src/styles/colors'
import { Inter } from 'src/styles/fonts'

interface Props {
  onDigitPress: (digit: number) => void
  onBackspacePress: () => void
  onDecimalPress?: () => void
  onBackspaceLongPress?: () => void
  decimalSeparator?: string
  testID?: string
}

function DigitButton({
  digit,
  onDigitPress,
}: {
  digit: number
  onDigitPress: (digit: number) => void
}) {
  const onPress = () => onDigitPress(digit)
  return (
    <Shadow style={styles.shadow} offset={[0, 4]} startColor="rgba(190, 201, 255, 0.28)">
      <Touchable testID={`digit${digit}`} borderless={true} onPress={onPress}>
        <Text allowFontScaling={false} style={styles.digit}>
          {digit}
        </Text>
      </Touchable>
    </Shadow>
  )
}

export default function NumberKeypad(props: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <DigitButton digit={1} onDigitPress={props.onDigitPress} />
        <DigitButton digit={2} onDigitPress={props.onDigitPress} />
        <DigitButton digit={3} onDigitPress={props.onDigitPress} />
      </View>
      <View style={styles.row}>
        <DigitButton digit={4} onDigitPress={props.onDigitPress} />
        <DigitButton digit={5} onDigitPress={props.onDigitPress} />
        <DigitButton digit={6} onDigitPress={props.onDigitPress} />
      </View>
      <View style={styles.row}>
        <DigitButton digit={7} onDigitPress={props.onDigitPress} />
        <DigitButton digit={8} onDigitPress={props.onDigitPress} />
        <DigitButton digit={9} onDigitPress={props.onDigitPress} />
      </View>
      <View style={styles.row}>
        {props.decimalSeparator && props.onDecimalPress ? (
          <Touchable
            borderless={true}
            onPress={props.onDecimalPress}
            testID={`digit${props.decimalSeparator}`}
          >
            <Text style={styles.digit}>{props.decimalSeparator}</Text>
          </Touchable>
        ) : (
          <View style={styles.digit} />
        )}
        <DigitButton digit={0} onDigitPress={props.onDigitPress} />
        <Touchable
          testID="Backspace"
          borderless={true}
          onPress={props.onBackspacePress}
          onLongPress={props.onBackspaceLongPress}
        >
          <View style={styles.digit}>
            <Backspace />
          </View>
        </Touchable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: 300,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    flexShrink: 0,
    display: 'flex',
    gap: 38,
    flexWrap: 'wrap',
    paddingBottom: 20,
    marginBottom: 20,
  },
  row: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  digit: {
    borderRadius: 80,
    width: 56,
    height: 56,
    backgroundColor: Colors.white,
    fontSize: 32,
    lineHeight: 44,
    justifyContent: 'center',
    textAlign: 'center',
    alignItems: 'center',
    textAlignVertical: 'center',
    fontFamily: Inter.Bold,
    color: Colors.primary,
    borderColor: Colors.white,
  },
  shadow: {
    borderRadius: 80,
    display: 'flex',
    marginTop: 3,
    borderColor: Colors.white,
  },
})
