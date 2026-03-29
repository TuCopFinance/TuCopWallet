import LottieView from 'lottie-react-native'
import React from 'react'

const GreenLoadingSpinner = ({ height = 64 }) => {
  return (
    <LottieView
      source={require('src/icons/lottie-json/loadingSpinnerGreen.json')}
      autoPlay={true}
      loop={true}
      style={{ height }}
      testID="GreenLoadingSpinner"
    />
  )
}

export default GreenLoadingSpinner
