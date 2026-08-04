package org.tucop.wallet;

import android.os.Bundle;
import android.util.Log;
import com.clevertap.android.sdk.CleverTapAPI;
import com.clevertap.android.sdk.pushnotification.NotificationInfo;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class FirebaseMessagingService
  extends com.google.firebase.messaging.FirebaseMessagingService {

  static final String TAG = "FirebaseMessagingService";

  @Override
  public void onMessageReceived(RemoteMessage message) {
    try {
      if (message.getData().size() > 0) {
        Bundle extras = new Bundle();
        for (Map.Entry<String, String> entry : message.getData().entrySet()) {
          extras.putString(entry.getKey(), entry.getValue());
        }
        NotificationInfo info = CleverTapAPI.getNotificationInfo(extras);
        if (info.fromCleverTap) {
          CleverTapAPI.createNotification(getApplicationContext(), extras);
        }
      }
    } catch (Throwable t) {
      Log.e(TAG, "Error parsing FCM message", t);
    }
  }
}
