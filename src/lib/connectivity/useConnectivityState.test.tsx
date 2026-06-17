import { renderHook, act } from '@testing-library/react-native'
import NetInfo from '@react-native-community/netinfo'
import { useConnectivityState } from './useConnectivityState'

jest.mock('@react-native-community/netinfo')

describe('useConnectivityState', () => {
  let listeners: Array<(s: any) => void> = []

  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    listeners = []
    ;(NetInfo as any).addEventListener = jest.fn((cb) => {
      listeners.push(cb)
      return () => {
        listeners = listeners.filter((l) => l !== cb)
      }
    })
    ;(NetInfo as any).fetch = jest.fn().mockResolvedValue({ isConnected: true, type: 'wifi' })
  })

  it('returns initial connected state', async () => {
    const { result } = renderHook(() => useConnectivityState())
    await flush()
    expect(result.current.isConnected).toBe(true)
    expect(result.current.type).toBe('wifi')
  })

  it('updates when NetInfo emits a disconnect', async () => {
    const { result } = renderHook(() => useConnectivityState())
    await flush()
    void act(() => {
      listeners.forEach((cb) => cb({ isConnected: false, type: 'none' }))
    })
    expect(result.current.isConnected).toBe(false)
  })

  it('records last 5 transitions in history', async () => {
    const { result } = renderHook(() => useConnectivityState())
    await flush()
    void act(() => {
      listeners.forEach((cb) => cb({ isConnected: false, type: 'none' }))
    })
    void act(() => {
      listeners.forEach((cb) => cb({ isConnected: true, type: 'cellular' }))
    })
    expect(result.current.history.length).toBeGreaterThanOrEqual(2)
    expect(result.current.history.slice(-1)[0].isConnected).toBe(true)
  })

  it('caps history at 5 entries', async () => {
    const { result } = renderHook(() => useConnectivityState())
    await flush()
    for (let i = 0; i < 10; i++) {
      void act(() => {
        listeners.forEach((cb) => cb({ isConnected: i % 2 === 0, type: 'wifi' }))
      })
    }
    expect(result.current.history.length).toBeLessThanOrEqual(5)
  })
})
