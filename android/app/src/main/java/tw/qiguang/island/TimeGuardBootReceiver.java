package tw.qiguang.island;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 手機重開或 App 更新後，照設定重新啟動時間守護。 */
public class TimeGuardBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) TimeGuardService.sync(ctx);
    }
}
