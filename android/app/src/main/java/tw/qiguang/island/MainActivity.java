package tw.qiguang.island;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TimeGuardPlugin.class);
        registerPlugin(ImageSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
