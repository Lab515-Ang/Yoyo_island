package tw.qiguang.island;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 時間守護給網頁端用的介面：權限、App 清單、設定、解鎖。 */
@CapacitorPlugin(name = "TimeGuard")
public class TimeGuardPlugin extends Plugin {

    @Override
    public void load() {
        TimeGuardService.sync(getContext());
    }

    static boolean hasUsageAccess(Context ctx) {
        AppOpsManager ops = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
        int mode = Build.VERSION.SDK_INT >= 29
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    /** 回傳權限狀態；順便依目前權限啟動或停止服務（玩家剛從系統設定開好權限回來時）。 */
    @PluginMethod
    public void status(PluginCall call) {
        TimeGuardService.sync(getContext());
        JSObject r = new JSObject();
        r.put("usage", hasUsageAccess(getContext()));
        r.put("overlay", Settings.canDrawOverlays(getContext()));
        r.put("exactAlarm", canExactAlarm());
        // 深度專注設定清單：通知（提醒回來、專注倒數）、不受省電限制（背景看守不被系統關掉）
        r.put("notify", androidx.core.app.NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        r.put("battery", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(r);
    }

    /** 電池最佳化清單（讓玩家把棲光小島設成不受限制）。用清單頁，不用直接詢問的視窗：後者 Google Play 審核限制很多。 */
    /** 打開系統設定頁；這支手機沒有那一頁（部分品牌、舊版 Android）就改開 App 資訊頁，不要讓 App 閃退。 */
    private void openSettings(Intent i) {
        try {
            getActivity().startActivity(i);
        } catch (Exception e) {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())));
            } catch (Exception ignored) {
                // 連 App 資訊頁都打不開：什麼都不做
            }
        }
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        openSettings(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        call.resolve();
    }

