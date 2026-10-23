package tw.qiguang.island;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.util.Calendar;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 時間守護：每秒看一次前景 App，玩家選的 App 在守護時段內被打開時，把棲光小島叫到前面顯示攔截畫面。
 * 設定存在 SharedPreferences，App 被關掉、手機重開後服務仍照設定運作。
 */
public class TimeGuardService extends Service {

    static final String PREFS = "timeguard";
    static final String KEY_CONFIG = "config";
    private static final String CHANNEL = "timeguard";
    private static final long TICK_MS = 1000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private String foreground;
    private long lastLaunch;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            check();
            handler.postDelayed(this, TICK_MS);
        }
    };

    static JSONObject config(Context ctx) {
        try {
            String raw = prefs(ctx).getString(KEY_CONFIG, null);
            return raw == null ? null : new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean enabled(Context ctx) {
        JSONObject c = config(ctx);
        return c != null && c.optBoolean("enabled");
    }

    /** 依設定啟動或停止服務（只能在 App 前景、開機廣播時呼叫）。 */
    static void sync(Context ctx) {
        Intent i = new Intent(ctx, TimeGuardService.class);
        if (enabled(ctx) && TimeGuardPlugin.hasUsageAccess(ctx)) ContextCompat.startForegroundService(ctx, i);
        else ctx.stopService(i);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "時間守護", NotificationManager.IMPORTANCE_MIN));
        }
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("時間守護開啟中")
            .setContentText("打開你想減少使用的 App 時，小島會先請你停一下。")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);
        handler.post(tick);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!enabled(this)) stopSelf();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void check() {
        PowerManager pm = getSystemService(PowerManager.class);
        if (pm != null && !pm.isInteractive()) return;
        JSONObject c = config(this);
        if (c == null || !c.optBoolean("enabled")) {
            stopSelf();
            return;
        }
        // 最近 5 秒內最後一個進入前景的 App；沒有新事件就沿用上一次的結果
        long now = System.currentTimeMillis();
        UsageStatsManager usm = getSystemService(UsageStatsManager.class);
        UsageEvents events = usm.queryEvents(now - 5000, now);
        UsageEvents.Event e = new UsageEvents.Event();
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            if (e.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) foreground = e.getPackageName();
        }
        if (foreground == null || foreground.equals(getPackageName())) return;
        String label = blockedLabel(c, foreground);
        if (label == null || !inSchedule(c, Calendar.getInstance())) return;
        if (now < prefs(this).getLong("unlock:" + foreground, 0)) return;
        if (now - lastLaunch < 3000) return;
        lastLaunch = now;
        Uri uri = Uri.parse("qiguang://guard").buildUpon().appendQueryParameter("pkg", foreground).appendQueryParameter("label", label).build();
        Intent i = new Intent(Intent.ACTION_VIEW, uri, this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
        } catch (Exception ignored) {
            // 系統不允許從背景開啟畫面（通常是沒有「顯示在其他應用程式上層」權限）
        }
    }

    private static String blockedLabel(JSONObject c, String pkg) {
        JSONArray apps = c.optJSONArray("apps");
        if (apps == null) return null;
        for (int i = 0; i < apps.length(); i++) {
            JSONObject a = apps.optJSONObject(i);
            if (a != null && pkg.equals(a.optString("pkg"))) return a.optString("label", pkg);
        }
        return null;
    }

    /** 守護時段：總是啟用，或每週勾選的日子 from～to（分鐘；from > to 表示跨午夜）。 */
    static boolean inSchedule(JSONObject c, Calendar now) {
        if (c.optBoolean("always", true)) return true;
        JSONArray days = c.optJSONArray("days");
        int from = c.optInt("from"), to = c.optInt("to");
        int day = now.get(Calendar.DAY_OF_WEEK) - 1; // 0 = 週日
        int min = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        if (days == null) return false;
        if (from < to) return days.optBoolean(day) && min >= from && min < to;
        return (days.optBoolean(day) && min >= from) || (days.optBoolean((day + 6) % 7) && min < to);
    }
}
