/**
 * NetworkAudioControls
 * ─────────────────────────────────────────────────────────────────────────────
 * لوحة تحكم شبكية للغرفة السرية — 5 مفاتيح مرتبطة بمايك الدائرة الكبيرة
 *
 * 1. Wifi Audio     — تشغيل الصوت عبر الشبكة المحلية
 * 2. WiFi Boost     — تعزيز جودة الإرسال الصوتي
 * 3. Audio Call VoIP — بروتوكول VoIP للاتصال الصوتي
 * 4. Output Device  — اختيار جهاز الإخراج
 * 5. Live Call      — بث مباشر عبر الإنترنت
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wifi, WifiOff, Zap, Phone, Speaker, Radio, ChevronDown, ChevronUp, Check } from 'lucide-react';

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  primary:      '#00BCD4',
  primaryDim:   'rgba(0,188,212,0.25)',
  primaryBorder:'rgba(0,188,212,0.3)',
  primaryFaint: 'rgba(0,188,212,0.07)',
  green:        '#22c55e',
  greenDim:     'rgba(34,197,94,0.2)',
  greenBorder:  'rgba(34,197,94,0.4)',
  red:          '#ef4444',
  orange:       '#f97316',
  text:         'rgba(200,230,230,0.88)',
  textDim:      'rgba(120,180,180,0.5)',
  bg:           'rgba(4,14,14,0.97)',
  bgCard:       'rgba(0,0,0,0.35)',
  border:       'rgba(0,188,212,0.12)',
};

// ── Types ─────────────────────────────────────────────────────────────────────
export interface NetworkAudioState {
  wifiAudio:   boolean;
  wifiBoost:   boolean;
  voip:        boolean;
  outputDevice:boolean;
  liveCall:    boolean;
}

interface OutputDevice {
  deviceId: string;
  label:    string;
}

interface NetworkAudioControlsProps {
  /** هل المايك الكبير شغّال الآن */
  micActive: boolean;
  /** callback عند تغيير أي مفتاح */
  onChange?: (state: NetworkAudioState) => void;
}

