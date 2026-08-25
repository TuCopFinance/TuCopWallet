const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const path = require('path')
const exclusionList = require('metro-config/src/defaults/exclusionList')
const escapeStringRegexp = require('escape-string-regexp')
const isE2E = process.env.CELO_TEST_CONFIG === 'e2e'

const root = path.resolve(__dirname)
const escapedRoot = escapeStringRegexp(root)
const blist = [RegExp(`${escapedRoot}\/services\/.*`)]
const defaultSourceExts = require('metro-config/src/defaults/defaults').sourceExts
const defaultAssetExts = require('metro-config/src/defaults/defaults').assetExts

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
    unstable_allowRequireContext: true,
  },
  resolver: {
    assetExts: [...defaultAssetExts, 'txt'].filter((ext) => ext !== 'svg'),
    blockList: exclusionList(
      isE2E ? blist : blist.concat([RegExp(`${escapedRoot}\/e2e\/mocks/.*`)])
    ),
    extraNodeModules: {
      crypto: require.resolve('react-native-quick-crypto'),
      fs: require.resolve('react-native-fs'),
    },
    sourceExts: [...defaultSourceExts, 'svg'],
    // Targeted resolver override so posthog-react-native's subpath imports
    // (`@posthog/core/surveys`, `@posthog/core/utils`, etc) resolve to the
    // built CJS files inside node_modules/@posthog/core/dist/*. Metro on RN
    // 0.77 does NOT honor the package.json `exports` field, and enabling
    // `unstable_enablePackageExports` globally breaks web3-utils' ESM
    // namespace re-exports. Keeping the override tightly scoped to the
    // PostHog subpaths is the minimum surface change that unblocks the
    // SDK import without regressing web3.
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName.startsWith('@posthog/core/') && moduleName !== '@posthog/core') {
        const subpath = moduleName.slice('@posthog/core/'.length)
        return {
          type: 'sourceFile',
          filePath: path.join(root, 'node_modules/@posthog/core/dist', subpath, 'index.js'),
        }
      }
      return context.resolveRequest(context, moduleName, platform)
    },
  },
  watchFolders: [root],
}

module.exports = mergeConfig(getDefaultConfig(__dirname), config)
