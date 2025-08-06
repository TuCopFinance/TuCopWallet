const fs = require('fs')
const path = require('path')

const namespacePatches = [
  {
    file: 'node_modules/react-native-contacts/android/build.gradle',
    namespace: 'com.rt2zz.reactnativecontacts',
  },
  {
    file: 'node_modules/react-native-persona/android/build.gradle',
    namespace: 'com.withpersona.react',
  },
  {
    file: 'node_modules/@react-native-clipboard/clipboard/android/build.gradle',
    namespace: 'com.reactnativeclipboard',
  },
  {
    file: 'node_modules/@react-native-picker/picker/android/build.gradle',
    namespace: 'com.reactnativecommunity.picker',
  },
  {
    file: 'node_modules/@react-native-masked-view/masked-view/android/build.gradle',
    namespace: 'org.reactnative.maskedview',
  },
  {
    file: 'node_modules/react-native-adjust/android/build.gradle',
    namespace: 'com.adjust.sdk.react',
  },
  {
    file: 'node_modules/react-native-android-open-settings/android/build.gradle',
    namespace: 'com.levelasquez.androidopensettings',
  },
  {
    file: 'node_modules/react-native-camera/android/build.gradle',
    namespace: 'org.reactnative.camera',
  },
  {
    file: 'node_modules/react-native-exit-app/android/build.gradle',
    namespace: 'com.github.wumke.RNExitApp',
  },
  {
    file: 'node_modules/react-native-fast-image/android/build.gradle',
    namespace: 'com.dylanvann.fastimage',
  },
  {
    file: 'node_modules/react-native-fs/android/build.gradle',
    namespace: 'com.rnfs',
  },
  {
    file: 'node_modules/react-native-gesture-handler/android/build.gradle',
    namespace: 'com.swmansion.gesturehandler',
  },
  {
    file: 'node_modules/react-native-haptic-feedback/android/build.gradle',
    namespace: 'com.mkuczera',
  },
  {
    file: 'node_modules/react-native-in-app-review/android/build.gradle',
    namespace: 'com.ibits.react_native_in_app_review',
  },
  {
    file: 'node_modules/react-native-linear-gradient/android/build.gradle',
    namespace: 'com.BV.LinearGradient',
  },
  {
    file: 'node_modules/react-native-localize/android/build.gradle',
    namespace: 'com.zoontek.rnlocalize',
  },
  {
    file: 'node_modules/react-native-permissions/android/build.gradle',
    namespace: 'com.zoontek.rnpermissions',
  },
  {
    file: 'node_modules/react-native-picker-select/android/build.gradle',
    namespace: 'com.henninghall.picker',
  },
  {
    file: 'node_modules/react-native-platform-touchable/android/build.gradle',
    namespace: 'com.github.jondot.rntouchable',
  },
  {
    file: 'node_modules/react-native-qrcode-svg/android/build.gradle',
    namespace: 'com.horcrux.svg',
  },
  {
    file: 'node_modules/react-native-quick-crypto/android/build.gradle',
    namespace: 'com.margelo.quickcrypto',
  },
  {
    file: 'node_modules/react-native-restart/android/build.gradle',
    namespace: 'com.reactnativerestart',
  },
  {
    file: 'node_modules/react-native-shadow-2/android/build.gradle',
    namespace: 'com.zoontek.rnshadow',
  },
  {
    file: 'node_modules/react-native-shake/android/build.gradle',
    namespace: 'com.clipsub.rnshake',
  },
  {
    file: 'node_modules/react-native-share/android/build.gradle',
    namespace: 'cl.json',
  },
  {
    file: 'node_modules/react-native-simple-toast/android/build.gradle',
    namespace: 'com.reactnativecommunity.toast',
  },
  {
    file: 'node_modules/react-native-skeleton-placeholder/android/build.gradle',
    namespace: 'com.reactnativeskeletonplaceholder',
  },
  {
    file: 'node_modules/react-native-sms-retriever/android/build.gradle',
    namespace: 'me.furtado.smsretriever',
  },
  {
    file: 'node_modules/react-native-splash-screen/android/build.gradle',
    namespace: 'org.devio.rn.splashscreen',
  },
  {
    file: 'node_modules/react-native-svg/android/build.gradle',
    namespace: 'com.horcrux.svg',
  },
  {
    file: 'node_modules/react-native-vector-icons/android/build.gradle',
    namespace: 'com.oblador.vectoricons',
  },
  {
    file: 'node_modules/react-native-video/android/build.gradle',
    namespace: 'com.brentvatne.react',
  },
  {
    file: 'node_modules/react-native-webview/android/build.gradle',
    namespace: 'com.reactnativecommunity.webview',
  },
]

namespacePatches.forEach(({ file, namespace }) => {
  const filePath = path.join(__dirname, file)
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8')

    // Check if namespace already exists
    if (!content.includes('namespace ')) {
      // Find the android { block
      const androidBlockRegex = /android\s*\{/
      if (androidBlockRegex.test(content)) {
        content = content.replace(androidBlockRegex, `android {\n  namespace "${namespace}"`)
        fs.writeFileSync(filePath, content)
        console.log(`✅ Added namespace to ${file}`)
      } else {
        console.log(`⚠️ Could not find android block in ${file}`)
      }
    } else {
      console.log(`ℹ️ Namespace already exists in ${file}`)
    }
  } else {
    console.log(`⚠️ File not found: ${file}`)
  }
})

console.log('\n✅ Namespace fixes applied!')
