package com.stooorna.nearby

/**
 * StooornaNearby — إضافة Capacitor (أندرويد) للدردشة جهاز-لجهاز بدون إنترنت.
 * تستخدم Google Nearby Connections (بلوتوث + Wi-Fi Direct تلقائياً) بإستراتيجية P2P_CLUSTER.
 *
 * التركيب:
 *  1) app/build.gradle:   implementation 'com.google.android.gms:play-services-nearby:19.3.0'
 *  2) AndroidManifest.xml (داخل <manifest>):
 *       <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30"/>
 *       <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30"/>
 *       <uses-permission android:name="android.permission.ACCESS_WIFI_STATE"/>
 *       <uses-permission android:name="android.permission.CHANGE_WIFI_STATE"/>
 *       <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
 *       <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation"/>
 *       <uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE"/>
 *       <uses-permission android:name="android.permission.BLUETOOTH_CONNECT"/>
 *       <uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" android:usesPermissionFlags="neverForLocation"/>
 *  3) MainActivity.java:  registerPlugin(StooornaNearbyPlugin.class);  قبل super.onCreate
 *
 * الأحداث إلى JS:  peerFound {id,name} · peerLost {id} · message {from,fromName,text,clientId,ts}
 * الدوال:           start({id,name}) · stop() · send({peerId,text,clientId,ts,fromName})
 */
import android.Manifest
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.*
import org.json.JSONObject

@CapacitorPlugin(
    name = "StooornaNearby",
    permissions = [
        Permission(alias = "nearby", strings = [
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.BLUETOOTH_SCAN,
            Manifest.permission.BLUETOOTH_ADVERTISE,
            Manifest.permission.BLUETOOTH_CONNECT,
            Manifest.permission.NEARBY_WIFI_DEVICES,
        ]),
    ],
)
class StooornaNearbyPlugin : Plugin() {
    private val SERVICE_ID = "com.stooorna.app.nearby" // خاص بالتطبيق => لا يرى إلا أجهزة Stooorna
    private val strategy = Strategy.P2P_CLUSTER
    private var myId = ""
    private var myName = ""
    private val endpointToUser = HashMap<String, String>() // endpointId -> userId (متصل)
    private val userToEndpoint = HashMap<String, String>()
    private val names = HashMap<String, String>()
    private val pending = HashSet<String>()

    private val client by lazy { Nearby.getConnectionsClient(context) }

    @PluginMethod
    fun start(call: PluginCall) {
        myId = call.getString("id") ?: return call.reject("id required")
        myName = (call.getString("name") ?: "User").take(40)
        if (getPermissionState("nearby").toString() != "granted") {
            requestPermissionForAlias("nearby", call, "permCb"); return
        }
        begin(call)
    }

    @PermissionCallback
    private fun permCb(call: PluginCall) {
        if (getPermissionState("nearby").toString() == "granted") begin(call)
        else call.resolve(JSObject().put("granted", false))
    }

    private fun begin(call: PluginCall) {
        val info = "$myId|$myName" // endpointName يحمل الهوية
        client.startAdvertising(info, SERVICE_ID, connCb, AdvertisingOptions.Builder().setStrategy(strategy).build())
        client.startDiscovery(SERVICE_ID, discCb, DiscoveryOptions.Builder().setStrategy(strategy).build())
        call.resolve(JSObject().put("granted", true))
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        client.stopAdvertising(); client.stopDiscovery(); client.stopAllEndpoints()
        endpointToUser.clear(); userToEndpoint.clear(); pending.clear()
        call.resolve()
    }

    @PluginMethod
    fun send(call: PluginCall) {
        val peer = call.getString("peerId") ?: return call.reject("peerId required")
        val ep = userToEndpoint[peer] ?: return call.reject("not connected")
        val o = JSONObject()
            .put("t", call.getString("text") ?: "")
            .put("c", call.getString("clientId") ?: "")
            .put("ts", call.getLong("ts") ?: System.currentTimeMillis())
            .put("fn", call.getString("fromName") ?: myName)
        client.sendPayload(ep, Payload.fromBytes(o.toString().toByteArray(Charsets.UTF_8)))
            .addOnSuccessListener { call.resolve() }
            .addOnFailureListener { call.reject(it.message ?: "send failed") }
    }

    private val discCb = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(ep: String, info: DiscoveredEndpointInfo) {
            val parts = info.endpointName.split("|", limit = 2)
            val uid = parts.getOrNull(0) ?: return
            if (uid == myId) return
            names[ep] = parts.getOrNull(1) ?: "User"
            // الطرف صاحب المعرّف الأصغر هو من يطلب الاتصال (يمنع تصادم الطلبين)
            if (myId < uid && pending.add(ep)) client.requestConnection("$myId|$myName", ep, connCb)
        }
        override fun onEndpointLost(ep: String) {
            pending.remove(ep)
            endpointToUser.remove(ep)?.let { uid ->
                userToEndpoint.remove(uid)
                notifyListeners("peerLost", JSObject().put("id", uid))
            }
        }
    }

    private val connCb = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(ep: String, info: ConnectionInfo) {
            val parts = info.endpointName.split("|", limit = 2)
            val uid = parts.getOrNull(0) ?: return
            names[ep] = parts.getOrNull(1) ?: "User"
            endpointToUser[ep] = uid
            client.acceptConnection(ep, payloadCb)
        }
        override fun onConnectionResult(ep: String, r: ConnectionResolution) {
            pending.remove(ep)
            val uid = endpointToUser[ep] ?: return
            if (r.status.isSuccess) {
                userToEndpoint[uid] = ep
                notifyListeners("peerFound", JSObject().put("id", uid).put("name", names[ep] ?: "User"))
            } else endpointToUser.remove(ep)
        }
        override fun onDisconnected(ep: String) {
            endpointToUser.remove(ep)?.let { uid ->
                userToEndpoint.remove(uid)
                notifyListeners("peerLost", JSObject().put("id", uid))
            }
        }
    }

    private val payloadCb = object : PayloadCallback() {
        override fun onPayloadReceived(ep: String, p: Payload) {
            val uid = endpointToUser[ep] ?: return
            val bytes = p.asBytes() ?: return
            try {
                val o = JSONObject(String(bytes, Charsets.UTF_8))
                notifyListeners("message", JSObject()
                    .put("from", uid).put("fromName", o.optString("fn", names[ep] ?: "User"))
                    .put("text", o.optString("t")).put("clientId", o.optString("c")).put("ts", o.optLong("ts")))
            } catch (_: Exception) { /* تجاهل */ }
        }
        override fun onPayloadTransferUpdate(ep: String, u: PayloadTransferUpdate) {}
    }
}
