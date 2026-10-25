package tw.qiguang.island;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
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
 * 每秒看一次前景 App，負責兩件事：
 * 1. 時間守護：玩家選的 App 在守護時段內被打開時，把棲光小島叫到前面顯示攔截畫面。
 * 2. 深度專注：專注中離開小島（允許名單以外）超過寬限時間就記下失敗；接電話期間記成暫停。
 *    結果存在 SharedPreferences，網頁端回到前景時讀取並結算（App 在背景時網頁不會執行）。
 * 設定存在 SharedPreferences，App 被關掉、手機重開後服務仍照設定運作。
 */
public class TimeGuardService extends Service {

    static final String PREFS = "timeguard";
    static final String KEY_CONFIG = "config";
    private static final String CHANNEL = "timeguard";
    private static final String CHANNEL_ALERT = "focuswatch";
    private static final int ID_SERVICE = 7001; // 不能用 1：倒數結束通知（LocalNotifications）用的是 1
    private static final int ID_FOCUS_END = 1;
    private static final int ID_AWAY = 2;
    private static final int ID_FAILED = 3;
    private static final int ID_DONE = 4;
    /** 背景服務（主執行緒）與外掛（bridge 執行緒）都會讀改寫看守狀態：同一把鎖。 */
    static final Object LOCK = new Object();
    /** 系統畫面：通知列、權限詢問視窗（不同手機的套件名稱不同）。 */
    private static final java.util.Set<String> SYSTEM_OK = new java.util.HashSet<>(java.util.Arrays.asList(
        "com.android.systemui", "com.google.android.permissioncontroller", "com.android.permissioncontroller"));
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

    static boolean watching(Context ctx) {
        return prefs(ctx).getBoolean("watchActive", false);
    }

    static boolean shouldRun(Context ctx) {
        return (enabled(ctx) || watching(ctx)) && TimeGuardPlugin.hasUsageAccess(ctx);
    }

