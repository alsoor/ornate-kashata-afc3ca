/**
 * lib/callFixPatch.tsx — باتش مستقل فوق المكالمة الحالية (ما يلغي أي إضافة).
 * يربط الصورة، يمنع خطأ الصوت الكاذب، يمنع اختفاء المكالمة وإعادة الاتصال بعد الإغلاق،
 * ويظهر انتظار المكالمة بنغمة ونص عربي.
 */
import React, { useEffect, useState } from 'react';

export const CALL_WAIT_AR = 'ارجو الانتظار المتصل عليه لديه مكالمه اخرى';

type Photo = { name?: string | null; avatarUrl?: string | null };
let photo: Photo = {};
let waitingOn = false;
let closedUntil = 0;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(fn => fn()); }

export function noteCallPhoto(next: Photo) {
  const avatarUrl = String(next.avatarUrl || '').trim();
  const name = next.name || photo.name || null;
  if (avatarUrl === (photo.avatarUrl || '') && name === (photo.name || null)) return;
  photo = { name, avatarUrl: avatarUrl || photo.avatarUrl || null };
  emit();
}

export function resolveCallPhoto(fallback?: Photo): { name: string; avatarUrl: string | null } {
  const avatarUrl = String(fallback?.avatarUrl || photo.avatarUrl || '').trim() || null;
  const name = String(fallback?.name || photo.name || 'User');
  if (avatarUrl && avatarUrl !== photo.avatarUrl) noteCallPhoto({ name, avatarUrl });
  return { name, avatarUrl };
}

/** بعد الإغلاق: امنع أي دعوة قديمة تعيد الاتصال وحدها. */
export function noteCallClosed(ms = 20000) {
  closedUntil = Date.now() + ms;
  waitingOn = false;
  emit();
}
export function shouldBlockPhantomCall(inviteAt?: number) {
  if (!closedUntil || Date.now() > closedUntil) return false;
  if (inviteAt && inviteAt > closedUntil - 1500) return false;
  return true;
}

/** خطأ Agora بعد الإغلاق أو وهو متصل أصلاً ما يطلع للمستخدم ولا يقفل الصفحة. */
export function shouldIgnoreCallAudioError() {
  if (closedUntil && Date.now() < closedUntil) return true;
  return false;
}

export function notePeerOnAnotherCall(on: boolean) {
  waitingOn = on;
  emit();
  if (on) startWaitTone();
  else stopWaitTone();
}
export function peerIsOnAnotherCall() { return waitingOn; }

let tone: number | null = null;
function beep() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [440, 480].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.16);
    });
    window.setTimeout(() => { try { void ctx.close(); } catch { /* */ } }, 700);
  } catch { /* */ }
}
function startWaitTone() {
  stopWaitTone();
  beep();
  tone = window.setInterval(beep, 2800);
}
function stopWaitTone() {
  if (tone) { window.clearInterval(tone); tone = null; }
}

export function CallFixPatchUI() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick(x => x + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  if (!waitingOn) return null;
  return (
    <div style={{ position: 'fixed', left: 16, right: 16, top: 'calc(env(safe-area-inset-top, 0px) + 72px)', zIndex: 12100, textAlign: 'center', pointerEvents: 'none' }}>
      <div style={{ display: 'inline-block', maxWidth: 420, padding: '10px 14px', borderRadius: 16, background: 'rgba(8,22,25,0.96)', color: '#e8fbff', border: '1px solid rgba(0,188,212,0.45)', fontWeight: 800, fontSize: 14, lineHeight: 1.45 }}>
        {CALL_WAIT_AR}
      </div>
    </div>
  );
}
