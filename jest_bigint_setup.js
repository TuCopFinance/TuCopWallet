// BigInt JSON serialization polyfill - loaded early via setupFiles
// This MUST run before any test module loading to prevent
// "Do not know how to serialize a BigInt" errors in jest-worker IPC
// eslint-disable-next-line no-extend-native
BigInt.prototype.toJSON = function () {
  return this.toString()
}
