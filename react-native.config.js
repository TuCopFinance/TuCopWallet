const path = require('path')

module.exports = {
  project: {
    ios: {
      sourceDir: './ios',
    },
    android: {
      sourceDir: './android',
      packageName: 'xyz.mobilestack',
      appName: 'app',
    },
  },
  assets: ['./assets/fonts/'],
}
