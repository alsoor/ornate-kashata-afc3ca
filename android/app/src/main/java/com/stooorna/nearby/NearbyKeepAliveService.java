package com.stooorna.nearby;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.webkit.CookieManager;

import androidx.core.content.ContextCompat;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * خدمة أمامية (Foreground Service) تبقي عملية التطبيق شغالة وهو بالخلفية:
 *  1) البلوتوث (Nearby) يظل يعلن عن المستخدم ويلقطه الآخرون حتى لو طلع من التطبيق.
 *  2) [v2] نشر الموقع (GPS) للسيرفر كل ~45 ثانية من الخدمة نفسها (بدون الحاجة لصفحة الويب)،
 *     عبر نفس جلسة المستخدم (كوكيز الـWebView) => POST /api/nearby/ping — فيظهر لبقية المستخدمين وهو خارج التطبيق.
 *  3) [v2] تبليغ السيرفر بمن لقطهم البلوتوث (/api/nearby/ble-seen) حتى يظهروا عبر السيرفر أيضاً.
 * تبدأ مع start() في StooornaNearbyPlugin وتتوقف مع stop().
 *
 * Extras: serverUrl (مثل https://example.com) · geo (boolean — انشر الموقع أم لا)
 */
public class NearbyKeepAliveService extends Service {
    public static final String EXTRA_SERVER = "serverUrl";
    public static final String EXTRA_GEO = "geo";

    private static final String CHANNEL_ID = "stooorna_nearby";
    private static final int NOTIF_ID = 7431;
    private static final long BEAT_MS = 45_000L;

    private static volatile boolean running = false;
    public static boolean isRunning() { return running; }

    private HandlerThread thread;
    private Handler bg;
    private LocationManager lm;
    private volatile Location last;
    private volatile String serverUrl = "";
    private volatile boolean geo = false;
    private boolean listening = false;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String s = intent.getStringExtra(EXTRA_SERVER);
            if (s != null && !s.isEmpty()) serverUrl = s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
            geo = intent.getBooleanExtra(EXTRA_GEO, false);
        }
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm != null) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Nearby", NotificationManager.IMPORTANCE_LOW));
            }
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
            Notification n = b.setContentTitle("Stooorna Nearby")
                .setContentText("Visible to people nearby via Bluetooth" + (geo ? " & GPS" : ""))
                .setSmallIcon(getApplicationInfo().icon)
                .setOngoing(true)
                .build();
            startFg(n);
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        ensureThread();
        bg.removeCallbacksAndMessages(null);
        if (geo && !serverUrl.isEmpty()) {
            startLocation();
            bg.post(beat);
        } else {
            stopLocation();
        }
        return START_NOT_STICKY; // لو العملية انقتلت، ما نرجّع إشعار بدون بلوتوث
    }

    /** نوع الخدمة: connectedDevice دائماً، + location إذا الصلاحية موجودة (أندرويد 14 يرمي استثناء لو النوع بلا صلاحية). */
    private void startFg(Notification n) {
        if (Build.VERSION.SDK_INT >= 29) {
            int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE;
            if (geo && hasLoc()) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
            try { startForeground(NOTIF_ID, n, type); return; }
            catch (Exception e) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
                geo = false; // ما قدرنا نأخذ نوع الموقع => بلوتوث فقط
            }
        } else {
            startForeground(NOTIF_ID, n);
        }
    }

    private boolean hasLoc() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void ensureThread() {
        if (thread != null) return;
        thread = new HandlerThread("stooorna-nearby-beat");
        thread.start();
        bg = new Handler(thread.getLooper());
    }

    /* ───────────── الموقع ───────────── */

    private final LocationListener listener = new LocationListener() {
        @Override public void onLocationChanged(Location l) { if (l != null) last = l; }
        @Override public void onProviderEnabled(String p) { }
        @Override public void onProviderDisabled(String p) { }
        @Override public void onStatusChanged(String p, int s, Bundle b) { }
    };

    private void startLocation() {
        if (listening || !hasLoc()) return;
        try {
            lm = (LocationManager) getSystemService(LOCATION_SERVICE);
            if (lm == null) return;
            Looper lp = thread.getLooper();
            boolean any = false;
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) { lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 30_000L, 0f, listener, lp); any = true; }
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) { lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 30_000L, 0f, listener, lp); any = true; }
            listening = any;
            // آخر موقع معروف كبداية سريعة
            for (String p : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) {
                try { Location l = lm.getLastKnownLocation(p); if (l != null && (last == null || l.getTime() > last.getTime())) last = l; } catch (SecurityException ignored) { /* */ }
            }
        } catch (Exception ignored) { /* */ }
    }

    private void stopLocation() {
        if (!listening || lm == null) { listening = false; return; }
        try { lm.removeUpdates(listener); } catch (Exception ignored) { /* */ }
        listening = false;
    }

    /* ───────────── النبضة: تنشر الموقع كل 45 ث ───────────── */

    private final Runnable beat = new Runnable() {
        @Override public void run() {
            try {
                if (!running) return;
                if (geo && !serverUrl.isEmpty()) {
                    if (!listening) startLocation();
                    Location l = last;
                    // لا ننشر موقعاً أقدم من 10 دقائق
                    if (l != null && System.currentTimeMillis() - l.getTime() < 10 * 60_000L) {
                        String body = String.format(Locale.US, "{\"lat\":%.6f,\"lng\":%.6f,\"accuracy\":%.1f}", l.getLatitude(), l.getLongitude(), l.hasAccuracy() ? l.getAccuracy() : 0f);
                        postJson(serverUrl, "/api/nearby/ping", body, true);
                    }
                }
            } catch (Throwable ignored) { /* */ }
            if (running && bg != null) bg.postDelayed(this, BEAT_MS);
        }
    };

    /** POST بجلسة المستخدم (كوكيز الـWebView). يرجع كود الاستجابة أو -1. */
    private int postJson(String base, String path, String json, boolean stopOn401) {
        HttpURLConnection c = null;
        try {
            String cookie = CookieManager.getInstance().getCookie(base);
            if (cookie == null || cookie.isEmpty()) return -1; // ما في جلسة => ما ننشر شيء
            c = (HttpURLConnection) new URL(base + path).openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(10_000);
            c.setReadTimeout(10_000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Cookie", cookie);
            try (OutputStream os = c.getOutputStream()) { os.write(json.getBytes(StandardCharsets.UTF_8)); }
            int code = c.getResponseCode();
            if (code == 401 && stopOn401) { running = false; stopSelf(); } // الجلسة انتهت (تسجيل خروج) => نوقف النشر
            return code;
        } catch (Exception e) {
            return -1;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** تُستدعى من الإضافة: أبلغ السيرفر بمن لقطهم البلوتوث (خيط مستقل، لا يحجب الواجهة). */
    public static void reportSeen(final String serverUrl, final String idsJson) {
        if (serverUrl == null || serverUrl.isEmpty()) return;
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                String base = serverUrl.endsWith("/") ? serverUrl.substring(0, serverUrl.length() - 1) : serverUrl;
                String cookie = CookieManager.getInstance().getCookie(base);
                if (cookie == null || cookie.isEmpty()) return;
                c = (HttpURLConnection) new URL(base + "/api/nearby/ble-seen").openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(10_000);
                c.setReadTimeout(10_000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                c.setRequestProperty("Cookie", cookie);
                try (OutputStream os = c.getOutputStream()) { os.write(("{\"ids\":" + idsJson + "}").getBytes(StandardCharsets.UTF_8)); }
                c.getResponseCode();
            } catch (Exception ignored) { /* */ }
            finally { if (c != null) c.disconnect(); }
        }, "stooorna-nearby-seen").start();
    }

    @Override
    public void onDestroy() {
        running = false;
        stopLocation();
        if (bg != null) bg.removeCallbacksAndMessages(null);
        if (thread != null) { thread.quitSafely(); thread = null; }
        super.onDestroy();
    }
}