// ── Toggle Row ────────────────────────────────────────────────────────────────
function ToggleRow({
  icon, label, sublabel, active, disabled, onToggle, accent,
}: {
  icon:     React.ReactNode;
  label:    string;
  sublabel: string;
  active:   boolean;
  disabled: boolean;
  onToggle: () => void;
  accent:   string;
}) {
  return (
    <motion.div
      whileTap={disabled ? {} : { scale: 0.97 }}
      onClick={disabled ? undefined : onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px',
        borderRadius: 14,
        background: active ? `rgba(${accent === C.green ? '34,197,94' : '0,188,212'},0.08)` : C.bgCard,
        border: `1px solid ${active ? (accent === C.green ? C.greenBorder : C.primaryBorder) : C.border}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.38 : 1,
        transition: 'background 0.2s, border-color 0.2s, opacity 0.2s',
        userSelect: 'none',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? (accent === C.green ? C.greenDim : C.primaryDim) : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? (accent === C.green ? C.greenBorder : C.primaryBorder) : 'rgba(255,255,255,0.07)'}`,
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        <span style={{ color: active ? accent : C.textDim }}>{icon}</span>
      </div>

      {/* Labels */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: active ? accent : C.text, letterSpacing: '0.02em' }}>
          {label}
        </p>
        <p style={{ margin: 0, fontSize: '0.58rem', color: C.textDim, marginTop: 1 }}>
          {sublabel}
        </p>
      </div>

      {/* Toggle pill */}
      <div
        style={{
          width: 42, height: 24, borderRadius: 12, flexShrink: 0,
          background: active ? accent : 'rgba(255,255,255,0.08)',
          border: `1px solid ${active ? accent : 'rgba(255,255,255,0.12)'}`,
          position: 'relative',
          transition: 'background 0.25s, border-color 0.25s',
        }}
      >
        <motion.div
          animate={{ x: active ? 20 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{
            position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%',
            background: active ? '#fff' : 'rgba(255,255,255,0.35)',
            boxShadow: active ? `0 0 6px ${accent}` : 'none',
          }}
        />
      </div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function NetworkAudioControls({ micActive, onChange }: NetworkAudioControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<NetworkAudioState>({
    wifiAudio:    false,
    wifiBoost:    false,
    voip:         false,
    outputDevice: false,
    liveCall:     false,
  });

  // Output devices list
  const [devices,       setDevices]       = useState<OutputDevice[]>([]);
  const [activeDevice,  setActiveDevice]  = useState<string>('default');
  const [showDevices,   setShowDevices]   = useState(false);
  const devicePanelRef = useRef<HTMLDivElement>(null);

  // Load audio output devices
  useEffect(() => {
    async function loadDevices() {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const all = await navigator.mediaDevices.enumerateDevices();
        const out = all
          .filter(d => d.kind === 'audiooutput')
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 6)}` }));
        if (out.length > 0) setDevices(out);
      } catch { /* permissions not granted yet */ }
    }
    loadDevices();
  }, []);

  // Close device picker on outside click
  useEffect(() => {
    if (!showDevices) return;
    function handler(e: MouseEvent) {
      if (devicePanelRef.current && !devicePanelRef.current.contains(e.target as Node)) {
        setShowDevices(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDevices]);

  function toggle(key: keyof NetworkAudioState) {
    setState(prev => {
      const next = { ...prev, [key]: !prev[key] };
      onChange?.(next);
      return next;
    });
  }

  // Active count badge
  const activeCount = Object.values(state).filter(Boolean).length;

  // Status dot color
  const dotColor = !micActive ? C.textDim
    : activeCount >= 4 ? C.green
    : activeCount >= 2 ? C.primary
    : C.orange;

  return (
    <div style={{ width: '100%', maxWidth: 340, position: 'relative' }}>

      {/* ── Collapsed header / toggle button ── */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 14px',
          borderRadius: 14,
          background: expanded ? 'rgba(0,188,212,0.09)' : C.bgCard,
          border: `1px solid ${expanded ? C.primaryBorder : C.border}`,
          cursor: 'pointer',
          transition: 'background 0.2s, border-color 0.2s',
        }}
      >
        {/* Status dot */}
        <motion.div
          animate={micActive && activeCount > 0 ? { scale: [1, 1.4, 1], opacity: [1, 0.5, 1] } : {}}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, transition: 'background 0.3s' }}
        />

        <span style={{ flex: 1, textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>
          Network Audio Controls
        </span>

        {/* Active count badge */}
        {activeCount > 0 && (
          <span style={{
            fontSize: '0.55rem', fontWeight: 800,
            color: C.primary, background: C.primaryFaint,
            border: `1px solid ${C.primaryBorder}`,
            borderRadius: 8, padding: '1px 6px',
          }}>
            {activeCount}/5
          </span>
        )}

        <span style={{ color: C.textDim, display: 'flex' }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </motion.button>

      {/* ── Expanded panel — floating, لا تؤثر على الـ layout ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              zIndex: 999,
              borderRadius: 14,
              background: 'rgba(4,12,12,0.98)',
              border: `1px solid ${C.primaryBorder}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,188,212,0.08)',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '10px 10px 0 10px' }}>

              {/* 1 — Wifi Audio */}
              <ToggleRow
                icon={state.wifiAudio ? <Wifi size={18} /> : <WifiOff size={18} />}
                label="Wifi Audio"
                sublabel={state.wifiAudio ? 'Streaming over local network' : 'Local network audio — off'}
                active={state.wifiAudio}
                disabled={!micActive}
                onToggle={() => toggle('wifiAudio')}
                accent={C.primary}
              />

              {/* 2 — WiFi Boost */}
              <ToggleRow
                icon={<Zap size={18} />}
                label="WiFi Boost"
                sublabel={state.wifiBoost ? 'High-quality transmission on' : 'Boost audio quality — off'}
                active={state.wifiBoost}
                disabled={!micActive}
                onToggle={() => toggle('wifiBoost')}
                accent={C.primary}
              />

              {/* 3 — Audio Call VoIP */}
              <ToggleRow
                icon={<Phone size={18} />}
                label="Audio Call VoIP"
                sublabel={state.voip ? 'VoIP protocol active' : 'VoIP call protocol — off'}
                active={state.voip}
                disabled={!micActive}
                onToggle={() => toggle('voip')}
                accent={C.green}
              />

              {/* 4 — Output Device */}
              <div>
                <ToggleRow
                  icon={<Speaker size={18} />}
                  label="Output Device"
                  sublabel={state.outputDevice
                    ? (devices.find(d => d.deviceId === activeDevice)?.label ?? 'Default Speaker')
                    : 'Select audio output — off'}
                  active={state.outputDevice}
                  disabled={false}
                  onToggle={() => {
                    toggle('outputDevice');
                    if (!state.outputDevice && devices.length > 0) setShowDevices(true);
                  }}
                  accent={C.primary}
                />

                {/* Device picker dropdown */}
                <AnimatePresence>
                  {state.outputDevice && showDevices && devices.length > 0 && (
                    <motion.div
                      ref={devicePanelRef}
                      key="device-picker"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        marginTop: 4, borderRadius: 10,
                        background: 'rgba(4,16,16,0.98)',
                        border: `1px solid ${C.primaryBorder}`,
                        overflow: 'hidden',
                      }}
                    >
                      {devices.map(d => (
                        <motion.button
                          key={d.deviceId}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => { setActiveDevice(d.deviceId); setShowDevices(false); }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 12px', background: 'none', border: 'none',
                            cursor: 'pointer', textAlign: 'left',
                            borderBottom: `1px solid rgba(0,188,212,0.07)`,
                          }}
                        >
                          {activeDevice === d.deviceId && <Check size={12} color={C.primary} />}
                          {activeDevice !== d.deviceId && <div style={{ width: 12 }} />}
                          <span style={{ fontSize: '0.65rem', color: activeDevice === d.deviceId ? C.primary : C.text, fontWeight: activeDevice === d.deviceId ? 700 : 400 }}>
                            {d.label}
                          </span>
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 5 — Live Call */}
              <ToggleRow
                icon={<Radio size={18} />}
                label="Live Call"
                sublabel={state.liveCall ? 'Broadcasting live over internet' : 'Internet live broadcast — off'}
                active={state.liveCall}
                disabled={!micActive}
                onToggle={() => toggle('liveCall')}
                accent={C.green}
              />

            </div>

            {/* Status bar at bottom */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 14px',
              marginTop: 8,
              borderTop: `1px solid ${C.border}`,
              background: 'rgba(0,0,0,0.25)',
            }}>
              {!micActive ? (
                <span style={{ fontSize: '0.58rem', color: C.textDim, letterSpacing: '0.06em' }}>
                  شغّل المايك لتفعيل الكنترول
                </span>
              ) : activeCount === 0 ? (
                <span style={{ fontSize: '0.58rem', color: C.textDim, letterSpacing: '0.06em' }}>
                  كل المفاتيح مطفية
                </span>
              ) : (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1] }}
                    transition={{ duration: 0.9, repeat: Infinity }}
                    style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor }}
                  />
                  <span style={{ fontSize: '0.58rem', color: dotColor, fontWeight: 700, letterSpacing: '0.06em' }}>
                    {activeCount} {activeCount === 1 ? 'control' : 'controls'} active
                  </span>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
