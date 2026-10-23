package tw.qiguang.island;

import android.app.AppOpsManager;
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
import java.util.HashSet;
import java.util.List;
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
        call.resolve(r);
    }

    @PluginMethod
    public void openUsageSettings(PluginCall call) {
        getActivity().startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
        call.resolve();
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName())));
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

    /** 回到手機桌面（「其實不需要」）。 */
    @PluginMethod
    public void goHome(PluginCall call) {
        getActivity().startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        call.resolve();
    }
}
