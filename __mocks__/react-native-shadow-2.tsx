import React from 'react'
import { View } from 'react-native'

export function Shadow({ children, ...props }: any) {
  return <View {...props}>{children}</View>
}
