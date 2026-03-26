export const init = jest.fn()
export const wrap = jest.fn().mockImplementation((x: any) => x)
export const nativeCrash = jest.fn()
export const flush = jest.fn()
export const close = jest.fn()
export const captureException = jest.fn()
export const captureMessage = jest.fn()
export const captureEvent = jest.fn()
export const captureUserFeedback = jest.fn()
export const setUser = jest.fn()
export const setTag = jest.fn()
export const setTags = jest.fn()
export const setContext = jest.fn()
export const setExtra = jest.fn()
export const setExtras = jest.fn()
export const addBreadcrumb = jest.fn()
export const withScope = jest.fn()
export const config = () => ({ install: jest.fn() })
export const setTagsContext = jest.fn()
export const Severity = {
  Error: 'error',
}
export const reactNavigationIntegration = jest.fn().mockImplementation(() => ({
  registerNavigationContainer: jest.fn(),
}))
export const reactNativeTracingIntegration = jest.fn().mockImplementation(() => ({}))
export const Scope = jest.fn()
export const getClient = jest.fn().mockReturnValue({
  getOptions: jest.fn().mockReturnValue({}),
})
export const startInactiveSpan = jest.fn().mockReturnValue({
  end: jest.fn(),
  setAttribute: jest.fn(),
})
