import { useEffect, useRef, useState } from 'react'
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'
import type { ConnectivityState, ConnectivityTransition, ConnectivityType } from './types'

const HISTORY_CAP = 5

function mapType(t: NetInfoState['type']): ConnectivityType {
  if (t === 'wifi') return 'wifi'
  if (t === 'cellular') return 'cellular'
  if (t === 'none') return 'none'
  return 'unknown'
}

export function useConnectivityState(): ConnectivityState {
  const [state, setState] = useState<ConnectivityState>({
    isConnected: true,
    type: 'unknown',
    history: [],
  })
  const historyRef = useRef<ConnectivityTransition[]>([])

  useEffect(() => {
    let mounted = true
    void NetInfo.fetch().then((s) => {
      if (!mounted) return
      setState({
        isConnected: Boolean(s.isConnected),
        type: mapType(s.type),
        history: historyRef.current,
      })
    })
    const unsubscribe = NetInfo.addEventListener((s) => {
      if (!mounted) return
      const isConnected = Boolean(s.isConnected)
      historyRef.current = [...historyRef.current, { at: Date.now(), isConnected }].slice(
        -HISTORY_CAP
      )
      setState({ isConnected, type: mapType(s.type), history: historyRef.current })
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return state
}
