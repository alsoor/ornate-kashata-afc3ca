import Foundation
import Capacitor
import MultipeerConnectivity

/**
 * StooornaNearby — إضافة Capacitor (آيفون) للدردشة جهاز-لجهاز بدون إنترنت.
 * تستخدم MultipeerConnectivity (بلوتوث + Wi-Fi P2P تلقائياً) وبنفس واجهة نسخة أندرويد:
 *   الدوال:   start({id,name}) · stop() · send({peerId,text,clientId,ts,fromName})
 *   الأحداث:  peerFound {id,name} · peerLost {id} · message {from,fromName,text,clientId,ts}
 *
 * التركيب (Xcode ← App target):
 *  1) أضف StooornaNearbyPlugin.swift و StooornaNearbyPlugin.m إلى مجلد App/App وتأكد أنهما ضمن الـ Target.
 *  2) Info.plist:
 *       NSLocalNetworkUsageDescription = "Stooorna uses the local network to chat with people near you without internet."
 *       NSBluetoothAlwaysUsageDescription = "Stooorna uses Bluetooth to chat with people near you without internet."
 *       NSBonjourServices = [ "_stooorna-nb._tcp", "_stooorna-nb._udp" ]
 *  3) لا يحتاج Pods إضافية.
 *
 * ملاحظات:
 *  - يعمل والتطبيق في الواجهة (Foreground) فقط — قيد من نظام iOS.
 *  - معرّف المستخدم يُستخدم كاسم الجهاز (حد أقصى 63 بايت) — المعرفات القصيرة/UUID تمام.
 *  - آيفون↔آيفون فقط: MultipeerConnectivity لا يتصل بإضافة أندرويد (Nearby Connections).
 */
@objc(StooornaNearbyPlugin)
public class StooornaNearbyPlugin: CAPPlugin, MCSessionDelegate, MCNearbyServiceAdvertiserDelegate, MCNearbyServiceBrowserDelegate {
    private let serviceType = "stooorna-nb"   // خاص بالتطبيق => لا يرى إلا أجهزة Stooorna
    private var myId = ""
    private var myName = ""
    private var session: MCSession?
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?
    private var found: [String: MCPeerID] = [:]       // userId -> peer (مكتشف)
    private var connected: [String: MCPeerID] = [:]   // userId -> peer (متصل)
    private var names: [String: String] = [:]

    // MARK: - JS API

    @objc func start(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else { call.reject("id required"); return }
        let name = String((call.getString("name") ?? "User").prefix(40))
        DispatchQueue.main.async {
            self.stopAll()
            self.myId = String(id.prefix(60))
            self.myName = name
            let pid = MCPeerID(displayName: self.myId)
            let s = MCSession(peer: pid, securityIdentity: nil, encryptionPreference: .required)
            s.delegate = self
            self.session = s
            let adv = MCNearbyServiceAdvertiser(peer: pid, discoveryInfo: ["n": name], serviceType: self.serviceType)
            adv.delegate = self
            adv.startAdvertisingPeer()
            self.advertiser = adv
            let br = MCNearbyServiceBrowser(peer: pid, serviceType: self.serviceType)
            br.delegate = self
            br.startBrowsingForPeers()
            self.browser = br
            call.resolve(["granted": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.stopAll(); call.resolve() }
    }

    @objc func send(_ call: CAPPluginCall) {
        guard let peer = call.getString("peerId") else { call.reject("peerId required"); return }
        let obj: [String: Any] = [
            "t": call.getString("text") ?? "",
            "c": call.getString("clientId") ?? "",
            "ts": call.getDouble("ts") ?? (Date().timeIntervalSince1970 * 1000),
            "fn": call.getString("fromName") ?? myName,
        ]
        DispatchQueue.main.async {
            guard let pid = self.connected[peer], let s = self.session else { call.reject("not connected"); return }
            do {
                let data = try JSONSerialization.data(withJSONObject: obj)
                try s.send(data, toPeers: [pid], with: .reliable)
                call.resolve()
            } catch { call.reject(error.localizedDescription) }
        }
    }

    private func stopAll() {
        advertiser?.stopAdvertisingPeer(); advertiser = nil
        browser?.stopBrowsingForPeers(); browser = nil
        session?.disconnect(); session = nil
        found.removeAll(); connected.removeAll()
    }

    /// الطرف صاحب المعرّف الأصغر هو من يدعو (يمنع تصادم الدعوتين) — نفس منطق أندرويد.
    private func maybeInvite(_ uid: String) {
        guard connected[uid] == nil, let p = found[uid], let s = session, myId < uid else { return }
        browser?.invitePeer(p, to: s, withContext: nil, timeout: 20)
    }

    // MARK: - Browser

    public func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        let uid = peerID.displayName
        DispatchQueue.main.async {
            if uid == self.myId { return }
            self.found[uid] = peerID
            self.names[uid] = info?["n"] ?? self.names[uid] ?? "User"
            self.maybeInvite(uid)
        }
    }
    public func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        DispatchQueue.main.async { self.found.removeValue(forKey: peerID.displayName) }
    }
    public func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {}

    // MARK: - Advertiser

    public func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        DispatchQueue.main.async { invitationHandler(self.session != nil, self.session) }
    }
    public func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {}

    // MARK: - Session

    public func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        let uid = peerID.displayName
        DispatchQueue.main.async {
            switch state {
            case .connected:
                self.connected[uid] = peerID
                self.notifyListeners("peerFound", data: ["id": uid, "name": self.names[uid] ?? "User"])
            case .notConnected:
                if self.connected.removeValue(forKey: uid) != nil { self.notifyListeners("peerLost", data: ["id": uid]) }
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.maybeInvite(uid) }
            default: break
            }
        }
    }

    public func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        let uid = peerID.displayName
        guard let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        DispatchQueue.main.async {
            self.notifyListeners("message", data: [
                "from": uid,
                "fromName": (o["fn"] as? String) ?? self.names[uid] ?? "User",
                "text": (o["t"] as? String) ?? "",
                "clientId": (o["c"] as? String) ?? "",
                "ts": (o["ts"] as? NSNumber)?.doubleValue ?? 0,
            ])
        }
    }
    public func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    public func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    public func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}
