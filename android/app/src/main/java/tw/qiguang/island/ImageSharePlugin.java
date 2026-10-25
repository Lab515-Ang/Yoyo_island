package tw.qiguang.island;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** 專注成果統計圖：存到相簿、用系統分享選單分享。圖片由網頁端畫好（PNG data URL）。 */
@CapacitorPlugin(name = "ImageShare")
public class ImageSharePlugin extends Plugin {

    private static byte[] png(PluginCall call) {
        String data = call.getString("dataUrl", "");
        int comma = data.indexOf(',');
        return Base64.decode(comma >= 0 ? data.substring(comma + 1) : data, Base64.DEFAULT);
    }

    /** 存到相簿的「Pictures/棲光小島」（Android 10 起不需要儲存權限）。 */
    @PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29) {
            call.reject("這個 Android 版本還不支援直接存到相簿，請改用分享");
            return;
        }
        try {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Images.Media.DISPLAY_NAME, call.getString("name", "qiguang") + ".png");
            v.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
            v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/棲光小島");
            Uri uri = getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new IllegalStateException("insert failed");
            try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
                out.write(png(call));
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("存不進相簿");
        }
    }

    /** 寫到暫存資料夾，再用系統分享選單分享。 */
    @PluginMethod
    public void share(PluginCall call) {
        try {
            File f = new File(getContext().getCacheDir(), "share.png");
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(png(call));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(send, call.getString("title", "分享")));
            call.resolve();
        } catch (Exception e) {
            call.reject("無法分享");
        }
    }
}
