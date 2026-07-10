import {
  clearPasswordCaches,
  endTransactional,
  getCachedPassword,
  pinTransactional,
  setCachedPassword,
} from 'src/pincode/PasswordCache'

describe('PasswordCache transactional hold', () => {
  beforeEach(() => clearPasswordCaches())
  afterEach(() => {
    clearPasswordCaches()
    jest.useRealTimers()
  })

  it('does not expire during a transactional session even if 601s pass', () => {
    jest.useFakeTimers()
    const acct = '0xabc'
    setCachedPassword(acct, 'pw')
    pinTransactional(acct)
    jest.advanceTimersByTime(601 * 1000)
    expect(getCachedPassword(acct)).toBe('pw')
    endTransactional(acct)
    jest.advanceTimersByTime(601 * 1000)
    expect(getCachedPassword(acct)).toBeNull()
  })

  it('endTransactional is idempotent if called multiple times', () => {
    pinTransactional('0xa')
    endTransactional('0xa')
    expect(() => endTransactional('0xa')).not.toThrow()
  })

  it('multiple pinTransactional calls keep the cache pinned until all are released', () => {
    jest.useFakeTimers()
    setCachedPassword('0xa', 'pw')
    pinTransactional('0xa')
    pinTransactional('0xa') // refcount = 2
    endTransactional('0xa') // refcount = 1
    jest.advanceTimersByTime(601 * 1000)
    expect(getCachedPassword('0xa')).toBe('pw')
    endTransactional('0xa') // refcount = 0
    jest.advanceTimersByTime(601 * 1000)
    expect(getCachedPassword('0xa')).toBeNull()
  })
})