    /** 這個 App 的通知設定（玩家之前拒絕過，系統不會再跳詢問時用）。 */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        openSettings(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName()));
        call.resolve();
    }

    /** 精確鬧鐘（「鬧鐘與提醒」權限）：倒數結束通知準時跳出。Android 12 以下不用申請。 */
    private boolean canExactAlarm() {
        if (Build.VERSION.SDK_INT < 31) return true;
        android.app.AlarmManager am = (android.app.AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31) openSettings(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName())));
        call.resolve();
    }

    @PluginMethod
    public void openUsageSettings(PluginCall call) {
        openSettings(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
        call.resolve();
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        openSettings(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName())));
        call.resolve();
    }

    /** 手機上所有出現在桌面的 App（不含棲光小島自己），附 96px 圖示。 */
    @PluginMethod
    public void listApps(PluginCall call) {
        getBridge().execute(() -> {
            PackageManager pm = getContext().getPackageManager();
            Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> list = pm.queryIntentActivities(main, 0);
            Set<String> seen = new HashSet<>();
            JSArray apps = new JSArray();
            for (ResolveInfo ri : list) {
                String pkg = ri.activityInfo.packageName;
                if (pkg.equals(getContext().getPackageName()) || !seen.add(pkg)) continue;
                JSObject a = new JSObject();
                a.put("pkg", pkg);
                a.put("label", ri.loadLabel(pm).toString());
                a.put("icon", iconData(ri.loadIcon(pm)));
                apps.put(a);
            }
            JSObject r = new JSObject();
            r.put("apps", apps);
            call.resolve(r);
        });
    }

    private static String iconData(Drawable d) {
        Bitmap b = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
        d.setBounds(0, 0, 96, 96);
        d.draw(new Canvas(b));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.PNG, 100, out);
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    @PluginMethod
    public void getConfig(PluginCall call) {
        try {
            String raw = TimeGuardService.prefs(getContext()).getString(TimeGuardService.KEY_CONFIG, null);
            JSObject r = new JSObject();
            r.put("config", raw == null ? null : new JSObject(raw));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("讀不到時間守護設定");
        }
    }

    @PluginMethod
    public void setConfig(PluginCall call) {
        JSObject c = call.getObject("config");
        if (c == null) {
            call.reject("缺少設定");
            return;
        }
        TimeGuardService.prefs(getContext()).edit().putString(TimeGuardService.KEY_CONFIG, c.toString()).apply();
        TimeGuardService.sync(getContext());
        call.resolve();
    }

    /** 解鎖 minutes 分鐘，然後打開那個 App。 */
    @PluginMethod
    public void unlock(PluginCall call) {
        String pkg = call.getString("pkg");
        int minutes = call.getInt("minutes", 5);
        if (pkg == null) {
            call.reject("缺少 App");
            return;
        }
        TimeGuardService.prefs(getContext()).edit().putLong("unlock:" + pkg, System.currentTimeMillis() + minutes * 60_000L).apply();
        Intent launch = getContext().getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch != null) getActivity().startActivity(launch);
        call.resolve();
    }

    // ---------- 使用時間統計（時間守護首頁） ----------

    /**
     * start～end 之間每個 App 在前景的時間，並切成每 bucketMs 一格（一天用 1 小時、一週用 1 天）。
     * guarded 是想減少使用的 App：每格分成「干擾 App」和「其他 App」兩段。桌面與系統介面不算。
     */
    @PluginMethod
    public void usage(PluginCall call) {
        if (!hasUsageAccess(getContext())) {
            call.reject("沒有使用情況存取權");
            return;
        }
        // optLong：網頁傳來的小數字會是 Integer，getLong 讀不到
        long start = call.getData().optLong("start", 0L);
        long end = call.getData().optLong("end", System.currentTimeMillis());
        long bucket = Math.max(60_000L, call.getData().optLong("bucketMs", 3_600_000L));
        JSArray g = call.getArray("guarded", new JSArray());
        getBridge().execute(() -> {
            try {
                Set<String> guarded = new HashSet<>(g.<String>toList());
                long until = Math.min(end, System.currentTimeMillis());
                int n = (int) Math.max(1, Math.ceil((end - start) / (double) bucket));
                long[] gb = new long[n];
                long[] ob = new long[n];
                Map<String, Long> total = new HashMap<>();
                Set<String> skip = homePackages();
                skip.add("com.android.systemui");
                UsageStatsManager um = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
                // 往前多查 3 小時：區間開始時已經開著的 App 也算得到
                UsageEvents ev = um.queryEvents(start - 3 * 3_600_000L, until);
                UsageEvents.Event e = new UsageEvents.Event();
                // 同一時間只有一個 App 在前景：換成別的 App、螢幕關閉、上鎖、關機／開機時，前一個 App 的時間就結束
                // （不看單一畫面的 PAUSED／STOPPED：同一個 App 換畫面時會先停舊畫面，容易把新畫面也算成結束）
                String cur = null;
                long since = 0;
                while (ev.hasNextEvent()) {
                    ev.getNextEvent(e);
                    int t = e.getEventType();
                    long at = e.getTimeStamp();
                    if (t == 1) { // ACTIVITY_RESUMED
                        String pkg = e.getPackageName();
                        if (pkg.equals(cur)) continue;
                        if (cur != null && !skip.contains(cur)) span(cur, since, at, start, until, bucket, guarded, total, gb, ob);
                        cur = pkg;
                        since = at;
                    } else if (t == 16 || t == 17 || t == 26 || t == 27) { // 螢幕關閉、上鎖畫面、關機、開機
                        if (cur != null && !skip.contains(cur)) span(cur, since, at, start, until, bucket, guarded, total, gb, ob);
                        cur = null;
                    }
                }
                if (cur != null && !skip.contains(cur)) span(cur, since, until, start, until, bucket, guarded, total, gb, ob);

                List<Map.Entry<String, Long>> sorted = new ArrayList<>(total.entrySet());
                sorted.sort((a, b) -> Long.compare(b.getValue(), a.getValue()));
                PackageManager pm = getContext().getPackageManager();
                JSArray apps = new JSArray();
                long sum = 0;
                long guardedSum = 0;
                for (Map.Entry<String, Long> en : sorted) {
                    sum += en.getValue();
                    if (guarded.contains(en.getKey())) guardedSum += en.getValue();
                    if (apps.length() >= 8 || en.getValue() < 60_000L) continue; // 清單只列前 8 個、至少 1 分鐘
                    JSObject a = new JSObject();
                    a.put("pkg", en.getKey());
                    a.put("ms", en.getValue());
                    try {
                        android.content.pm.ApplicationInfo info = pm.getApplicationInfo(en.getKey(), 0);
                        a.put("label", pm.getApplicationLabel(info).toString());
                        a.put("icon", iconData(pm.getApplicationIcon(info)));
                    } catch (PackageManager.NameNotFoundException ex) {
                        a.put("label", en.getKey());
                    }
                    apps.put(a);
                }
                JSArray buckets = new JSArray();
                for (int i = 0; i < n; i++) {
                    JSObject b = new JSObject();
                    b.put("guarded", gb[i]);
                    b.put("other", ob[i]);
                    buckets.put(b);
                }
                JSObject r = new JSObject();
                r.put("totalMs", sum);
                r.put("guardedMs", guardedSum);
                r.put("apps", apps);
                r.put("buckets", buckets);
                call.resolve(r);
            } catch (Exception ex) {
                call.reject("讀不到使用時間");
            }
        });
    }

    /** 把一段前景時間（裁到 start～until 之內）加進總計與各格。 */
    private static void span(String pkg, long a, long b, long start, long until, long bucket, Set<String> guarded, Map<String, Long> total, long[] gb, long[] ob) {
        a = Math.max(a, start);
        b = Math.min(b, until);
        if (b <= a) return;
        Long cur = total.get(pkg);
        total.put(pkg, (cur == null ? 0 : cur) + (b - a));
        long[] arr = guarded.contains(pkg) ? gb : ob;
        for (long x = a; x < b; ) {
            int i = (int) ((x - start) / bucket);
            long y = Math.min(b, start + (i + 1) * bucket);
            if (i < arr.length) arr[i] += y - x;
            x = y;
        }
    }

    /** 桌面 App（切回桌面的時間不算使用）。 */
    private Set<String> homePackages() {
        Set<String> out = new HashSet<>();
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo ri : getContext().getPackageManager().queryIntentActivities(home, 0)) out.add(ri.activityInfo.packageName);
        out.remove("com.android.settings"); // 「設定」裡有開機用的備用桌面，但它是一般 App
        return out;
    }

    // ---------- 深度專注 ----------

    /**
     * 開始看守這段專注：endAt 之後（加上通話時間）自動結束；allow 是允許使用的 App。
     * key 是同一段專注的識別（id＋開始計時的時間）：App 重開、畫面重新掛上時 key 不變，
     * 這時保留背景期間記下的離開與通話，讓網頁端讀到後再結算（不然重開 App 就能洗掉失敗）。
     */
    @PluginMethod
    public void startFocusWatch(PluginCall call) {
        String key = call.getString("key", "");
        JSObject w = new JSObject();
        w.put("endAt", call.getData().optLong("endAt", 0L));
        w.put("graceMs", call.getData().optLong("graceMs", 10_000L));
        w.put("allow", call.getArray("allow", new JSArray()));
        w.put("notifyEnd", call.getBoolean("notifyEnd", false));
        w.put("doneTitle", call.getString("doneTitle", ""));
        w.put("doneText", call.getString("doneText", ""));
        // 常駐通知（狀態列鎖頭）：標題、內容、計時基準（倒數＝結束時間；正向計時＝開始時間）
        w.put("title", call.getString("title", "🔭 專注中"));
        w.put("text", call.getString("text", ""));
        w.put("chronoBase", call.getData().optLong("chronoBase", call.getData().optLong("endAt", 0L)));
        w.put("chronoDown", call.getBoolean("chronoDown", true));
        // 玩家按的暫停：這個時間以前離開小島不算（之後自動繼續，還在外面就照常判定）
        w.put("freeUntil", call.getData().optLong("freeUntil", 0L));
        synchronized (TimeGuardService.LOCK) {
            android.content.SharedPreferences p = TimeGuardService.prefs(getContext());
            android.content.SharedPreferences.Editor e = p.edit().putString("watch", w.toString()).putString("watchKey", key);
            if (key.equals(p.getString("watchKey", null))) {
                e.putBoolean("watchActive", p.getLong("failedAt", 0) == 0); // 已經失敗就維持停止
            } else {
                e.putBoolean("watchActive", true).putLong("awayAt", 0).putLong("failedAt", 0).putLong("callStart", 0).putString("calls", "[]");
                TimeGuardService.cancelAlerts(getContext());
            }
            e.apply();
        }
        TimeGuardService.sync(getContext());
        call.resolve();
    }

    @PluginMethod
    public void stopFocusWatch(PluginCall call) {
        synchronized (TimeGuardService.LOCK) {
            TimeGuardService.prefs(getContext()).edit().putBoolean("watchActive", false).remove("watchKey").putLong("awayAt", 0).putLong("failedAt", 0).putLong("callStart", 0).putString("calls", "[]").apply();
        }
        TimeGuardService.cancelAlerts(getContext());
        TimeGuardService.sync(getContext());
        call.resolve();
    }

    /** 背景期間發生的事：失敗時間（離開的那一刻）、已結束的通話區間、進行中的通話開始時間。 */
    @PluginMethod
    public void focusWatchStatus(PluginCall call) {
        android.content.SharedPreferences p = TimeGuardService.prefs(getContext());
        synchronized (TimeGuardService.LOCK) {
        try {
            JSObject r = new JSObject();
            r.put("active", p.getBoolean("watchActive", false));
            r.put("failedAt", p.getLong("failedAt", 0));
            r.put("callStart", p.getLong("callStart", 0));
            r.put("calls", new JSArray(p.getString("calls", "[]")));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("讀不到深度專注狀態");
        }
        }
    }

    /** 網頁端結算過背景事件後清掉，避免重複套用。 */
    @PluginMethod
    public void clearFocusEvents(PluginCall call) {
        synchronized (TimeGuardService.LOCK) {
            TimeGuardService.prefs(getContext()).edit().putLong("failedAt", 0).putLong("callStart", 0).putString("calls", "[]").apply();
        }
        TimeGuardService.cancelAlerts(getContext());
        call.resolve();
    }

    /**
     * 專注結果（參考 Forest iOS 鎖定畫面的結果卡片）：成功或被嚇跑都留一則通知，附動物圖片，30 分鐘後自動消失。
     * 用 1 號：取代倒數結束時排好的「專注完成」通知，不會同時出現兩則。
     */
    @PluginMethod
    public void showResult(PluginCall call) {
        Context ctx = getContext();
        android.app.NotificationManager nm = ctx.getSystemService(android.app.NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            android.app.NotificationChannel ch = new android.app.NotificationChannel("focusresult", "專注結果", android.app.NotificationManager.IMPORTANCE_DEFAULT);
            ch.setSound(null, null); // 只是留著看，不響、不震動
            ch.enableVibration(false);
            nm.createNotificationChannel(ch);
        }
        String title = call.getString("title", "");
        String text = call.getString("text", "");
        String sub = call.getString("sub", "");
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        android.app.PendingIntent pi = android.app.PendingIntent.getActivity(ctx, 1, open, android.app.PendingIntent.FLAG_IMMUTABLE | android.app.PendingIntent.FLAG_UPDATE_CURRENT);
        androidx.core.app.NotificationCompat.Builder b = new androidx.core.app.NotificationCompat.Builder(ctx, "focusresult")
            .setSmallIcon(R.drawable.ic_stat_scope)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new androidx.core.app.NotificationCompat.BigTextStyle().bigText(sub.isEmpty() ? text : text + '\n' + sub))
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pi)
            .setVisibility(androidx.core.app.NotificationCompat.VISIBILITY_PUBLIC)
            .setTimeoutAfter(30 * 60_000L);
        String icon = call.getString("icon");
        if (icon != null && icon.contains(",")) {
            try {
                byte[] png = Base64.decode(icon.substring(icon.indexOf(',') + 1), Base64.DEFAULT);
                b.setLargeIcon(android.graphics.BitmapFactory.decodeByteArray(png, 0, png.length));
            } catch (Exception ignored) {
                // 圖片壞了就只顯示文字
            }
        }
        nm.cancel(4); // TimeGuardService.ID_DONE
        try {
            nm.notify(1, b.build());
        } catch (SecurityException ignored) {
            // 沒有通知權限：不顯示
        }
        call.resolve();
    }

    /** 回到手機桌面（「其實不需要」）。 */
    @PluginMethod
    public void goHome(PluginCall call) {
        getActivity().startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        call.resolve();
    }
}
