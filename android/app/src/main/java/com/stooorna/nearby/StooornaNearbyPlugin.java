package com.stooorna.nearby;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * StooornaNearby — إضافة Capacitor (أندرويد) للدردشة جهاز-لجهاز بدون إنترنت.
 * تستخدم Google Nearby Connections (بلوتوث + Wi-Fi تلقائياً) وبنفس واجهة نسخة آيفون:
 *   الدوال:   start({id,name}) · stop() · send({peerId,text,clientId,ts,fromName})
 *   الأحداث:  peerFound {id,name} · peerLost {id} · message {from,fromName,text,clientId,ts}
 *
 * ملاحظات:
 *  - [v2] يعمل بالخلفية: عند start() تبدأ NearbyKeepAliveService (إشعار دائم) فيظل المستخدم ظاهراً بالبلوتوث والـGPS حتى لو طلع من التطبيق.
 *    الرسائل الواردة والتطبيق بالخلفية تُحفظ وتظهر كإشعار، وتُسلَّم للواجهة عند الرجوع (drainPending).
 *    الدوال الجديدة: status() · drainPending() · batterySettings() — و start() تقبل {serverUrl, geo}.
 *    يلزم في AndroidManifest: الخدمة + صلاحيات FOREGROUND_SERVICE (انظر ملف المانيفست المرفق).
 *  - أندرويد↔أندرويد فقط (آيفون يستخدم MultipeerConnectivity وهو بروتوكول مختلف).
 *  - لازم خدمات Google Play على الجهاز.
 *  - معرّف المستخدم + الاسم يُنشران كاسم النقطة: "id|name".
 */
