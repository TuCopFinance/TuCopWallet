import React, { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import colors from 'src/styles/colors'
import { typeScale } from 'src/styles/fonts'

// How long the last entered digit is visible
const LAST_DIGIT_VISIBLE_INTERVAL = 2000 // 2secs

const DOT_SIZE = 8

interface Props {
  pin: string
  maxLength: number
}

interface PinDotProps {
  isEntered: boolean
  char: string | undefined
  index: number
  revealIndex: number
}

function PinDot({ isEntered, char, revealIndex, index }: PinDotProps) {
  const scale = useSharedValue(isEntered ? 1 : 0.8)

  useEffect(() => {
    scale.value = withTiming(isEntered ? 1 : 0.8, { duration: 150 })
  }, [isEntered, scale])

  const animatedDotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: isEntered ? colors.black : 'transparent',
  }))

  const showChar = index === revealIndex && char

  return (
    <Animated.View style={styles.inputContainer} layout={LinearTransition.duration(150)}>
      {showChar ? (
        <Animated.Text
          entering={FadeIn.duration(100)}
          exiting={FadeOut.duration(100)}
          allowFontScaling={false}
          style={styles.char}
        >
          {char}
        </Animated.Text>
      ) : (
        <Animated.View style={[styles.dot, animatedDotStyle]} />
      )}
    </Animated.View>
  )
}

export default function PincodeDisplay({ pin, maxLength }: Props) {
  const revealIndexRef = useRef(-1)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevPinRef = useRef(pin)
  const [revealIndex, setRevealIndex] = React.useState(-1)

  useEffect(() => {
    const prevPin = prevPinRef.current
    prevPinRef.current = pin

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    // Check if pin length is smaller (deleting)
    if (pin.length < prevPin.length) {
      revealIndexRef.current = -1
      setRevealIndex(-1)
      return
    }

    // Reveal the last digit
    revealIndexRef.current = pin.length - 1
    setRevealIndex(pin.length - 1)

    // Hide after interval
    timeoutRef.current = setTimeout(() => {
      revealIndexRef.current = -1
      setRevealIndex(-1)
    }, LAST_DIGIT_VISIBLE_INTERVAL)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [pin])

  return (
    <View style={styles.container} testID="PincodeDisplay">
      {Array.from({ length: maxLength }).map((_, index) => {
        const char = pin[index]
        const isEntered = index < pin.length

        return (
          <PinDot
            key={index}
            index={index}
            isEntered={isEntered}
            char={char}
            revealIndex={revealIndex}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
  inputContainer: {
    flex: 1,
    height: typeScale.titleMedium.lineHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  char: {
    ...typeScale.titleMedium,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 1,
    borderColor: colors.black,
  },
})
