package ru.aiternitas.conference;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class MyFirebaseMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        // Check if message contains a data payload.
        if (remoteMessage.getData().size() > 0) {
            Map<String, String> data = remoteMessage.getData();

            // Check if this is an incoming call (look for fullScreenId property)
            if (data.containsKey("fullScreenId")) {
                showFullScreenNotification(data);
            }
        }
    }

    private void showFullScreenNotification(Map<String, String> data) {
        String channelId = "incoming_call_channel";
        String title = data.getOrDefault("title", "Входящий звонок");
        String body = data.getOrDefault("text", "Нажмите, чтобы ответить");

        // Intent to launch MainActivity
        Intent fullScreenIntent = new Intent(this, MainActivity.class);
        // Add flags to ensure activity is brought to front/created
        fullScreenIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        // Put all data into intent extras so Capacitor can read it
        for (Map.Entry<String, String> entry : data.entrySet()) {
            fullScreenIntent.putExtra(entry.getKey(), entry.getValue());
        }

        // Create PendingIntent
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(this, 0,
                fullScreenIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        // Create Notification Channel (Required for Android O+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    channelId,
                    "Входящие звонки",
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Уведомления о входящих звонках на весь экран");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            // Configure sound/vibration if needed, although usually handled by app logic
            // once opened
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .build();
            // channel.setSound(..., audioAttributes);
            channel.enableVibration(true);

            notificationManager.createNotificationChannel(channel);
        }

        // Build Notification
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(getResources().getIdentifier("ic_launcher", "mipmap", getPackageName()))
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setFullScreenIntent(fullScreenPendingIntent, true) // This triggers the full screen activity
                .setAutoCancel(true)
                .setOngoing(true) // Prevent dismissal until answered
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        // Show notification
        // Use a fixed ID or unique one based on callId? Fixed is safer to avoid spam.
        // Or hashcode of callId.
        int notificationId = data.containsKey("callId") ? data.get("callId").hashCode() : 12345;
        notificationManager.notify(notificationId, builder.build());
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        // Token is also handled by Capacitor Push plugin, so we might duplicate logic
        // here or ignore.
        // Usually safe to ignore if plugin handles it.
    }
}