@CapacitorPlugin(
    name = "StooornaNearby",
    permissions = {
        @Permission(alias = "loc", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "bt12", strings = { "android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_ADVERTISE", "android.permission.BLUETOOTH_CONNECT" }),
        @Permission(alias = "wifi13", strings = { "android.permission.NEARBY_WIFI_DEVICES" }),
        @Permission(alias = "notif13", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class StooornaNearbyPlugin extends Plugin {
    private static final String SERVICE_ID = "stooorna-nb"; // خاص بالتطبيق => ما يشوف إلا أجهزة Stooorna
    private static final int MAX_PAYLOAD = 32768;

    private final Handler main = new Handler(Looper.getMainLooper());
    private ConnectionsClient client;
    private boolean running = false;
    private String myId = "";
    private String myName = "";
    private String myEndpoint = "";
    private String serverUrl = "";      // [v2] لتبليغ السيرفر بمن لقطهم البلوتوث
    private boolean geoWanted = false;  // [v2] هل الخدمة تنشر الموقع؟
    private boolean paused = false;     // [v2] الواجهة بالخلفية
    private final List<JSObject> bgMsgs = new ArrayList<>(); // [v2] رسائل وصلت والواجهة بالخلفية
    private static final String MSG_CHANNEL = "stooorna_nearby_msg";
    private int notifSeq = 0;

    // كل الخرائط تُلمس من الخيط الرئيسي فقط
    private final Map<String, String> found = new HashMap<>();      // userId -> endpointId (مكتشف)
    private final Map<String, String> connected = new HashMap<>();  // userId -> endpointId (متصل)
    private final Map<String, String> epToUid = new HashMap<>();    // endpointId -> userId
    private final Map<String, String> names = new HashMap<>();      // userId -> name
    private final Set<String> pending = new HashSet<>();            // اتصالات قيد المحاولة

    /* ───────────── JS API ───────────── */

    @PluginMethod
    public void start(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) { call.reject("id required"); return; }
        String su = call.getString("serverUrl", "");
        if (su != null && !su.isEmpty()) serverUrl = su;
        geoWanted = Boolean.TRUE.equals(call.getBoolean("geo", false));
        List<String> need = missingAliases();
        // [v2] إذن الإشعارات (أندرويد 13+) نطلبه مع البقية لكنه غير إلزامي للتشغيل
        boolean wantNotif = Build.VERSION.SDK_INT >= 33 && !has("android.permission.POST_NOTIFICATIONS");
        if (need.isEmpty() && !wantNotif) { beginStart(call); return; }
        List<String> ask = new ArrayList<>(need);
        if (wantNotif) ask.add("notif13");
        requestPermissionForAliases(ask.toArray(new String[0]), call, "permsCallback");
    }

    @PermissionCallback
    private void permsCallback(PluginCall call) {
        if (missingAliases().isEmpty()) {
            beginStart(call);
        } else {
            JSObject r = new JSObject();
            r.put("granted", false);
            call.resolve(r);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> { stopAll(); stopService(); call.resolve(); });
    }

    /** [v2] هل البلوتوث شغّال فعلاً؟ (الواجهة تستدعيها عند الرجوع للتطبيق لإعادة التشغيل لو لزم). */
    @PluginMethod
    public void status(PluginCall call) {
        main.post(() -> {
            JSObject r = new JSObject();
            r.put("running", running);
            r.put("service", NearbyKeepAliveService.isRunning());
            r.put("connected", connected.size());
            call.resolve(r);
        });
    }

    /** [v2] رسائل وصلت والتطبيق بالخلفية (تُفرَّغ مرة واحدة). */
    @PluginMethod
    public void drainPending(PluginCall call) {
        main.post(() -> {
            JSArray arr = new JSArray();
            for (JSObject o : bgMsgs) arr.put(o);
            bgMsgs.clear();
            JSObject r = new JSObject();
            r.put("messages", arr);
            call.resolve(r);
        });
    }

    /** [v2] يفتح إعدادات استثناء البطارية (بعض الأجهزة تقتل الخدمة بدونها). */
    @PluginMethod
    public void batterySettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        final String peer = call.getString("peerId");
        if (peer == null) { call.reject("peerId required"); return; }
        final String text = call.getString("text", "");
        final String cid = call.getString("clientId", "");
        final Double ts = call.getDouble("ts");
        final String fn = call.getString("fromName", myName);
        main.post(() -> {
            String ep = connected.get(peer);
            if (ep == null || client == null) { call.reject("not connected"); return; }
            try {
                JSONObject o = new JSONObject();
                o.put("t", text);
                o.put("c", cid);
                o.put("ts", ts != null ? ts.doubleValue() : (double) System.currentTimeMillis());
                o.put("fn", fn);
                byte[] b = o.toString().getBytes(StandardCharsets.UTF_8);
                if (b.length > MAX_PAYLOAD) { call.reject("too_large"); return; }
                client.sendPayload(ep, Payload.fromBytes(b))
                    .addOnSuccessListener(v -> call.resolve())
                    .addOnFailureListener(e -> call.reject(String.valueOf(e.getMessage())));
            } catch (Exception e) {
                call.reject(String.valueOf(e.getMessage()));
            }
        });
    }

    @Override
    protected void handleOnPause() { main.post(() -> paused = true); }

    @Override
    protected void handleOnResume() { main.post(() -> paused = false); }

    @Override
    protected void handleOnDestroy() {
        main.post(() -> { stopAll(); stopService(); });
    }

    /* ───────────── [v2] الخدمة الأمامية ───────────── */

    private void startService() {
        try {
            Context c = getContext();
            Intent i = new Intent(c, NearbyKeepAliveService.class);
            i.putExtra(NearbyKeepAliveService.EXTRA_SERVER, serverUrl);
            i.putExtra(NearbyKeepAliveService.EXTRA_GEO, geoWanted);
            ContextCompat.startForegroundService(c, i);
        } catch (Exception ignored) { /* نكمل بدون خدمة: يشتغل والتطبيق مفتوح فقط */ }
    }

    private void stopService() {
        try { getContext().stopService(new Intent(getContext(), NearbyKeepAliveService.class)); } catch (Exception ignored) { /* */ }
    }

    /** إشعار رسالة وصلت بالبلوتوث والتطبيق بالخلفية. */
    private void notifyMessage(String fromName, String text) {
        try {
            Context c = getContext();
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= 33 && !has("android.permission.POST_NOTIFICATIONS")) return;
            if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(new NotificationChannel(MSG_CHANNEL, "Nearby messages", NotificationManager.IMPORTANCE_HIGH));
            Intent launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            PendingIntent pi = launch == null ? null : PendingIntent.getActivity(c, 0, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, MSG_CHANNEL) : new Notification.Builder(c);
            b.setContentTitle(fromName).setContentText(text).setSmallIcon(c.getApplicationInfo().icon).setAutoCancel(true);
            if (pi != null) b.setContentIntent(pi);
            nm.notify(8000 + (notifSeq++ % 50), b.build());
        } catch (Exception ignored) { /* */ }
    }

    /** يبلّغ السيرفر بمن أنا ملاقيهم بالبلوتوث الآن (يظهرون عبر السيرفر أيضاً). */
    private void reportSeen() {
        if (serverUrl == null || serverUrl.isEmpty() || connected.isEmpty()) return;
        JSONArray a = new JSONArray();
        for (String uid : connected.keySet()) a.put(uid);
        NearbyKeepAliveService.reportSeen(serverUrl, a.toString());
    }

    /* ───────────── الصلاحيات ───────────── */

    private boolean has(String p) {
        return ContextCompat.checkSelfPermission(getContext(), p) == PackageManager.PERMISSION_GRANTED;
    }

    private List<String> missingAliases() {
        List<String> a = new ArrayList<>();
        int sdk = Build.VERSION.SDK_INT;
        if (sdk <= 32 && !has(Manifest.permission.ACCESS_FINE_LOCATION)) a.add("loc");
        if (sdk >= 31 && !(has("android.permission.BLUETOOTH_SCAN") && has("android.permission.BLUETOOTH_ADVERTISE") && has("android.permission.BLUETOOTH_CONNECT"))) a.add("bt12");
        if (sdk >= 33 && !has("android.permission.NEARBY_WIFI_DEVICES")) a.add("wifi13");
        return a;
    }

    /* ───────────── التشغيل ───────────── */

    private void beginStart(PluginCall call) {
        try {
            BluetoothAdapter bt = BluetoothAdapter.getDefaultAdapter();
            if (bt == null) { call.reject("no_bluetooth"); return; }
            if (!bt.isEnabled()) { call.reject("bluetooth_off"); return; }
        } catch (SecurityException ignored) { /* نكمل ونخلي Nearby يقرر */ }

        final String id = call.getString("id", "");
        final String name = call.getString("name", "User");
        main.post(() -> {
            stopAll();
            myId = trunc(id, 60);
            myName = truncBytes(name, 48);
            myEndpoint = myId + "|" + myName;
            client = Nearby.getConnectionsClient(getContext());
            running = true;

            AdvertisingOptions ao = new AdvertisingOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build();
            DiscoveryOptions dop = new DiscoveryOptions.Builder().setStrategy(Strategy.P2P_CLUSTER).build();
            Task<Void> adv = client.startAdvertising(myEndpoint, SERVICE_ID, lifecycle, ao);
            Task<Void> dis = client.startDiscovery(SERVICE_ID, discovery, dop);
            Tasks.whenAll(adv, dis)
                .addOnSuccessListener(v -> {
                    startService(); // [v2] يبقى شغّالاً بالخلفية
                    JSObject r = new JSObject();
                    r.put("granted", true);
                    call.resolve(r);
                })
                .addOnFailureListener(e -> {
                    stopAll();
                    stopService();
                    call.reject(String.valueOf(e.getMessage()));
                });
        });
    }

    private void stopAll() {
        running = false;
        main.removeCallbacksAndMessages(null);
        if (client != null) {
            try { client.stopAdvertising(); } catch (Exception ignored) { /* */ }
            try { client.stopDiscovery(); } catch (Exception ignored) { /* */ }
            try { client.stopAllEndpoints(); } catch (Exception ignored) { /* */ }
        }
        found.clear();
        connected.clear();
        epToUid.clear();
        pending.clear();
    }

    /** الطرف صاحب المعرّف الأصغر هو من يطلب الاتصال (يمنع تصادم الطلبين) — نفس منطق آيفون. */
    private void maybeInvite(final String uid) {
        if (!running || client == null) return;
        final String ep = found.get(uid);
        if (ep == null || connected.containsKey(uid) || pending.contains(uid) || myId.compareTo(uid) >= 0) return;
        pending.add(uid);
        main.postDelayed(() -> pending.remove(uid), 20000); // لو ما جاء رد
        client.requestConnection(myEndpoint, ep, lifecycle)
            .addOnFailureListener(e -> { pending.remove(uid); scheduleInvite(uid); });
    }

    private void scheduleInvite(final String uid) {
        main.postDelayed(() -> maybeInvite(uid), 3500);
    }

    /* ───────────── Callbacks ───────────── */

    private final EndpointDiscoveryCallback discovery = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(String endpointId, DiscoveredEndpointInfo info) {
            String[] p = parse(info.getEndpointName());
            if (p[0].isEmpty() || p[0].equals(myId)) return;
            found.put(p[0], endpointId);
            epToUid.put(endpointId, p[0]);
            names.put(p[0], p[1]);
            maybeInvite(p[0]);
        }

        @Override
        public void onEndpointLost(String endpointId) {
            String uid = epToUid.get(endpointId);
            if (uid != null && endpointId.equals(found.get(uid))) found.remove(uid);
        }
    };

    private final ConnectionLifecycleCallback lifecycle = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(String endpointId, ConnectionInfo info) {
            String[] p = parse(info.getEndpointName());
            if (client == null || p[0].isEmpty() || p[0].equals(myId)) {
                if (client != null) client.rejectConnection(endpointId);
                return;
            }
            epToUid.put(endpointId, p[0]);
            names.put(p[0], p[1]);
            client.acceptConnection(endpointId, payloads); // التشفير والمصادقة داخل Nearby
        }

        @Override
        public void onConnectionResult(String endpointId, ConnectionResolution result) {
            String uid = epToUid.get(endpointId);
            if (uid == null) return;
            pending.remove(uid);
            if (result.getStatus().isSuccess()) {
                connected.put(uid, endpointId);
                reportSeen(); // [v2] عبر السيرفر أيضاً
                JSObject o = new JSObject();
                o.put("id", uid);
                o.put("name", nameOf(uid));
                notifyListeners("peerFound", o);
            } else {
                scheduleInvite(uid);
            }
        }

        @Override
        public void onDisconnected(String endpointId) {
            String uid = epToUid.get(endpointId);
            if (uid == null) return;
            pending.remove(uid);
            if (endpointId.equals(connected.get(uid))) {
                connected.remove(uid);
                JSObject o = new JSObject();
                o.put("id", uid);
                notifyListeners("peerLost", o);
            }
            scheduleInvite(uid);
        }
    };

    private final PayloadCallback payloads = new PayloadCallback() {
        @Override
        public void onPayloadReceived(String endpointId, Payload payload) {
            if (payload.getType() != Payload.Type.BYTES) return;
            byte[] b = payload.asBytes();
            String uid = epToUid.get(endpointId);
            if (b == null || uid == null) return;
            try {
                JSONObject o = new JSONObject(new String(b, StandardCharsets.UTF_8));
                JSObject r = new JSObject();
                r.put("from", uid);
                r.put("fromName", o.optString("fn", nameOf(uid)));
                r.put("text", o.optString("t", ""));
                r.put("clientId", o.optString("c", ""));
                r.put("ts", o.optDouble("ts", 0));
                notifyListeners("message", r);
                if (paused) { // [v2] التطبيق بالخلفية: احفظها + إشعار
                    if (bgMsgs.size() >= 100) bgMsgs.remove(0);
                    bgMsgs.add(r);
                    String t = o.optString("t", "");
                    notifyMessage(o.optString("fn", nameOf(uid)), t.length() > 120 ? t.substring(0, 120) + "…" : t);
                }
            } catch (Exception ignored) { /* رسالة تالفة */ }
        }

        @Override
        public void onPayloadTransferUpdate(String endpointId, PayloadTransferUpdate update) { /* bytes فقط */ }
    };

    /* ───────────── أدوات ───────────── */

    private String nameOf(String uid) {
        String n = names.get(uid);
        return n == null || n.isEmpty() ? "User" : n;
    }

    private static String[] parse(String s) {
        if (s == null) return new String[] { "", "User" };
        int i = s.indexOf('|');
        if (i < 0) return new String[] { s, "User" };
        String n = s.substring(i + 1);
        return new String[] { s.substring(0, i), n.isEmpty() ? "User" : n };
    }

    private static String trunc(String s, int max) {
        return s == null ? "" : (s.length() > max ? s.substring(0, max) : s);
    }

    private static String truncBytes(String s, int max) {
        if (s == null) return "User";
        while (s.length() > 0 && s.getBytes(StandardCharsets.UTF_8).length > max) s = s.substring(0, s.length() - 1);
        return s.isEmpty() ? "User" : s;
    }
}
