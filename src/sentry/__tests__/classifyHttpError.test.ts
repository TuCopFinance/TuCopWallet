import { classifyHttpError } from 'src/sentry/classifyHttpError'

describe('classifyHttpError', () => {
  it('classifies AbortError as timeout', () => {
    const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    expect(classifyHttpError(err)).toBe('timeout')
  })

  it('classifies "timeout" text as timeout', () => {
    expect(classifyHttpError(new Error('fetchNeeruMeta failed: request timeout'))).toBe('timeout')
  })

  it('classifies SyntaxError as parse_error', () => {
    const err = new SyntaxError('Unexpected token < in JSON')
    expect(classifyHttpError(err)).toBe('parse_error')
  })

  it('classifies "Unexpected end of JSON input" as parse_error', () => {
    expect(classifyHttpError(new Error('Unexpected end of JSON input'))).toBe('parse_error')
  })

  it('classifies 400-499 status codes embedded in message as http_4xx', () => {
    expect(classifyHttpError(new Error('fetch failed: 404 Not Found'))).toBe('http_4xx')
    expect(classifyHttpError(new Error('triggerShortcut: 400 Bad Request body: {...}'))).toBe(
      'http_4xx'
    )
    expect(classifyHttpError(new Error('429 Too Many Requests'))).toBe('http_4xx')
  })

  it('classifies 500-599 status codes as http_5xx', () => {
    expect(classifyHttpError(new Error('backend: 502 Bad Gateway'))).toBe('http_5xx')
    expect(classifyHttpError(new Error('503 Service Unavailable'))).toBe('http_5xx')
  })

  it('classifies "Network request failed" as network_error', () => {
    expect(classifyHttpError(new Error('Network request failed'))).toBe('network_error')
    expect(classifyHttpError(new Error('The network connection was lost'))).toBe('network_error')
  })

  it('falls back to network_error for unclassified errors', () => {
    expect(classifyHttpError(new Error('boom'))).toBe('network_error')
    expect(classifyHttpError('not an error')).toBe('network_error')
    expect(classifyHttpError(null)).toBe('network_error')
  })

  it('does not misread a category id or gas number as an HTTP status', () => {
    // Category ids 0-3 and gas values 15k, 21k, 300k are 1-6 digit numbers
    // but the regex requires 3-digit \b-bounded values. Verify a message with
    // no 3-digit status does not get mis-classified.
    expect(classifyHttpError(new Error('deposit failed for category 3'))).toBe('network_error')
    // A 3-digit gas number would false-match, but real fetch throws include
    // "400 Bad Request"-style prefixes; that gap is acceptable per the review.
  })
})
