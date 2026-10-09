package com.stooorna.app;

import android.os.Bundle;
import android.view.KeyEvent;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenShieldPlugin.class); // SCREEN-SHIELD (keep any other registerPlugin lines you already have)
        super.onCreate(savedInstanceState);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN && getBridge() != null) {
            PluginHandle h = getBridge().getPlugin("ScreenShield");
            if (h != null && h.getInstance() instanceof ScreenShieldPlugin) {
                ((ScreenShieldPlugin) h.getInstance()).onVolumeDown();
            }
        }
        return super.onKeyDown(keyCode, event); // volume still works normally
    }
}
