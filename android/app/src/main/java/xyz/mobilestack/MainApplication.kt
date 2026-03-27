package xyz.mobilestack

import androidx.multidex.MultiDexApplication
import cl.json.ShareApplication
import com.clevertap.android.sdk.ActivityLifecycleCallback
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.modules.network.OkHttpClientProvider
import com.facebook.soloader.SoLoader
import com.facebook.react.soloader.OpenSourceMergedSoMapping

class MainApplication : MultiDexApplication(), ShareApplication, ReactApplication {

    companion object {
        const val TAG = "MainApplication"
    }

    override val reactNativeHost: ReactNativeHost = object : DefaultReactNativeHost(this) {
        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override fun getPackages(): List<ReactPackage> = PackageList(this).packages

        override fun getJSMainModuleName(): String = "index"

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED

        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
    }

    override fun onCreate() {
        // CleverTap setup
        ActivityLifecycleCallback.register(this)

        super.onCreate()

        SoLoader.init(this, OpenSourceMergedSoMapping)
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            // If you opted-in for the New Architecture, we load the native entry point for this app.
            load()
        }
        OkHttpClientProvider.setOkHttpClientFactory(UserAgentClientFactory(this))
    }

    override fun getFileProviderAuthority(): String = "${BuildConfig.APPLICATION_ID}.provider"
}
