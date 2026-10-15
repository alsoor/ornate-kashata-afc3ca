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

import org.json.JSONObject;

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
 *  4) [v3] GPS Live: إذا مفعّل مشاركة الموقع في صفحة GPS Live ننشر موقعي أيضاً على POST /api/live-gps (id/name/username/avatarUrl)
 *     فيظهر أونلاين على خريطة بقية المستخدمين حتى لو أنا خارج التطبيق (السيرفر يختم at بوقت كل نشر، والخريطة تعتبر أونلاين من نشر خلال دقيقتين).
 *
 * Extras: serverUrl · geo (نشر /api/nearby/ping) · ble (البلوتوث شغّال) · live + liveId/liveName/liveUser/liveAvatar (نشر /api/live-gps)
 */
public class NearbyKeepAliveService extends Service {
    public static final String EXTRA_SERVER = "serverUrl";
    public static final String EXTRA_GEO = "geo";
    public static final String EXTRA_BLE = "ble";
    public static final String EXTRA_LIVE = "live";
    public static final String EXTRA_LIVE_ID = "liveId";
    public static final String EXTRA_LIVE_NAME = "liveName";
    public static final String EXTRA_LIVE_USER = "liveUser";
    public static final String EXTRA_LIVE_AVATAR = "liveAvatar";

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
    private volatile boolean ble = true;
    private volatile boolean live = false;
    private volatile String liveId = "", liveName = "User", liveUser = "", liveAvatar = "";
    private volatile long lastPost = 0L;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String s = intent.getStringExtra(EXTRA_SERVER);
            if (s != null && !s.isEmpty()) serverUrl = s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
            geo = intent.getBooleanExtra(EXTRA_GEO, false);
            ble = intent.getBooleanExtra(EXTRA_BLE, true);
            live = intent.getBooleanExtra(EXTRA_LIVE, false);
            String lid = intent.getStringExtra(EXTRA_LIVE_ID);
            if (lid != null) liveId = lid;
            String ln = intent.getStringExtra(EXTRA_LIVE_NAME);
            if (ln != null && !ln.isEmpty()) liveName = ln;
            String lu = intent.getStringExtra(EXTRA_LIVE_USER);
            if (lu != null) liveUser = lu;
            String la = intent.getStringExtra(EXTRA_LIVE_AVATAR);
            if (la != null) liveAvatar = la;
            if (liveId.isEmpty()) live = false;
        }
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm != null) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Nearby", NotificationManager.IMPORTANCE_LOW));
            }
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
            Notification n = b.setContentTitle("Stooorna Nearby")
                .setContentText((ble ? "Visible to people nearby via Bluetooth" : "Sharing your live location") + ((geo || live) && ble ? " & GPS" : ""))
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
        if ((geo || live) && !serverUrl.isEmpty()) {
            startLocation();
            bg.post(beat);
        } else {
            stopLocation();
            if (!ble) { stopSelf(); return START_NOT_STICKY; } // لا بلوتوث ولا نشر => ما في سبب نبقى
        }
        return START_NOT_STICKY; // لو العملية انقتلت، ما نرجّع إشعار بدون بلوتوث
    }

    /** نوع الخدمة: connectedDevice دائماً، + location إذا الصلاحية موجودة (أندرويد 14 يرمي استثناء لو النوع بلا صلاحية). */
    private void startFg(Notification n) {
        if (Build.VERSION.SDK_INT >= 29) {
            int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE;
            if ((geo || live) && hasLoc()) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION;
            if (!ble) type = ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION; // نشر موقع فقط
            try { startForeground(NOTIF_ID, n, type); return; }
            catch (Exception e) {
                startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
                geo = false; live = false; // ما قدرنا نأخذ نوع الموقع => بلوتوث فقط
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
        @Override public void onLocationChanged(Location l) { if (l != null) { last = l; maybePost(); } } // يصحّي المعالج عند كل تحديث => ينشر حتى مع نوم الجهاز
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
                if ((geo || live) && !serverUrl.isEmpty()) {
                    if (!listening) startLocation();
                    maybePost();
                }
            } catch (Throwable ignored) { /* */ }
            if (running && bg != null) bg.postDelayed(this, BEAT_MS);
        }
    };

    /** ينشر الموقع (nearby ping و/أو live-gps) كل ~40 ث على الأقل بين نشرتين. */
    private synchronized void maybePost() {
        long now = System.currentTimeMillis();
        if (now - lastPost < 40_000L) return;
        Location l = last;
        // لا ننشر موقعاً أقدم من 10 دقائق
        if (l == null || now - l.getTime() > 10 * 60_000L || serverUrl.isEmpty()) return;
        lastPost = now;
        try {
            if (geo) {
                String body = String.format(Locale.US, "{\"lat\":%.6f,\"lng\":%.6f,\"accuracy\":%.1f}", l.getLatitude(), l.getLongitude(), l.hasAccuracy() ? l.getAccuracy() : 0f);
                postJson(serverUrl, "/api/nearby/ping", body, true);
            }
            if (live && !liveId.isEmpty()) {
                JSONObject o = new JSONObject();
                o.put("id", liveId);
                o.put("name", liveName);
                o.put("username", liveUser);
                if (!liveAvatar.isEmpty()) o.put("avatarUrl", liveAvatar);
                o.put("lat", l.getLatitude());
                o.put("lng", l.getLongitude());
                postJson(serverUrl, "/api/live-gps", o.toString(), true); // السيرفر يختم at بوقت النشر => أونلاين
            }
        } catch (Exception ignored) { /* */ }
    }

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
