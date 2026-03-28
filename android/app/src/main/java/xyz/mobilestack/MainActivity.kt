package xyz.mobilestack

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import com.clevertap.android.sdk.CleverTapAPI
import com.clevertap.react.CleverTapModule
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import org.devio.rn.splashscreen.SplashScreen

class MainActivity : ReactActivity() {

    private var appStartedMillis: Long = 0

    /**
     * Returns the name of the main component registered from JavaScript. This is
     * used to schedule rendering of the component.
     */
    override fun getMainComponentName(): String = BuildConfig.APP_REGISTRY_NAME

    /**
     * Returns the instance of the [ReactActivityDelegate]. Here we use a util class [DefaultReactActivityDelegate]
     * which allows you to easily enable Fabric and Concurrent React (aka React 18) with two boolean flags.
     */
    override fun createReactActivityDelegate(): ReactActivityDelegate {
        return object : DefaultReactActivityDelegate(
            this,
            mainComponentName,
            fabricEnabled
        ) {
            override fun getLaunchOptions(): Bundle {
                // This is used to pass props (in this case app start time) to React
                return Bundle().apply {
                    putLong("appStartedMillis", appStartedMillis)
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        )

        appStartedMillis = System.currentTimeMillis()
        SplashScreen.show(this, R.style.SplashTheme, false)
        super.onCreate(null)
        CleverTapModule.setInitialUri(intent.data)
    }

    override fun onResume() {
        super.onResume()
        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }

    override fun onPause() {
        super.onPause()
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
    }

    override fun onNewIntent(intent: Intent) {
        // Always call super.onNewIntent to handle deep links properly
        super.onNewIntent(intent)
        // Ensure the new intent is used instead of the original one
        setIntent(intent)

        // if firebase is not enabled this would cause a crash because of the firebase app not being inited
        val firebaseEnabled = BuildConfig.FIREBASE_ENABLED.toBoolean()
        if (firebaseEnabled) {
            val cleverTapDefaultInstance = CleverTapAPI.getDefaultInstance(this)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                cleverTapDefaultInstance?.pushNotificationClickedEvent(intent.extras)
            }
        }
    }
}
