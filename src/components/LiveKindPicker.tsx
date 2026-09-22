/**
 * Bottom-bar live picker.
 * Voice live stays on /live (public voice room untouched).
 * Camera live opens /live-camera for the current account only.
 */
import React from 'react';
import { useNavigate } from 'react-router';
import { Mic, Video } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  hostId: string;
  hostName?: string;
  hostUsername?: string | null;
  hostAvatar?: string | null;
};

export default function LiveKindPicker({
  open,
  onClose,
  hostId,
  hostName = 'Host',
  hostUsername = null,
  hostAvatar = null,
}: Props) {
  const navigate = useNavigate();
  if (!open) return null;

  const qs = new URLSearchParams({
    hostId,
    hostName,
    hostUsername: hostUsername || '',
    hostAvatar: hostAvatar || '',
  }).toString();

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        // Was 1200 — the app's fixed bottom navigation renders at zIndex 10200,
        // so this sheet (and its "Camera live" row) was rendering underneath it
        // and getting visually covered by the nav bar's own buttons/badges.
        zIndex: 10500,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          background: 'rgba(6,16,18,0.98)',
          borderRadius: '18px 18px 0 0',
          border: '1px solid rgba(0,188,212,0.25)',
          padding: '16px 16px max(env(safe-area-inset-bottom,0px),20px)',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.25)', margin: '0 auto 14px' }} />
        <p style={{ margin: '0 0 12px', color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>Start live</p>
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate(`/live?${qs}`);
          }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 12px',
            marginBottom: 8,
            borderRadius: 14,
            border: '1px solid rgba(0,188,212,0.28)',
            background: 'rgba(0,188,212,0.08)',
            color: '#e8ffff',
            cursor: 'pointer',
            fontWeight: 800,
          }}
        >
          <Mic size={18} color="#00BCD4" />
          Voice live
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate(`/live-camera?${qs}`);
          }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 12px',
            borderRadius: 14,
            border: '1px solid rgba(239,68,68,0.4)',
            background: 'rgba(239,68,68,0.1)',
            color: '#ffe8e8',
            cursor: 'pointer',
            fontWeight: 800,
          }}
        >
          <Video size={18} color="#ef4444" />
          Camera live
        </button>
      </div>
    </div>
  );
}
