package ru.aiternitas.conference;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Foreground service to keep the app process alive for receiving incoming calls
 * when minimized. Improves FCM delivery and WebSocket reconnect on app resume.
 */
public class CallReceiverService extends Service {

    private static final String CHANNEL_ID = "conference_call_receiver";
    private static final int NOTIFICATION_ID = 33329;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createChannel();
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Conference")
                .setContentText("Готов к приёму звонков")
                .setSmallIcon(getResources().getIdentifier("ic_launcher", "mipmap", getPackageName()))
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setOngoing(true)
                .setContentIntent(PendingIntent.getActivity(this, 0,
                        getPackageManager().getLaunchIntentForPackage(getPackageName()),
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
                .build();

        startForeground(NOTIFICATION_ID, notification);
        return START_STICKY;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                    "Приём звонков",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Фоновый режим для приёма входящих звонков");
            channel.setShowBadge(false);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
