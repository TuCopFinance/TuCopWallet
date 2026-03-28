import { DependencyList, useEffect } from 'react'
import { BackHandler } from 'react-native'

export default function useBackHandler(handler: () => boolean, deps: DependencyList) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handler)

    return () => subscription.remove()
  }, deps)
}