    /** 依設定啟動或停止服務（只能在 App 前景、開機廣播時呼叫）。 */
    static void sync(Context ctx) {
        Intent i = new Intent(ctx, TimeGuardService.class);
        if (shouldRun(ctx)) ContextCompat.startForegroundService(ctx, i);
        else ctx.stopService(i);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "時間守護", NotificationManager.IMPORTANCE_MIN));
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_ALERT, "深度專注提醒", NotificationManager.IMPORTANCE_HIGH));
        }
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("棲光小島守護中")
            .setContentText("時間守護與深度專注會在背景幫你留意手機。")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID_SERVICE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(ID_SERVICE, n);
        handler.post(tick);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!shouldRun(this)) stopSelf();
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
        if (!shouldRun(this)) {
            stopSelf();
            return;
        }
        long now = System.currentTimeMillis();
        PowerManager pm = getSystemService(PowerManager.class);
        boolean interactive = pm == null || pm.isInteractive();
        if (interactive) {
            // 最近 5 秒內最後一個進入前景的 App；沒有新事件就沿用上一次的結果
            UsageStatsManager usm = getSystemService(UsageStatsManager.class);
            UsageEvents events = usm.queryEvents(now - 5000, now);
            UsageEvents.Event e = new UsageEvents.Event();
            while (events.hasNextEvent()) {
                events.getNextEvent(e);
                if (e.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) foreground = e.getPackageName();
            }
        }
        synchronized (LOCK) {
            if (watching(this)) watchTick(now, interactive);
        }

        JSONObject c = config(this);
        if (!interactive || c == null || !c.optBoolean("enabled")) return;
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

    /** 深度專注：專注結束、接電話、離開太久。 */
    /** 呼叫前要先拿 LOCK。 */
    private void watchTick(long now, boolean interactive) {
        SharedPreferences p = prefs(this);
        JSONObject w;
        JSONArray calls;
        try {
            w = new JSONObject(p.getString("watch", "{}"));
            calls = new JSONArray(p.getString("calls", "[]"));
        } catch (Exception ex) {
            p.edit().putBoolean("watchActive", false).apply();
            return;
        }
        long callStart = p.getLong("callStart", 0);
        long callTotal = callStart > 0 ? now - callStart : 0;
        for (int i = 0; i < calls.length(); i++) {
            JSONArray c = calls.optJSONArray(i);
            if (c != null) callTotal += c.optLong(1) - c.optLong(0);
        }
        long endAt = w.optLong("endAt");
        // 有通話順延：原本時間跳出的「專注完成」（網頁端排的）不準了，收回
        if (callTotal > 0 && now >= endAt) cancel(ID_FOCUS_END);
        // 專注時間到了（通話時間不算在內）：不用再看
        if (now >= endAt + callTotal) {
            p.edit().putBoolean("watchActive", false).apply();
            cancel(ID_AWAY);
            if (callTotal > 0 && w.optBoolean("notifyEnd")) alert(ID_DONE, w.optString("doneTitle"), w.optString("doneText"));
            return;
        }
        // 螢幕關著：手機放下了，什麼都不變（離開的計時也不重來，避免開關螢幕繞過）
        if (!interactive) return;
        boolean inIsland = foreground == null || foreground.equals(getPackageName());
        // 接電話（離開小島去接）：記成暫停，不算離開；在小島裡講電話（例如語音陪讀）照常計時
        AudioManager am = getSystemService(AudioManager.class);
        int mode = am == null ? AudioManager.MODE_NORMAL : am.getMode();
        boolean inCall = mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION || mode == AudioManager.MODE_RINGTONE;
        if (inCall && !inIsland) {
            if (callStart == 0) p.edit().putLong("callStart", now).putLong("awayAt", 0).apply();
            cancel(ID_AWAY);
            return;
        }
        if (callStart > 0) {
            calls.put(new JSONArray().put(callStart).put(now));
            p.edit().putString("calls", calls.toString()).putLong("callStart", 0).apply();
        }
        // 在小島裡、拉下通知列、系統權限詢問視窗、允許名單裡的 App 都不算離開
        JSONArray allow = w.optJSONArray("allow");
        boolean ok = inIsland || SYSTEM_OK.contains(foreground);
        for (int i = 0; !ok && allow != null && i < allow.length(); i++) ok = foreground.equals(allow.optString(i));
        long awayAt = p.getLong("awayAt", 0);
        if (ok) {
            if (awayAt > 0) {
                p.edit().putLong("awayAt", 0).apply();
                cancel(ID_AWAY);
            }
            return;
        }
        long grace = w.optLong("graceMs", 10_000);
        if (awayAt == 0) {
            p.edit().putLong("awayAt", now).apply();
            alert(ID_AWAY, "快回到棲光小島", (grace / 1000) + " 秒內回來，動物就不會被嚇跑。");
        } else if (now - awayAt >= grace) {
            // 從離開的那一刻算放棄
            p.edit().putLong("failedAt", awayAt).putBoolean("watchActive", false).apply();
            cancel(ID_AWAY);
            alert(ID_FAILED, "動物被嚇跑了", "離開棲光小島超過 " + (grace / 1000) + " 秒，這次專注沒有完成。");
        }
    }

    private void alert(int id, String title, String text) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, id, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CHANNEL_ALERT)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build();
        try {
            getSystemService(NotificationManager.class).notify(id, n);
        } catch (SecurityException ignored) {
            // 沒有通知權限：仍然照常判定，只是不會跳提醒
        }
    }

    static void cancelAlerts(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.cancel(ID_AWAY);
        nm.cancel(ID_FAILED);
    }

    private void cancel(int id) {
        getSystemService(NotificationManager.class).cancel(id);
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
        if (days == null || from == to) return false;
        if (from < to) return days.optBoolean(day) && min >= from && min < to;
        return (days.optBoolean(day) && min >= from) || (days.optBoolean((day + 6) % 7) && min < to);
    }
}
