package com.stooorna.app;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.database.ContentObserver;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Screen shield for the Templates section.
 * - setActive({active}) is called from templatesShieldPatch.ts when Templates opens/closes.
 * - While active:
 *     a) Volume-Down key press (part of Power + Volume Down screenshot) -> FLAG_SECURE for ~2.5s + popup event
 *     b) Android 14+: Activity.ScreenCaptureCallback -> popup event
 *     c) Fallback: MediaStore observer sees a new "screenshot" image -> popup event
 * - The popup itself is drawn by the web patch when it receives 'stooorna:screenshot-attempt'.
 */
@CapacitorPlugin(name = "ScreenShield")
public class ScreenShieldPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean active = false;
    private ContentObserver observer;
    private Object captureCallback; // Activity.ScreenCaptureCallback (API 34)
    private long lastFire = 0;
    private final Runnable clearSecure = () -> {
        Activity a = getActivity();
        if (a != null) a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    };

    @PluginMethod
    public void setActive(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("active", false));
        main.post(() -> {
            active = on;
            if (on) startDetection(); else { stopDetection(); clearSecure.run(); }
        });
        call.resolve();
    }

    /** Called from MainActivity.onKeyDown(KEYCODE_VOLUME_DOWN). */
    public void onVolumeDown() {
        if (!active) return;
        Activity a = getActivity();
        if (a == null) return;
        a.getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        main.removeCallbacks(clearSecure);
        main.postDelayed(clearSecure, 2500);
        fire();
    }

    private void fire() {
        long now = System.currentTimeMillis();
        if (now - lastFire < 1200) return;
        lastFire = now;
        main.post(() -> {
            try {
                bridge.eval("window.dispatchEvent(new Event('stooorna:screenshot-attempt'))", null);
            } catch (Exception ignored) { }
        });
    }

    private void startDetection() {
        Activity a = getActivity();
        if (a == null) return;
        if (Build.VERSION.SDK_INT >= 34 && captureCallback == null) {
            try {
                Activity.ScreenCaptureCallback cb = () -> fire();
                a.registerScreenCaptureCallback(a.getMainExecutor(), cb);
                captureCallback = cb;
            } catch (Throwable ignored) { }
        }
        if (observer == null) {
            observer = new ContentObserver(main) {
                @Override public void onChange(boolean selfChange, Uri uri) { checkLatestImage(); }
            };
            try {
                a.getContentResolver().registerContentObserver(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, observer);
            } catch (Throwable ignored) { observer = null; }
        }
    }

    private void stopDetection() {
        Activity a = getActivity();
        if (a == null) return;
        if (Build.VERSION.SDK_INT >= 34 && captureCallback != null) {
            try { a.unregisterScreenCaptureCallback((Activity.ScreenCaptureCallback) captureCallback); } catch (Throwable ignored) { }
            captureCallback = null;
        }
        if (observer != null) {
            try { a.getContentResolver().unregisterContentObserver(observer); } catch (Throwable ignored) { }
            observer = null;
        }
    }

    private void checkLatestImage() {
        Activity a = getActivity();
        if (a == null || !active) return;
        String perm = Build.VERSION.SDK_INT >= 33 ? "android.permission.READ_MEDIA_IMAGES" : "android.permission.READ_EXTERNAL_STORAGE";
        if (a.checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED) return;
        try (Cursor c = a.getContentResolver().query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                new String[]{MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.DATE_ADDED},
                null, null, MediaStore.Images.Media.DATE_ADDED + " DESC LIMIT 1")) {
            if (c != null && c.moveToFirst()) {
                String name = String.valueOf(c.getString(0)).toLowerCase();
                long added = c.getLong(1);
                long nowSec = System.currentTimeMillis() / 1000;
                if (name.contains("screenshot") && Math.abs(nowSec - added) <= 10) fire();
            }
        } catch (Throwable ignored) { }
    }

    @Override
    protected void handleOnDestroy() { stopDetection(); }
}
