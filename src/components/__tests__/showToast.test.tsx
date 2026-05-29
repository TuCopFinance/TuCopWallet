import { NotificationVariant } from 'src/components/InLineNotification'
import {
  __resetToastListeners,
  showToast,
  ShowToastInput,
  subscribeToToasts,
} from 'src/components/showToast'

describe('showToast', () => {
  afterEach(() => {
    __resetToastListeners()
  })

  it('dispatches the input to every subscriber', () => {
    const listenerA = jest.fn()
    const listenerB = jest.fn()
    subscribeToToasts(listenerA)
    subscribeToToasts(listenerB)

    const input: ShowToastInput = { message: 'hi', variant: NotificationVariant.Success }
    showToast(input)

    expect(listenerA).toHaveBeenCalledWith(input)
    expect(listenerB).toHaveBeenCalledWith(input)
  })

  it('stops dispatching after unsubscribe', () => {
    const listener = jest.fn()
    const unsubscribe = subscribeToToasts(listener)
    unsubscribe()

    showToast({ message: 'ignored' })

    expect(listener).not.toHaveBeenCalled()
  })

  it('does not throw when called with no listeners', () => {
    expect(() => showToast({ message: 'nobody home' })).not.toThrow()
  })
})
