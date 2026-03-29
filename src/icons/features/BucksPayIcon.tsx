import * as React from 'react'
import { Image, StyleSheet } from 'react-native'

interface Props {
  size?: number
}

const BucksPayLogo = require('src/fiatExchanges/buckspay-logo.png')

const BucksPayIcon = ({ size = 32 }: Props) => (
  <Image source={BucksPayLogo} style={[styles.image, { width: size, height: size }]} />
)

const styles = StyleSheet.create({
  image: {
    borderRadius: 8,
  },
})

export default React.memo(BucksPayIcon)
