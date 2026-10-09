import React, { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { User, Mail, Lock, Eye, EyeOff, LogOut, Mic, Play, Pause, Trash2, Clock, CheckCircle, Share2, X, AtSign, Edit2, Users, Copy, Check, QrCode, Phone, ShieldCheck, Radio, Headphones, Send, Plus, MessageCircle, Bell, Music, Heart, Search, Link2, ClipboardPaste, Building2, Briefcase, Menu, ChevronDown, AlertTriangle, FileText, DollarSign, Image as ImageIcon, Video as VideoIcon, Smile } from 'lucide-react';
import { useSession, signOut, signIn, signUp } from '@/lib/auth/auth-client';
import { usePresenceQuery } from '@/hooks/usePresence';
import LiveLocationMap from '@/components/LiveLocationMap';
import PublicVoiceLive from '@/components/PublicVoiceLive';
import { ensureMyCountry, readSavedCountry } from '@/lib/profileCountry';
import { maskStoredPhone } from './forgot-phone-mask';
import { restoreOwnerAccount, wipeOwnerAccount } from '@/lib/ownerRestorePatch';
// Owner-only paid Ads panel (feed ads) — loaded on demand
const OwnerAdsPanelLazy = React.lazy(() => import('./add-friend').then((m) => ({ default: m.OwnerAdsPanel })));
// Owner-only STOOORNA note (shows on the STOOORNA title for everyone) — loaded on demand
const OwnerNotePanelLazy = React.lazy(() => import('./add-friend').then((m) => ({ default: m.OwnerNotePanel })));
import { activateVip, deactivateVip, setVipColor as persistVipColor, vipRenameUsed, markVipRenameUsed, VIP_COLORS, setVipFeat, hydrateVipFromServer, hydrateVipDirectory, resolveVipNameStyle, VIP_PRICE_KD, getVipExpiry, formatVipCountdown, ownerGrantEightMics, getVipFeats } from '@/lib/vipPatch';
import { getAppProfitsSnapshot, syncAppProfitsFromServer, syncEarningsFromServer, readUserEarnings, PAYPAL_WITHDRAW_URL, isOwnerIdentity } from '@/lib/giftProfitSplit';
import { readOwnerSupportProfit, syncOwnerSupportProfit } from '@/lib/ownerSupportProfitPatch';
import AppUploadSection from '@/components/AppUploadSection';
// VIP frame cancelled — avatar renders without frame
// import { VipAvatarFrame } from '@/components/VipBadge';
import { LiveVipDock } from '@/components/LiveVipDock';
import { WalletSheet } from '@/components/LiveCoinsDock';

/** Owner gift: credits spendable Coins immediately and queues the gifts-box notice. */

function OwnerLiveIconsControls() {
  const [hide, setHide] = useState({ coins: false, gifts: false, deposit: false });
  useEffect(() => {
    const hideCard = () => {
      document.querySelectorAll<HTMLElement>('div,section,article').forEach(el => {
        const text = el.textContent || '';
        if (!text.includes('Deposit box') || text.includes('Gifts icon') || text.includes('Coins')) return;
        el.style.display = 'none';
      });
    };
    hideCard();
    const obs = new MutationObserver(hideCard);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  const [priv, setPriv] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('stooorna_live_icons_hide');
      if (raw) setHide({ coins: false, gifts: false, deposit: false, ...JSON.parse(raw) });
      setPriv(localStorage.getItem('stooorna_owner_live_icons_private') === '1');
    } catch { /* */ }
    void fetch('/api/live-icons', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(d => {
      if (d && d.hide) setHide({ coins: !!d.hide.coins, gifts: !!d.hide.gifts, deposit: !!d.hide.deposit });
    }).catch(() => {});
  }, []);
  function saveHide(next: { coins: boolean; gifts: boolean; deposit: boolean }) {
    setHide(next);
    try { localStorage.setItem('stooorna_live_icons_hide', JSON.stringify(next)); } catch { /* */ }
    window.dispatchEvent(new CustomEvent('stooorna:live-icons-hide', { detail: next }));
    void fetch('/api/live-icons', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hide: next }) }).catch(() => {});
  }
  const row = (key: 'coins' | 'gifts' | 'deposit', label: string) => (
    <button key={key} type="button" onClick={() => saveHide({ ...hide, [key]: !hide[key] })}
      style={{ width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', background: hide[key] ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.1)', border: `1px solid ${hide[key] ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.35)'}`, color: hide[key] ? '#fca5a5' : '#86efac', fontWeight: 800, fontSize: '0.82rem' }}>
      {label}: {hide[key] ? 'مخفي عن الناس' : 'ظاهر للناس'}
    </button>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {row('coins', 'إخفاء الشحن')}
      {row('gifts', 'إخفاء الهدايا')}
      <button type="button" onClick={() => {
        const next = !priv; setPriv(next);
        try { localStorage.setItem('stooorna_owner_live_icons_private', next ? '1' : '0'); } catch { /* */ }
        window.dispatchEvent(new Event('stooorna:owner-live-icons'));
      }} style={{ width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', background: priv ? 'rgba(250,204,21,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${priv ? 'rgba(250,204,21,0.45)' : 'rgba(255,255,255,0.12)'}`, color: priv ? '#facc15' : 'rgba(220,220,220,0.9)', fontWeight: 800, fontSize: '0.82rem' }}>
        {priv ? 'زر البث الخاص: شغّال — الشحن والهدايا تظهر لك فقط' : 'زر البث الخاص: متوقف'}
      </button>
    </div>
  );
}

function grantAppCoins(targetUserId: string, coins: number): { ok: boolean; error?: string; id?: string } {
  const uid = String(targetUserId || '').trim();
  const n = Math.floor(Number(coins) || 0);
  if (!uid) return { ok: false, error: 'اختر مستخدماً' };
  if (n < 1 || n > 1_000_000) return { ok: false, error: 'العدد من 1 إلى 1,000,000' };
  const id = `own_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const grant = { id, userId: uid, coins: n, at: Date.now(), text: 'تم اعطاؤك دعم من التطبيق' };
  try {
    const raw = localStorage.getItem('stooorna_app_coin_grants');
    const list = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(list) ? list : [];
    next.push(grant);
    localStorage.setItem('stooorna_app_coin_grants', JSON.stringify(next.slice(-500)));
    const balKey = `stooorna_coins_balance_${uid}`;
    const cur = Math.max(0, Math.floor(Number(localStorage.getItem(balKey) || 0) || 0));
    const bal = cur + n;
    localStorage.setItem(balKey, String(bal));
    localStorage.setItem(`stooorna_gift_box_notice_${uid}`, JSON.stringify({ id, coins: n, at: Date.now(), text: 'تم اعطاؤك دعم من التطبيق' }));
    localStorage.setItem(`stooorna_app_coin_grants_applied_${uid}`, JSON.stringify(
      Array.from(new Set([...(JSON.parse(localStorage.getItem(`stooorna_app_coin_grants_applied_${uid}`) || '[]')), id])).slice(-400),
    ));
    window.dispatchEvent(new CustomEvent('stooorna:coins-balance', { detail: { userId: uid, balance: bal } }));
    window.dispatchEvent(new CustomEvent('stooorna:app-coin-grant', { detail: { ...grant, balance: bal } }));
    window.dispatchEvent(new CustomEvent('stooorna:gift-box-notice', { detail: { id, coins: n, text: 'تم اعطاؤك دعم من التطبيق' } }));
  } catch { /* ignore */ }
  const body = JSON.stringify({ userId: uid, coins: n, grantId: id, note: 'تم اعطاؤك دعم من التطبيق', source: 'owner' });
  for (const url of ['/api/owner/grant-coins', '/api/coins/grant', '/api/gifts/grant']) {
    void fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
  }
  void fetch('/api/gifts/balance', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: uid, delta: n, grantId: id }),
  }).catch(() => {});
  return { ok: true, id };
}

import StoryModerationManager from '@/components/StoryModerationManager';
import { ClearUserStoriesDialog } from '@/components/StoryModeration';
import { SharePageView } from '@/pages/share';

/** Hides the small "VIP" header pill that VipAvatarFrame draws on top of the avatar.
 *  The frame ring / colours are left exactly as they were. */
function HideVipHeaderTag({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const isVipText = (el: Element) => (el.textContent || '').replace(/\s+/g, '').toUpperCase() === 'VIP';
    const holdsAvatar = (el: Element) => !!el.querySelector('img, button, video, canvas');
    const hide = () => {
      root.querySelectorAll<HTMLElement>('*').forEach(el => {
        if (el.children.length > 0 || !isVipText(el)) return;
        let target: HTMLElement = el;
        // climb to the pill itself (its wrapper) while the wrapper contains nothing but the VIP label
        while (target.parentElement && target.parentElement !== root && isVipText(target.parentElement) && !holdsAvatar(target.parentElement)) {
          target = target.parentElement;
        }
        if (target !== root) target.style.display = 'none';
      });
    };
    hide();
    const mo = new MutationObserver(hide);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, []);
  return <span ref={ref} style={{ display: 'contents' }}>{children}</span>;
}

const STOOORNA_APP_ICON = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAEAAQADASIAAhEBAxEB/8QAHQAAAgICAwEAAAAAAAAAAAAAAQgAAgYHAwUJBP/EAFUQAAECBAMGAgYFBQoJDQAAAAECAwAEBREGByEIEjFBUWFxgRMUIpGhsTJCUrLBI2KCktEVFiQzQ1NyosLhFxglNmN1hNLwJic1N0RGVFVWZXOU8f/EABwBAAEEAwEAAAAAAAAAAAAAAAYABAUHAQMIAv/EADwRAAEDAwIDBQUFBwQDAAAAAAEAAgMEBREGIRIxURMiQWFxFDKBkaEjM0KxwQcVFjRSU9EkJUPhNXLw/9oADAMBAAIRAxEAPwBEVQEnSBAAtDhMVY8RrBBF9TACTxEQhXEiEsbohQudYJIMU6RISWFaLjhHGOBiDoYSyuTQxU6G0VJtaO1w3hOsYwmzL0invTzg0JbT7KfFXAece2MdIcMGSm8s0cDS+V2B5rq7++CCOZjfeEtlGamAh7ElTEsk6mVkvbX4FZ0HkDG48MZO4QwolBk6Mw6+P5eaHpVnzVoPKJyCy1EuC/uhAlfrS30mWw5efJJzR8G13EFhTqROzgVoFNMKKffwjNKds5Y5qASpVPYkkn/xUwkH3C5hxgEoSEpAQgcEpFgPKJfpE5HYYW++4lBVRr2skP2EYaPPdK5JbKGIHUgzNZp8v+ahK12+AjsW9kiZ+viRq/5sqr/ehkoEPW2ekb+H6qFfrC7OORIB8Et7myRNWu3iRkq6KlVAfejq53ZQxEyCZarU6YHRQWi/wMNKIl9bRk2ekd+H6ryzWN3YffB9Qk1qWzrjqngqTS2p1I5yswlR9xIMYXWMIVzD6impUickrc3mVAe+1of2+vaKuIS6kpWkLQeKVC4PlDCSwwu9xxCnabXtWwjt4w4eWy87gbxfeBEO1ibJnCOK0rVN0dlh8/8AaJT8ivx00PmI09i7ZVnpRK3sN1FM8kaiVnPYX5LGh87RCVFlqId294I2oNaW+sIbIeA+fJaGuIB1jsq/hmrYVm/VqvT35B7kHUWCvA8D5R1osRxiDcxzDhwwUdxTRzND43ZB6KJ4xa8A6gRLR4W1AW1EQ6QOsS2l4SyFINucVGnL4xYXF9ISRRuNNYPDTlFSrqLxAq8JIKlonPtAA84MJJEm3CBEip4wksq1okUgwklcaR9dJo89X55uSp0q7OTbmiGmUbx//O8Zbllk/WMy5oLZT6lSW1Wen3E3T/RQPrK/4MNpgjL2i4Ap3qtJlglZH5WZc1dePVSvwGkTtDaZKrvv2agO/arprUDFF35OnT1WoMvdmBpj0U7it70znEU6XXZA7LWOPgPfG96RSJGhSaJSnyrMlLI0S0wgJT8I+wgmIB5wc09HDSt4Y2qjLjeay5vLqh+3TwRBvBgAWEWSkq4C8PVC89gheJHQ4hxzQMLJJqlXlJJQ/k3HRv8A6o1jXVW2pMISJUmURPVNaTxZZ3EnzUR8oZSVlPFs94UzTWavq8GGIn4LcZJgX1hdZ7a5vpJ4aNur83r7kpjp3drOtqJ3KFT0JPVxZMMTeKQfiU6zR13cN48fFNJfUdIhtCttbWdeB9uh05Q7OOCO1kNrohQE9hvTmZaa/BQhNvFIT7yT9HXdgz2YPoUx2lu8S8aio21Bg6obom/XaY4dPyzO+keaSflGwqDjWhYobC6VVpWev9Rp0bw/R4w/jrIJfceCh+ptNfSffREfBd3cwRFef4QeHMw72KieXNfFWKHT8QyS5OpSbM9Kr4tPo3h5dPKNC5hbL43XJzCb1iLk06ZXx/oL/A++GHGkS8MqmihqhiQfFTltvVbbHh0D9ungvPmp0ybos65Jz0s7JzTRstl5O6oR8l73h6Mf5b0XMWn+gqcuBMJH5GcbADrR7HmOx0hRsyMq6zltPhE6n1inOqsxPNj2F9j9lXYwC1trlpO83dqvSxaoprsBHJ3ZOnX0WIkWiRxWN+ognS8QiOcq58fKIdRrxjjBEE6jzhJFX0gCOO2vExISyr9IkVuQOkHehLACMS0DeEEkAd4SXJAgiNuZLZFzGOnG6vWErlqAhV0p4LmiOIHRPU+6DkXk0rHc4msVZsooEuuyUG4M0sfVH5o5nyhtGWW5ZlDLKEtNNpCUIQLJSBoAB0gptdr7XE0w28Aqq1Rqj2TNHRnv+J6Ljp1PlqVJNScmw3LSrKQhtppNkpHQCOcptEicoOQA0YCo973PcXOOSVIkSBGVqWs81M76flpNokVSr0/U3Gw6hhPsoCSbAqV4g6CF9xfn/jDFm+16/wDuVJq09XkPydx3V9I++Mm2sWA3julOW1XThr4OKjSIVeK9uddUdu6IOwAuhdMWO3+wxVTowXuGcndcjrq33FOOKUtZ1KlG5PnFIgPaJfsYHySdyrDa1rBhowFLcdYHlBvEvGF6QGl4g4QTEvCWVLRdl1yWdS6ytTTiforQopUPMRx6XiFUZBLTkLW5jXjDhkLZmDdoPFmFFttvTQrEknQsTt1KA7L4j4wwGBM/sMY2W3LOOmjVFWgl5xQCVn8xfA+djCZ37GJ7/dExTXaopyBnI80HXTSlvuAJDeB3UL0WBuIMJ1lnn7WsDLbk59S6xRwbeidV+VaH5ij8jp4Q1WEsY0nG9JRUKRNpmWTotPBbSvsqTxBg1o7hFVjAOHdFSV407V2d2XjiZ1H6ruxxj46tSJOvU5+QqEs3Nyb6d1xpwXBH4HvH2RBbnwiTLQ4YPJDTJHROD2HBHik9zjyVm8upgz9PC5vD7q7JcOq5cnghfbornGrjwvHoZOyUvUpR6VmmUTEs8kocacF0qB5EQn2dmUL2XNT9ckkreoM0uzKzqWVfzaj8jzHeAS6WvsMzQju9OivbS2pxXAUlWcPHI9f+1rMa8ohFyIAVuj9kC8DKtAK27raIBFQReITaEsqERPlEiQl55I7ul4zfKbLOZzKxKiW9pqmS9nJx8ck8kj85XL38oxGmU6ZrFRlpCTaL01MuBppCeJUTYQ8eWmA5TLvC0tS2Alb9vSTL4GrrpGp8BwHaJy10PtcvE73QgfVN7FrpuCI/aO2Hl5rIKdTJWjyEvIyTKZeUl0BtppGgSkcI+mITrA5RYwAaMDkucXvdI4veckojU2jqX8V0tnEzGHhNByrOtKfLCNS2hIvdXS/IRg+dmbLeW9LSxKqQ7XJpJ9XaOobT/OK7dBzML1k1i19jOCkVCoTC33Zx9TLzzpuVFxJFz5kRCVNzZFM2BvMndG9r0xLWUclbLsADgdU6cSAbp4xIm0DYwll2uZRQrmHZsA7i5Z1m/cLB/tRoJHDhDm5/YCdxzgVwSTRdqcgv1lhKfpLAFlpHiPiBCZWKVEEEEcQdLRXV4hdHUl/g5dGaMrY6i2NiB7zNirX0iQL35QVHXSIJHiqTBAvBtE4CEvSkQm0A6coBNzCSUOsEAGBaCNISSMTjAvEOkJYUI0ju8JYyq2B6s3UaRNKYeB9tB1Q6n7KhzEdILmDa41j2x7o3BzTghaJ4Y6hhjlGQfBO1lZm3TMzKddvdlKqyn+ESSlaj85PVPy5xnhEefFCrk7hury1Spz65abl1haHEfI9QeYh0MrM0JLMuhB9ATL1JgBM3Kg/RV9pPVJ5dOEH9suYqh2cvvfmqB1Rpl1sd7TTbxH6LNxxEfFXKJJYkpM1TagwmZk5lG44hXzHQjiDytH1g6iLXifc0PBaVX8cjonB7DghIrmbl7OZb4nepswVPSq/ykpMkaOt308xwIjFNOsPJmpl7L5jYWekFpSmeau7Jvnihy3DwVwP90I/Oyj1Pm3pWZZLEwytTbjatClQNiIre50PskuW+6V0hpi+C8UuH/eN5+fmuHgYgveATeLRDI1QuQdYhV0ioN+sdhh6hTOJa9IUqVG8/OPJaT2udT5C58o9saXuDR4rTNI2GMyO5AZW/NlvL8KExi2dbvqWJEEfrr/AecMZfjHXUGiS2HKLI0uTSES8mylpAA42HHzNz5x99zFo0VO2lgawfFct3q4vuda+dx25D0VjpbvGPY8xxI5f4amqvOkK9GN1lgHV5w/RSPx7R36lWRc8uZhMc88yF49xa4xLuk0enqU1LgcHFcFOd72sOwhvca0UkWRzPJSGm7ObvVhrvcbuf8LDMT4ln8X1yaq1SeL03ML3lHkkckpHIAaAR10tNrkptqYZO460sOIV0UDcH4RxKPCKAk3vFbF7nO4yd10kyCNkQiaO7jGE/+BsUMY0wnTKwwQRMshS0/ZcGi0+RBjvvKFL2cc1m8JVVeH6o7uUufWCy6o+yw9w16JVwPe0Nnf2Ys231bauEOHMc1zHqC0vtVa5hHdO4PkpxjTuaezvT8YzD1UorqKVVnDvOtqT+QeV1NvonuNDG4bxN4kjkIdT08dS3gkGQoyguNTbZe2pnYP5pJK1kbjqhrVvUJydbT/KySw6D5A3+EYZP0yoUpwpnZGZk1DiH2lI+Yj0PI5x881Jy882W5lhqYbVoUPICwfIiB2WwRHeN2FY1Nr6oZgVEQPpsvO8LPlFiSIcTGOzvhPFCVuS0qaLOHUPSWiSe6DofhC15iZVV3LaaAn2hMSC1Wan2QS2rsfsnsYHaq2T0vecMjqFYVp1PQ3U8DHcL+h/RYbvREqPSKwQbCIlGCtxvAKyOUC5gcTCSRKoO/wCcADjHd4QwZVsb1dNPpMmuaeIuojRLaftKVwAjYxjpDwtGSVommjp2GSU4AXS75toBFklS1WT7R6AQ0WDdlii0xDb2IZhdYmhqplpRbYT26q87RtmjYPoVAaDdOo8lKJA09Gwm/vIvBDBYppBmQ4Vc12uqKBxZTtLyPgEhaZSZI0l3SOoQY7nCGKKxgSuy9Uprb6X2le0gtq3XUc0KFtQYfENtjT0aAOyAPwjjVLMqJJaQf0REiyxGNwc2TcIfm12yeN0UtPkHzXW4OxRLYyw/J1aVQtpD6bqacFlNq5pPgY7uONptLQ3UJCQegtHLBUwENAcclVNM5jpHOjGG52CF9TCz7UeXqZKdYxZJM2amFBidCRoHPqLPiBY9x3hmDYR1GKsOy2LMPz9ImwPQzbRbufqnkryNj5QxrqYVUDmHn4KbsNzda65kwPdzg+hXn+NBEB6x9tYpEzQatOU2bTuTMo6plwW+sk2j4orBzSwlp5rqZkgkYHt5FQcI3zsqYQ9drtRxA83dEkj1dgkaekX9IjwT840IlfHXSHcyQw5+9jLKkMqQEvzKDNu9d5eo9ybCJuzQdrUhx5NQLrOvNJbTG07v2+His7JuTEgXIiql7qSbRYi5157LXmfmOP3l4CeaYc3KjUyZVix9pKSPbX5DTxIhMFJ3Cd3hGztoXGhxVmDMS7at6TpafVGgOG8NXD79PKNXb5J4RW11qTUVBA5DZdJ6Utn7ut7S4d5+5/RXIuLRUpsOkDeIETePjEMjRThaGJyU2h2pCWYoOK3iGUgNy1SVqUDklzt0V74XUk9IBNxDylqpKR/HGVDXS1U92hMM49D4heistNMTjSHZd5t9lYulxtQUlQ6giOU6QhmDcy8R4DdvSaittkm5lnfbaP6J4eVo3Xhna1lyhDdeojiF8C/IuBQPfcV+2DWnvcEoAk7pVKXHRVfSkmm+0b9UxHIRI1nT9o3Ak+BvVRyTUfqzMupNvMXEZvQsVUfE7JdpNSlqg2OJYcCinxHERMx1MMvuOBQbUW6tpQTNEQPRdsk2Op0j5qtSZOuU9+RnpZualH0lDjTguFD/AI5x9EXBje4Bw4SmDHuicHsOCEkOcWWLuWeJyw1vu0maBck3lcbX1Qe6b+YsYwKHeztwUjG2X1QYS2FT0okzcsRx30i5HmLiEgBuL/OK3ulJ7JP3eRXSWlrubrRAye+3Y/5Riw4RS5iBV9IhuaNMrucK4YncZ4gk6PT0b0zMrtvK+i2n6y1dgNYd/AeBabl9h9qm05GtgXphQ9t9fNSvwHIRrHZdwM3SsMOYjmG/4ZUiUMkjVLCTbT+kq58hG8FQfWeibFEJnDvFc+6xvj6ypNHEe4zn5lAi8AC0HmI4pqbYkJZcxNPtSzCBdTrywhI8zBISGjJVcta554WjJXLa94FgIw6YzjwVLOFC8SyAUNDuuX+QjhTndge+uJJE/pH9kNfaoB+MfNSItdcRkQu+RWcAWN4sDGDnO3Ax/wC8ciPNX7I+mlZsYRrlSYp8hXpSZnH1brbKFG6z0FxGRUwnYPC8utlc0Euhdj0KzCBa8QGD8IdKLSsbVGEP3JxRJV5lFmam2UO24B1FtfNJHuMaOUbQ5+0Nh798WV9S3Eb8xTyJxrTX2fpD9Un3Qlp1FrxXF4g7GqJHJ266R0bXmttjWuO7Nv8AC+7DlMNcxDTKckXM3Mts+SlAH4R6EMMIlmG2GwA20kIQByAFh8oSfIKl/upmzQwobyZdS5ki3DdSSPjaHcTw0idsEeInP6oH19UF1VFBnkM/NUULGOqxTVk0LDVTqSzZMpLuPeYTp8bR2yhcx8lWpMnXKc/T59gTEm+ndcaUSAoXvbSCaQEtIbzVY07mMmY6T3QRleecxNOT0y7MOr3nXllxZ6km5+cVHE6Xh2xkNgJKrjDcrfupf+9HIMkcDDT97Umf1v2wEGxTk54grwbrqhYA1sbsBJCeHC0V1EOpPbPuA6gkpFDTLk/Wl3lpI+MYDiTZJk3UOOUCsOsO8UsTwC0HtvDUe4w1lstSwZbupKl1rbZ3cL8t9QlpveBGQ4ywFXMBVD1StSK5VR+g6PabcHVKhoYx6IR7HRnheMFHUM8dQwSROBB6KG2kQxIkeFuUuesffQK/UMM1Zio06ZclJplQUlbZtfqCOYPQx8BEWsRHtjyw5aVrkijlYWPGQU++X+L2cd4Rp9ZaAQp9FnW08EODRQ9/zjIt+3KND7JNW9YwtWqaVe1KzaXkp6JWn9qY3uRrFpUUxnp2PPPC5VvdEKC4S07RsDt6IkhQII0OhHaEHzBoBwrjat0siyZeaWEf0Cd5PwIh9TodYVPapw0uQxvK1lLdpeoS6UqUBp6RGhHju7piHvsPHAJB4FGGhKwQVzqdx2ePqFpQnlbSLtNKfeS23qtaglI7k2EVJBtyjL8ocOLxRmLRZNKCtpD4mHiOAbR7RJ9wHnARCwySNaPEq8q2ZtNTvlccYBKdvC9IboGGqXTWhZEpLNsgdwkX+N47BXCKhRSOVukE3KYtljeBoaPBcjzPMsrpD4klfPPTjUhJPzTytxllCnFqPJIFz8BCP5lZm1TMitvzM28tunhREtJBXsNI5ac1HmYajPirGjZVV1xKtxbzQlk+K1BPyvCSgCA++1Lw8QtOAri0HbonRPrJG5OcBQGwiEnrBtAJ5QIK4sBQXj6qTUXaNWZGoskpelHkPJI6pVePlB1ix4R6a4tcCtMsbZGFh5HZeidOm0VKQlptogtTDSHkEdFJBHzj6N0iMAyKrJreVdCdUrecZaVLKPdCiPlaM+34tmB/aRNf1C5HroDTVUkJ/CSF81Wk0VCnTMo4LtzDaml+CgQfnHnvUZBdLqE1JuaLlnVsqv1SSPwj0OVcnpCRZ3UsUbNHEbCU2QuZ9OnwWkK/GBq/xZYyTorO/Z9U8M0tOfEArLNlWRExmFOTFr+ryKyL9VKSIbMGwtCwbIbYNfxG4R7SZRsA/p/3Qz6okLM0NpBjqVA60kLrs4HwAVSdYJIsdDfvAIMFKVkGySq3QROIE3PJC/OANYi7o+kkp7WiIBUqwBPlGOIdV74Hf0og84hI5wVIUk6i3jAse1o9LHJddiPDdNxdR3qZVZVE3KOjVKuKT9pJ5EdYSvNbLOcyyxIZNzefp791yc0RbfT9lX5w5w8wBTy0jDs2cCs5g4LnZApHrjSS/KOc0upFwPPh5xB3OhZVRFzR3gjXTN+ktdU2J5+yccEdPNIvvCKlQiziVJUUqBSpJIIPI9I472iuMY2XSDCHDIVrgCCVX15RSIFAQl7W4dmLFSaFmIJB1e6xVWTL68PSD2kfIjzhvSkk3jzpkZ96mzsvNyy1NTDDiXW1p4pUDcGHsy3zAlcxcKytUllJTMWDc0xfVp0DUeB4jsYNrFVAsMDuY5KkNd2t7Zm17Bsdj6rJ1cTHRYzwXTMe0F6lVRoraV7aHEGy2ljgpJ6/OO9MFNrd4KnsbI0tcNiqqhmkppBLEcOHIpYprZGqgnCJbEMouUJuFPNKCwO4GkbhysyipeWEm6WHDO1KYAS/OLTu3H2Ujkn5xnhMAA8oj4LdT07+0Y3dEFbqS418PYTSd38/VTyiwFweUAC2sfBXq7J4ao01Up95LErLNla1noOQ7k6ecSDnhgLnHYIcjjfM5scYyTyWjtrTEzbNLo9BQr8s86Zx5PRKfZRfxJPuhZgsC8d9j/Gkzj7Fc9WZq6fTKsy1fRtsaJT5D43jHSdIrCvqPaah0g5LqOwW42ugjp3c+Z9SuQuCBvJJinGCCRyiORIrXFwYJXpFBBVC5rCa/ZOqJmsBVCVKr+qz6rDstCT+EbsvC77IDylU7EzRGgfYX70qH4Qw40T5xZ1rcXUjMrmDVMYju8wHXP0RAF7woe1FLiXzRW4BYTEkws9yAU/hDep4iFQ2tGt3HlKcOm9TwPc4qGl7GaXPmpbQ7+G6gdQV2OyI7u1/ETfMyrR/rn9sNARClbJ076HMGfYvb08gqw6lK0mG1vePVlOaQepWnWjC27Oz4gIKhfNq2sVKjvYdMhPzMmh1DwWJd1SN4gptex7wwZ1ML3tcShVSsPTX1G5lxo/pIB/sxuupIpHFqZaVDHXaJr9wc8/RL6rF9fWDvVqoG/WbX+2C3jGvo4Vyopt0ml/tjpyoQAQeMV120n9RXSIo6fH3Y+QWd4ZzpxhhaYS6xWZmabBG9Lzqy62sdCD+EN5lxjuUzGwrL1iWR6FZJbfYvf0Tg4jw1uOxhCCq9gDDL7ID7hpmJWST6JL7KgOQUUkH5CCGz1kpnETjkFVzrKz0vsJqo2Brmkckw5VpACt1VxwBvAJFoEHmNlQviCEi+cVHRQczsRSbSdxkTRdQBwAWAq3xjDALxs3aQATm5VD9plhX9QRrO4EVNVtDJ3gdV1paJDLQQvdzLR+SIEUOhg7yetzEIBMNVL4QvrGWZb5j1PLavCfkT6SXcsmYlVn2HkdOx6HlGJ7sS4EbI5HROD2HBCbVFPFVxmGVuWnwT5YCzKoeYsiHqVMj1gC7sm6QHmjzBHMdxpGWhNrR5zyM9MU2abmZN9yVmGzdLrKihST2IjaOH9pnGdFQluafl6w0kW/hjdl/rJsT5wY019aRicb9VTdz0HKHl9A4EdCnEVxNoI4Qsf8Aje1PcAOG5MqHMTC7H4R0Na2psXVBKkyTcjSkn67TZcWPNWnwh++9UjRkElD0eibs93C5oA65TS4kxVScIU1c9WJ5uRl0g2Lh9pZ6JTxUfCFEzjzknMyp0S8slcnQ2FXalyfadV9tzv0HLxjBK3iGp4lnTN1Wffn5hX8o+sqt4dB4R15tAzXXaSr7jNmqzrDpOC1OE0p45PoPRVN4B00iGATECrA5Kwiw0iqVJOhMEEdYwseKtwEVvcQd4RVVrWEZys5TM7ILBFLxK9b2VPspv3CVH8YYUiNL7KdO9Vy7m5si3rc8sgnohKU/O8boJHWLOtbeGkYFy5qiUSXefHgcfRQDWFW2t1b2NqOm992nm/m4qGouDCjbUk6mZzMQ0Df0Eg0m3QkqV+IhrezilPqpfRDC66h3QFdFs81AUzNmib6t1MwVyyh/SSbfECHXEeeeHKuqh1+nVBFwuVmG3rj81QPyj0IlppE6w2+2Qpt1IcSRzBFx84Z2CTMTo+hUvr+mLKmKoHIjHyXJGqtpahmsZXTryE7y5B1uZ4cADuq+Co2oox8NepCMQUCp0twBSJyXcZN+pBt8bQQ1UfawuZ1Cr+11PslbFP0IXnerWJuk945puVXJTb8s6kodZWW1pI4KBsR8I4ge9oqcjBIXWTHB7Q4eKgunl74ZnZBt+5OJ9BvenY+6qFoFidYYTZGqjbdTxDTiQFustvoT13VEH7wiXtBAq25Qfq5jn2mXH/24TLQANYJNyQIIFostc0JM9pZpSc2588lSzBH6kausYZnajy2m6l6timnNKe9A16CcQ2LqCQfZXboL2PTSFmKr97RWFyhfFUv4hsSuoNM1kVVbIuA7tGD5YVbnpF4A1EGItFWygIHEwbg8oFhEhJYQg2g37RL9oSSFrwQm0CJqbAXJOlhC5rBwNypflHNKSkxUHwzLMOTLx4NsoKlHyEbuyu2Z53ETTFUxKpynU9YC0SSNH3U9T9gH3+EMjhrBdFwfKpl6NTpeRQBYqbT7au6lHUwRUlmlqBxyHhCr27ayo7e4xQDjePl80lUrk3jafbStjDVQKVcCtvcv77R9ByJx7b/NuaP6SP2w8hUQevjE3RfXWJkWGHHvFBR1/WE7RD6pGhkXj0cMNTQ80ftgnIrHv/pqav4o/bDyEC3CKgAcoX7hh/qKX8e1v9tv1SOf4C8ejT97c170/tiisj8eIH+bU370/th5t3hBCBzEL9ww/wBRS/j6t/tt+qw/KHDUxhDLqjUyab9FNttFbzZ+qtSioj4xmFze8EjQQII42CJgYOQVaVU7qqd87+biT80CSEmEczwqv7r5sYicCt5LT4l026ISE/MGHgmZhEnKPzLps0y2p1ZJ4BIJPyjzzrNQXVqvOT7huuafW8SePtKJ/GBi/wAmI2R9VaX7P6fimlnPgAF8RJVpy7Q7uRGJf3zZY0d1St9+WQZN3rvI0H9W0JGLC46Rv7ZNxZ6pXKnh11fsTiPWZcH+cSLKA8U/KIazTiGpDTydsjTWlD7XbTI0d5m/w8UzxEFJtfrBgg8YsRc4ZSX7ReFDhnMqcfbbKZWppE23YaBR0WP1tfONYE2hy9ofL84ywS5NyrW/UaXeZa3R7SkW9tPu18RCZq4xWt0pzT1B6HddN6VuYuNuYCe8zYqXjL8qcZ/vFx5TKmpZTKlfoZn/AOJeij5aHyjD4BA5xGRSGJ4ePBFFTTtqoXQP5OGF6OMlKwlaFBba0hSVDUEcjHMOMaA2bs4mqjIMYUrD4RPMDckn3To8j+bJ+0OXUeEMBu7pOsWjSVLaqMPauVbtbZrVVOglHoeoQUkLSUqAKSLEHmIwmsZNYJrTqnZrDsn6VZuVtJLZv+iRGbE8esVA6xvkhjl99oKaU9XPSnMLy30K09VdlfBs+hXqip6mOHgpp/0iR+ioH5xqPHWzNiTC7Ts3TFJr0ii5IYTuvpHUo5+UN5w5xyBRJERc9pppm4AwfJFVDq26UjwXP4x0K84FpU2tSFoKVpNilQsQehgA9Yb/ADvyKlcbSMxWaKymXxC0krUhAsmbA5Efb6HnwMKA42tpxbbiShxJKVJULEEcQYB62iko38LuXgVeVlvUF5g7SPZw5johva8Im9AiWiOREiF25QwuzXlEzVinFtYlw4w2siQl3BdK1Di6ocwDoO9zyjRuF6A9ijEdNpEv/Gzr6GQRyBOp8hcx6B0ily1FpkpT5NsNS0s0lptA5JAtBLZaMTyGV/JqrTWt4fQ04pYThz+fkF9gNuMC94mhgW16we7AKgRklTQQbaW7xr3GGeuEMFT6pKbqBmptBstmSQXSg9CRoD2vGPDaqwWfq1If7MP96GLq+mYeFzxlTsdiuUzBJHA4g+S3CRAteNQf40+CbX/yl/8AV/vif41GChwTUj/sv98ef3hS/wBwLb/Dt0P/AAOW4wLCKnUxp1G1VgtTiUBFSKlEAD1bn7429LTKZ2TZmEoW2HEBYQ4LKTcXsRyMOIqmKfPZuzhRlZbKugwamMtzyyr34xIqTcxY+zxhwo3BWvc/sUjDOV1VKHNyYnQJJqx1uv6RH6IVCR34do3ltWYxFTxPI0Bld2ac2XXgD/Kr5eSQPeY0YDFdXiftqkgcm7LpDR1vNFbWvd7z9z+iEdrhTEczhTEdPq8ooh+TeS6AOYHEeYuPOOnCrp6RAuyhaINryxwcOYRvLE2aMxvGQRhejFErEtiCkSVTklhyVm2kvNqB5EXt5cPKPsVfjaFy2U8xg4w/hCddstG9MSJVzT9dsfMecMavXgYtKiqRVQteOfiuVb1bX2uufA4bZyPRFFlCxSD2OohLM/8ALc4Bxi49LNlNIqRU/LEDRB+s35E+4iHSToe8YtmXgKTzFwrM0qa9h0jfl37XLLo4K8ORHSG9ypBVwkD3hyUnpq8OtNaHPPcdsf8AKQa4ghQ6Xj7cQUCdwtWZqlVFky85LLKFoPPoR1BGoMdfFaEFp4XDcLplj2ysD2HIK5UuKZcS4glC0kEKSbEHqI31lttSTlHbakMVMrqMsgBKZ9n+OSPzx9fx4+MaBuYidVC8OaerlpXcUZUXcLVS3SPs6lmfPxC9AML5j4bxgwl2lVeVmSRq3vhLg8UmxjIh7SbgEjtHnC0stLCkq3Fj6w4x2UvimsSZBYqs6zb+bmFj8YJo9QEDEjN1WdR+z9peTTzYHmF6FWvwi44wq2SGftUYr8rQ8Qzi5+SnFhlmaeN3GVnRN1c0k6a8IakpIJ5W0tBLR1kdbHxs+Kra8Weos0/Yzbg8iORRB90KRtQ4Bbw3itiuSbYRKVa5dSkWCX0/S/WFj43htxbhGq9pWhCsZV1B+13JBxuaQeYAVuq+CobXSAT0zttxupLS1e6hucYz3X7H4pMhYxDpwgFQHMeUVJuYrPK6ZbyW29mKmJn81JZ5QCvUpZ18X+1bdH3ocgixhStkof8AL+pH/wBuV99MNta47xYdjH+lz5rnjXDy668J5BoQF41LtH5iTGCsIMyVPdLNRqq1NB5JsppoD2yOhNwL9zG2+HjCybYSv8p4YHL0D/3kw6ukroqVxZzUTpamjqrrEyUZG5+SXtSt4kk3VxvFIh0AMSKyJ6rpwNDRgIgQQLRW9ucd3gvCs9jjEcpSKejeffVqq2jaB9JauwGse2NMjg1vMrTNMyCMySHAC2Fs55aqxfixNYnZfepVMUF+2PZde4pT3A4ny6w4QJJEdNhDCklgrDkpSKemzDCdVkauKP0lHuTHcpPGLNt9IKSEN8TzXMmobw68Vhk/ANgP1Vt3XUR1uKK5K4Vw/P1edITLSjJdVfnbgB3JsPOOzvpyhadq3MUPOy+EZJ4FLZTMTxSfrfUbPh9I+IjZXVIpYHPPPwTexW190rmQgbZyfQLQderUziKtT1Um1b0zNvKeWe5PDy4R14EVJiEgxVrnlxLj4rqeKNsTAxvILhJJg75ECJHjK2rsKJW5vD9XlKlJO+hm5VxLrSxyI/CH0y7x1J5h4VlKxKEBaxuPsg6tOj6ST8x2MefY4+UbIySzTcyyxLvP7zlHnCETbQ4p6OJHUfERO2qu9kl4Xe6UCarsYutL2sQ+0Zy8/JPENLmAeUcUlOMVKUYmpV1L8s8gONutm6VJIuCDHMoaRYoIO4XOTmFjixw3C1bnbk0xmVSfW5FCGcQSqT6Fw6B9P82o/I8oTKfkpimTj0pNMrl5llZQ404LKSocQRHo/axjU+dWRsnmNLrqMgG5PEDSfZdIsiYA+qvv0VAzdLZ2320I73iOqs/S2qDQ4o6w5YeR6JMdb2gx91aoc7h2pPyFSlXJOcZVuradFjft1HePhgHc0tPC4K9I5GytDmHIKgN4G8eUC9iYNhHlbV9FPX6Gdl3LkKS6hQI6giPRttRcaQsm5UlKj7hHnDKmz7RP20/MR6NypvKsnq2j7ogy0+ffHoqZ/aENoD6/ouURiubjQeyxxMlQ3h6g6fcLxlYTaMXzSH/NrifoKe992Cmo+5f6FVVbv5yEj+ofmkBJMAqsYKtUjoOkDQmKkXXLeQW8dkck5gVO/wD5cr76YbeFJ2Sf+sGpf6uV99MNtFiWQ/6Qeq501sf92PoEFaCFj2wv+k8Ln/Qvj+smGcIvyhZdsRH8NwqoWB9E/wDeTGy8fyblo0ccXeP0P5JdCs8CIAUSbARCdBf4R2GHcPVHFVXYptKllzc28qyUIH0RzKjyA6mK5a0uPC3mujpJWRML3nAC4aXSp2uT7MjIy65mbfUENtNi5UTDpZL5Qy+WNC3ntx6uTSQZqYTrujj6NJ+yPifKOTJ3Jin5Y05LzoROV55P5ebIuED7COg78TGx1cL/ABg8tlsFMO1l978lQ2p9TG4E0lIcRjmev/S47km0GAOPSPnqdTlaNTpiennky8pLNlx11ZsEpHGCJzg0ZKrVkbpXBjBklYzmlmDKZb4TmKo9uuTSrtyjBOrrpGnkOJ7eMInU6nMVaoTM7OOl+amXC464ripR1jL83czZrMzFDk4d5qmsXbkpdX1EfaI+0rifdGC3vx6xXN0rva5cN90LpPS9jFopeKQfaO3Pl5Ik3ioWYMQgX4RBI2VecSJEjykoOMWCiBxisWAj0Fhbv2f88jgyZboFbdJoby/yMwo39VUf7BPHpx6w3DbiHmkONrS42sBSVJNwQeBBjzYtG88is/l4RLVBxC6t2jE7rEyfaVKnoeqPlBbarp2eIJjt4FVPqrS3tOa2iHf8R18/VNoTBSd4dbRwy0yzPS7cxLupeYcSFocbO8lQPMGOVI3RpBvsRkKjnNcw8LhgrFMxcrqHmVTPV6kx6KbbH5CeaADrXbunsYT7MnKKv5bzajOs+s00qs3UGAS2rsr7J7GHuBJ4xwzkkxPSy5eYaQ8w4N1bbiQpKh3B4xDV1sirBxDZ3VGdk1RVWhwjceOPofD0Xm6RzEAKN7Q3WPtlSg1tK5rD0waJOnX1cjfl1Hw4p8riF5xpk7ivArilVCluuSo4TcqPStEeI4edoCqm3VFMe8MjqrutmpLfcwBG/Duh2KxBlVnmxy30/OPR2Q1kmD/o0/dEeccsi8y0kXJK0/OPR+VRuSjI/MT8hE9p8HMnwQF+0FwLYMea5IxfNPTLTE/enPfdjKdBGLZqEf4NMT/6ve+7BTUfcv8AQqqrecVkX/sPzSAm6kjW2kVtbjFgLgeEHdtzipCuuG8gt37JAvmBUugpyvvphtoUnZJN8wal/q5X30w2t9bRYlk/lB6lc6a3/wDLO9AjaFk2xHCJ/Co6tP8A3kwzdyOEY3iPL6hYvqtPqFXkkzzsgFBhDpu2LkEkp58OcP6+B1TAYm+Kg7DcI7ZXNqpRkAH8koGW2SNfzGfQ6hs06kg3XPzCSEkdEDio/DvDaZd5Y0PLimeq0qXu8oD0827q68e56dhpGWJbQ2hKEpCUJFkpSLBI6ARYAcobUdshpO9jLuqkLzqeruxLM8MfQfqrXsICjYcYiRHDPz0tTJN6am325aWZSVuOuq3UpA5kxLEgDJ5IRaHSEMaMkqPvNyrDjzziGmm0lS3FmwSBxJPIQoOfOdq8eTiqNR3FIoEuv2ljQzax9Y/mjkPOOTPHPt7HDjtFoilsUFJs47qlc0QeJ6J6DnzjSpNz2gIul07X7GE7eJ6q89K6X9kArK0d/wAB0/7VjEAipMC94Fcq1MYRVEvpE8YEYWVIkDePPhBjykpBJgRIyEkQq3jBuVCKxYCMrC2blLnlVctXkyru/UaItV1yalao6qbPI9uBhv8ABuN6Nj2lpn6POomW7Dfb4ONHopPER56XIEdphvFlWwjVEVCkTrsjNJ032zoodFDgR2MEFBdpKbuP3agC/aTp7oDND3JPofVei27yiHhGhctNqamVtLUjilCaTOn2ROIBMus9VDig/CN6y00zPS6H5d5t9lYulxpQUlQ7EQdU9XFUtzGVRVwtVXbJCypZjz8Pmr31EVW2lzQi6eY6xaITeHZwdiooOLTkLE61lThKvuF6coMoZi9w80j0awet02jKvopCRwAsPKDe0UXoSeIjwyJkeSwYyt8tTNOA2V5cByyeSlyDrwjqMZ0h7EeEqvS5dSEPzkstlCnDZIKhbWO2vrFwbCMvaHtLTyK1xSmGRsjeYOUqTeyPiVZ9uq0tsdlLV/ZjspLZAnFH+GYjYbHSXl1KPxIhmucSIUWajByQjR+s7u4bPA+C1pldkdTcr6k/Py09Mzs0+16FSnglKQm4OgHhGzBxMC0EKtwiVhhZTt4IxgITrK2evlM9Q7icjxMHwipUrlEB4ExvTJQ3HhBBF4+afn5amyi5mbfblpdsby3XlhKUjuTGiMx9qan0tDslhVoVKbF0meeBDKP6I4q+XjDSoq4aZuZCpe32isujw2mZkdfBbhxtj2iZfUoz1YnEspIPo2E6uunolPPx4CE9zWztrOZswWCTT6MhV2pFtX0uinD9Y/ARheIcR1LFNUcqFWnXZ6bc4uOm9h0A4AdhHVk3gErrrJVHhZs1XvYdK09qAll78nXwHooTeBEiRAEo+wpEETheJCSUMTnaJyJgA637QgkoAIMUuLcIiVWhEJK8QfOK73aJv24iMgJK0HeigXflB3r8oWFhWURbSANDFd/ThEC+kLCyuQnTU3jJcG5l4jwG+F0apusN3uqWWd9lXik6Ri29blA39b2jZG98Z4mnCbT08VSwxzNBHmmjwdtcyj6W2cTUtcqs6KmpH20eJQdR5ExuXDuY+GsXIBpNalJpR/kvSbjg/RVYx58BYNxEbdKFBSFFKhwI0Igggvc8Wz+8EAV+h6CpJdATGfLkvSzgNdPGKlBVpf4wgNDzZxhhwJTI4hnW2x/JOOFxHuVeM8o+1fjCQSEzbNPqIHNxkoV70mJuO/QO2eCEE1Gg6+PeF4cPknCKCCLxD9IQssptjP2T63hltR6sTZHwIjskbYtOUm68NTST+bMpP4Q9F2pHfiUG7SF3afus/EJiBrBtC6ObYlPH8XhqaJ/Omkj5COtm9sWaNxKYZYT0L80pXyAjBu9IPxL03SF4d/xY9SEzh0ifhxhPattX4znd4SrdPp4PAtMFZHmoxgWIM2MX4nCk1DEE680ri0hz0aPcm0MpL7ANmNJUxTaCr5SDM8NHzTr4mzMwxhFCjVK3KSywP4oL33D4JTcxpvGO1ww0Fs4ZphfXqBNz43UjuEDU+ZhYlLK1FSjdR5nUwAq0Qk97nk2Z3Qjmg0Pb6Uh85MhHXl8lk2L8w8QY6mfTVmpOzYv7LN91pHggaCMc3rRTf0vaAT2iAfI6U8TzlH8MEVOwMiaAPJX3rxLWigWNOsW3u0a8JwjziRXetyglfaMYSRiK7RQudom/c8I9YSVgLQAeUTe7QLkcoWEl/9k=';

// ─── Replaced virtual:content ───────────────────────────────────────────────
const settings = {
  supportHeader: 'Support',
  chooseLang: 'Choose language / اختر اللغة',
  langEn: 'English',
  langAr: 'العربية',
  taskDone: 'المهمة مكتملة',
  taskDoneSimple: 'تم',
  deleteCountdown: 'سيتم حذف المحادثة خلال',
  noMessages: 'لا توجد رسائل بعد',
  supportReplyPlaceholder: 'اكتب ردك...',
};

// ─── Inlined SUPPORT_COPY (was @/lib/support-copy) ──────────────────────────
type SupportLang = 'ar' | 'en';
type SupportCopy = {
  askRole: string;
  roleUser: string;
  roleCompany: string;
  greetingUser: (name: string) => string;
  greetingCompany: (companyName: string, license?: string) => string;
  howHelp: string;
  btnForgotPw: string;
  btnTalkSupport: string;
  waitForgot: string;
  waitSupport: string;
  waiting: string;
  supportJoined: string;
  blocked: string;
  askTitle: string;
  unavailable: string;
  notFound: string;
  playing: string;
  attach: string;
  placeholder: string;
};

const SUPPORT_COPY: Record<SupportLang, SupportCopy> = {
  ar: {
    askRole: 'هل أنت مستخدم فردي أم شركة؟',
    roleUser: 'مستخدم',
    roleCompany: 'شركة',
    greetingUser: (name) => `أهلاً ${name} 👋\nكيف نقدر نساعدك؟`,
    greetingCompany: (companyName, license) =>
      `أهلاً بكم من ${companyName}${license ? ` (ترخيص: ${license})` : ''} 👋\nكيف نقدر نساعدكم؟`,
    howHelp: 'اختر نوع المساعدة:',
    btnForgotPw: 'نسيت كلمة المرور',
    btnTalkSupport: 'التحدث مع الدعم',
    waitForgot: 'تم استلام طلبك بخصوص كلمة المرور. سيتم الرد عليك قريباً...',
    waitSupport: 'تم تحويل طلبك للدعم. سيتم الرد عليك قريباً...',
    waiting: 'نعتذر عن التأخير، الدعم سيتواصل معك في أقرب وقت...',
    supportJoined: 'انضم فريق الدعم للمحادثة 👋',
    blocked: 'عذراً، لا يمكن معالجة هذا النوع من الرسائل.',
    askTitle: 'ما اسم الأغنية أو السورة التي تريد سماعها؟',
    unavailable: 'عذراً، هذه الخدمة غير متوفرة حالياً.',
    notFound: 'لم يتم العثور على الملف المطلوب.',
    playing: 'جارٍ التشغيل:',
    attach: 'إرفاق ملف',
    placeholder: 'اكتب رسالتك...',
  },
  en: {
    askRole: 'Are you an individual user or a company?',
    roleUser: 'User',
    roleCompany: 'Company',
    greetingUser: (name) => `Hello ${name} 👋\nHow can we help you?`,
    greetingCompany: (companyName, license) =>
      `Welcome from ${companyName}${license ? ` (License: ${license})` : ''} 👋\nHow can we help you?`,
    howHelp: 'Choose the type of help:',
    btnForgotPw: 'Forgot password',
    btnTalkSupport: 'Talk to support',
    waitForgot: 'Your password request has been received. We will reply soon...',
    waitSupport: 'Your request has been forwarded to support. We will reply soon...',
    waiting: 'Sorry for the delay, support will contact you shortly...',
    supportJoined: 'Support has joined the chat 👋',
    blocked: 'Sorry, this type of message cannot be processed.',
    askTitle: 'What song or surah would you like to listen to?',
    unavailable: 'Sorry, this service is currently unavailable.',
    notFound: 'The requested file was not found.',
    playing: 'Now playing:',
    attach: 'Attach file',
    placeholder: 'Type your message...',
  },
};

// ─── Inlined auth-copy (was @/lib/auth-copy) ────────────────────────────────
export type AuthLang = 'ar' | 'en';

type AuthCopy = {
  enterEmailPw: string;
  pwMismatch: string;
  pwShort: string;
  needUsername: string;
  userFmt: string;
  userTaken: string;
  needCompanyName: string;
  needTradeName: string;
  needOwnerName: string;
  needLicense: string;
  needSector: string;
  needPhone: string;
  needName: string;
  joinNow: string;
  welcomeBack: string;
  createAccount: string;
  login: string;
  companyToggle: string;
  companyToggleHint: string;
  companyName: string;
  tradeName: string;
  ownerName: string;
  username: string;
  checkingUser: string;
  userAvailable: string;
  userInvalid: string;
  license: string;
  sector: string;
  sectorHint: string;
  phone: string;
  phoneAlt: string;
  email: string;
  password: string;
  confirmPassword: string;
  confirmEmail: string;
  name: string;
  submitCreate: string;
  submitLogin: string;
  haveAccount: string;
  noAccount: string;
  goLogin: string;
  goRegister: string;
};


const DIAL_CODES: { iso: string; dial: string; name: string }[] = [
  {iso:'AF',dial:'+93',name:'Afghanistan'},{iso:'AL',dial:'+355',name:'Albania'},{iso:'DZ',dial:'+213',name:'Algeria'},{iso:'AS',dial:'+1684',name:'American Samoa'},{iso:'AD',dial:'+376',name:'Andorra'},{iso:'AO',dial:'+244',name:'Angola'},{iso:'AI',dial:'+1264',name:'Anguilla'},{iso:'AG',dial:'+1268',name:'Antigua and Barbuda'},{iso:'AR',dial:'+54',name:'Argentina'},{iso:'AM',dial:'+374',name:'Armenia'},{iso:'AW',dial:'+297',name:'Aruba'},{iso:'AU',dial:'+61',name:'Australia'},{iso:'AT',dial:'+43',name:'Austria'},{iso:'AZ',dial:'+994',name:'Azerbaijan'},
  {iso:'BS',dial:'+1242',name:'Bahamas'},{iso:'BH',dial:'+973',name:'Bahrain'},{iso:'BD',dial:'+880',name:'Bangladesh'},{iso:'BB',dial:'+1246',name:'Barbados'},{iso:'BY',dial:'+375',name:'Belarus'},{iso:'BE',dial:'+32',name:'Belgium'},{iso:'BZ',dial:'+501',name:'Belize'},{iso:'BJ',dial:'+229',name:'Benin'},{iso:'BM',dial:'+1441',name:'Bermuda'},{iso:'BT',dial:'+975',name:'Bhutan'},{iso:'BO',dial:'+591',name:'Bolivia'},{iso:'BA',dial:'+387',name:'Bosnia and Herzegovina'},{iso:'BW',dial:'+267',name:'Botswana'},{iso:'BR',dial:'+55',name:'Brazil'},{iso:'BN',dial:'+673',name:'Brunei'},{iso:'BG',dial:'+359',name:'Bulgaria'},{iso:'BF',dial:'+226',name:'Burkina Faso'},{iso:'BI',dial:'+257',name:'Burundi'},
  {iso:'KH',dial:'+855',name:'Cambodia'},{iso:'CM',dial:'+237',name:'Cameroon'},{iso:'CA',dial:'+1',name:'Canada'},{iso:'CV',dial:'+238',name:'Cape Verde'},{iso:'KY',dial:'+1345',name:'Cayman Islands'},{iso:'CF',dial:'+236',name:'Central African Republic'},{iso:'TD',dial:'+235',name:'Chad'},{iso:'CL',dial:'+56',name:'Chile'},{iso:'CN',dial:'+86',name:'China'},{iso:'CO',dial:'+57',name:'Colombia'},{iso:'KM',dial:'+269',name:'Comoros'},{iso:'CG',dial:'+242',name:'Congo'},{iso:'CD',dial:'+243',name:'Congo DR'},{iso:'CR',dial:'+506',name:'Costa Rica'},{iso:'CI',dial:'+225',name:'Cote dIvoire'},{iso:'HR',dial:'+385',name:'Croatia'},{iso:'CU',dial:'+53',name:'Cuba'},{iso:'CY',dial:'+357',name:'Cyprus'},{iso:'CZ',dial:'+420',name:'Czechia'},
  {iso:'DK',dial:'+45',name:'Denmark'},{iso:'DJ',dial:'+253',name:'Djibouti'},{iso:'DM',dial:'+1767',name:'Dominica'},{iso:'DO',dial:'+1809',name:'Dominican Republic'},
  {iso:'EC',dial:'+593',name:'Ecuador'},{iso:'EG',dial:'+20',name:'Egypt'},{iso:'SV',dial:'+503',name:'El Salvador'},{iso:'GQ',dial:'+240',name:'Equatorial Guinea'},{iso:'ER',dial:'+291',name:'Eritrea'},{iso:'EE',dial:'+372',name:'Estonia'},{iso:'SZ',dial:'+268',name:'Eswatini'},{iso:'ET',dial:'+251',name:'Ethiopia'},
  {iso:'FJ',dial:'+679',name:'Fiji'},{iso:'FI',dial:'+358',name:'Finland'},{iso:'FR',dial:'+33',name:'France'},
  {iso:'GA',dial:'+241',name:'Gabon'},{iso:'GM',dial:'+220',name:'Gambia'},{iso:'GE',dial:'+995',name:'Georgia'},{iso:'DE',dial:'+49',name:'Germany'},{iso:'GH',dial:'+233',name:'Ghana'},{iso:'GR',dial:'+30',name:'Greece'},{iso:'GD',dial:'+1473',name:'Grenada'},{iso:'GT',dial:'+502',name:'Guatemala'},{iso:'GN',dial:'+224',name:'Guinea'},{iso:'GW',dial:'+245',name:'Guinea-Bissau'},{iso:'GY',dial:'+592',name:'Guyana'},
  {iso:'HT',dial:'+509',name:'Haiti'},{iso:'HN',dial:'+504',name:'Honduras'},{iso:'HK',dial:'+852',name:'Hong Kong'},{iso:'HU',dial:'+36',name:'Hungary'},
  {iso:'IS',dial:'+354',name:'Iceland'},{iso:'IN',dial:'+91',name:'India'},{iso:'ID',dial:'+62',name:'Indonesia'},{iso:'IR',dial:'+98',name:'Iran'},{iso:'IQ',dial:'+964',name:'Iraq'},{iso:'IE',dial:'+353',name:'Ireland'},{iso:'IL',dial:'+972',name:'Israel'},{iso:'IT',dial:'+39',name:'Italy'},
  {iso:'JM',dial:'+1876',name:'Jamaica'},{iso:'JP',dial:'+81',name:'Japan'},{iso:'JO',dial:'+962',name:'Jordan'},
  {iso:'KZ',dial:'+7',name:'Kazakhstan'},{iso:'KE',dial:'+254',name:'Kenya'},{iso:'KI',dial:'+686',name:'Kiribati'},{iso:'KW',dial:'+965',name:'Kuwait'},{iso:'KG',dial:'+996',name:'Kyrgyzstan'},
  {iso:'LA',dial:'+856',name:'Laos'},{iso:'LV',dial:'+371',name:'Latvia'},{iso:'LB',dial:'+961',name:'Lebanon'},{iso:'LS',dial:'+266',name:'Lesotho'},{iso:'LR',dial:'+231',name:'Liberia'},{iso:'LY',dial:'+218',name:'Libya'},{iso:'LI',dial:'+423',name:'Liechtenstein'},{iso:'LT',dial:'+370',name:'Lithuania'},{iso:'LU',dial:'+352',name:'Luxembourg'},
  {iso:'MO',dial:'+853',name:'Macao'},{iso:'MG',dial:'+261',name:'Madagascar'},{iso:'MW',dial:'+265',name:'Malawi'},{iso:'MY',dial:'+60',name:'Malaysia'},{iso:'MV',dial:'+960',name:'Maldives'},{iso:'ML',dial:'+223',name:'Mali'},{iso:'MT',dial:'+356',name:'Malta'},{iso:'MH',dial:'+692',name:'Marshall Islands'},{iso:'MR',dial:'+222',name:'Mauritania'},{iso:'MU',dial:'+230',name:'Mauritius'},{iso:'MX',dial:'+52',name:'Mexico'},{iso:'FM',dial:'+691',name:'Micronesia'},{iso:'MD',dial:'+373',name:'Moldova'},{iso:'MC',dial:'+377',name:'Monaco'},{iso:'MN',dial:'+976',name:'Mongolia'},{iso:'ME',dial:'+382',name:'Montenegro'},{iso:'MA',dial:'+212',name:'Morocco'},{iso:'MZ',dial:'+258',name:'Mozambique'},{iso:'MM',dial:'+95',name:'Myanmar'},
  {iso:'NA',dial:'+264',name:'Namibia'},{iso:'NR',dial:'+674',name:'Nauru'},{iso:'NP',dial:'+977',name:'Nepal'},{iso:'NL',dial:'+31',name:'Netherlands'},{iso:'NZ',dial:'+64',name:'New Zealand'},{iso:'NI',dial:'+505',name:'Nicaragua'},{iso:'NE',dial:'+227',name:'Niger'},{iso:'NG',dial:'+234',name:'Nigeria'},{iso:'KP',dial:'+850',name:'North Korea'},{iso:'MK',dial:'+389',name:'North Macedonia'},{iso:'NO',dial:'+47',name:'Norway'},
  {iso:'OM',dial:'+968',name:'Oman'},
  {iso:'PK',dial:'+92',name:'Pakistan'},{iso:'PW',dial:'+680',name:'Palau'},{iso:'PS',dial:'+970',name:'Palestine'},{iso:'PA',dial:'+507',name:'Panama'},{iso:'PG',dial:'+675',name:'Papua New Guinea'},{iso:'PY',dial:'+595',name:'Paraguay'},{iso:'PE',dial:'+51',name:'Peru'},{iso:'PH',dial:'+63',name:'Philippines'},{iso:'PL',dial:'+48',name:'Poland'},{iso:'PT',dial:'+351',name:'Portugal'},
  {iso:'QA',dial:'+974',name:'Qatar'},
  {iso:'RO',dial:'+40',name:'Romania'},{iso:'RU',dial:'+7',name:'Russia'},{iso:'RW',dial:'+250',name:'Rwanda'},
  {iso:'KN',dial:'+1869',name:'Saint Kitts and Nevis'},{iso:'LC',dial:'+1758',name:'Saint Lucia'},{iso:'VC',dial:'+1784',name:'Saint Vincent'},{iso:'WS',dial:'+685',name:'Samoa'},{iso:'SM',dial:'+378',name:'San Marino'},{iso:'ST',dial:'+239',name:'Sao Tome and Principe'},{iso:'SA',dial:'+966',name:'Saudi Arabia'},{iso:'SN',dial:'+221',name:'Senegal'},{iso:'RS',dial:'+381',name:'Serbia'},{iso:'SC',dial:'+248',name:'Seychelles'},{iso:'SL',dial:'+232',name:'Sierra Leone'},{iso:'SG',dial:'+65',name:'Singapore'},{iso:'SK',dial:'+421',name:'Slovakia'},{iso:'SI',dial:'+386',name:'Slovenia'},{iso:'SB',dial:'+677',name:'Solomon Islands'},{iso:'SO',dial:'+252',name:'Somalia'},{iso:'ZA',dial:'+27',name:'South Africa'},{iso:'KR',dial:'+82',name:'South Korea'},{iso:'SS',dial:'+211',name:'South Sudan'},{iso:'ES',dial:'+34',name:'Spain'},{iso:'LK',dial:'+94',name:'Sri Lanka'},{iso:'SD',dial:'+249',name:'Sudan'},{iso:'SR',dial:'+597',name:'Suriname'},{iso:'SE',dial:'+46',name:'Sweden'},{iso:'CH',dial:'+41',name:'Switzerland'},{iso:'SY',dial:'+963',name:'Syria'},
  {iso:'TW',dial:'+886',name:'Taiwan'},{iso:'TJ',dial:'+992',name:'Tajikistan'},{iso:'TZ',dial:'+255',name:'Tanzania'},{iso:'TH',dial:'+66',name:'Thailand'},{iso:'TL',dial:'+670',name:'Timor-Leste'},{iso:'TG',dial:'+228',name:'Togo'},{iso:'TO',dial:'+676',name:'Tonga'},{iso:'TT',dial:'+1868',name:'Trinidad and Tobago'},{iso:'TN',dial:'+216',name:'Tunisia'},{iso:'TR',dial:'+90',name:'Turkey'},{iso:'TM',dial:'+993',name:'Turkmenistan'},{iso:'TV',dial:'+688',name:'Tuvalu'},
  {iso:'UG',dial:'+256',name:'Uganda'},{iso:'UA',dial:'+380',name:'Ukraine'},{iso:'AE',dial:'+971',name:'United Arab Emirates'},{iso:'GB',dial:'+44',name:'United Kingdom'},{iso:'US',dial:'+1',name:'United States'},{iso:'UY',dial:'+598',name:'Uruguay'},{iso:'UZ',dial:'+998',name:'Uzbekistan'},
  {iso:'VU',dial:'+678',name:'Vanuatu'},{iso:'VA',dial:'+379',name:'Vatican'},{iso:'VE',dial:'+58',name:'Venezuela'},{iso:'VN',dial:'+84',name:'Vietnam'},
  {iso:'YE',dial:'+967',name:'Yemen'},
  {iso:'ZM',dial:'+260',name:'Zambia'},{iso:'ZW',dial:'+263',name:'Zimbabwe'},
];

const AUTH_COPY: Record<AuthLang, AuthCopy> = {
  ar: {
    enterEmailPw: 'أدخل البريد وكلمة المرور',
    pwMismatch: 'كلمتا المرور غير متطابقتين',
    pwShort: 'كلمة المرور قصيرة جداً (٦ أحرف على الأقل)',
    needUsername: 'اليوزرنيم مطلوب',
    userFmt: 'صيغة اليوزرنيم غير صحيحة',
    userTaken: 'اليوزرنيم مستخدم مسبقاً',
    needCompanyName: 'اسم الشركة مطلوب',
    needTradeName: 'الاسم التجاري مطلوب',
    needOwnerName: 'اسم المالك مطلوب',
    needLicense: 'رقم السجل التجاري مطلوب',
    needSector: 'القطاع مطلوب',
    needPhone: 'رقم الهاتف مطلوب',
    needName: 'الاسم مطلوب',
    joinNow: 'انضم الآن',
    welcomeBack: 'مرحباً بعودتك',
    createAccount: 'إنشاء حساب',
    login: 'تسجيل الدخول',
    companyToggle: 'حساب شركة',
    companyToggleHint: 'سجّل كشركة بدلاً من فرد',
    companyName: 'اسم الشركة',
    tradeName: 'الاسم التجاري',
    ownerName: 'اسم المالك',
    username: 'اليوزرنيم',
    checkingUser: 'جاري التحقق...',
    userAvailable: 'متاح ✓',
    userInvalid: 'غير صالح',
    license: 'رقم السجل التجاري',
    sector: 'القطاع',
    sectorHint: 'اكتب القطاع',
    phone: 'رقم الهاتف',
    phoneAlt: 'رقم هاتف آخر (اختياري)',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    confirmPassword: 'تأكيد كلمة المرور',
    confirmEmail: 'تأكيد البريد',
    name: 'الاسم',
    submitCreate: 'إنشاء الحساب',
    submitLogin: 'دخول',
    haveAccount: 'لديك حساب؟',
    noAccount: 'ليس لديك حساب؟',
    goLogin: 'سجّل الدخول',
    goRegister: 'إنشاء حساب',
  },
  en: {
    enterEmailPw: 'Enter email and password',
    pwMismatch: 'Passwords do not match',
    pwShort: 'Password is too short (min 6 characters)',
    needUsername: 'Username is required',
    userFmt: 'Invalid username format',
    userTaken: 'Username is already taken',
    needCompanyName: 'Company name is required',
    needTradeName: 'Trade name is required',
    needOwnerName: 'Owner name is required',
    needLicense: 'License number is required',
    needSector: 'Sector is required',
    needPhone: 'Phone number is required',
    needName: 'Name is required',
    joinNow: 'Join now',
    welcomeBack: 'Welcome back',
    createAccount: 'Create account',
    login: 'Log in',
    companyToggle: 'Company account',
    companyToggleHint: 'Register as a company instead of individual',
    companyName: 'Company name',
    tradeName: 'Trade name',
    ownerName: 'Owner name',
    username: 'Username',
    checkingUser: 'Checking...',
    userAvailable: 'Available ✓',
    userInvalid: 'Invalid',
    license: 'Commercial registration number',
    sector: 'Sector',
    sectorHint: 'Enter sector',
    phone: 'Phone number',
    phoneAlt: 'Alternative phone (optional)',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm password',
    confirmEmail: 'Confirm email',
    name: 'Name',
    submitCreate: 'Create account',
    submitLogin: 'Log in',
    haveAccount: 'Already have an account?',
    noAccount: "Don't have an account?",
    goLogin: 'Log in',
    goRegister: 'Sign up',
  },
};

function cacheProfileMedia(userId: string | null | undefined, kind: 'avatar' | 'cover', dataUrl: string) {
  if (!userId || !dataUrl) return;
  try { localStorage.setItem('stooorna_' + kind + '_' + String(userId), dataUrl); } catch { /* */ }
}
function readCachedProfileMedia(userId: string | null | undefined, kind: 'avatar' | 'cover'): string | null {
  if (!userId) return null;
  try { return localStorage.getItem('stooorna_' + kind + '_' + String(userId)); } catch { return null; }
}
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const max = 480;
        const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width || 1) * scale));
        const h = Math.max(1, Math.round((img.height || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(raw); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => resolve(raw);
      img.src = raw;
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  const raw = String(url).trim();
  if (!raw) return '';
  if (/^(blob:|data:)/i.test(raw)) return raw;
  if (typeof window === 'undefined') return raw;
  try {
    if (raw.startsWith('//')) return `${window.location.protocol}${raw}`;
    const u = raw.startsWith('/') ? new URL(raw, window.location.origin) : new URL(raw, window.location.origin);
    if (u.protocol === 'http:' && window.location.protocol === 'https:' && u.hostname === window.location.hostname) {
      u.protocol = 'https:';
    }
    return u.href;
  } catch {
    return raw;
  }
}

function getAuthCopy(lang: AuthLang): AuthCopy {
  return AUTH_COPY[lang] || AUTH_COPY.ar;
}

type Tab = 'account' | 'live' | 'companies';
/** حساب الدعم الوحيد — له صلاحيات شات الدعم + تحكم المستخدمين */
const SUPPORT_OWNER_EMAIL = 'stooorna@mail.com';
const SUPPORT_OWNER_USERNAME = 'stooorna';
const OWNER_EMAILS = new Set([SUPPORT_OWNER_EMAIL.toLowerCase()]);
const PRIVILEGED_USERNAMES = new Set(['stooorna']);

function isPrivilegedUser(user: { email?: string | null; username?: string | null; name?: string | null } | null | undefined) {
  const username = (user?.username ?? user?.name ?? '').replace(/^@/, '').trim().toLowerCase();
  const email = (user?.email ?? '').trim().toLowerCase();
  return OWNER_EMAILS.has(email) || PRIVILEGED_USERNAMES.has(username);
}

/**
 * حساب الدعم الرسمي فقط (@Stooorna / Stooorna@mail.com).
 * لا نستخدم حقل name لأنه قد يطابق بالخطأ مع مستخدمين عاديين.
 * اختياري: username من الـ DB (profileUsername) أدق من session أحياناً.
 */
function isSupportOwnerAccount(
  user: { email?: string | null; username?: string | null; name?: string | null } | null | undefined,
  profileUsername?: string | null,
) {
  if (!user && !profileUsername) return false;
  const email = (user?.email ?? '').trim().toLowerCase();
  const sessionUsername = (user?.username ?? '').replace(/^@/, '').trim().toLowerCase();
  const dbUsername = (profileUsername ?? '').replace(/^@/, '').trim().toLowerCase();
  const username = dbUsername || sessionUsername;
  // تطابق صارم — إيميل الدعم أو يوزر stooorna فقط
  if (email === SUPPORT_OWNER_EMAIL) return true;
  if (username === SUPPORT_OWNER_USERNAME) return true;
  return false;
}

/** مستخدم عادي مسجّل → يظهر له أيقونة الدعم فوق */

// ─── Company registration registry (pending / active / inactive) ─────────────
// Shared across AuthScreen + owner admin panel. Backend routes preferred when available.
export type CompanyRegStatus = 'pending' | 'active' | 'inactive';
export type CompanyRegistration = {
  id: string;
  companyName: string;
  tradeName: string;
  ownerName: string;
  licenseNumber: string;
  /** رقم الترخيص التجاري */
  tradeLicenseNumber?: string;
  /** شهادة السجل التجاري — base64 data URL */
  commercialRegCert?: string;
  /** اسم ملف شهادة السجل التجاري */
  commercialRegCertName?: string;
  /** شهادة الترخيص التجاري — base64 data URL */
  tradeLicenseCert?: string;
  /** اسم ملف شهادة الترخيص التجاري */
  tradeLicenseCertName?: string;
  sector?: string;
  sectorCustom?: string;
  phone: string;
  phoneAlt?: string;
  email: string;
  /** username فريد للحساب */
  username?: string;
  /** stored only to allow post-approval first login when account was not created yet */
  password?: string;
  status: CompanyRegStatus;
  createdAt: string;
  updatedAt: string;
  userId?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
};

const COMPANIES_REGISTRY_KEY = 'stooorna_companies_registry';
const COMPANY_NOTICES_KEY = 'stooorna_company_notices';
const COMPANY_ACTIVATIONS_KEY = 'stooorna_company_activations';
const DELETED_USERS_KEY = 'stooorna_deleted_users';

/** نوع جلسة الحساب — يمنع تحوّل الفرد لشركة بالخطأ */
export function setSessionAccountKind(kind: 'personal' | 'company', userId?: string | null) {
  try {
    localStorage.setItem('stooorna_session_account_kind', kind);
    if (userId) localStorage.setItem('stooorna_session_user_id', String(userId));
    window.dispatchEvent(new CustomEvent('stooorna:session-account-kind', { detail: { kind, userId } }));
  } catch { /* */ }
}
export function getSessionAccountKind(): 'personal' | 'company' | null {
  try {
    const k = localStorage.getItem('stooorna_session_account_kind');
    return k === 'company' || k === 'personal' ? k : null;
  } catch { return null; }
}

const FREED_USERNAMES_KEY = 'stooorna_freed_usernames';

const COMPANY_USERNAME_FEATURE_KEY = 'stooorna_company_username_feature';

/** هل فعّل الأونر ميزة يوزرنيم للشركات؟ */
export function isCompanyUsernameFeatureEnabled(): boolean {
  try {
    const raw = localStorage.getItem(COMPANY_USERNAME_FEATURE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw);
    return o === true || o?.enabled === true;
  } catch {
    return false;
  }
}

export function setCompanyUsernameFeatureEnabled(enabled: boolean) {
  try {
    localStorage.setItem(COMPANY_USERNAME_FEATURE_KEY, JSON.stringify({ enabled: !!enabled, at: new Date().toISOString() }));
    window.dispatchEvent(new CustomEvent('stooorna:company-username-feature', { detail: { enabled: !!enabled } }));
  } catch { /* ignore */ }
}

// ── Business registration (regular users upgrade to Business after owner approval) ──
export type BusinessRegStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type BusinessRegistration = {
  id: string;
  userId: string;
  username?: string | null;
  email?: string | null;
  projectName: string;
  licenseNumber: string;
  tradeLicenseNumber: string;
  commercialRegCert?: string;
  commercialRegCertName?: string;
  tradeLicenseCert?: string;
  tradeLicenseCertName?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  /** Owner note shown once in user settings after reject (or optional on approve) */
  ownerNote?: string | null;
  /** True after user dismissed the owner note */
  ownerNoteSeen?: boolean;
  /** True when @Stooorna granted Business directly from Owner settings (no application) */
  grantedByOwner?: boolean;
};

const BUSINESS_REGISTRY_KEY = 'stooorna_business_registry';

export function loadBusinessRegistry(): BusinessRegistration[] {
  try {
    const raw = localStorage.getItem(BUSINESS_REGISTRY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const BUSINESS_DIRECTORY_KEY = 'stooorna_business_directory';

export type PublicBusinessAccount = {
  userId: string;
  username?: string | null;
  email?: string | null;
  projectName?: string | null;
};

export function syncBusinessPublicDirectory(list?: BusinessRegistration[]) {
  try {
    const src = list || loadBusinessRegistry();
    const approved: PublicBusinessAccount[] = src
      .filter(x => x.status === 'approved')
      .map(x => ({
        userId: String(x.userId),
        username: x.username ? String(x.username).replace(/^@/, '').trim().toLowerCase() : null,
        email: x.email ? String(x.email).trim().toLowerCase() : null,
        projectName: x.projectName || null,
      }));
    localStorage.setItem(BUSINESS_DIRECTORY_KEY, JSON.stringify(approved));
    window.dispatchEvent(new CustomEvent('stooorna:business-directory', { detail: approved }));
  } catch { /* ignore */ }
}

export function loadBusinessPublicDirectory(): PublicBusinessAccount[] {
  try {
    const raw = localStorage.getItem(BUSINESS_DIRECTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** True when this identity is an approved Business account — used app-wide next to @username */
export function isPublicBusinessAccount(u?: {
  id?: string | null;
  userId?: string | null;
  username?: string | null;
  email?: string | null;
} | null): boolean {
  if (!u) return false;
  const id = String(u.id || u.userId || '').trim();
  const un = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  const em = String(u.email || '').trim().toLowerCase();
  if (id && isBusinessApproved(id)) return true;
  const dir = loadBusinessPublicDirectory();
  if (dir.some(x =>
    (id && x.userId === id) ||
    (un && x.username === un) ||
    (em && x.email === em)
  )) return true;
  try {
    const list = loadBusinessRegistry();
    return list.some(x =>
      x.status === 'approved' && (
        (id && String(x.userId) === id) ||
        (un && String(x.username || '').replace(/^@/, '').trim().toLowerCase() === un) ||
        (em && String(x.email || '').trim().toLowerCase() === em)
      )
    );
  } catch {
    return false;
  }
}

/** Small yellow Business head shown beside @username for every viewer */
export function BusinessHeadBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      title="Business"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: compact ? '0.52rem' : '0.58rem',
        fontWeight: 900,
        color: '#0a0a0a',
        background: '#eab308',
        borderRadius: 5,
        padding: compact ? '1px 5px' : '2px 7px',
        letterSpacing: '0.04em',
        lineHeight: 1.2,
        boxShadow: '0 0 8px rgba(234,179,8,0.45)',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >
      Business
    </span>
  );
}

export function saveBusinessRegistry(list: BusinessRegistration[]) {
  try {
    localStorage.setItem(BUSINESS_REGISTRY_KEY, JSON.stringify(list.slice(0, 2000)));
    syncBusinessPublicDirectory(list);
    window.dispatchEvent(new CustomEvent('stooorna:business-registry', { detail: list }));
  } catch { /* ignore */ }
}

export function getBusinessForUser(userId?: string | null): BusinessRegistration | null {
  if (!userId) return null;
  const uid = String(userId);
  const list = loadBusinessRegistry();
  const matches = list.filter(x => String(x.userId) === uid);
  if (!matches.length) return null;
  const approved = matches.find(x => x.status === 'approved');
  if (approved) return approved;
  const pending = matches.find(x => x.status === 'pending');
  if (pending) return pending;
  return matches.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
}

export function isBusinessApproved(userId?: string | null): boolean {
  const row = getBusinessForUser(userId);
  return !!(row && row.status === 'approved');
}

export function upsertBusinessRegistration(row: BusinessRegistration) {
  const list = loadBusinessRegistry().filter(x => !(String(x.userId) === String(row.userId) && x.status === 'pending'));
  const withoutSameId = list.filter(x => x.id !== row.id);
  withoutSameId.unshift(row);
  saveBusinessRegistry(withoutSameId);
  return row;
}

export function reviewBusinessRegistration(
  id: string,
  action: 'approve' | 'reject',
  ownerNote?: string | null,
) {
  const list = loadBusinessRegistry();
  const note = (ownerNote || '').trim() || null;
  const next = list.map(x => {
    if (x.id !== id) return x;
    return {
      ...x,
      status: (action === 'approve' ? 'approved' : 'rejected') as 'approved' | 'rejected',
      updatedAt: new Date().toISOString(),
      approvedAt: action === 'approve' ? new Date().toISOString() : x.approvedAt ?? null,
      ownerNote: note,
      ownerNoteSeen: false,
    };
  });
  saveBusinessRegistry(next);
  if (action === 'approve') {
    const approvedRow = list.find(x => x.id === id);
    try {
      window.dispatchEvent(new CustomEvent('stooorna:business-posts-visibility', {
        detail: { userId: approvedRow ? String(approvedRow.userId) : null, hidden: false },
      }));
    } catch { /* ignore */ }
  }
  return next;
}

export function dismissBusinessOwnerNote(userId?: string | null) {
  if (!userId) return loadBusinessRegistry();
  const uid = String(userId);
  const list = loadBusinessRegistry();
  const next = list.map(x => {
    if (String(x.userId) !== uid) return x;
    if (!x.ownerNote || x.ownerNoteSeen) return x;
    return { ...x, ownerNoteSeen: true };
  });
  saveBusinessRegistry(next);
  return next;
}

// ── Business posts visibility (owner unsubscribed) ──
// When the owner cancels their Business subscription we flip their approved
// row to 'cancelled' (instead of deleting it), so every place that already
// checks `status === 'approved'` (isBusinessApproved / isPublicBusinessAccount
// / syncBusinessPublicDirectory) automatically treats the account as a
// regular user again, and so a later re-approval can flip it back and
// restore whatever the owner did not permanently delete in the meantime.
export function cancelBusinessSubscription(userId?: string | null): BusinessRegistration[] {
  if (!userId) return loadBusinessRegistry();
  const uid = String(userId);
  const list = loadBusinessRegistry();
  const next = list.map(x => {
    if (String(x.userId) !== uid || x.status !== 'approved') return x;
    return { ...x, status: 'cancelled' as const, updatedAt: new Date().toISOString() };
  });
  saveBusinessRegistry(next);
  try {
    window.dispatchEvent(new CustomEvent('stooorna:business-posts-visibility', { detail: { userId: uid, hidden: true } }));
  } catch { /* ignore */ }
  return next;
}

/** True while this user's Business account is cancelled — their posts stay
 * hidden from everyone but themselves until they resubscribe (re-approval). */
export function isBusinessPostsHidden(userId?: string | null): boolean {
  if (!userId) return false;
  const row = getBusinessForUser(userId);
  return !!(row && row.status === 'cancelled');
}

/** Owner action: permanently deletes a cancelled Business application/account.
 * Only removes the business registration row for this user — the user's
 * regular account, posts, and profile are untouched. Only ever applied to
 * rows already in 'cancelled' status, as a safety guard. */
export function deleteBusinessAccount(id: string): BusinessRegistration[] {
  const list = loadBusinessRegistry();
  const row = list.find(x => x.id === id);
  if (!row || row.status !== 'cancelled') return list;
  const next = list.filter(x => x.id !== id);
  saveBusinessRegistry(next);
  return next;
}

export type DeletedUserRecord = {
  id: string;
  email?: string | null;
  username?: string | null;
  deletedAt: string;
};

// ── Permanent-wipe / restore tombstones ─────────────────────────────────────
// wiped: حسابات حُذفت نهائياً — لا تُعاد أبداً لقائمة Banned/Deleted حتى لو بقي صفّها على السيرفر.
//        المطابقة بالـ id (أو باسم deleted_* الفريد) فقط، حتى لا يُحجب مستخدم جديد يسجّل بنفس الإيميل/اليوزر.
// restored: حسابات استُعيدت — لا تُعامل كمحذوفة حتى لو ظل اسمها deleted_* على السيرفر لحظياً.
const WIPED_USERS_KEY = 'stooorna_wiped_users_v1';
const RESTORED_USERS_KEY = 'stooorna_restored_users_v1';
type WipeTombstone = { id?: string | null; username?: string | null; at: string };

function readJsonList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function loadWipedUsers(): WipeTombstone[] {
  return readJsonList<WipeTombstone>(WIPED_USERS_KEY);
}

export function isUserWiped(u: { id?: string | null; username?: string | null } | null | undefined): boolean {
  if (!u) return false;
  const id = String(u.id || '').trim();
  const un = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  const list = loadWipedUsers();
  return list.some(x =>
    (id && x.id && String(x.id) === id) ||
    (un.startsWith('deleted_') && x.username && String(x.username).toLowerCase() === un),
  );
}

export function markUserWiped(u: { id?: string | null; username?: string | null }) {
  const id = String(u.id || '').trim();
  const un = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  if (!id && !un.startsWith('deleted_')) return;
  const list = loadWipedUsers();
  if (!list.some(x => (id && x.id === id) || (un && x.username === un))) {
    list.unshift({ id: id || null, username: un.startsWith('deleted_') ? un : null, at: new Date().toISOString() });
    try { localStorage.setItem(WIPED_USERS_KEY, JSON.stringify(list.slice(0, 5000))); } catch { /* */ }
  }
}

export function isUserRestored(u: { id?: string | null; email?: string | null } | null | undefined): boolean {
  if (!u) return false;
  const id = String(u.id || '').trim();
  if (!id) return false;
  return readJsonList<string>(RESTORED_USERS_KEY).includes(id);
}

export function markUserRestored(u: { id?: string | null }) {
  const id = String(u.id || '').trim();
  if (!id) return;
  const list = readJsonList<string>(RESTORED_USERS_KEY);
  if (!list.includes(id)) {
    list.push(id);
    try { localStorage.setItem(RESTORED_USERS_KEY, JSON.stringify(list.slice(-2000))); } catch { /* */ }
  }
}

function unmarkUserRestored(u: { id?: string | null }) {
  const id = String(u.id || '').trim();
  if (!id) return;
  const list = readJsonList<string>(RESTORED_USERS_KEY);
  if (list.includes(id)) {
    try { localStorage.setItem(RESTORED_USERS_KEY, JSON.stringify(list.filter(x => x !== id))); } catch { /* */ }
  }
}

export function loadDeletedUsers(): DeletedUserRecord[] {
  try {
    const raw = localStorage.getItem(DELETED_USERS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    // الحسابات المحذوفة نهائياً لا تظهر أبداً في قسم Banned/Deleted
    return list.filter((x: DeletedUserRecord) => !isUserWiped(x));
  } catch {
    return [];
  }
}

export function saveDeletedUsers(list: DeletedUserRecord[]) {
  try {
    localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('stooorna:users-deleted', { detail: list }));
  } catch { /* ignore */ }
}

/** إعادة تعيين كل الحسابات المحذوفة — تسمح بإعادة استخدام اليوزر/الإيميل */
export function clearAllDeletedUsers() {
  try {
    localStorage.removeItem(DELETED_USERS_KEY);
    window.dispatchEvent(new CustomEvent('stooorna:users-deleted', { detail: [] }));
  } catch { /* ignore */ }
}

/** إعادة تعيين اليوزرات المحذوفة — تسمح بإعادة إنشاء نفس اليوزر (فرد/شركة) */
export function ensureDeletedUsersResetOnce() {
  // Soft-deleted users must stay in recovery list — do not clear on boot.
  try {
    if (localStorage.getItem('stooorna_deleted_users_keep_v4') === '1') return;
    localStorage.setItem('stooorna_deleted_users_keep_v4', '1');
  } catch { /* ignore */ }
}

export function markUserDeleted(u: { id?: string | null; email?: string | null; username?: string | null }) {
  const id = String(u.id || '').trim();
  const email = String(u.email || '').trim().toLowerCase();
  const username = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  if (!id && !email && !username) return loadDeletedUsers();
  if (isUserWiped({ id, username })) return loadDeletedUsers();
  unmarkUserRestored({ id });
  const list = loadDeletedUsers();
  const exists = list.some(x =>
    (id && x.id === id) ||
    (email && String(x.email || '').toLowerCase() === email) ||
    (username && String(x.username || '').replace(/^@/, '').toLowerCase() === username),
  );
  if (!exists) {
    list.unshift({
      id: id || `del-${Date.now()}`,
      email: email || null,
      username: username || null,
      deletedAt: new Date().toISOString(),
    });
    saveDeletedUsers(list.slice(0, 2000));
  }
  return list;
}

export function isUserDeleted(u: { id?: string | null; email?: string | null; username?: string | null } | null | undefined): boolean {
  if (!u) return false;
  if (isUserRestored(u)) return false;
  const username = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  if (isUserWiped({ id: u.id, username })) return true;
  if (username.startsWith('deleted_')) return true;
  const id = String(u.id || '').trim();
  const email = String(u.email || '').trim().toLowerCase();
  const list = loadDeletedUsers();
  return list.some(x =>
    (id && x.id === id) ||
    (email && String(x.email || '').toLowerCase() === email) ||
    (username && String(x.username || '').replace(/^@/, '').toLowerCase() === username),
  );
}

/** Soft-delete only — keeps row in recovery list (not permanent). */
export function softDeleteUser(u: { id?: string | null; email?: string | null; username?: string | null; name?: string | null }) {
  return markUserDeleted(u);
}

/** Restore a soft-deleted user so they reappear in User Control / app. */
export function restoreDeletedUser(u: {
  id?: string | null;
  email?: string | null;
  username?: string | null;
  originalUsername?: string | null;
}) {
  const id = String(u.id || '').trim();
  const email = String(u.email || '').trim().toLowerCase();
  const username = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  const originalUsername = String(u.originalUsername || '').replace(/^@/, '').trim().toLowerCase();
  const next = loadDeletedUsers().filter(x => {
    const xid = String(x.id || '').trim();
    const xem = String(x.email || '').toLowerCase();
    const xun = String(x.username || '').replace(/^@/, '').toLowerCase();
    const xorig = String(x.originalUsername || '').replace(/^@/, '').toLowerCase();
    if (id && xid && id === xid) return false;
    if (email && xem && email === xem) return false;
    if (username && (xun === username || xorig === username)) return false;
    if (originalUsername && (xorig === originalUsername || xun === originalUsername)) return false;
    return true;
  });
  saveDeletedUsers(next);
  try {
    window.dispatchEvent(new CustomEvent('stooorna:users-deleted', { detail: next }));
  } catch { /* */ }
  return next;
}

/** Server hard-delete attempts. Returns true only on a real success (2xx/204).
 *  404/405 = route does not exist → keep trying the next endpoint (the old code stopped at the first 404). */
export async function purgeUserOnServer(u: {
  id?: string | null;
  email?: string | null;
  username?: string | null;
  originalUsername?: string | null;
}): Promise<boolean> {
  const id = String(u.id || '').trim();
  const email = String(u.email || '').trim().toLowerCase();
  const username = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  const originalUsername = String(u.originalUsername || '').replace(/^@/, '').trim().toLowerCase();
  const body = { hard: true, permanent: true, permanentlyDelete: true, purge: true, email, username, originalUsername, id };
  const urls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  if (id) {
    urls.push(
      { url: `/api/owner/users/${encodeURIComponent(id)}/purge`, method: 'POST', body },
      { url: `/api/owner/permanent-wipe`, method: 'POST', body },
      { url: `/api/owner/users/${encodeURIComponent(id)}?hard=1`, method: 'DELETE', body },
      { url: `/api/owner/users/${encodeURIComponent(id)}?permanent=1`, method: 'DELETE', body },
      { url: `/api/owner/users/${encodeURIComponent(id)}`, method: 'DELETE', body },
      { url: `/api/support/users/${encodeURIComponent(id)}`, method: 'DELETE', body },
      { url: `/api/users/${encodeURIComponent(id)}`, method: 'DELETE', body },
    );
  }
  if (email) {
    urls.push(
      { url: `/api/owner/users/by-email/purge`, method: 'POST', body },
      { url: `/api/owner/users/by-email/${encodeURIComponent(email)}`, method: 'DELETE', body },
      { url: `/api/users/delete`, method: 'POST', body },
    );
  }
  const un = originalUsername || username.replace(/^deleted_/, '');
  if (un) {
    urls.push(
      { url: `/api/users/release-username`, method: 'POST', body: { ...body, username: un } },
      { url: `/api/owner/username/${encodeURIComponent(un)}`, method: 'DELETE', body },
    );
  }
  for (const ep of urls) {
    try {
      const r = await fetch(ep.url, {
        method: ep.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ep.body || body),
      });
      if (r.ok || r.status === 204) return true;
    } catch { /* next */ }
  }
  return false;
}

/** Permanent wipe: the account disappears for good (with all its local data) and never returns to
 *  Banned/Deleted. Also frees username, tries real server hard-delete so the email can be reused. */
export async function permanentlyWipeUser(u: {
  id?: string | null;
  email?: string | null;
  username?: string | null;
  originalUsername?: string | null;
}): Promise<boolean> {
  const id = String(u.id || '').trim();
  const email = String(u.email || '').trim().toLowerCase();
  const username = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  const originalUsername = String(u.originalUsername || '').replace(/^@/, '').trim().toLowerCase();
  // 1) tombstone FIRST — so no background sync can re-add the account while we work
  markUserWiped({ id, username });
  // Free usernames for reuse
  for (const uName of [username, originalUsername, username.replace(/^deleted_/, ''), originalUsername.replace(/^deleted_/, '')]) {
    if (uName && !uName.startsWith('deleted_')) markUsernameFreed(uName);
  }
  // 2) remove from local recovery list (UI updates immediately)
  restoreDeletedUser(u);
  if (email) {
    const still = loadDeletedUsers().filter(x => String(x.email || '').toLowerCase() !== email);
    saveDeletedUsers(still);
  }
  // 3) drop every local trace: company registry, business registry, VIP, balance
  try {
    const reg = loadCompaniesRegistry().filter(c => {
      const cem = String(c.email || '').toLowerCase();
      const cun = String(c.username || '').replace(/^@/, '').toLowerCase();
      const cid = String(c.id || '');
      const cuid = String(c.userId || '');
      if (email && cem === email) return false;
      if (username && cun === username) return false;
      if (originalUsername && cun === originalUsername) return false;
      if (id && (cid === id || cuid === id)) return false;
      return true;
    });
    saveCompaniesRegistry(reg);
  } catch { /* */ }
  try {
    if (id) {
      const biz = loadBusinessRegistry().filter(b => String((b as { userId?: string }).userId || '') !== id && String(b.id || '') !== id);
      saveBusinessRegistry(biz);
    }
  } catch { /* */ }
  try {
    if (id) {
      for (const k of ['stooorna_vip_plan', 'stooorna_vip_color', 'stooorna_vip_feats']) {
        const o = JSON.parse(localStorage.getItem(k) || '{}');
        if (o && typeof o === 'object' && id in o) { delete o[id]; localStorage.setItem(k, JSON.stringify(o)); }
      }
      localStorage.removeItem(`stooorna_biz_balance_${id}`);
    }
  } catch { /* */ }
  // 4) real server hard delete (frees the email for a fresh signup)
  return purgeUserOnServer(u);
}


export function loadFreedUsernames(): string[] {
  try {
    const raw = localStorage.getItem(FREED_USERNAMES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map((x: string) => String(x).replace(/^@/, '').toLowerCase()) : [];
  } catch { return []; }
}

export function markUsernameFreed(username?: string | null) {
  const u = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!u) return;
  const list = loadFreedUsernames();
  if (!list.includes(u)) {
    list.push(u);
    try { localStorage.setItem(FREED_USERNAMES_KEY, JSON.stringify(list)); } catch { /* */ }
  }
}

export function isUsernameFreed(username?: string | null): boolean {
  const u = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!u) return false;
  if (loadFreedUsernames().includes(u)) return true;
  return loadDeletedUsers().some(x => String(x.username || '').replace(/^@/, '').toLowerCase() === u);
}

/** طبّق قرارات التفعيل المحلية (Approve) فوق أي نسخة قديمة من السجل */
function applyRememberedActivations(list: CompanyRegistration[]): CompanyRegistration[] {
  let acts: Record<string, { status: CompanyRegStatus; at: string; email: string }> = {};
  try {
    const raw = localStorage.getItem(COMPANY_ACTIVATIONS_KEY);
    const o = raw ? JSON.parse(raw) : {};
    acts = o && typeof o === 'object' ? o : {};
  } catch { acts = {}; }
  return list.map(c => {
    const em = String(c.email || '').trim().toLowerCase();
    const remembered = em ? acts[em]?.status : null;
    if (!remembered) return c;
    // قرار الأونر المحلي (active/inactive) يثبت ولا يرجع pending من السيرفر
    if (remembered === 'active' || remembered === 'inactive') {
      return {
        ...c,
        status: remembered,
        approvedAt: remembered === 'active' ? (c.approvedAt || acts[em]?.at || new Date().toISOString()) : c.approvedAt,
        updatedAt: c.updatedAt || acts[em]?.at || new Date().toISOString(),
      };
    }
    return c;
  });
}

export function loadCompaniesRegistry(): CompanyRegistration[] {
  try {
    const raw = localStorage.getItem(COMPANIES_REGISTRY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? list as CompanyRegistration[] : [];
    // لا تظهر الشركات/المستخدمون المحذوفون في السجل أو الدليل العام
    const alive = arr.filter(c => {
      if (isUserDeleted({ id: c.userId || c.id, email: c.email, username: c.username })) return false;
      const un = String(c.username || '').replace(/^@/, '').toLowerCase();
      if (un.startsWith('deleted_')) return false;
      return true;
    });
    return applyRememberedActivations(alive);
  } catch {
    return [];
  }
}

/** Drop heavy base64 cert payloads for list UIs — keeps settings responsive. */
export function stripCompanyCerts(c: CompanyRegistration): CompanyRegistration {
  return {
    ...c,
    commercialRegCert: undefined,
    tradeLicenseCert: undefined,
    commercialRegCertName: c.commercialRegCertName || (c.commercialRegCert ? 'attached' : undefined),
    tradeLicenseCertName: c.tradeLicenseCertName || (c.tradeLicenseCert ? 'attached' : undefined),
  };
}

/** Registry for list/admin panels without multi-MB base64 fields. */
let _lightRegCache: { at: number; list: CompanyRegistration[] } | null = null;
export function loadCompaniesRegistryLight(): CompanyRegistration[] {
  const now = Date.now();
  if (_lightRegCache && now - _lightRegCache.at < 2000) return _lightRegCache.list;
  const list = loadCompaniesRegistry().map(stripCompanyCerts);
  _lightRegCache = { at: now, list };
  return list;
}
export function invalidateCompaniesRegistryLightCache() {
  _lightRegCache = null;
}

/** Full row (with certificates) for owner detail view only. */
export function loadCompanyRegistrationFull(idOrEmail: string): CompanyRegistration | null {
  const key = String(idOrEmail || '').trim().toLowerCase();
  if (!key) return null;
  const list = loadCompaniesRegistry();
  return (
    list.find(c => {
      const cem = String(c.email || '').toLowerCase();
      const cid = String(c.id || '').toLowerCase();
      const cuid = String(c.userId || '').toLowerCase();
      return (
        cid === key ||
        cem === key ||
        (cuid && cuid === key) ||
        String(c.id) === idOrEmail ||
        String(c.userId || '') === idOrEmail
      );
    }) || null
  );
}

export function saveCompaniesRegistry(list: CompanyRegistration[]) {
  try {
    // ثبّت التفعيل قبل الحفظ حتى لا يُكتب pending فوق active
    const fixed = applyRememberedActivations(list).filter(c => {
      if (isUserDeleted({ id: c.userId || c.id, email: c.email, username: c.username })) return false;
      const un = String(c.username || '').replace(/^@/, '').toLowerCase();
      if (un.startsWith('deleted_')) return false;
      return true;
    });
    localStorage.setItem(COMPANIES_REGISTRY_KEY, JSON.stringify(fixed));
    try { invalidateCompaniesRegistryLightCache(); } catch { /* */ }
    // keep public directory in sync (active only) for add-friend Company tab
    const active = fixed.filter(c => c.status === 'active').map(c => ({
      id: c.userId || c.id,
      companyName: c.companyName,
      name: c.companyName,
      tradeName: c.tradeName,
      ownerName: c.ownerName,
      email: c.email,
      username: c.username || null,
      accountType: 'company',
      isCompany: true,
      status: 'active',
    }));
    localStorage.setItem('stooorna_companies_directory', JSON.stringify(active));
    window.dispatchEvent(new CustomEvent('stooorna:companies-registry', { detail: fixed.map(stripCompanyCerts) }));
  } catch { /* ignore */ }
}

export function upsertCompanyRegistration(entry: CompanyRegistration) {
  // لا نستخدم loadCompaniesRegistry هنا حتى لا نخلط الذاكرة أثناء الدمج
  let list: CompanyRegistration[] = [];
  try {
    const raw = localStorage.getItem(COMPANIES_REGISTRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    list = Array.isArray(parsed) ? parsed : [];
  } catch { list = []; }
  const em = String(entry.email || '').toLowerCase();
  const un = String(entry.username || '').replace(/^@/, '').toLowerCase();
  const idx = list.findIndex(c => {
    if (entry.id && c.id === entry.id) return true;
    if (entry.userId && c.userId && String(c.userId) === String(entry.userId)) return true;
    const cem = String(c.email || '').toLowerCase();
    const cun = String(c.username || '').replace(/^@/, '').toLowerCase();
    if (em && cem === em) return true;
    if (un && cun && un === cun) return true;
    return false;
  });
  if (idx >= 0) {
    const prev = list[idx];
    // لا تخفض حالة active/inactive إلى pending عند دمج بيانات السيرفر
    let status = entry.status ?? prev.status;
    const remembered = em ? getRememberedCompanyStatus(em) : null;
    if (remembered === 'active' || remembered === 'inactive') status = remembered;
    else if ((prev.status === 'active' || prev.status === 'inactive') && status === 'pending') status = prev.status;
    list[idx] = {
      ...prev,
      ...entry,
      status,
      email: em || prev.email,
      username: entry.username || prev.username,
      password: entry.password || prev.password,
      approvedAt: status === 'active' ? (entry.approvedAt || prev.approvedAt || new Date().toISOString()) : (entry.approvedAt ?? prev.approvedAt),
      approvedBy: entry.approvedBy || prev.approvedBy,
      userId: entry.userId || prev.userId,
      id: prev.id || entry.id,
    };
  } else {
    list.unshift(entry);
  }
  saveCompaniesRegistry(list);
  return applyRememberedActivations(list);
}

export function setCompanyRegStatus(idOrEmail: string, status: CompanyRegStatus, meta?: { approvedBy?: string }) {
  let list: CompanyRegistration[] = [];
  try {
    const raw = localStorage.getItem(COMPANIES_REGISTRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    list = Array.isArray(parsed) ? parsed : [];
  } catch { list = []; }
  const key = String(idOrEmail || '').trim().toLowerCase();
  let matchedEmail = '';
  const next = list.map(c => {
    const cem = String(c.email || '').toLowerCase();
    const cid = String(c.id || '').toLowerCase();
    const cuid = String(c.userId || '').toLowerCase();
    const cun = String(c.username || '').replace(/^@/, '').toLowerCase();
    const hit =
      cid === key ||
      cem === key ||
      (cuid && cuid === key) ||
      (cun && cun === key) ||
      String(c.id) === idOrEmail ||
      String(c.userId || '') === idOrEmail;
    if (!hit) return c;
    matchedEmail = cem || matchedEmail;
    return {
      ...c,
      status,
      updatedAt: new Date().toISOString(),
      approvedAt: status === 'active' ? new Date().toISOString() : c.approvedAt,
      approvedBy: status === 'active' ? (meta?.approvedBy || c.approvedBy) : c.approvedBy,
    };
  });
  // إن لم يُعثر على صف، لا نُسقط القرار — نخزّن التفعيل بالإيميل إن وُجد لاحقاً
  if (matchedEmail) {
    rememberCompanyActivation(matchedEmail, status);
  } else if (key.includes('@')) {
    rememberCompanyActivation(key, status);
  }
  // ثبّت كل التفعيلات المعروفة على القائمة
  const fixed = applyRememberedActivations(next);
  saveCompaniesRegistry(fixed);
  // notice for the company email when approved
  if (status === 'active') {
    try {
      const target = fixed.find(c => {
        const cem = String(c.email || '').toLowerCase();
        return cem === matchedEmail || cem === key || String(c.id) === idOrEmail;
      });
      if (target?.email) {
        const notices = JSON.parse(localStorage.getItem(COMPANY_NOTICES_KEY) || '{}') as Record<string, string[]>;
        const arr = notices[target.email.toLowerCase()] || [];
        arr.push('يمكنكم تسجيل الدخول الآن — تمت الموافقة على حساب شركتكم');
        notices[target.email.toLowerCase()] = arr.slice(-10);
        localStorage.setItem(COMPANY_NOTICES_KEY, JSON.stringify(notices));
        window.dispatchEvent(new CustomEvent('stooorna:company-notice', {
          detail: { email: target.email, message: arr[arr.length - 1] },
        }));
      }
    } catch { /* ignore */ }
  }
  return fixed;
}

export function getCompanyNotice(email: string): string | null {
  try {
    const notices = JSON.parse(localStorage.getItem(COMPANY_NOTICES_KEY) || '{}') as Record<string, string[]>;
    const arr = notices[email.toLowerCase()] || [];
    return arr.length ? arr[arr.length - 1] : null;
  } catch {
    return null;
  }
}

export function findCompanyByEmail(email: string): CompanyRegistration | null {
  const em = email.trim().toLowerCase();
  if (!em) return null;
  const hit = loadCompaniesRegistry().find(c => String(c.email || '').toLowerCase() === em);
  if (hit) return hit;
  // Fallback: raw registry (includes soft-deleted) so approved companies can still log in
  try {
    const raw = localStorage.getItem(COMPANIES_REGISTRY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? (list as CompanyRegistration[]) : [];
    const found = arr.find(c => String(c.email || '').toLowerCase() === em) || null;
    if (found) {
      const remembered = getRememberedCompanyStatus(em);
      if (remembered === 'active' || found.status === 'active') {
        try { restoreDeletedUser({ id: found.userId || found.id, email: em, username: found.username }); } catch { /* */ }
        return { ...found, status: remembered === 'active' ? 'active' : found.status };
      }
      return found;
    }
  } catch { /* */ }
  return null;
}

export function loadCompanyActivations(): Record<string, { status: CompanyRegStatus; at: string; email: string }> {
  try {
    const raw = localStorage.getItem(COMPANY_ACTIVATIONS_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

export function rememberCompanyActivation(email: string, status: CompanyRegStatus) {
  const em = email.trim().toLowerCase();
  if (!em) return;
  try {
    const all = loadCompanyActivations();
    all[em] = { status, at: new Date().toISOString(), email: em };
    localStorage.setItem(COMPANY_ACTIVATIONS_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('stooorna:company-activated', { detail: all[em] }));
  } catch { /* */ }
}

export function getRememberedCompanyStatus(email: string): CompanyRegStatus | null {
  const em = email.trim().toLowerCase();
  const rec = loadCompanyActivations()[em];
  return rec?.status || null;
}

/** مزامنة الحالة مع السيرفر بعد Approve حتى يستطيع الحساب الدخول */
export async function pushCompanyStatusToServer(co: CompanyRegistration, status: CompanyRegStatus) {
  const payload = {
    id: co.id,
    email: co.email,
    username: co.username,
    companyName: co.companyName,
    tradeName: co.tradeName,
    ownerName: co.ownerName,
    licenseNumber: co.licenseNumber,
    phone: co.phone,
    password: co.password,
    status,
    accountType: 'company',
    isCompany: true,
    approved: status === 'active',
    active: status === 'active',
  };
  const endpoints: Array<{ url: string; method: string }> = [
    { url: `/api/company/${encodeURIComponent(co.id)}/status`, method: 'PATCH' },
    { url: `/api/companies/${encodeURIComponent(co.id)}/status`, method: 'PATCH' },
    { url: `/api/owner/companies/${encodeURIComponent(co.id)}/status`, method: 'PATCH' },
    { url: `/api/owner/company-requests/${encodeURIComponent(co.id)}`, method: 'PATCH' },
    { url: '/api/owner/companies/activate', method: 'POST' },
    { url: '/api/company/activate', method: 'POST' },
    { url: '/api/companies/activate', method: 'POST' },
    { url: '/api/company/status', method: 'POST' },
    { url: '/api/auth/company-activate', method: 'POST' },
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep.url, {
        method: ep.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok || r.status === 201 || r.status === 204) return true;
    } catch { /* next */ }
  }
  return false;
}


/** رقم جوال → بريد اصطناعي لـ better-auth (تسجيل/دخول بالموبايل) */
export function phoneDigitsOnly(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}
export function isPhoneIdentifier(raw: string): boolean {
  const t = String(raw || '').trim();
  if (!t || t.includes('@')) return false;
  const d = phoneDigitsOnly(t);
  return d.length >= 8 && d.length <= 15;
}
export function phoneToAuthEmail(raw: string): string {
  const d = phoneDigitsOnly(raw);
  return `${d}@phone.stooorna.local`;
}
/** يحفظ ربط رقم الجوال بالحساب محلياً (للاسترجاع عند الدخول) */
export function rememberPhoneAuth(phone: string, email: string) {
  try {
    const d = phoneDigitsOnly(phone);
    if (!d) return;
    localStorage.setItem(`stooorna_phone_auth_${d}`, email.toLowerCase());
    localStorage.setItem(`stooorna_email_phone_${email.toLowerCase()}`, d);
  } catch { /* */ }
}
export function resolveAuthEmailFromIdentifier(raw: string): string | null {
  const t = String(raw || '').trim().replace(/^@/, '');
  if (!t) return null;
  // Email only — mobile login/signup disabled
  if (t.includes('@') && !isPhoneIdentifier(t)) return t.toLowerCase();
  return null;
}

/** يقبل الإيميل فقط — لا تحويل من يوزرنيم */
/** After Approve: create the auth user so the company can sign in immediately. */
export async function provisionCompanyAuthAccount(co: CompanyRegistration): Promise<boolean> {
  const email = String(co.email || '').trim().toLowerCase();
  const password = String(co.password || '').trim();
  if (!email || !password) return false;
  const displayName = co.companyName || co.ownerName || email;
  const username = String(co.username || '').replace(/^@/, '').trim() || undefined;
  try {
    // Prefer dedicated server activate endpoints (may create the user)
    await pushCompanyStatusToServer({ ...co, status: 'active' }, 'active');
  } catch { /* continue */ }
  try {
    const up = await signUp.email({
      name: displayName,
      email,
      password,
      ...(username ? ({ username } as any) : {}),
    } as any);
    if (!(up as { error?: unknown })?.error) return true;
  } catch { /* may already exist */ }
  // If already exists, sign-in probe with stored password (session not kept for owner)
  try {
    const r = await signIn.email({ email, password });
    if (!(r as { error?: unknown })?.error) {
      try { await signOut(); } catch { /* */ }
      return true;
    }
  } catch { /* */ }
  return false;
}


export async function resolveLoginEmailFromUsername(raw: string): Promise<{ email: string | null; username: string | null }> {
  const v = String(raw || '').trim().replace(/^@/, '');
  if (!v) return { email: null, username: null };
  if (v.includes('@')) return { email: v.toLowerCase(), username: null };
  return { email: null, username: v };
}

/** دخول بالإيميل فقط — يرفض اليوزرنيم (أفراد وشركات) */
// @ts-ignore TS6133: retained for future reuse.
async function signInWithEmailOrUsername(identifier: string, password: string) {
  const raw = String(identifier || '').trim().replace(/^@/, '');
  if (!raw || !password) return { ok: false as const, email: '', error: 'missing-credentials' };
  if (!raw.includes('@')) return { ok: false as const, email: '', error: 'email-required' };
  const email = raw.toLowerCase();
  try {
    const r = await signIn.email({ email, password });
    if (!(r as { error?: unknown })?.error) return { ok: true as const, email, error: null };
    return { ok: false as const, email, error: 'login-failed' };
  } catch {
    return { ok: false as const, email, error: 'login-failed' };
  }
}

export async function fetchCompanyStatusFromServer(email: string): Promise<CompanyRegStatus | null> {
  const em = encodeURIComponent(email.trim().toLowerCase());
  const urls = [
    `/api/company/status?email=${em}`,
    `/api/companies/status?email=${em}`,
    `/api/owner/companies?email=${em}`,
    `/api/company/by-email?email=${em}`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) continue;
      const d = await r.json();
      const row = Array.isArray(d) ? d[0] : (d.company || d.registration || d);
      const st = String(row?.status || row?.state || '').toLowerCase();
      if (st === 'active' || row?.active === true || row?.approved === true) return 'active';
      if (st === 'inactive' || row?.active === false) return 'inactive';
      if (st === 'pending') return 'pending';
    } catch { /* next */ }
  }
  return null;
}

/** Personal accounts that must stay in User Control — never Companies */
const PERSONAL_USER_BLOCKLIST = new Set([
  'nadoosha',
  'nadoshatota',
  'nadoshatota@gmail.com',
  'libra',
  'ليبرا',
  'ليبر',
  'account.kw@yahoo.com',
]);

export function isPersonalBlockedAccount(u: {
  email?: string | null;
  username?: string | null;
  name?: string | null;
} | null | undefined): boolean {
  if (!u) return false;
  const em = String(u.email || '').trim().toLowerCase();
  const un = String(u.username || '').replace(/^@/, '').replace(/❤️/g, '').trim().toLowerCase();
  const nm = String(u.name || '').replace(/❤️/g, '').trim().toLowerCase();
  if (em && PERSONAL_USER_BLOCKLIST.has(em)) return true;
  if (un && PERSONAL_USER_BLOCKLIST.has(un)) return true;
  if (nm && PERSONAL_USER_BLOCKLIST.has(nm.replace(/\s+/g, ''))) return true;
  if (/nadoosha/i.test(String(u.username || u.name || u.email || ''))) return true;
  // Libra يبقى في تحكم المستخدمين وليس قسم الشركات فقط
  if (/libra|ليبر/i.test(String(u.username || u.name || u.email || ''))) return true;
  return false;
}

/** Canonical Arabic title for known company brands */
export function preferredCompanyDisplayName(row: {
  companyName?: string | null;
  name?: string | null;
  tradeName?: string | null;
  email?: string | null;
  username?: string | null;
}): string {
  const un = String(row.username || '').replace(/^@/, '').trim();
  // كل شركة حساب مستقل — نعرض اسمها/يوزرها الحقيقي بدون دمج العلامات
  for (const val of [row.companyName, row.name, un, row.tradeName, row.email]) {
    if (val && String(val).trim()) return String(val).trim();
  }
  return 'Company';
}

/** Clean registry: drop personal accounts, normalize Libra Arabic name, dedupe */
export function sanitizeCompaniesRegistry(): CompanyRegistration[] {
  // UI-only: never write localStorage here — stringify of cert base64 freezes the main thread.
  const list = loadCompaniesRegistryLight();
  const out: CompanyRegistration[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    const un = String((c as CompanyRegistration).username || '').replace(/^@/, '').toLowerCase();
    if (/nadoosha/i.test(`${c.email} ${un} ${c.companyName || ''}`)) continue;
    const uniqueKey = (
      String(c.id || '') + '|' +
      String(c.email || '').toLowerCase() + '|' +
      un
    );
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    out.push({
      ...c,
      companyName: c.companyName || c.tradeName || un || c.email,
    });
  }
  return out;
}

/** هل هذا الصف حساب شركة؟ (يُستبعد من User Control ويُعرض في قسم الشركات فقط) */
export function isCompanyAccountRow(u: {
  email?: string | null;
  username?: string | null;
  name?: string | null;
  accountType?: string | null;
  type?: string | null;
  role?: string | null;
  userType?: string | null;
  isCompany?: boolean | null;
  companyName?: string | null;
  tradeName?: string | null;
  licenseNumber?: string | null;
  id?: string | null;
} | null | undefined): boolean {
  if (!u) return false;
  if (isPersonalBlockedAccount(u)) return false;
  const t = String(u.accountType || u.type || u.role || u.userType || '').toLowerCase();
  if (t === 'user' || t === 'personal' || t === 'individual') return false;
  if (t === 'company' || t === 'business') return true;
  if (u.isCompany === true) return true;
  if (u.isCompany === false) return false;
  // سجل الشركات فقط بمطابقة إيميل/يوزر — بدون اسم عام
  if (u.email) {
    const reg = findCompanyByEmail(u.email);
    if (reg) return true;
  }
  try {
    const un = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
    const reg = loadCompaniesRegistry();
    if (un && reg.some(c => String((c as any).username || '').replace(/^@/, '').toLowerCase() === un)) return true;
  } catch { /* ignore */ }
  // licenseNumber + companyName معاً أقوى من الاسم وحده
  if (u.licenseNumber && (u.companyName || u.tradeName)) return true;
  return false;
}

/** Ensure a user row is stored in the companies registry (Companies panel only) */
export function ensureCompanyInRegistry(row: any): CompanyRegistration | null {
  if (isPersonalBlockedAccount(row)) return null; // never put NaDooSha etc. in Companies
  const em = String(row?.email || '').trim().toLowerCase();
  if (!em && !row?.id) return null;
  const existing = em ? findCompanyByEmail(em) : null;
  const remembered = em ? getRememberedCompanyStatus(em) : null;
  const serverActive = row?.status === 'active' || row?.isActive === true || row?.approved === true;
  const serverInactive = row?.status === 'inactive' || row?.isBanned === true || row?.active === false;
  // أولوية: قرار التفعيل المحلي (Approve) ثم السيرفر ثم السجل السابق — لا نرجع من active إلى pending
  let status: CompanyRegStatus = 'pending';
  if (remembered === 'active' || remembered === 'inactive') status = remembered;
  else if (serverActive) status = 'active';
  else if (serverInactive) status = 'inactive';
  else if (existing?.status === 'active' || existing?.status === 'inactive') status = existing.status;
  else status = 'pending';
  const entry: CompanyRegistration = {
    id: String(existing?.id || row.id || `co-${em || row.username || Date.now()}`),
    companyName: preferredCompanyDisplayName({ companyName: row.companyName || existing?.companyName, name: row.name, tradeName: row.tradeName, email: em || row.email, username: row.username }),
    tradeName: (() => {
      const preferred = preferredCompanyDisplayName({ companyName: row.companyName, name: row.name, tradeName: row.tradeName, email: em, username: row.username });
      if (/ليبر|libra/i.test(preferred)) return row.tradeName && /[؀-ۿ]/.test(row.tradeName) ? row.tradeName : (existing?.tradeName && /[؀-ۿ]/.test(existing.tradeName) ? existing.tradeName : 'لإدارة وتأجير العقارات المملوكة او المؤجرة');
      return row.tradeName || existing?.tradeName || row.companyName || row.name || '';
    })(),
    ownerName: row.ownerName || existing?.ownerName || row.name || '',
    licenseNumber: row.licenseNumber || existing?.licenseNumber || '',
    phone: row.phone || existing?.phone || '',
    phoneAlt: row.phoneAlt || existing?.phoneAlt,
    email: em || existing?.email || '',
    username: row.username || existing?.username,
    password: existing?.password,
    status,
    createdAt: row.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: row.id || existing?.userId || null,
    approvedAt: status === 'active' ? (existing?.approvedAt || new Date().toISOString()) : existing?.approvedAt || null,
    approvedBy: existing?.approvedBy || null,
  };
  upsertCompanyRegistration(entry);
  return entry;
}


function shouldShowSupportHeaderIcon(
  user: { email?: string | null; username?: string | null; name?: string | null } | null | undefined,
  profileUsername?: string | null,
) {
  // Guests (not logged in) can also open support chat
  if (!user) return true;
  return !isSupportOwnerAccount(user, profileUsername);
}
interface Recording {
  id: number;
  title: string;
  duration: number;
  mode: string;
  fileUrl: string | null;
  createdAt: string;
}

// Theme colors matching the cyan main screen
const SETTINGS_CLR = {
  bg: 'radial-gradient(ellipse 70% 60% at 50% 40%, #0d2a2e 0%, #0a1a1a 50%, #060e0e 100%)',
  primary: '#00BCD4',
  primaryDim: 'rgba(0,188,212,0.7)',
  primaryFaint: 'rgba(0,188,212,0.15)',
  primaryBorder: 'rgba(0,188,212,0.25)',
  primaryGlow: 'rgba(0,188,212,0.3)',
  surface: 'rgba(13,32,32,0.8)',
  surfaceBorder: 'rgba(0,188,212,0.12)',
  text: 'rgba(200,230,230,0.9)',
  textMuted: 'rgba(150,190,190,0.6)',
  inputBg: 'rgba(6,14,14,0.8)',
  inputBorder: 'rgba(0,188,212,0.2)',
  inputFocus: 'rgba(0,188,212,0.5)',
  navBg: 'linear-gradient(180deg, transparent 0%, rgba(6,14,14,0.95) 100%)',
  navBorder: 'rgba(0,188,212,0.08)',
  danger: 'rgba(239,68,68,0.8)',
  dangerBorder: 'rgba(239,68,68,0.3)',
  dangerFaint: 'rgba(239,68,68,0.1)',
  success: '#00BCD4',
  tabActive: 'rgba(0,188,212,0.15)',
  tabBorder: 'rgba(0,188,212,0.4)',
  bronze: 'rgba(205,140,50,0.8)',
  bronzeBorder: 'rgba(205,140,50,0.3)',
  bronzeFaint: 'rgba(205,140,50,0.1)',
  green: 'hsl(var(--accent))',
  greenFaint: 'hsl(var(--accent) / 0.12)',
  greenBorder: 'hsl(var(--accent) / 0.35)',
  bgDeep: 'rgba(6,14,14,0.95)',
  overlay: 'rgba(0,0,0,0.75)',
  modalBg: 'linear-gradient(160deg, #0d2a2e 0%, #0a1a1a 100%)',
  yellowFaint: 'rgba(234,179,8,0.12)',
  yellowBorder: 'rgba(234,179,8,0.5)',
  yellow: '#eab308'
};
/** Alias kept for all existing T.xxx references in this file */
const T = SETTINGS_CLR;
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ─── Recording card ───────────────────────────────────────────────────────────
function RecordingCard({
  rec,
  onDelete
}: {
  rec: Recording;
  onDelete: (id: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);
  function togglePlay() {
    if (!rec.fileUrl) return;
    if (!audioRef.current) {
      const audio = new Audio(rec.fileUrl);
      audioRef.current = audio;
      audio.ontimeupdate = () => {
        if (audio.duration) setProgress(audio.currentTime / audio.duration);
      };
      audio.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  }
  async function handleShare() {
    if (!rec.fileUrl) return;
    setSharing(true);
    try {
      const fullUrl = window.location.origin + rec.fileUrl;
      if (navigator.share) {
        // Share URL only — file sharing via navigator.share is unreliable in iframes/webviews
        await navigator.share({
          title: rec.title,
          text: `Voice recording: ${rec.title}`,
          url: fullUrl
        });
      } else {
        // Fallback: trigger a direct download
        const a = document.createElement('a');
        a.href = rec.fileUrl;
        a.download = `${rec.title}.mp3`;
        a.click();
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        // Last resort: copy link
        try {
          await navigator.clipboard.writeText(window.location.origin + rec.fileUrl);
        } catch {/* silent */}
      }
    } finally {
      setSharing(false);
    }
  }
  const isBronze = rec.mode === 'whisper';
  const modeColor = isBronze ? T.bronze : T.primary;
  const modeBorder = isBronze ? T.bronzeBorder : T.primaryBorder;
  const modeFaint = isBronze ? T.bronzeFaint : T.primaryFaint;
  return <motion.div initial={{
    opacity: 0,
    scale: 0.96
  }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} className="rounded-xl overflow-hidden" style={{
    background: T.surface,
    border: `1px solid ${T.surfaceBorder}`
  }}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Play button */}
        <motion.button whileTap={{
        scale: 0.85
      }} onClick={togglePlay} disabled={!rec.fileUrl} className="flex items-center justify-center rounded-full flex-shrink-0" style={{
        width: 38,
        height: 38,
        background: modeFaint,
        border: `1px solid ${modeBorder}`,
        cursor: rec.fileUrl ? 'pointer' : 'default',
        color: modeColor,
        opacity: rec.fileUrl ? 1 : 0.4
      }}>
          {playing ? <Pause size={14} fill={modeColor} /> : <Play size={14} fill={modeColor} style={{
          marginLeft: 2
        }} />}
        </motion.button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p style={{
          color: T.text,
          fontSize: '0.82rem',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
            {rec.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <Clock size={10} style={{
            color: T.textMuted
          }} />
            <span style={{
            color: T.textMuted,
            fontSize: '0.65rem'
          }}>{formatDuration(rec.duration)}</span>
            <span style={{
            color: modeColor,
            fontSize: '0.58rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            background: modeFaint,
            border: `1px solid ${modeBorder}`,
            padding: '1px 5px',
            borderRadius: 3
          }}>
              {rec.mode}
            </span>
            <span style={{
            color: T.textMuted,
            fontSize: '0.62rem'
          }}>{formatDate(rec.createdAt)}</span>
          </div>
        </div>

        {/* Share */}
        <motion.button whileTap={{
        scale: 0.85
      }} onClick={handleShare} disabled={!rec.fileUrl || sharing} style={{
        background: 'none',
        border: 'none',
        cursor: rec.fileUrl ? 'pointer' : 'default',
        color: T.primaryDim,
        flexShrink: 0,
        opacity: sharing ? 0.5 : 1
      }}>
          {sharing ? <motion.div animate={{
          rotate: 360
        }} transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'linear'
        }} style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: `2px solid ${T.primaryBorder}`,
          borderTopColor: T.primary
        }} /> : <Share2 size={16} />}
        </motion.button>

        {/* Delete / confirm */}
        <AnimatePresence mode="wait">
          {confirmDelete ? <motion.div key="confirm" initial={{
          opacity: 0,
          scale: 0.8
        }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{
          opacity: 0
        }} className="flex items-center gap-1 flex-shrink-0">
              <motion.button whileTap={{
            scale: 0.85
          }} onClick={() => onDelete(rec.id)} style={{
            background: T.dangerFaint,
            border: `1px solid ${T.dangerBorder}`,
            borderRadius: 6,
            padding: '3px 8px',
            color: T.danger,
            fontSize: '0.65rem',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.05em'
          }}>
                Delete
              </motion.button>
              <motion.button whileTap={{
            scale: 0.85
          }} onClick={() => setConfirmDelete(false)} style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: T.textMuted
          }}>
                <X size={14} />
              </motion.button>
            </motion.div> : <motion.button key="trash" whileTap={{
          scale: 0.85
        }} onClick={() => setConfirmDelete(true)} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: T.dangerBorder,
          flexShrink: 0
        }}>
              <Trash2 size={16} />
            </motion.button>}
        </AnimatePresence>
      </div>

      {/* Progress bar — only when playing */}
      <AnimatePresence>
        {playing && <motion.div initial={{
        scaleX: 0,
        opacity: 0
      }} animate={{
        scaleX: 1,
        opacity: 1
      }} exit={{
        opacity: 0
      }} style={{
        transformOrigin: 'left',
        height: 2,
        background: `linear-gradient(90deg, ${modeColor} ${progress * 100}%, ${modeBorder} ${progress * 100}%)`
      }} />}
      </AnimatePresence>
    </motion.div>;
}

// ─── Support chat (Settings header → @Stooorna owner/support + AI wait companion) ─
type SupportMsg = {
  id: string;
  from: 'bot' | 'user' | 'support';
  text: string;
  at: number;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'file' | 'audio';
};

type AiPhase = 'pick_lang' | 'ask_role' | 'ask_help' | 'idle' | 'waiting' | 'ask_category' | 'ask_title' | 'playing' | 'human';

/** Max playback for song / music / Quran in the support AI player */
const SUPPORT_AUDIO_MAX_SEC = 5 * 60; // 5 minutes

// SUPPORT_COPY is imported from @/lib/support-copy — do not redeclare here.

const BLOCKED_RE =
  /(sex|porn|xxx|nude|كسم|شرموط|زب|طيز|نيك|سكس|إباحي|اباحي|قتل|انتحار|bomb|terror|hack|دوكس)/i;

/** Resolve @stooorna user id (real chat peer) */
async function resolveSupportUserId(): Promise<string | null> {
  try {
    const r = await fetch('/api/users/by-username/stooorna', { credentials: 'include' });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.id || d.userId || d.user?.id || null) as string | null;
  } catch {
    return null;
  }
}

/** آخر محاولات الإرسال (للتشخيص — تظهر للدعم إذا فشل الإرسال) */
let lastSendDiag: string[] = [];

/**
 * Deliver a message into the real messaging system.
 * نجرّب أولاً صيغاً "نظيفة" بدون حقول إضافية (بعض السيرفرات ترفض أي حقل غير معروف بـ 400)،
 * ثم نفس الصيغ مع الحقول الإضافية، ثم مسارات بديلة. أول نجاح يكفي.
 */
async function sendRealChatMessage(opts: {
  toUserId: string;
  text: string;
  mediaUrl?: string;
  mediaType?: string;
  meta?: Record<string, unknown>;
}): Promise<boolean> {
  lastSendDiag = [];
  const to = opts.toUserId;
  const media = { mediaUrl: opts.mediaUrl, mediaType: opts.mediaType };
  const shapes = (withMeta: boolean): Record<string, unknown>[] => {
    const m = withMeta ? (opts.meta || {}) : {};
    return [
      { receiverId: to, body: opts.text, ...media, ...m },
      { toUserId: to, text: opts.text, ...media, ...m },
      { recipientId: to, content: opts.text, ...media, ...m },
      { userId: to, message: opts.text, text: opts.text, ...media, ...m },
      { peerId: to, body: opts.text, text: opts.text, ...m },
      { to, text: opts.text, ...m },
    ];
  };
  const routes: Array<{ url: string; bodies: Record<string, unknown>[] }> = [
    { url: '/api/messages', bodies: [...shapes(false), ...(opts.meta ? shapes(true) : [])] },
    { url: `/api/messages/${encodeURIComponent(to)}`, bodies: [{ text: opts.text, ...media }, { content: opts.text, ...media }] },
    { url: `/api/conversations/${encodeURIComponent(to)}/messages`, bodies: [{ text: opts.text, ...media }] },
    { url: '/api/support/messages', bodies: [
      (opts.meta as Record<string, unknown> | undefined)?.isSupportTicket
        // رسالة مستخدم للدعم: لا نعلّمها كرد دعم أبداً (كانت تضيع/تتكرر)
        ? { toUserId: to, toUsername: 'stooorna', text: opts.text, isSupportTicket: true, ...media, ...(opts.meta || {}) }
        : { toUserId: to, text: opts.text, from: 'support', isSupportReply: true, ...media },
    ] },
  ];

  // رد الدعم: مسار الدعم المخصص أولاً
  if (opts.meta && (opts.meta as Record<string, unknown>).isSupportReply) {
    const i = routes.findIndex(r => r.url === '/api/support/messages');
    if (i > 0) routes.unshift(routes.splice(i, 1)[0]);
  }
  for (const route of routes) {
    for (const body of route.bodies) {
      try {
        const r = await fetch(route.url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (r.ok || r.status === 201) return true;
        let detail = '';
        try {
          const raw = await r.text();
          const pre = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(raw);
          if (pre) detail = pre[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 70);
          else if (!/^\s*</.test(raw)) detail = raw.replace(/\s+/g, ' ').trim().slice(0, 70);
        } catch { /* ignore */ }
        const label = route.url.replace(/\/[A-Za-z0-9_-]{12,}/g, '/:id');
        lastSendDiag.push(`${label} ← ${r.status}${detail ? ' ' + detail : ''}`);
        // مسار غير موجود / ممنوع: تغيير شكل الجسم ما يفيد → ننتقل للمسار التالي
        if (r.status === 401 || r.status === 403 || r.status === 404 || r.status === 405) break;
      } catch (e) {
        lastSendDiag.push(`${route.url.slice(0, 40)} ← network error`);
        break;
      }
    }
  }
  return false;
}

/** Persist ticket locally so owner inbox can still show something if API shape differs */
function queueSupportTicket(ticket: {
  fromUserId?: string;
  fromUsername?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  text: string;
  mediaUrl?: string;
  mediaType?: string;
  lang?: string;
  accountRole?: string;
  companyName?: string;
  licenseNumber?: string;
}) {
  try {
    const key = 'stooorna_support_tickets';
    const prev = JSON.parse(localStorage.getItem(key) || '[]') as unknown[];
    const lastT = prev[prev.length - 1] as { fromUserId?: string; text?: string; at?: string } | undefined;
    if (lastT && lastT.fromUserId === ticket.fromUserId && lastT.text === ticket.text && Date.now() - (Date.parse(String(lastT.at || '')) || 0) < 60000) return;
    const next = [
      ...prev,
      {
        id: `t-${Date.now()}`,
        ...ticket,
        at: new Date().toISOString(),
        unread: 1,
      },
    ].slice(-300);
    localStorage.setItem(key, JSON.stringify(next));
    // notify other tabs / owner UI
    window.dispatchEvent(new CustomEvent('stooorna:support-ticket', { detail: next[next.length - 1] }));
  } catch { /* ignore */ }
}

function readLocalSupportTickets(): Array<{
  id: string;
  fromUserId?: string;
  fromUsername?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  text: string;
  at: string;
  unread?: number;
  mediaUrl?: string;
}> {
  try {
    return JSON.parse(localStorage.getItem('stooorna_support_tickets') || '[]');
  } catch {
    return [];
  }
}

/** معرّف ثابت للزائر (غير المسجّل) حتى تبقى محادثته واحدة عند الدعم */
function getSupportGuestId(): string {
  try {
    let id = localStorage.getItem('stooorna_support_guest_id');
    if (!id) {
      id = `guest-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      localStorage.setItem('stooorna_support_guest_id', id);
    }
    return id;
  } catch { return 'guest'; }
}

/** Support chat history lives 10 minutes then is wiped (client + optional API) */
const SUPPORT_CHAT_TTL_MS = 10 * 60 * 1000;

const SUPPORT_TASK_DONE_MSG =
  'شكرا للتواصل معنا واذا بغيتنا نساعدك لا تترد بالتواصل مره اخرى\nملاحظه/ سوف يتم حذف المحادثه بعد عشرة دقائق بشكل نهائي  شكرا لتواصلكم';

function supportChatKey(peerId: string) {
  return `stooorna_support_thread_${peerId}`;
}

type StoredSupportThread = {
  messages: Array<{
    id: string;
    from: string;
    text: string;
    at: number;
    mediaUrl?: string;
    mediaType?: string;
  }>;
  expiresAt: number;
  completedAt?: number;
};

function loadSupportThread(peerId: string): StoredSupportThread | null {
  try {
    const raw = localStorage.getItem(supportChatKey(peerId));
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredSupportThread;
    if (!data || !Array.isArray(data.messages)) return null;
    if (data.expiresAt && Date.now() > data.expiresAt) {
      if (data.completedAt) {
        // المحادثة انتهت مهمتها وعدّت 10 دقائق → حذف كامل (محلي + سيرفر + إشعار الواجهات)
        clearSupportThread(peerId);
      } else {
        localStorage.removeItem(supportChatKey(peerId));
      }
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveSupportThread(peerId: string, messages: StoredSupportThread['messages'], opts?: { completedAt?: number; resetTtl?: boolean }) {
  try {
    const prev = loadSupportThread(peerId);
    const now = Date.now();
    const completedAt = opts?.completedAt ?? prev?.completedAt;
    let expiresAt = prev?.expiresAt && prev.expiresAt > now ? prev.expiresAt : now + SUPPORT_CHAT_TTL_MS;
    if (opts?.resetTtl && !completedAt) expiresAt = now + SUPPORT_CHAT_TTL_MS;
    // بعد "تم إنهاء المهمة" العدّاد ثابت: وقت الإنهاء + 10 دقائق ولا يُصفَّر بأي رسالة
    if (completedAt) expiresAt = completedAt + SUPPORT_CHAT_TTL_MS;
    const payload: StoredSupportThread = {
      messages,
      expiresAt,
      completedAt,
    };
    localStorage.setItem(supportChatKey(peerId), JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('stooorna:support-thread', { detail: { peerId, ...payload } }));
  } catch { /* ignore */ }
}

const DELETED_THREADS_KEY = 'stooorna_deleted_support_threads';
function getDeletedThreadIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DELETED_THREADS_KEY) || '[]')); } catch { return new Set(); }
}
function markThreadDeleted(peerId: string) {
  try {
    const ids = getDeletedThreadIds();
    ids.add(peerId);
    localStorage.setItem(DELETED_THREADS_KEY, JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

/** آخر وقت تم فيه تفريغ محادثة الدعم — أي رسالة أقدم منه لا تظهر مرة ثانية حتى لو السيرفر لسا يرجّعها */
function supportWipedKey(peerId: string) {
  return `stooorna_support_wiped_${peerId}`;
}
function getSupportWipedAt(peerId: string): number {
  try { return Number(localStorage.getItem(supportWipedKey(peerId)) || 0) || 0; } catch { return 0; }
}
function toMs(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Date.parse(v); return Number.isNaN(n) ? 0 : n; }
  return 0;
}
/** رسالة الشكر التي تُرسل عند الضغط على "تم" (نستخدمها عند المستخدم لمعرفة وقت الإنهاء) */
function isSupportDoneText(text?: string | null): boolean {
  return !!text && text.includes('سوف يتم حذف المحادثه بعد عشرة دقائق');
}
/** هل انتهت مدة الحفظ لهذه المحادثة؟ (قراءة مباشرة بدون حذف) */
function peekSupportThreadExpired(peerId: string): boolean {
  try {
    const raw = localStorage.getItem(supportChatKey(peerId));
    if (!raw) return false;
    const d = JSON.parse(raw) as StoredSupportThread;
    return !!(d?.expiresAt && Date.now() > d.expiresAt);
  } catch { return false; }
}

function clearSupportThread(peerId: string) {
  try {
    localStorage.removeItem(supportChatKey(peerId));
    localStorage.setItem(supportWipedKey(peerId), String(Date.now()));
    // also drop matching local tickets
    const tickets = readLocalSupportTickets().filter(
      t => t.fromUserId !== peerId,
    );
    localStorage.setItem('stooorna_support_tickets', JSON.stringify(tickets));
    // remember this thread was deleted so inbox fetch won't re-show it
    markThreadDeleted(peerId);
    window.dispatchEvent(new CustomEvent('stooorna:support-thread', { detail: { peerId, cleared: true, targetUserId: peerId } }));
  } catch { /* ignore */ }
  // Delete from DB (owner-only endpoint — silently ignored for non-owners)
  fetch(`/api/support/thread?userId=${encodeURIComponent(peerId)}`, {
    method: 'DELETE',
    credentials: 'include',
  }).catch(() => { /* optional */ });
  // Tombstone so the other side (user or owner) drops the thread too.
  const tomb = '[[support-thread-deleted]]';
  void fetch('/api/messages', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toUserId: peerId, recipientId: peerId, text: tomb, content: tomb, supportDeleted: true }),
  }).catch(() => {});
  void fetch('/api/support/messages', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: tomb, toUserId: peerId, from: 'support', deleted: true }),
  }).catch(() => {});
}

function pushOwnerSupportAlert(fromLabel: string) {
  const alert = { id: `sa-${Date.now()}`, text: 'لديك رساله جديده', from: fromLabel || 'مستخدم', at: Date.now(), unread: true };
  try {
    const raw = JSON.parse(localStorage.getItem('stooorna_owner_support_alerts') || '[]');
    const list = Array.isArray(raw) ? raw : [];
    list.push(alert);
    localStorage.setItem('stooorna_owner_support_alerts', JSON.stringify(list.slice(-40)));
    window.dispatchEvent(new CustomEvent('stooorna:owner-support-alert', { detail: alert }));
  } catch { /* ignore */ }
  void fetch('/api/notifications', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'لديك رساله جديده', body: fromLabel || 'رسالة دعم', kind: 'support', toUsername: 'stooorna' }),
  }).catch(() => {});
}

async function notifySupportThreadComplete(peerId: string) {
  try {
    // Tell server to schedule a WS "support_thread_clear" event to the user after 10 min
    await fetch('/api/support/complete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: peerId, deleteAfterMs: SUPPORT_CHAT_TTL_MS }),
    });
  } catch { /* optional backend */ }
  try {
    await sendRealChatMessage({
      toUserId: peerId,
      text: SUPPORT_TASK_DONE_MSG,
      meta: { isSupportReply: true, taskComplete: true, deleteAfterMs: SUPPORT_CHAT_TTL_MS },
    });
  } catch { /* */ }
}

function classifyListenIntent(text: string): 'quran' | 'ar_song' | 'en_song' | 'music' | 'other' {
  const t = text.toLowerCase().trim();
  if (/(قرآن|قران|quran|qur.?an|سورة|سوره|تلاوة|مصحف)/i.test(t)) return 'quran';
  if (/(عربي|عربية|arabic)/i.test(t) && /(أغنية|اغنية|أغنيه|اغنيه|song|موسيقى|موسيقي)/i.test(t)) return 'ar_song';
  if (/(إنجليزي|انجليزي|english)/i.test(t) && /(أغنية|اغنية|song|موسيقى)/i.test(t)) return 'en_song';
  if (/(أغنية|اغنية|أغنيه|اغنيه|song)/i.test(t)) {
    if (/(عربي|عربية|arabic)/i.test(t)) return 'ar_song';
    if (/(إنجليزي|انجليزي|english)/i.test(t)) return 'en_song';
    return 'ar_song';
  }
  if (/(موسيقى|موسيقي|music|instrumental)/i.test(t)) return 'music';
  return 'other';
}

/** Curated safe audio sources (audio only). Backend may override via /api/support/audio-search */
const AUDIO_CATALOG: Record<string, { title: string; url: string }[]> = {
  quran: [
    { title: 'الفاتحة — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3' },
    { title: 'البقرة (بداية) — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/2.mp3' },
    { title: 'يس — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/36.mp3' },
    { title: 'الرحمن — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/55.mp3' },
    { title: 'الملك — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/67.mp3' },
    { title: 'الإخلاص — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/112.mp3' },
  ],
  ar_song: [
    { title: 'موسيقى هادئة عربية (عينة)', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  ],
  en_song: [
    { title: 'Calm instrumental (sample)', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  ],
  music: [
    { title: 'Instrumental music (sample)', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  ],
};

async function resolveAudio(category: 'quran' | 'ar_song' | 'en_song' | 'music', query: string): Promise<{ title: string; url: string } | null> {
  // Prefer backend search if available (auto-search for support AI)
  try {
    const r = await fetch('/api/support/audio-search', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, query }),
    });
    if (r.ok) {
      const d = await r.json();
      if (d?.url && typeof d.url === 'string') {
        return { title: d.title || query, url: d.url };
      }
    }
  } catch { /* fallback catalog */ }

  const list = AUDIO_CATALOG[category] || [];
  if (!list.length) return null;
  const q = query.toLowerCase();
  const hit = list.find(x => x.title.toLowerCase().includes(q) || q.includes(x.title.toLowerCase().slice(0, 8)));
  return hit || list[0];
}

/** ردود الدعم التي حذفها المستخدم من عنده (تبقى مخفية حتى لو السيرفر يرجّعها) */
function supportHiddenKey(uid: string) {
  return `stooorna_support_hidden_replies_${uid}`;
}
function getHiddenSupportReplies(uid: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(supportHiddenKey(uid)) || '[]')); } catch { return new Set(); }
}
function hideSupportReply(uid: string, id: string, msg?: { text?: string | null; mediaUrl?: string | null; at?: number | null }) {
  try {
    const ids = getHiddenSupportReplies(uid);
    ids.add(id);
    localStorage.setItem(supportHiddenKey(uid), JSON.stringify(Array.from(ids).slice(-300)));
    // نفس الرد قد يصل من أكثر من قناة بمعرّفات مختلفة → نخفيه أيضاً بمحتواه
    if (msg) {
      const sigs = getHiddenSupportSigs(uid);
      sigs.push({ s: supportReplySig(msg), at: Number(msg.at) || 0 });
      localStorage.setItem(supportHiddenSigKey(uid), JSON.stringify(sigs.slice(-300)));
    }
  } catch { /* ignore */ }
}
const SUPPORT_DUP_WINDOW_MS = 5 * 60 * 1000;
function supportReplySig(m: { text?: string | null; mediaUrl?: string | null }): string {
  return `${String(m.text || '').replace(/\s+/g, ' ').trim()}|${String(m.mediaUrl || '')}`;
}
function supportHiddenSigKey(uid: string) {
  return `stooorna_support_hidden_sigs_${uid}`;
}
function getHiddenSupportSigs(uid: string): Array<{ s: string; at: number }> {
  try {
    const v = JSON.parse(localStorage.getItem(supportHiddenSigKey(uid)) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function isSupportSigHidden(sigs: Array<{ s: string; at: number }>, m: { text?: string | null; mediaUrl?: string | null; at?: number | null }): boolean {
  if (!sigs.length) return false;
  const s = supportReplySig(m);
  const at = Number(m.at) || 0;
  return sigs.some(x => x.s === s && (!x.at || !at || Math.abs(x.at - at) < SUPPORT_DUP_WINDOW_MS));
}

/** مفتاح "آخر رد شافه المستخدم" — يُستخدم لنقطة التنبيه على أيقونة الدعم */
function supportSeenKey(uid: string) {
  return `stooorna_support_seen_${uid}`;
}
function markSupportRepliesSeen(uid: string, at: number) {
  try {
    const prev = Number(localStorage.getItem(supportSeenKey(uid)) || 0) || 0;
    if (at > prev) localStorage.setItem(supportSeenKey(uid), String(at));
    window.dispatchEvent(new CustomEvent('stooorna:support-seen', { detail: { uid } }));
  } catch { /* ignore */ }
}

/** نص المشكلة فقط بدون سطر [مستخدم] وسطر الإيميل (مع الحفاظ على الأسطر) لعرضه داخل محادثة الدعم */
function stripSupportHeader(text?: string | null): string {
  const lines = String(text || '')
    .split('\n')
    .filter(l => l.trim() && !/^\s*\[(مستخدم|شركة)\]/.test(l) && !l.trim().startsWith('📧'));
  return lines.join('\n').trim();
}

/** استخراج نص المشكلة فقط (بدون سطر [مستخدم] وسطر الإيميل) لعرضه مختصراً في القائمة */
function supportPreview(text?: string | null): string {
  const lines = String(text || '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !/^\[(مستخدم|شركة)\]/.test(l) && !l.startsWith('📧'));
  return lines.join(' ');
}

/** ─── قناة محلية احتياطية لردود الدعم (نفس المتصفح) — تُستخدم فقط بجانب السيرفر ─── */
const SUPPORT_REPLY_QUEUE_KEY = 'stooorna_support_replies';
type QueuedSupportReply = {
  id: string; toUserId?: string; toUsername?: string | null; text: string; at: number; mediaUrl?: string; mediaType?: string;
};
function readQueuedSupportReplies(): QueuedSupportReply[] {
  try { return JSON.parse(localStorage.getItem(SUPPORT_REPLY_QUEUE_KEY) || '[]'); } catch { return []; }
}
function queueSupportReply(r: Omit<QueuedSupportReply, 'id' | 'at'>) {
  try {
    const item: QueuedSupportReply = { ...r, id: `qreply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now() };
    const next = [...readQueuedSupportReplies(), item].slice(-100);
    localStorage.setItem(SUPPORT_REPLY_QUEUE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('stooorna:support-reply', { detail: item }));
  } catch { /* ignore */ }
}

/** يحلّ معرّف حساب الدعم (مع كاش حتى لا نكرر الطلب كل 8 ثواني) */
let _supportIdCache: string | null = null;
async function getSupportIdCached(): Promise<string | null> {
  if (_supportIdCache) return _supportIdCache;
  const id = await resolveSupportUserId();
  if (id) _supportIdCache = id;
  return id;
}

const SUPPORT_TICKET_HEADER_RE = /^\s*\[(مستخدم|شركة)\]/;

/** قراءة آمنة لمعرّف من حقل قد يكون نص أو كائن */
function pickId(v: any): string {
  if (v == null) return '';
  if (typeof v === 'object') return String(v.id ?? v._id ?? v.userId ?? '');
  return String(v);
}

/**
 * يحوّل قائمة رسائل السيرفر إلى "ردود دعم" موجّهة لهذا المستخدم.
 * لا نعتمد على اسم حقل واحد للمرسل — السيرفر قد يسمّيه بأكثر من شكل.
 * assumeThreadWithSupport=true عندما تكون القائمة هي محادثتي مع حساب الدعم نفسه.
 */
function extractSupportReplies(
  list: any[],
  ctx: { uid: string; supportId: string | null; assumeThreadWithSupport: boolean },
): { replies: SupportMsg[]; tombAt: number } {
  const tomb = '[[support-thread-deleted]]';
  const out: SupportMsg[] = [];
  let tombAt = 0;
  for (const m of list || []) {
    if (!m || typeof m !== 'object') continue;
    const text = String(m.text || m.content || m.body || m.message || '');
    if (!text && !m.mediaUrl) continue;
    const sender = pickId(m.fromUserId ?? m.senderId ?? m.authorId ?? m.sender_id ?? m.fromId ?? m.from_user_id ?? m.sender ?? m.author ?? (typeof m.from === 'object' ? m.from : ''));
    const receiver = pickId(m.toUserId ?? m.recipientId ?? m.receiverId ?? m.to_user_id ?? m.toId ?? m.receiver ?? m.recipient ?? (typeof m.to === 'object' ? m.to : ''));
    const senderName = String(m.fromUsername ?? m.senderUsername ?? m.sender?.username ?? m.author?.username ?? m.from?.username ?? '').replace(/^@/, '').toLowerCase();
    const isMine = (!!sender && sender === ctx.uid)
      || m.mine === true || m.isMine === true || m.me === true || m.isOwn === true
      || m.direction === 'out' || m.direction === 'sent';
    if (isMine) continue; // رسائلي أنا
    const flagged =
      m.from === 'support' || m.from === 'agent' || m.from === 'stooorna' ||
      !!m.isSupportReply || !!m.meta?.isSupportReply || m.fromRole === 'support' || m.meta?.fromRole === 'support';
    const bySupportId = !!ctx.supportId && sender === ctx.supportId;
    const bySupportName = senderName === 'stooorna';
    const toMe = !!receiver && receiver === ctx.uid && !!sender && sender !== ctx.uid;
    // ملاحظة: رسائل المستخدم نفسه تبدأ بسطر [مستخدم] — لا تُعتبر ردّاً أبداً
    const looksLikeMyTicket = SUPPORT_TICKET_HEADER_RE.test(text);
    const fromSupport = flagged || bySupportId || bySupportName || (ctx.assumeThreadWithSupport && (toMe || !sender || sender !== ctx.uid) && !looksLikeMyTicket);
    if (!fromSupport || looksLikeMyTicket) continue;
    const at = toMs(m.at ?? m.createdAt ?? m.sentAt ?? m.created_at ?? m.timestamp);
    if (text.includes(tomb)) { tombAt = Math.max(tombAt, at || Date.now()); continue; }
    const id = String(m.id ?? m._id ?? `${at}-${text.slice(0, 16)}`);
    out.push({ id, from: 'support', text, at, mediaUrl: m.mediaUrl, mediaType: m.mediaType });
  }
  return { replies: out, tombAt };
}

/** ردود فريق الدعم الموجّهة لهذا المستخدم (تصله في نفس مكان أيقونة الدعم) */
async function fetchSupportReplies(uid: string, uname?: string | null): Promise<SupportMsg[]> {
  if (!uid) return [];
  const found = new Map<string, SupportMsg>();
  let tombAt = 0;
  let supportId: string | null = null;
  try { supportId = await getSupportIdCached(); } catch { /* ignore */ }

  const sources: Array<{ url: string; thread: boolean }> = [{ url: '/api/support/messages?role=user', thread: false }];
  if (supportId) {
    const q = encodeURIComponent(supportId);
    sources.push(
      { url: `/api/messages?with=${q}`, thread: true },
      { url: `/api/messages?userId=${q}`, thread: true },
      { url: `/api/messages?peerId=${q}`, thread: true },
    );
  }
  sources.push({ url: '/api/notifications', thread: false });
  let gotThread = false;
  for (const src of sources) {
    if (src.thread && gotThread) break; // أول صيغة تنجح تكفي
    try {
      const r = await fetch(src.url, { credentials: 'include' });
      if (!r.ok) continue;
      const d = await r.json();
      let list: any[] = Array.isArray(d) ? d : (d.messages || d.items || d.notifications || []);
      if (src.url === '/api/notifications') {
        // إشعارات رد الدعم فقط → نحوّلها لشكل رسالة صادرة من الدعم
        list = list
          .filter((n: any) => /support/i.test(String(n?.kind || n?.type || '')) && /reply/i.test(String(n?.kind || n?.type || '')))
          .map((n: any) => ({
            id: n.id ?? n._id,
            text: n.body || n.text || n.message || '',
            createdAt: n.createdAt ?? n.at,
            from: 'support',
            mediaUrl: n.mediaUrl,
            mediaType: n.mediaType,
          }));
      }
      if (src.thread && list.length) gotThread = true;
      const { replies, tombAt: t } = extractSupportReplies(list, { uid, supportId, assumeThreadWithSupport: src.thread });
      tombAt = Math.max(tombAt, t);
      for (const rp of replies) found.set(rp.id, rp);
    } catch { /* next */ }
  }

  // القناة المحلية الاحتياطية (نفس المتصفح): نضيفها فقط إذا ما وصلت نسخة منها من السيرفر
  const unameN = String(uname || '').replace(/^@/, '').toLowerCase();
  const serverList = Array.from(found.values());
  for (const q of readQueuedSupportReplies()) {
    const forMe = (q.toUserId && q.toUserId === uid) || (!!unameN && String(q.toUsername || '').replace(/^@/, '').toLowerCase() === unameN);
    if (!forMe) continue;
    const dup = serverList.some(x => x.text === q.text && Math.abs((x.at || 0) - q.at) < 120000);
    if (dup) continue;
    found.set(q.id, { id: q.id, from: 'support', text: q.text, at: q.at, mediaUrl: q.mediaUrl, mediaType: q.mediaType as SupportMsg['mediaType'] });
  }

  let wipedAt = getSupportWipedAt(uid);
  // الدعم حذف المحادثة → نخفي كل ما قبل وقت الحذف
  if (tombAt > wipedAt) {
    wipedAt = tombAt;
    try { localStorage.setItem(supportWipedKey(uid), String(tombAt)); } catch { /* ignore */ }
  }
  let out = Array.from(found.values());
  // رسالة الشكر (تم): تختفي بعد 10 دقائق
  const done = out.filter(m => isSupportDoneText(m.text)).sort((x, y) => y.at - x.at)[0];
  if (done && done.at && Date.now() - done.at >= SUPPORT_CHAT_TTL_MS && done.at > wipedAt) {
    wipedAt = done.at;
    try { localStorage.setItem(supportWipedKey(uid), String(done.at)); } catch { /* ignore */ }
  }
  out = out.filter(m => !wipedAt || !m.at || m.at > wipedAt);
  const hidden = getHiddenSupportReplies(uid);
  if (hidden.size) out = out.filter(m => !hidden.has(m.id));
  const hiddenSigs = getHiddenSupportSigs(uid);
  if (hiddenSigs.length) out = out.filter(m => !isSupportSigHidden(hiddenSigs, m));
  // نفس الرد وصل من أكثر من قناة (رسائل + دعم + إشعارات) → يظهر مرة واحدة فقط
  const uniq: SupportMsg[] = [];
  for (const m of out.slice().sort((x, y) => x.at - y.at)) {
    const sig = supportReplySig(m);
    const dup = uniq.some(u => supportReplySig(u) === sig && (!u.at || !m.at || Math.abs(u.at - m.at) < SUPPORT_DUP_WINDOW_MS));
    if (!dup) uniq.push(m);
  }
  return uniq;
}

type SupportAttachment = { url: string; type: 'image' | 'video' | 'file'; name: string };

/** أيقونة الدعم → فقاعة طلب بسيطة (بدون شات): يوزر + إيميل + المشكلة + مرفق + إرسال */
function SupportChatOverlay({
  open,
  onClose,
  onSent,
  currentUser,
}: {
  open: boolean;
  onClose: () => void;
  /** يُستدعى بعد نجاح الإرسال (الصفحة تتسكر + يطلع مربع تأكيد) */
  onSent?: () => void;
  currentUser: { id?: string; name?: string | null; username?: string | null; email?: string | null } | null;
}) {
  const uid = currentUser?.id || '';
  const uname = String(currentUser?.username || '').replace(/^@/, '').trim();
  const isAr = (() => { try { return localStorage.getItem('lang') !== 'en'; } catch { return true; } })();
  const t = isAr
    ? {
        user: 'المستخدم', guest: 'زائر', emailPh: 'البريد الإلكتروني', problemPh: 'اكتب مشكلتك هنا...',
        send: 'إرسال', sending: 'جاري الإرسال…', sentTitle: 'تم إرسال طلبك', sentSub: 'وسوف يتم الرد عليكم قريباً',
        replies: 'رسائل الدعم', image: 'صورة', video: 'فيديو', file: 'ملف', attach: 'إرفاق',
        badEmail: 'اكتب بريداً إلكترونياً صحيحاً', needProblem: 'اكتب المشكلة أو أرفق ملفاً',
        sendFail: 'تعذّر إرسال رسالتك، تأكد من الاتصال وحاول مرة ثانية',
      }
    : {
        user: 'User', guest: 'Guest', emailPh: 'Email address', problemPh: 'Describe your problem...',
        send: 'Send', sending: 'Sending…', sentTitle: 'Your request has been sent', sentSub: 'We will reply to you soon',
        replies: 'Support messages', image: 'Image', video: 'Video', file: 'File', attach: 'Attach',
        badEmail: 'Enter a valid email address', needProblem: 'Describe the problem or attach a file',
        sendFail: 'Could not send your message. Check your connection and try again',
      };

  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState('');
  const [attachment, setAttachment] = useState<SupportAttachment | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // فتح الفقاعة: نظّف النموذج وعبّي الإيميل من حساب المستخدم (قابل للتعديل)
  useEffect(() => {
    if (!open) return;
    setEmail(currentUser?.email || '');
    setProblem('');
    setAttachment(null);
    setMenuOpen(false);
    setSending(false);
    setSent(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentUser?.id]);

  async function deliverToSupport(p: { email: string; text: string; media: SupportAttachment | null }): Promise<boolean> {
    let ok = false;
    const fromUsername = uname || null;
    const fromName = currentUser ? (currentUser.name ?? null) : 'Guest';
    const fromUserId = currentUser?.id;
    // مفتاح ثابت لكل مستخدم → محادثة واحدة فقط عند الدعم
    const stableSupportKey = fromUserId || (fromUsername ? `user:${fromUsername}` : getSupportGuestId());
    const header = `[مستخدم] @${fromUsername || fromName || 'user'}\n📧 ${p.email}`;
    const body = p.text || (p.media ? `[${p.media.type}]` : '');
    const notifyText = `${header}\n${body}`;
    const lang = isAr ? 'ar' : 'en';

    // يُحفظ محلياً حتى يلتقطه صندوق الدعم
    queueSupportTicket({
      fromUserId: stableSupportKey,
      fromUsername,
      fromName,
      fromEmail: p.email,
      text: notifyText,
      mediaUrl: p.media?.url,
      mediaType: p.media?.type,
      lang,
      accountRole: 'user',
    });

    // إرسال حقيقي عبر نظام الرسائل → @stooorna
    try {
      const supportId = await resolveSupportUserId();
      if (supportId) {
        ok = await sendRealChatMessage({
          toUserId: supportId,
          text: notifyText,
          mediaUrl: p.media?.url,
          mediaType: p.media?.type,
          meta: { isSupportTicket: true, support: true, fromUsername, fromName, fromEmail: p.email, lang, accountRole: 'user' },
        });
      }
      // القناة الثانية فقط إذا الأولى فشلت (قبل كانت ترسل نسختين → تكرار عند الدعم)
      if (!ok) {
        try {
          const r2 = await fetch('/api/support/messages', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: notifyText,
              mediaUrl: p.media?.url,
              mediaType: p.media?.type,
              toUsername: 'stooorna',
              toUserId: supportId,
              fromUserId,
              fromUsername,
              fromName,
              fromEmail: p.email,
              lang,
              accountRole: 'user',
              isSupportTicket: true,
            }),
          });
          ok = r2.ok || r2.status === 201;
        } catch { /* ignore */ }
      }
    } catch { /* non-blocking */ }
    return ok;
  }

  async function submit() {
    if (sending) return;
    const mail = email.trim();
    const text = problem.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { setError(t.badEmail); return; }
    if (!text && !attachment) { setError(t.needProblem); return; }
    setError('');
    setSending(true);
    try {
      const delivered = await deliverToSupport({ email: mail, text, media: attachment });
      if (!delivered) {
        // الرسالة ما وصلت للسيرفر: لا نقول "تم الإرسال" — نبقي النص ليعيد المحاولة
        setError(t.sendFail);
        return;
      }
      pushOwnerSupportAlert(uname ? `@${uname}` : (currentUser?.name || mail));
      setProblem('');
      setAttachment(null);
      // إغلاق الصفحة مباشرة + إظهار مربع "تم ارسال الرساله" لمدة ثانيتين
      onClose();
      onSent?.();
    } finally {
      setSending(false);
    }
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'file') {
    const file = e.target.files?.[0];
    e.target.value = '';
    setMenuOpen(false);
    if (!file) return;
    let url = '';
    try {
      const r = await fetch('/api/support/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (r.ok) {
        const d = await r.json();
        url = d.url || d.mediaUrl || '';
      }
    } catch { /* local preview fallback */ }
    if (!url) url = URL.createObjectURL(file);
    setAttachment({ url, type, name: file.name });
    setSent(false);
    setError('');
  }

  if (!open) return null;

  const primary = '#0277BD';
  const menuItem: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 12px', border: 'none',
    background: 'transparent', cursor: 'pointer', color: '#0f172a', fontSize: '0.82rem', fontWeight: 700,
    textAlign: 'start',
  };

  return (
    <AnimatePresence>
      <motion.div
        key="support-request-bubble"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 10350, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          onClick={e => e.stopPropagation()}
          style={{
            width: 'min(94vw, 420px)', maxHeight: '88vh', overflowY: 'auto', background: '#ffffff',
            borderRadius: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', padding: '14px 16px 18px',
            direction: isAr ? 'rtl' : 'ltr', color: '#0f172a',
          }}
        >
          {/* أيقونة التطبيق + Support */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, direction: 'ltr', marginBottom: 12 }}>
            <img
              src={STOOORNA_APP_ICON}
              alt=""
              style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid #e2e8f0' }}
            />
            <span style={{ fontWeight: 900, fontSize: '1.05rem', color: primary, letterSpacing: '0.02em' }}>Support</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ marginInlineStart: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}
            >
              <X size={20} />
            </button>
          </div>

          {/* يوزر المستخدم */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12,
            background: '#f1f5f9', border: '1px solid #e2e8f0', marginBottom: 10,
          }}>
            <User size={15} style={{ color: '#64748b', flexShrink: 0 }} />
            <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 700 }}>{t.user}</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', direction: 'ltr', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {uname ? `@${uname}` : (currentUser?.name || t.guest)}
            </span>
          </div>

          {/* تم إرسال طلبك */}
          {sent && (
            <div style={{
              padding: '12px 14px', borderRadius: 14, background: '#ecfdf5', border: '1px solid #86efac',
              marginBottom: 12, textAlign: 'center',
            }}>
              <p style={{ margin: 0, fontWeight: 900, fontSize: '0.92rem', color: '#15803d' }}>{t.sentTitle}</p>
              <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#166534' }}>{t.sentSub}</p>
            </div>
          )}

          {/* الإيميل */}
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setSent(false); setError(''); }}
            placeholder={t.emailPh}
            autoComplete="email"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 12, marginBottom: 10,
              background: '#f8fafc', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.88rem',
              outline: 'none', direction: 'ltr', textAlign: isAr ? 'right' : 'left', fontFamily: 'var(--font-sans)',
            }}
          />

          {/* المشكلة */}
          <textarea
            value={problem}
            onChange={e => { setProblem(e.target.value.slice(0, 2000)); setSent(false); setError(''); }}
            placeholder={t.problemPh}
            rows={4}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'none', padding: '11px 12px', borderRadius: 12,
              background: '#f8fafc', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.88rem',
              outline: 'none', lineHeight: 1.5, fontFamily: 'var(--font-sans)',
              direction: isAr ? 'rtl' : 'ltr',
            }}
          />

          {/* المرفق المختار */}
          {attachment && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '8px 10px', borderRadius: 12,
              background: '#f1f5f9', border: '1px solid #e2e8f0',
            }}>
              {attachment.type === 'image'
                ? <img src={attachment.url} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                : attachment.type === 'video'
                  ? <VideoIcon size={20} style={{ color: primary, flexShrink: 0 }} />
                  : <FileText size={20} style={{ color: primary, flexShrink: 0 }} />}
              <span style={{ flex: 1, minWidth: 0, fontSize: '0.78rem', fontWeight: 700, color: '#0f172a', direction: 'ltr', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {attachment.name}
              </span>
              <button type="button" onClick={() => setAttachment(null)} aria-label="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}>
                <X size={16} />
              </button>
            </div>
          )}

          {error && (
            <p style={{ margin: '8px 2px 0', color: '#dc2626', fontSize: '0.78rem', fontWeight: 700 }}>{error}</p>
          )}

          {/* + (صورة / فيديو / ملف) و إرسال */}
          <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => void onPick(e, 'image')} />
          <input ref={vidRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => void onPick(e, 'video')} />
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.zip,.txt,.xls,.xlsx,.ppt,.pptx" style={{ display: 'none' }} onChange={e => void onPick(e, 'file')} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, position: 'relative' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <motion.button
                whileTap={{ scale: 0.92 }}
                type="button"
                onClick={() => setMenuOpen(v => !v)}
                title={t.attach}
                aria-label={t.attach}
                style={{
                  width: 44, height: 44, borderRadius: 12, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', background: '#f1f5f9',
                  border: `1px solid ${menuOpen ? primary : '#cbd5e1'}`, color: primary,
                }}
              >
                <Plus size={22} strokeWidth={2.4} />
              </motion.button>
              {menuOpen && (
                <div style={{
                  position: 'absolute', bottom: 52, insetInlineStart: 0, minWidth: 140, background: '#ffffff',
                  border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
                  overflow: 'hidden', zIndex: 5,
                }}>
                  <button type="button" style={menuItem} onClick={() => imgRef.current?.click()}>
                    <ImageIcon size={17} style={{ color: primary }} /> {t.image}
                  </button>
                  <button type="button" style={{ ...menuItem, borderTop: '1px solid #f1f5f9' }} onClick={() => vidRef.current?.click()}>
                    <VideoIcon size={17} style={{ color: primary }} /> {t.video}
                  </button>
                  <button type="button" style={{ ...menuItem, borderTop: '1px solid #f1f5f9' }} onClick={() => fileRef.current?.click()}>
                    <FileText size={17} style={{ color: primary }} /> {t.file}
                  </button>
                </div>
              )}
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              disabled={sending}
              onClick={() => void submit()}
              style={{
                flex: 1, height: 44, borderRadius: 12, border: 'none', cursor: sending ? 'default' : 'pointer',
                background: primary, color: '#ffffff', fontWeight: 800, fontSize: '0.92rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: sending ? 0.7 : 1,
              }}
            >
              <Send size={17} />
              {sending ? t.sending : t.send}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/** "منذ ٣ دقائق" — وقت نسبي بالعربي */
function relTimeAr(at?: number | string | null): string {
  const t = typeof at === 'number' ? at : toMs(at);
  if (!t) return '';
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'الآن';
  if (min < 60) return min === 1 ? 'منذ دقيقة' : `منذ ${min} دقيقة`;
  const h = Math.floor(min / 60);
  if (h < 24) return h === 1 ? 'منذ ساعة' : `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'منذ يوم' : `منذ ${d} يوم`;
}

/** ورقة سفلية بشكل "التعليقات": مقبض سحب + عنوان "N تعليق" + قائمة + شريط كتابة */
function CommentsSheet({
  onClose,
  count,
  title,
  subtitle,
  scrollRef,
  footer,
  children,
}: {
  onClose: () => void;
  count: number;
  title?: string;
  subtitle?: React.ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement>;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const dragControls = useDragControls();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10360, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.5 }}
        onDragEnd={(_e: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
          if (info.offset.y > 110 || info.velocity.y > 600) onClose();
        }}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(100vw, 560px)', height: 'min(84vh, 780px)', background: '#ffffff',
          borderRadius: '22px 22px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.3)', direction: 'ltr', color: '#0f172a',
        }}
      >
        {/* مقبض السحب */}
        <div
          onPointerDown={e => dragControls.start(e)}
          style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center', cursor: 'grab', touchAction: 'none', flexShrink: 0 }}
        >
          <div style={{ width: 56, height: 5, borderRadius: 3, background: '#cbd5e1' }} />
        </div>

        {/* العنوان: ٣ تعليق */}
        <div style={{
          position: 'relative', textAlign: 'center', padding: '4px 44px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0,
        }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#475569' }}>
            {title ?? `${count.toLocaleString('ar-EG')} تعليق`}
          </p>
          {subtitle && <div style={{ marginTop: 3, fontSize: '0.68rem', color: '#94a3b8', direction: 'ltr' }}>{subtitle}</div>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ position: 'absolute', right: 12, top: 0, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 0', background: '#ffffff' }}>
          {children}
        </div>

        {footer}
      </motion.div>
    </motion.div>
  );
}

/** فقاعة قراءة رد الدعم — للقراءة فقط، وبجانب كل رسالة زر حذف */
function SupportRepliesBubble({
  open,
  onClose,
  replies,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  replies: SupportMsg[];
  onDelete: (id: string) => void;
}) {
  const isAr = (() => { try { return localStorage.getItem('lang') !== 'en'; } catch { return true; } })();
  const title = isAr ? 'رسالة من الدعم' : 'Message from support';
  const empty = isAr ? 'لا توجد رسائل من الدعم' : 'No messages from support';
  const orange = '#f97316';
  const fmt = (at: number) => {
    if (!at) return '';
    try { return new Date(at).toLocaleString(isAr ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }); } catch { return ''; }
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="support-replies-bubble"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 10350, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(94vw, 420px)', maxHeight: '80vh', overflowY: 'auto', background: '#ffffff',
              borderRadius: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', padding: '14px 16px 18px',
              direction: isAr ? 'rtl' : 'ltr', color: '#0f172a',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, direction: 'ltr', marginBottom: 12 }}>
              <img
                src={STOOORNA_APP_ICON}
                alt=""
                style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid #e2e8f0' }}
              />
              <span style={{ fontWeight: 900, fontSize: '1.05rem', color: orange }}>{title}</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{ marginInlineStart: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {replies.length === 0 ? (
              <p style={{ margin: '24px 0', textAlign: 'center', color: '#64748b', fontSize: '0.84rem' }}>{empty}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {replies.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
                    <div style={{
                      flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 14,
                      background: '#fff7ed', border: '1px solid #fdba74',
                      fontSize: '0.86rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#0f172a',
                      wordBreak: 'break-word',
                    }}>
                      {m.mediaUrl && m.mediaType === 'image' && (
                        <img src={m.mediaUrl} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: m.text ? 8 : 0, display: 'block' }} />
                      )}
                      {m.mediaUrl && m.mediaType === 'video' && (
                        <video src={m.mediaUrl} controls playsInline style={{ width: '100%', borderRadius: 10, marginBottom: m.text ? 8 : 0, display: 'block' }} />
                      )}
                      {m.mediaUrl && m.mediaType === 'file' && (
                        <a href={m.mediaUrl} target="_blank" rel="noreferrer" style={{ color: orange, fontSize: '0.8rem', display: 'block', marginBottom: m.text ? 6 : 0 }}>
                          📎 Attachment
                        </a>
                      )}
                      {m.text}
                      {!!m.at && (
                        <div style={{ marginTop: 6, fontSize: '0.66rem', color: '#9a6b3d', direction: 'ltr', textAlign: isAr ? 'right' : 'left' }}>{fmt(m.at)}</div>
                      )}
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      type="button"
                      title={isAr ? 'حذف' : 'Delete'}
                      aria-label={isAr ? 'حذف' : 'Delete'}
                      onClick={() => onDelete(m.id)}
                      style={{
                        width: 40, flexShrink: 0, borderRadius: 12, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                      }}
                    >
                      <Trash2 size={17} />
                    </motion.button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Owner support thread (Stooorna inbox → chat with a user) ─────────────────
function OwnerSupportThread({
  peer,
  onClose,
  currentUser,
}: {
  peer: {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    online?: boolean;
    lastIp?: string | null;
    country?: string | null;
    email?: string | null;
    lastMessage?: string | null;
    lastAt?: string | null;
  };
  onClose: () => void;
  currentUser: { id?: string; name?: string | null; username?: string | null; email?: string | null } | null;
}) {
  type Msg = { id: string; from: 'user' | 'support' | 'me'; text: string; at: number; mediaUrl?: string; mediaType?: string };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [taskDone, setTaskDone] = useState(false);
  const [sendError, setSendError] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [ttlLeft, setTtlLeft] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const displayName = peer.name || peer.username || 'User';
  // إيميل المستخدم: من بيانات المحادثة أو من سطر 📧 داخل رسالته
  const emailShown = peer.email || (() => {
    for (const m of messages) {
      const mm = /📧\s*([^\s@]+@[^\s@]+\.[^\s@]+)/.exec(m.text || '');
      if (mm) return mm[1];
    }
    return '';
  })();

  // Persist messages while thread is open (survive leave/re-enter until TTL)
  useEffect(() => {
    if (!messages.length) return;
    saveSupportThread(
      peer.id,
      messages.map(m => ({
        id: m.id,
        from: m.from,
        text: m.text,
        at: m.at,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
      })),
      taskDone && expiresAt ? { completedAt: expiresAt - SUPPORT_CHAT_TTL_MS } : undefined,
    );
  }, [messages, peer.id, taskDone, expiresAt]);

  // Countdown + auto wipe after 10 minutes
  useEffect(() => {
    const tick = () => {
      const stored = loadSupportThread(peer.id);
      if (stored?.expiresAt) {
        setExpiresAt(stored.expiresAt);
        const left = stored.expiresAt - Date.now();
        setTtlLeft(Math.max(0, left));
        if (left <= 0) {
          clearSupportThread(peer.id);
          setMessages([]);
          setTaskDone(false);
          setExpiresAt(null);
          setTtlLeft(null);
        }
      } else if (!taskDone) {
        // keep a rolling 10-min window from last activity when not completed
        setTtlLeft(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);

    // Listen for server-pushed clear event (owner marked task done)
    const onClear = (e: Event) => {
      const detail = (e as CustomEvent).detail as { cleared?: boolean; all?: boolean; targetUserId?: string | null };
      // For the user side: detail.all=true, no targetUserId
      // For the owner side: detail.targetUserId matches the peer we're chatting with
      const isForThisThread = detail?.cleared && (detail.all && !detail.targetUserId || detail.targetUserId === peer.id);
      if (isForThisThread) {
        clearSupportThread(peer.id);
        setMessages([]);
        setTaskDone(false);
        setExpiresAt(null);
        setTtlLeft(null);
      }
    };
    window.addEventListener('stooorna:support-thread', onClear);

    return () => {
      clearInterval(id);
      window.removeEventListener('stooorna:support-thread', onClear);
    };
  }, [peer.id, taskDone, messages.length]);

  useEffect(() => {
    let cancelled = false;

    // رسالة المستخدم الظاهرة في القائمة الخارجية — تظهر فوراً عند الدخول (بدون انتظار السيرفر)
    const seedMsg = (): Msg | null => {
      const t = String(peer.lastMessage || '').trim();
      if (!t) return null;
      return { id: `peer-last-${peer.id}`, from: 'user', text: t, at: toMs(peer.lastAt) || Date.now() };
    };
    const toMsg = (m: any): Msg => ({
      id: String(m.id ?? m._id ?? `${m.createdAt || m.at || ''}-${String(m.text || m.content || m.body || m.message || '').slice(0, 12)}`),
      from: (m.from === 'support' || m.from === 'agent' || m.fromUserId === currentUser?.id || m.senderId === currentUser?.id || m.me)
        ? 'me'
        : 'user',
      text: m.text || m.content || m.body || m.message || '',
      at: toMs(m.at) || toMs(m.createdAt) || toMs(m.sentAt) || Date.now(),
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
    });
    const mergeIn = (incoming: Msg[]) => {
      if (!incoming.length) return;
      setMessages(prev => {
        const byId = new Map<string, Msg>();
        const hasReal = incoming.some(x => !x.id.startsWith('peer-last-'));
        for (const x of [...prev, ...incoming]) {
          if (hasReal && x.id.startsWith('peer-last-')) continue; // الرسالة المؤقتة تُستبدل بالحقيقية
          byId.set(x.id, x);
        }
        // نفس الرسالة من التذكرة المحلية + السيرفر (معرّفات مختلفة) → تظهر مرة واحدة
        const uniqMsgs: Msg[] = [];
        for (const x of Array.from(byId.values()).sort((a, b) => a.at - b.at)) {
          const sigX = `${x.from}|${String(x.text || '').replace(/\s+/g, ' ').trim()}|${x.mediaUrl || ''}`;
          const dup = uniqMsgs.some(u => `${u.from}|${String(u.text || '').replace(/\s+/g, ' ').trim()}|${u.mediaUrl || ''}` === sigX && Math.abs(u.at - x.at) < 3 * 60 * 1000);
          if (!dup) uniqMsgs.push(x);
        }
        return uniqMsgs;
      });
    };

    // 1) فوراً: المحفوظ محلياً + رسالة القائمة
    const stored = loadSupportThread(peer.id);
    if (stored?.messages?.length) {
      mergeIn(stored.messages.map(m => ({
        id: m.id,
        from: (m.from === 'me' || m.from === 'support' || m.from === 'agent') ? 'me' as const : 'user' as const,
        text: m.text,
        at: m.at,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
      })));
      if (stored.completedAt) setTaskDone(true);
      if (stored.expiresAt) setExpiresAt(stored.expiresAt);
    }
    const seed = seedMsg();
    if (seed) mergeIn([seed]);
    // تذاكر المستخدم المحفوظة محلياً (نفس الجهاز)
    const localTickets = readLocalSupportTickets().filter(
      t => t.fromUserId === peer.id
        || (!!peer.username && t.fromUsername === peer.username)
        || (!!peer.email && t.fromEmail === peer.email),
    );
    if (localTickets.length) {
      mergeIn(localTickets.map(t => ({ id: String(t.id), from: 'user' as const, text: t.text, at: toMs(t.at) || Date.now(), mediaUrl: t.mediaUrl })));
    }

    // 2) ثم من السيرفر (يضيف الردود والرسائل الأحدث)
    async function load() {
      try {
        const endpoints = [
          `/api/messages?with=${encodeURIComponent(peer.id)}`,
          `/api/messages?userId=${encodeURIComponent(peer.id)}`,
          `/api/messages?peerId=${encodeURIComponent(peer.id)}`,
          `/api/support/messages?with=${encodeURIComponent(peer.id)}`,
        ];
        let list: any[] = [];
        for (const url of endpoints) {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) continue;
            const d = await r.json();
            list = Array.isArray(d) ? d : (d.messages || d.items || []);
            if (list.length) break;
          } catch { /* next */ }
        }
        if (cancelled || !list.length) return;
        const wipedAt = getSupportWipedAt(peer.id);
        const mapped = list.map(toMsg).filter(m => String(m.text || m.mediaUrl || '').length > 0);
        // التفريغ يخفي الأقدم فقط؛ ورسالة القائمة الحالية تبقى دائماً
        const fresh = wipedAt ? mapped.filter(m => m.at > wipedAt) : mapped;
        mergeIn(fresh);
      } catch { /* silent */ }
    }
    void load();
    const id = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer.id, peer.username, peer.lastMessage, currentUser?.id]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send(textOverride?: string, media?: { url: string; type: string }) {
    const text = (textOverride ?? input).trim();
    if (!text && !media) return;
    if (sending) return;
    setSending(true);
    const local: Msg = {
      id: `local-${Date.now()}`,
      from: 'me',
      text: text || (media?.type === 'image' ? '📷' : '📎'),
      at: Date.now(),
      mediaUrl: media?.url,
      mediaType: media?.type,
    };
    setMessages(prev => [...prev, local]);
    setInput('');
    // refresh TTL while conversation is active (unless already marked done)
    if (!taskDone) {
      saveSupportThread(
        peer.id,
        [...messages, local].map(m => ({ id: m.id, from: m.from, text: m.text, at: m.at, mediaUrl: m.mediaUrl, mediaType: m.mediaType })),
        { resetTtl: true },
      );
    }
    const body = text || (media?.type ? `[${media.type}]` : '');
    let delivered = false;
    let candidates0: string[] = [];
    try {
      // معرّف المستقبل الحقيقي: نحلّه من اليوزر أولاً (peer.id قد يكون مفتاح محلي وليس معرّف حساب)
      const candidates: string[] = [];
      if (peer.username) {
        const un = String(peer.username).replace(/^@/, '');
        for (const variant of Array.from(new Set([un, un.toLowerCase()]))) {
          try {
            const r = await fetch(`/api/users/by-username/${encodeURIComponent(variant)}`, { credentials: 'include' });
            if (!r.ok) continue;
            const d = await r.json();
            const rid = String(d.id || d.userId || d.user?.id || '');
            if (rid) { if (!candidates.includes(rid)) candidates.push(rid); break; }
          } catch { /* ignore */ }
        }
      }
      if (peer.id && !/^(user:|guest|cmt-|peer-last-)/.test(peer.id) && !candidates.includes(peer.id)) candidates.push(peer.id);

      candidates0 = candidates;
      for (const toUserId of candidates) {
        const ok = await sendRealChatMessage({
          toUserId,
          text: body,
          mediaUrl: media?.url,
          mediaType: media?.type,
          meta: { fromRole: 'support', isSupportReply: true },
        });
        if (ok) { delivered = true; break; }
      }

      // قنوات إضافية (لا تضر): API الدعم + قناة محلية لنفس المتصفح
      if (!delivered) {
        try {
          const r2 = await fetch('/api/support/messages', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: body, mediaUrl: media?.url, mediaType: media?.type,
              toUserId: candidates[0] || peer.id, toUsername: peer.username || null,
              from: 'support', isSupportReply: true,
            }),
          });
          if (r2.ok) delivered = true;
        } catch { /* ignore */ }
      }
      void fetch('/api/notifications', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'رد من الدعم', body, text: body, kind: 'support_reply',
          toUserId: candidates[0] || peer.id, toUsername: peer.username || null,
          mediaUrl: media?.url, mediaType: media?.type,
        }),
      }).catch(() => {});
      if (delivered) queueSupportReply({ toUserId: candidates[0] || peer.id, toUsername: peer.username || null, text: body, mediaUrl: media?.url, mediaType: media?.type });
    } catch { /* handled below */ }

    if (!delivered) {
      // السيرفر ما قبل الرسالة: توصل لنفس الجهاز فقط (قناة محلية) — ونوضّح ذلك بدل ما نخدع الدعم
      queueSupportReply({ toUserId: candidates0[0] || peer.id, toUsername: peer.username || null, text: body, mediaUrl: media?.url, mediaType: media?.type });
      const diag = lastSendDiag.slice(-6).join('\n');
      setSendError(
        (candidates0.length === 0
          ? 'تعذّر تحديد حساب المستخدم، فالرد وصل لهذا الجهاز فقط.'
          : 'السيرفر ما قبل الرد: وصل لهذا الجهاز فقط ولن يصل لأجهزة المستخدم.')
        + (diag ? '\n' + diag : ''),
      );
    } else {
      setSendError('');
    }
    setSending(false);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const mediaType = isImage ? 'image' : isVideo ? 'video' : 'file';
    let mediaUrl = '';
    try {
      const r = await fetch('/api/support/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (r.ok) {
        const d = await r.json();
        mediaUrl = d.url || d.mediaUrl || '';
      }
    } catch { /* */ }
    if (!mediaUrl) mediaUrl = URL.createObjectURL(file);
    await send('', { url: mediaUrl, type: mediaType });
  }

  const peerHandle = peer.username ? `@${String(peer.username).replace(/^@/, '')}` : displayName;
  const openPeerProfile = () => {
    // البروفايل الجديد (بث / منشورات) وليس صفحة /u/ القديمة
    const q = new URLSearchParams();
    q.set('openProfile', peer.id);
    if (peer.name) q.set('openProfileName', peer.name);
    if (peer.username) q.set('openProfileUsername', peer.username);
    if (peer.avatarUrl) q.set('openProfileAvatar', peer.avatarUrl);
    window.location.href = `/?${q.toString()}`;
  };
  const quickEmojis = ['❤️', '😊', '👍', '🙏', '🌹', '✅', '😂', '🔥'];

  const footer = (
    <div style={{ flexShrink: 0, background: '#ffffff', borderTop: '1px solid #e5e7eb' }}>
      {sendError && (
        <div dir="auto" style={{ padding: '8px 14px', background: '#fffbeb', borderBottom: '1px solid #fde68a', color: '#b45309', fontSize: '0.74rem', fontWeight: 700, textAlign: 'center', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflowY: 'auto' }}>
          {sendError}
        </div>
      )}
      {showEmoji && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {quickEmojis.map(em => (
            <button key={em} type="button" onClick={() => setInput(v => (v + em).slice(0, 2000))}
              style={{ background: '#f1f5f9', border: 'none', borderRadius: 10, fontSize: '1.25rem', padding: '4px 8px', cursor: 'pointer' }}>
              {em}
            </button>
          ))}
        </div>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}>
        <img src={STOOORNA_APP_ICON} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #e2e8f0' }} />
        <input ref={fileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.zip,.txt" style={{ display: 'none' }} onChange={onPickFile} />
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 0 14px',
          border: '1px solid #cbd5e1', borderRadius: 999, background: '#ffffff', minHeight: 46,
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value.slice(0, 2000))}
            placeholder={`الرد على ${peerHandle}...`}
            rows={1}
            dir="auto"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            style={{
              flex: 1, minWidth: 0, resize: 'none', maxHeight: 96, textAlign: 'left', padding: '12px 0', border: 'none', outline: 'none',
              background: 'transparent', color: '#0f172a', fontSize: '0.92rem', fontFamily: 'var(--font-sans)', lineHeight: 1.35,
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4, display: 'flex' }}>
            <Plus size={22} strokeWidth={2.2} />
          </button>
          <button type="button" onClick={() => setShowEmoji(v => !v)} aria-label="Emoji"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: showEmoji ? '#0a0a0a' : '#64748b', padding: 4, display: 'flex' }}>
            <Smile size={24} strokeWidth={2} />
          </button>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          type="button"
          disabled={sending || !input.trim()}
          onClick={() => send()}
          aria-label="Send"
          style={{
            width: 48, height: 48, borderRadius: '50%', flexShrink: 0, border: 'none',
            background: input.trim() ? '#0a0a0a' : '#e5e7eb',
            color: input.trim() ? '#ffffff' : '#94a3b8',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default',
          }}
        >
          <Send size={20} />
        </motion.button>
      </div>
    </div>
  );

  return (
    <CommentsSheet
      onClose={onClose}
      count={messages.length}
      scrollRef={listRef}
      footer={footer}
      subtitle={
        <>
          {emailShown ? `📧 ${emailShown}` : ''}
          {emailShown ? ' · ' : ''}
          {peer.online ? 'Online' : 'Offline'}
          {peer.lastIp ? ` · IP ${peer.lastIp}` : ''}
          {peer.country ? ` · ${peer.country}` : ''}
        </>
      }
    >
      {messages.length === 0 && (
        <p style={{ color: '#94a3b8', fontSize: '0.84rem', textAlign: 'center', marginTop: 48 }}>
          {settings.noMessages}
        </p>
      )}
      {messages.map(m => {
        const mine = m.from === 'me' || m.from === 'support';
        return (
          <div key={m.id} style={{
            display: 'flex', gap: 10, padding: '10px 14px', alignItems: 'flex-start',
            marginLeft: mine ? 44 : 0,
          }}>
            {mine ? (
              <img src={STOOORNA_APP_ICON} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #e2e8f0' }} />
            ) : (
              <button type="button" onClick={openPeerProfile} aria-label="Profile"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', background: '#e5e7eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0a0a', fontWeight: 700,
                }}>
                  {peer.avatarUrl
                    ? <img src={peer.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (displayName[0] || '?').toUpperCase()}
                </div>
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0a0a0a', direction: 'ltr' }}>
                  {mine ? '@Stooorna' : peerHandle}
                </span>
                {mine && (
                  <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#ffffff', background: '#0a0a0a', borderRadius: 6, padding: '1px 6px' }}>الدعم</span>
                )}
                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{relTimeAr(m.at)}</span>
              </div>
              <div dir="auto" style={{ marginTop: 4, fontSize: '0.92rem', lineHeight: 1.6, color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: 'left' }}>
                {m.mediaUrl && m.mediaType === 'image' && (
                  <img src={m.mediaUrl} alt="" style={{ width: '100%', maxWidth: 260, borderRadius: 12, marginBottom: m.text ? 8 : 0, display: 'block' }} />
                )}
                {m.mediaUrl && m.mediaType === 'video' && (
                  <video src={m.mediaUrl} controls playsInline style={{ width: '100%', maxWidth: 260, borderRadius: 12, marginBottom: m.text ? 8 : 0, display: 'block' }} />
                )}
                {m.mediaUrl && m.mediaType === 'file' && (
                  <a href={m.mediaUrl} target="_blank" rel="noreferrer" style={{ color: '#0a0a0a', fontSize: '0.84rem', display: 'block', marginBottom: m.text ? 6 : 0 }}>
                    📎 Attachment
                  </a>
                )}
                {stripSupportHeader(m.text) || m.text}
              </div>
            </div>
          </div>
        );
      })}
    </CommentsSheet>
  );
}

// ─── Auth screen (shown when not logged in) ───────────────────────────────────
function AuthScreen({ T }: { T: Record<string, string> }) {
  type AuthMode = 'login' | 'register';
  type AccountKind = 'personal' | 'company';
  // AuthLang imported from @/lib/auth-copy
  const [mode, setMode] = useState<AuthMode>('login');
    // تحرير اليوزرات المحذوفة سابقاً (مرة واحدة) لإعادة التسجيل
  useEffect(() => {
    try {
      ensureDeletedUsersResetOnce();
      clearAllDeletedUsers();
      localStorage.removeItem('stooorna_deleted_users');
    } catch { /* */ }
  }, []);

  const [accountKind, setAccountKind] = useState<AccountKind>('personal');
  /** لغة شاشة الدخول/التسجيل فقط (عربي افتراضي — إنجليزي اختياري) */
  const [authLang, setAuthLang] = useState<AuthLang>(() => {
    try {
      const s = localStorage.getItem('stooorna_auth_lang');
      return s === 'en' ? 'en' : 'ar';
    } catch { return 'ar'; }
  });
  function setAuthLanguage(next: AuthLang) {
    setAuthLang(next);
    try { localStorage.setItem('stooorna_auth_lang', next); } catch { /* */ }
  }
  const formLang: AuthLang = mode === 'register' ? 'en' : authLang;
  const L = getAuthCopy(formLang);
  const isEn = formLang === 'en';
  const dir = isEn ? 'ltr' : 'rtl';

  // Personal fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Company registration fields
  const [companyName, setCompanyName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [licenseNumber] = useState('');
  const [tradeLicenseNumber] = useState('');
  const [commercialRegFile, setCommercialRegFile] = useState<{ dataUrl: string; name: string } | null>(null);
  const [tradeLicenseFile, setTradeLicenseFile] = useState<{ dataUrl: string; name: string } | null>(null);
  // حالة فحص الشهادتين بالذكاء الاصطناعي: idle (لم يُرفع شيء بعد) | checking (جاري الفحص) | valid (تم التحقق ومطابقة الرقم) | invalid (شهادة غير صحيحة أو لا تطابق الرقم)
  const [commercialRegVerify, setCommercialRegVerify] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [tradeLicenseVerify, setTradeLicenseVerify] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  // السبب الفعلي المُرجَع من السيرفر عند الرفض — يُعرض تحت الحقل مباشرة بدل نص عام ثابت،
  // حتى يبين سبب الرفض الحقيقي (مثلاً: خطأ سيرفر، مفتاح API غير مركّب، أو عدم تطابق فعلي)
  const [commercialRegVerifyMessage, setCommercialRegVerifyMessage] = useState('');
  const [tradeLicenseVerifyMessage, setTradeLicenseVerifyMessage] = useState('');
  // AI-extracted fields shown under each certificate after verification
  const [companySector, setCompanySector] = useState('');
  const [companySectorCustom, setCompanySectorCustom] = useState('');
  const [sectorOpen, setSectorOpen] = useState(false);
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyPhone2, setCompanyPhone2] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [signupDial, setSignupDial] = useState('+965');
  const [signupPhone, setSignupPhone] = useState('');
  const [dialOpen, setDialOpen] = useState(false);
  const [dialQuery, setDialQuery] = useState('');
  const [forgotPhoneMask, setForgotPhoneMask] = useState('');
  const [forgotPhoneInput, setForgotPhoneInput] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companyPendingMsg, setCompanyPendingMsg] = useState('');
  const [forgotStep, setForgotStep] = useState<'hidden' | 'email' | 'icon' | 'reset' | 'done'>('hidden');
  const [forgotToken, setForgotToken] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotPw1, setForgotPw1] = useState('');
  const [forgotPw2, setForgotPw2] = useState('');
  useEffect(() => {
    try {
      const token = new URLSearchParams(window.location.search).get('forgot');
      if (token) { setForgotToken(token); setForgotStep('reset'); }
    } catch { /* */ }
  }, []);
  useEffect(() => {
    if (forgotStep !== 'done') return;
    const t = window.setTimeout(() => {
      setForgotStep('hidden');
      setForgotMsg('');
      setForgotPw1('');
      setForgotPw2('');
      setForgotToken('');
    }, 1600);
    return () => window.clearTimeout(t);
  }, [forgotStep]);

  function resetFormErrors() {
    setError('');
    setCompanyPendingMsg('');
  }

  // إذا غيّر المستخدم رقم السجل التجاري بعد أن فحصنا الشهادة، لازم يعيد الرفع/الفحص من جديد
  useEffect(() => {
    if (commercialRegVerify !== 'idle') {
      setCommercialRegVerify('idle');
      setCommercialRegFile(null);
      setCommercialRegVerifyMessage('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenseNumber]);

  // نفس الشيء لرقم الترخيص التجاري
  useEffect(() => {
    if (tradeLicenseVerify !== 'idle') {
      setTradeLicenseVerify('idle');
      setTradeLicenseFile(null);
      setTradeLicenseVerifyMessage('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeLicenseNumber]);

  /**
   * يرفع الشهادة (سجل تجاري أو ترخيص تجاري) لخدمة الفحص بالذكاء الاصطناعي بالسيرفر،
   * ويتأكد أنها شهادة فعلية وأن الرقم المكتوب فيها يطابق الرقم الذي أدخله المستخدم.
   * الفحص الفعلي (قراءة الشهادة بالـ AI) يتم في السيرفر عبر /api/company/verify-certificate.
   */
  async function verifyCertificateFile(
    file: File,
    _documentType: 'commercial_registry' | 'trade_license',
    _expectedNumber: string,
  ): Promise<{
    valid: boolean;
    dataUrl: string;
    message?: string;
    extractedNumber?: string | null;
    extractedExpiryDate?: string | null;
    isExpired?: boolean;
    numbersMatch?: boolean;
    isCertificate?: boolean;
  }> {
    // Manual review flow: accept upload locally. Owner reviews certificates in settings.
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target?.result as string);
      reader.onerror = () => reject(new Error('file-read-failed'));
      reader.readAsDataURL(file);
    });
    const maxBytes = 12 * 1024 * 1024;
    if (dataUrl.length > maxBytes) {
      return {
        valid: false,
        dataUrl,
        message: authLang === 'en' ? 'File is too large' : 'الملف كبير جداً',
      };
    }
    const okType = file.type.startsWith('image/') || file.type === 'application/pdf' || /\.(png|jpe?g|gif|webp|pdf)$/i.test(file.name);
    if (!okType) {
      return {
        valid: false,
        dataUrl,
        message: authLang === 'en' ? 'Only image or PDF is accepted' : 'يُقبل صورة أو PDF فقط',
      };
    }
    return {
      valid: true,
      dataUrl,
      isCertificate: true,
      numbersMatch: true,
      isExpired: false,
      extractedNumber: null,
      extractedExpiryDate: null,
    };
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    resetFormErrors();
    setConfirmPassword('');
    setConfirmEmail('');
    setUsernameStatus('idle');
    if (next === 'login') setAccountKind('personal');
  }

  function switchKind(next: AccountKind) {
    setAccountKind(next);
    resetFormErrors();
    setConfirmPassword('');
    setConfirmEmail('');
    setUsernameStatus('idle');
  }

  /** Username availability: the server is the single source of truth. */
  const usernameSrc = useRef('');
  async function checkUsernameAvailable(raw: string): Promise<'available' | 'taken' | 'invalid'> {
    const u = raw.trim().replace(/^@/, '');
    if (!u || !/^[a-zA-Z0-9_]{2,30}$/.test(u)) { usernameSrc.current = 'format'; return 'invalid'; }
    if (isUsernameFreed(u) || isUserDeleted({ username: u })) { usernameSrc.current = 'freed'; return 'available'; }
    try {
      const chk = await fetch(`/api/users/check-username?username=${encodeURIComponent(u)}`, { credentials: 'include' });
      if (chk.ok) {
        const d = await chk.json();
        if (d && d.available === false) { usernameSrc.current = 'server'; return 'taken'; }
        if (d && d.available === true) { usernameSrc.current = 'server'; return 'available'; }
      }
    } catch { /* server unreachable */ }
    // Server did not answer: do not block sign-up on weak local guesses - sign-up itself enforces uniqueness.
    usernameSrc.current = 'fallback';
    return 'available';
  }

  // debounce تحقق اليوزر أثناء الكتابة
  useEffect(() => {
    if (mode !== 'register') {
      setUsernameStatus('idle');
      return;
    }
    const u = username.trim().replace(/^@/, '');
    if (!u) {
      setUsernameStatus('idle');
      return;
    }
    if (!/^[a-zA-Z0-9_]{2,30}$/.test(u)) {
      setUsernameStatus('invalid');
      return;
    }
    setUsernameStatus('checking');
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const st = await checkUsernameAvailable(u);
      if (!cancelled) setUsernameStatus(st);
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [username, mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const rawId = email.trim().replace(/^@/, '');
    if (!rawId || !password) {
      setError(L.enterEmailPw);
      return;
    }
    // الدخول والتسجيل: البريد الإلكتروني فقط — لا موبايل
    if (!rawId.includes('@') || isPhoneIdentifier(rawId)) {
      setError(authLang === 'en'
        ? 'Enter a valid email address'
        : 'أدخل بريداً إلكترونياً صالحاً');
      return;
    }
    const resolved = resolveAuthEmailFromIdentifier(rawId);
    if (!resolved || !resolved.includes('@') || isPhoneIdentifier(rawId)) {
      setError(authLang === 'en'
        ? 'Enter a valid email address'
        : 'أدخل بريداً إلكترونياً صالحاً');
      return;
    }
    const em = resolved;
    const usedPhone = false; // mobile login/signup disabled
    if (!em || !password) {
      setError(L.enterEmailPw);
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError(L.pwMismatch);
        return;
      }
      if (password.length < 8) {
        setError(L.pwShort);
        return;
      }
      if (em !== confirmEmail.trim().toLowerCase()) {
        setError('Email and confirm email do not match');
        return;
      }
      if (!isCompany) {
        const national = signupPhone.replace(/\D/g, '');
        if (national.length < 6) {
          setError(L.needPhone);
          return;
        }
      }
      // اليوزرنيم مطلوب للأفراد والشركات عند التسجيل
      {
        const uname = username.trim().replace(/^@/, '');
        if (!uname) {
          setError(L.needUsername);
          return;
        }
        if (!/^[a-zA-Z0-9_]{2,30}$/.test(uname)) {
          setError(L.userFmt);
          return;
        }
        const unStatus = await checkUsernameAvailable(uname);
        if (unStatus === 'taken') {
          setError(`${L.userTaken} [${usernameSrc.current}]`);
          setUsernameStatus('taken');
          return;
        }
        if (unStatus === 'invalid') {
          setError(L.userFmt);
          setUsernameStatus('invalid');
          return;
        }
      }

      // Email must not already be registered (checked on the server, case-insensitive)
      try {
        const ec = await fetch(`/api/users/check-username?email=${encodeURIComponent(em)}`, { credentials: 'include' });
        if (ec.ok) {
          const ed = await ec.json();
          if (ed && ed.emailAvailable === false) {
            setError('This email is already registered. Sign in instead.');
            return;
          }
        }
      } catch { /* server check unavailable - let sign-up decide */ }

      if (accountKind === 'company') {
        if (!companyName.trim()) {
          setError(L.needCompanyName);
          return;
        }
        if (!tradeName.trim()) {
          setError(L.needTradeName);
          return;
        }
        if (!ownerName.trim()) {
          setError(L.needOwnerName);
          return;
        }
        if (commercialRegVerify === 'checking' || tradeLicenseVerify === 'checking') {
          setError(authLang === 'en' ? 'Please wait until certificates finish uploading' : 'انتظر حتى ينتهي رفع الشهادات');
          return;
        }
        if (!commercialRegFile || commercialRegVerify !== 'valid') {
          setError(authLang === 'en'
            ? 'Please upload the commercial registration certificate'
            : 'يجب رفع شهادة السجل التجاري لإتمام التسجيل');
          return;
        }
        if (!tradeLicenseFile || tradeLicenseVerify !== 'valid') {
          setError(authLang === 'en'
            ? 'Please upload the trade license certificate'
            : 'يجب رفع شهادة الترخيص التجاري لإتمام التسجيل');
          return;
        }
        if (!companySector.trim() && !companySectorCustom.trim()) {
          setError(L.needSector);
          return;
        }
        const phoneNorm = companyPhone.replace(/[\s\-()]/g, '').trim();
        if (!phoneNorm) {
          setError(L.needPhone);
          return;
        }
        if (!/^\+?[0-9]{8,15}$/.test(phoneNorm)) {
          setError('رقم الهاتف غير صالح — أدخل رقماً صحيحاً (8–15 رقماً)');
          return;
        }
        if (companyPhone2.trim()) {
          const altNorm = companyPhone2.replace(/[\s\-()]/g, '').trim();
          if (altNorm && !/^\+?[0-9]{8,15}$/.test(altNorm)) {
            setError('رقم الهاتف البديل غير صالح');
            return;
          }
        }
        if (em !== confirmEmail.trim().toLowerCase()) {
          setError('Email and confirm email do not match');
          return;
        }
      } else {
        if (!name.trim()) {
          setError(L.needName);
          return;
        }
      }
    }

    setLoading(true);
    try {
      // تم إلغاء حظر اليوزرات المحذوفة — يمكن إعادة إنشاء الحساب بنفس اليوزر/الإيميل
      try { ensureDeletedUsersResetOnce(); } catch { /* */ }
      if (mode === 'login') {
        const reg = findCompanyByEmail(em);
        // دخول موحّد: إيميل شركة → مسار الشركات، وإلا أفراد
        const treatAsCompany = !!reg || accountKind === 'company';

        // ── Company account login ──
        if (treatAsCompany) {
          let companyReg = reg;
          const remembered = getRememberedCompanyStatus(em);
          if (remembered === 'active' || companyReg?.status === 'active') {
            try { restoreDeletedUser({ id: companyReg?.userId || companyReg?.id, email: em, username: companyReg?.username }); } catch { /* */ }
            companyReg = findCompanyByEmail(em) || companyReg;
          }
          const remote = await fetchCompanyStatusFromServer(em);
          // Priority: any "active" wins; then local remembered; then remote; then registry.
          // Never let a stale remote "pending" override a local admin Approve.
          let resolved: CompanyRegStatus | null = null;
          const sources: Array<CompanyRegStatus | null | undefined> = [
            remembered,
            companyReg?.status,
            remote,
          ];
          if (sources.some(s => s === 'active')) resolved = 'active';
          else if (sources.some(s => s === 'inactive')) resolved = 'inactive';
          else if (remembered) resolved = remembered;
          else if (companyReg?.status) resolved = companyReg.status;
          else if (remote) resolved = remote;

          if (companyReg && resolved && companyReg.status !== resolved) {
            setCompanyRegStatus(companyReg.id, resolved);
            companyReg = { ...companyReg, status: resolved };
          }
          if (!companyReg && resolved === 'active') {
            companyReg = {
              id: `co-${em}`,
              companyName: em,
              tradeName: '',
              ownerName: '',
              licenseNumber: '',
              phone: '',
              email: em,
              status: 'active',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            upsertCompanyRegistration(companyReg);
          }
          if (!companyReg) {
            const tryRemote = await signIn.email({ email: em, password });
            if (!(tryRemote as { error?: unknown })?.error) {
              rememberCompanyActivation(em, 'active');
              try { setSessionAccountKind('company'); } catch { /* */ }
              setLoading(false);
              return;
            }
            setError(
              'هذا الحساب ليس حساب شركة. سجّل الدخول من قسم الأفراد.',
            );
            setLoading(false);
            return;
          }
          if (companyReg.status === 'pending') {
            // Owner may have approved on another device — try real auth first
            const tryPending = await signIn.email({ email: em, password });
            if (!(tryPending as { error?: unknown })?.error) {
              setCompanyRegStatus(companyReg.id, 'active');
              rememberCompanyActivation(em, 'active');
              try { setSessionAccountKind('company'); } catch { /* */ }
              setLoading(false);
              return;
            }
            // Also try stored password from registration
            if (companyReg.password && companyReg.password !== password) {
              const tryStored = await signIn.email({ email: em, password: companyReg.password });
              if (!(tryStored as { error?: unknown })?.error) {
                setCompanyRegStatus(companyReg.id, 'active');
                rememberCompanyActivation(em, 'active');
                try { setSessionAccountKind('company'); } catch { /* */ }
                setLoading(false);
                return;
              }
            }
            setError('طلبكم قيد المراجعة — سوف يتم الاتصال بكم قريباً');
            setCompanyPendingMsg('سوف يتم الاتصال بكم قريباً');
            setLoading(false);
            return;
          }
          if (companyReg.status === 'inactive') {
            setError('حساب الشركة غير مفعّل — تواصل مع الإدارة');
            setLoading(false);
            return;
          }
          // active: sign in, or create auth user then sign in
          if (companyReg.status === 'active') {
            const regRow = companyReg;
            // Approved companies must never stay soft-deleted
            try { restoreDeletedUser({ id: regRow.userId || regRow.id, email: em, username: regRow.username }); } catch { /* */ }
            rememberCompanyActivation(em, 'active');
            try { await pushCompanyStatusToServer({ ...regRow, status: 'active' }, 'active'); } catch { /* */ }
            const notice = getCompanyNotice(em);
            if (notice) setCompanyPendingMsg(notice);
            const pwCandidates = Array.from(new Set(
              [password, regRow.password].filter((p): p is string => !!p && String(p).length > 0).map(String)
            ));
            if (pwCandidates.length === 0 && password) pwCandidates.push(password);
            try {
              const finishOk = async () => {
                rememberCompanyActivation(em, 'active');
                try { setSessionAccountKind('company'); } catch { /* */ }
                setError('');
                setCompanyPendingMsg('');
                setLoading(false);
              };
              // 1) Try sign-in with each known password
              for (const pw of pwCandidates) {
                const trySignIn = await signIn.email({ email: em, password: pw });
                if (!(trySignIn as { error?: unknown })?.error) {
                  await finishOk();
                  return;
                }
              }
              // 2) Create auth account then sign in (first login after Approve)
              const displayName = regRow.companyName || regRow.ownerName || em;
              const pwForCreate = pwCandidates[0] || password || `Co${Date.now().toString(36)}A1`;
              // Persist password used so later logins work on this device
              try {
                upsertCompanyRegistration({ ...regRow, password: pwForCreate, status: 'active' });
              } catch { /* */ }
              const up = await signUp.email({
                name: displayName,
                email: em,
                password: pwForCreate,
                ...({ username: (regRow.username || '').replace(/^@/, '') || undefined } as any),
              } as any);
              if (!(up as { error?: unknown })?.error) {
                const after = await signIn.email({ email: em, password: pwForCreate });
                if (!(after as { error?: unknown })?.error) {
                  await finishOk();
                  return;
                }
              }
              // 3) Existing account — retry passwords + force provision helper
              for (const pw of pwCandidates) {
                const res2 = await signIn.email({ email: em, password: pw });
                if (!(res2 as { error?: unknown })?.error) {
                  await finishOk();
                  return;
                }
              }
              try {
                await provisionCompanyAuthAccount({ ...regRow, password: pwForCreate, status: 'active' });
                const res3 = await signIn.email({ email: em, password: pwForCreate });
                if (!(res3 as { error?: unknown })?.error) {
                  await finishOk();
                  return;
                }
              } catch { /* */ }
              // 4) Last resort: sign in with the password the user typed now
              if (password) {
                const res4 = await signIn.email({ email: em, password });
                if (!(res4 as { error?: unknown })?.error) {
                  await finishOk();
                  return;
                }
              }
              setError(
                (up as { error?: { message?: string } })?.error?.message
                || 'Login failed — use the same password from company registration'
              );
              setLoading(false);
              return;
            } catch (err) {
              setError(String(err));
              setLoading(false);
              return;
            }
          }
        }

        // ── دخول أفراد عادي (بريد أو موبايل) ──
        const res = await signIn.email({ email: em, password });
        if ((res as { error?: { message?: string } })?.error) {
          setError((res as { error?: { message?: string } }).error?.message || 'فشل تسجيل الدخول');
        } else if (accountKind === 'personal') {
          try { setSessionAccountKind('personal'); } catch { /* */ }
          if (usedPhone) {
            try { rememberPhoneAuth(rawId, em); } catch { /* */ }
          }
          // تحقق إضافي من السيرفر: إن كان الحساب شركة أخرج وأظهر تنبيهاً
          try {
            const me = await fetch('/api/users/me', { credentials: 'include' });
            if (me.ok) {
              const d = await me.json();
              const u = d.user || d;
              const isCo =
                String(u.accountType || u.type || u.role || '').toLowerCase() === 'company' ||
                u.isCompany === true ||
                !!findCompanyByEmail(em);
              if (isCo || findCompanyByEmail(em)) {
                try { await signOut(); } catch { /* ignore */ }
                setError(
                  'هذا الحساب خاص بالشركات وليس للأفراد. يرجى المحاولة وتسجيل الدخول من قسم الشركات.',
                );
                setCompanyPendingMsg(
                  'حساب شركات — استخدم تبويب «شركات» لتسجيل الدخول',
                );
              }
            }
          } catch { /* ignore */ }
        }
      } else if (accountKind === 'personal') {
        if (findCompanyByEmail(em)) {
          setError(
            'هذا البريد مسجّل كحساب شركة. يرجى استخدام قسم الشركات.',
          );
          setCompanyPendingMsg(
            'حساب شركات — استخدم تبويب «شركات»',
          );
          setLoading(false);
          return;
        }
        const uname = username.trim().replace(/^@/, '');
        let res: any = await signUp.email({
          name: name.trim(),
          email: em,
          password,
          // some better-auth builds accept extra fields
          ...( { username: uname } as any ),
        } as any);
        // The server already confirmed the username is free. If the auth layer still rejects it
        // as a username error, create the account without it; the username is saved right after
        // through PATCH /api/users/me (below).
        if (res?.error && /username|user name|handle/i.test(String(res.error.message || ''))) {
          res = await signUp.email({ name: name.trim(), email: em, password } as any);
        }
        if (!(res as { error?: { message?: string } })?.error) {
          try { setSessionAccountKind('personal'); } catch { /* */ }
          if (usedPhone) {
            try { rememberPhoneAuth(rawId, em); } catch { /* */ }
          }
        }
        if ((res as { error?: { message?: string } })?.error) {
          const msg = (res as { error?: { message?: string } }).error?.message || 'Could not create the account';
          // Classify the server error: an existing EMAIL must not be reported as a taken USERNAME.
          if (/username|user name|handle/i.test(msg)) {
            setError(`${L.userTaken} [signup: ${msg}]`);
            setUsernameStatus('taken');
          } else if (/email|already|exists|registered|duplicate|taken/i.test(msg)) {
            setError('This email is already registered. Sign in instead.');
          } else {
            setError(msg);
          }
        } else {
          // Persist username immediately so Settings profile shows it without re-entry
          try {
            localStorage.setItem('stooorna_pending_username', uname);
            localStorage.setItem(`stooorna_username_${em}`, uname);
            if (!isCompany) {
              const fullPhone = `${signupDial}${signupPhone.replace(/\D/g, '')}`;
              localStorage.setItem(`stooorna_phone_${em}`, fullPhone);
              try {
                const bind = await fetch('/api/password/phone-bind', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, phone: fullPhone }) });
                const bindData = await bind.json().catch(() => ({} as any));
                if (!bind.ok && (bind.status === 409 || bindData.error === 'phone_taken')) { setError('This mobile number is already used on another account'); return; }
                await fetch('/api/users/me/phone', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: fullPhone }) });
              } catch { /* phone retry stays in settings if the route is late */ }
            }
            if (usedPhone) rememberPhoneAuth(rawId, em);
          } catch { /* ignore */ }
          try {
            await signIn.email({ email: em, password });
          } catch { /* already signed in */ }
          const patchUsername = async () => {
            try {
              const r = await fetch('/api/users/me', {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: uname }),
              });
              return r.ok;
            } catch {
              return false;
            }
          };
          if (!(await patchUsername())) {
            await new Promise(r => setTimeout(r, 400));
            await patchUsername();
          }
        }
      } else {
        // Company signup: طلب تسجيل فقط — لا دخول مباشر حتى يوافق @Stooorna
        const existing = findCompanyByEmail(em);
        if (existing && existing.status === 'pending') {
          setError('طلبكم قيد المراجعة — سوف يتم الاتصال بكم قريباً');
          setCompanyPendingMsg('سوف يتم الاتصال بكم قريباً');
          return;
        }
        if (existing && existing.status === 'inactive') {
          setError('حساب الشركة معطّل — تواصل مع الدعم');
          return;
        }
        if (existing && existing.status === 'active') {
          setError('الشركة مفعّلة مسبقاً — سجّل الدخول من تبويب الدخول');
          return;
        }

        const companyPayload: CompanyRegistration = {
          id: `co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          companyName: companyName.trim(),
          tradeName: tradeName.trim(),
          ownerName: ownerName.trim(),
          licenseNumber: licenseNumber.trim(),
          tradeLicenseNumber: tradeLicenseNumber.trim(),
          commercialRegCert: commercialRegFile?.dataUrl,
          commercialRegCertName: commercialRegFile?.name,
          tradeLicenseCert: tradeLicenseFile?.dataUrl,
          tradeLicenseCertName: tradeLicenseFile?.name,
          sector: companySector.trim() || 'other',
          sectorCustom: companySectorCustom.trim() || undefined,
          phone: companyPhone.replace(/[\s\-()]/g, '').trim(),
          phoneAlt: companyPhone2.trim() ? companyPhone2.replace(/[\s\-()]/g, '').trim() : undefined,
          email: em,
          username: username.trim().replace(/^@/, ''),
          password, // مؤقت حتى الموافقة وإنشاء الحساب
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          userId: null,
          approvedAt: null,
          approvedBy: null,
        };

        try {
          const freed = loadFreedUsernames().filter(x => x !== String(companyPayload.username || '').toLowerCase());
          localStorage.setItem(FREED_USERNAMES_KEY, JSON.stringify(freed));
        } catch { /* */ }
        upsertCompanyRegistration(companyPayload);
        try { setSessionAccountKind('company'); } catch { /* */ }
        try {
          localStorage.setItem('stooorna_company_profile', JSON.stringify({ ...companyPayload, at: Date.now() }));
          localStorage.setItem('stooorna_company_last_request', JSON.stringify(companyPayload));
        } catch { /* ignore */ }
        try {
          window.dispatchEvent(new CustomEvent('stooorna:company-register-request', { detail: companyPayload }));
          window.dispatchEvent(new CustomEvent('stooorna:companies-registry', { detail: loadCompaniesRegistry() }));
        } catch { /* ignore */ }

        // إشعار السيرفر + صندوق طلبات الأونر إن وُجد — بدون تسجيل دخول المستخدم
        const endpoints = [
          '/api/company/register',
          '/api/companies/register',
          '/api/auth/company-signup',
          '/api/owner/company-requests',
          '/api/owner/companies',
          '/api/support/company-requests',
          '/api/companies/pending',
        ];
        for (const url of endpoints) {
          try {
            const r = await fetch(url, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...companyPayload, accountType: 'company', status: 'pending', username: companyPayload.username }),
            });
            if (r.ok || r.status === 201) break;
          } catch { /* try next */ }
        }

        // لا نستدعي signUp هنا — الحساب يُنشأ بعد موافقة الأدمن أو عند أول دخول بعد التفعيل
        setCompanyPendingMsg('سوف يتم الاتصال بكم قريباً');
        setError('');
        setPassword('');
        setConfirmPassword('');
        setConfirmEmail('');
        return;
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const btnFg = 'hsl(var(--primary-foreground))';
  const isCompany = false; // company signup disabled — regular users only
  const isRegister = mode === 'register';

  // CSS helper — not content, just a style shorthand
  function fieldCss(overrides?: React.CSSProperties): React.CSSProperties {
    return {
      width: '100%',
      background: T.surface,
      border: `1px solid ${T.surfaceBorder}`,
      borderRadius: 12,
      padding: '12px 14px 12px 40px',
      color: T.text,
      fontSize: 14,
      outline: 'none',
      boxSizing: 'border-box',
      ...overrides,
    };
  }

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '24px 16px' }} dir={dir}>
      {/* لغة شاشة الدخول — عربي / English */}
      <div style={{
        position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 14, zIndex: 5,
        display: 'flex', borderRadius: 10, overflow: 'hidden',
        border: `1px solid ${T.primaryBorder}`,
        background: T.surface,
      }}>
        {!isRegister && <button type="button" onClick={() => setAuthLanguage('ar')} style={{
          padding: '7px 12px', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12,
          background: !isEn ? T.primaryFaint : 'transparent',
          color: !isEn ? T.primary : T.primaryDim,
        }}>عربي</button>}
        <button type="button" onClick={() => setAuthLanguage('en')} style={{
          padding: '7px 12px', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12,
          background: isEn ? T.primaryFaint : 'transparent',
          color: isEn ? T.primary : T.primaryDim,
          borderLeft: `1px solid ${T.primaryBorder}`,
        }}>EN</button>
      </div>

      <div style={{
        width: 80, height: 80, borderRadius: '50%', overflow: 'hidden',
        marginBottom: 20, flexShrink: 0,
        boxShadow: `0 0 28px ${T.primaryFaint}`,
        // App icon: pre-cropped square centred on the ring, so it fills the circle exactly.
        // (the old logo url is kept as a fallback layer underneath)
        backgroundImage: `url(${STOOORNA_APP_ICON}), url(/airo-assets/images/logo/horizontal)`,
        backgroundSize: '100% 100%, cover',
        backgroundPosition: 'center center, center center',
        backgroundRepeat: 'no-repeat, no-repeat',
        backgroundColor: '#1a2426',
      }} />
      <div style={{ textAlign: 'center', marginBottom: 16, width: '100%', maxWidth: 360 }}>
        <p style={{
          margin: 0,
          color: T.text,
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1.45,
          direction: dir,
        }}>
          {isRegister
            ? L.joinNow
            : L.welcomeBack}
        </p>
        <p style={{
          margin: '4px 0 0',
          color: T.primary,
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: '0.04em',
          lineHeight: 1.2,
        }}>
          Stooorna
        </p>
        <p style={{
          margin: '8px 0 0',
          color: T.primaryDim,
          fontSize: 13,
          fontWeight: 600,
        }}>
          {isRegister ? L.createAccount : L.login}
        </p>
      </div>

      {/* Company account toggle disabled — all signups are regular users */}
      {false && isRegister && (
        <button
          type="button"
          onClick={() => switchKind(isCompany ? 'personal' : 'company')}
          style={{
            width: '100%', maxWidth: 360, marginBottom: 14, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
            background: isCompany ? 'rgba(0,188,212,0.12)' : T.surface,
            border: `1.5px solid ${isCompany ? T.primary : T.surfaceBorder}`,
            color: T.text, textAlign: isEn ? 'left' : 'right', direction: dir,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Building2 size={18} color={isCompany ? T.primary : T.primaryDim} />
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: isCompany ? T.primary : T.text }}>{L.companyToggle}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: T.primaryDim }}>{L.companyToggleHint}</p>
            </div>
          </div>
          <span aria-hidden style={{
            width: 48, height: 28, borderRadius: 999, flexShrink: 0, position: 'relative',
            background: isCompany ? T.primary : 'rgba(150,190,190,0.25)',
            transition: 'background 0.2s',
          }}>
            <span style={{
              position: 'absolute', top: 3, width: 22, height: 22, borderRadius: '50%',
              background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
              left: isCompany ? 23 : 3, transition: 'left 0.2s',
            }} />
          </span>
        </button>
      )}

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ── Company registration fields ── */}
        {isRegister && isCompany && (
          <>
            <div style={{ position: 'relative' }}>
              <Building2 size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="text" placeholder={L.companyName} value={companyName} onChange={e => setCompanyName(e.target.value)} required
                style={fieldCss()} />
            </div>
            <div style={{ position: 'relative' }}>
              <Briefcase size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="text" placeholder={L.tradeName} value={tradeName} onChange={e => setTradeName(e.target.value)} required
                style={fieldCss()} />
            </div>
            <div style={{ position: 'relative' }}>
              <User size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="text" placeholder={L.ownerName} value={ownerName} onChange={e => setOwnerName(e.target.value)} required
                style={fieldCss()} />
            </div>
            <div style={{ position: 'relative' }}>
              <AtSign size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder={L.username}
                value={username}
                onChange={e => setUsername(e.target.value.replace(/\s/g, ''))}
                required
                autoCapitalize="none"
                autoCorrect="off"
                style={{
                  ...fieldCss(),
                  direction: 'ltr',
                  border: `1px solid ${
                    usernameStatus === 'taken' ? 'hsl(var(--destructive))'
                    : usernameStatus === 'available' ? 'rgba(34,197,94,0.55)'
                    : T.surfaceBorder
                  }`,
                }}
                dir="ltr"
              />
            </div>
            {username.trim() && (
              <p style={{
                margin: '-6px 0 0', fontSize: 12, fontWeight: 700, textAlign: 'center',
                color: usernameStatus === 'available' ? '#22c55e'
                  : usernameStatus === 'taken' ? 'hsl(var(--destructive))'
                  : usernameStatus === 'invalid' ? '#eab308'
                  : usernameStatus === 'checking' ? T.primaryDim
                  : 'transparent',
              }}>
                {usernameStatus === 'checking' && L.checkingUser}
                {usernameStatus === 'available' && L.userAvailable}
                {usernameStatus === 'taken' && L.userTaken}
                {usernameStatus === 'invalid' && L.userInvalid}
              </p>
            )}
            {/* Commercial registration certificate — label + upload (no number required) */}
            <div style={{ position: 'relative' }}>
              <div style={{
                ...fieldCss(),
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                paddingRight: 48, cursor: 'default',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(200,230,230,0.95)', fontWeight: 700, fontSize: '0.9rem' }}>
                  <ShieldCheck size={16} color={T.primaryDim} />
                  {authLang === 'en' ? 'Commercial registration certificate' : 'شهادة السجل التجاري'}
                </span>
              </div>
              <input
                id="commercial-reg-file"
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setError('');
                  setCommercialRegFile(null);
                  setCommercialRegVerify('checking');
                  setCommercialRegVerifyMessage('');
                  try {
                    const result = await verifyCertificateFile(file, 'commercial_registry', '');
                    if (result.valid) {
                      setCommercialRegFile({ dataUrl: result.dataUrl, name: file.name });
                      setCommercialRegVerify('valid');
                      setCommercialRegVerifyMessage('');
                    } else {
                      setCommercialRegVerify('invalid');
                      setCommercialRegFile(null);
                      const msg = result.message || (authLang === 'en' ? 'Upload failed' : 'فشل الرفع');
                      setCommercialRegVerifyMessage(msg);
                      setError(msg);
                    }
                  } catch {
                    setCommercialRegVerify('invalid');
                    setCommercialRegVerifyMessage(authLang === 'en' ? 'Upload failed' : 'فشل الرفع');
                  }
                }}
              />
              <button
                type="button"
                title={authLang === 'en' ? 'Upload commercial registration certificate' : 'رفع شهادة السجل التجاري'}
                disabled={commercialRegVerify === 'checking'}
                onClick={() => document.getElementById('commercial-reg-file')?.click()}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: commercialRegVerify === 'valid' ? 'hsl(var(--success)/0.18)' : commercialRegVerify === 'invalid' ? 'hsl(var(--destructive)/0.18)' : 'hsl(var(--primary)/0.12)',
                  border: `1px solid ${commercialRegVerify === 'valid' ? 'hsl(var(--success)/0.5)' : commercialRegVerify === 'invalid' ? 'hsl(var(--destructive)/0.5)' : 'hsl(var(--primary)/0.35)'}`,
                  borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: commercialRegVerify === 'checking' ? 'wait' : 'pointer', flexShrink: 0,
                  opacity: commercialRegVerify === 'checking' ? 0.6 : 1,
                }}
              >
                {commercialRegVerify === 'checking'
                  ? <Clock size={15} color="hsl(var(--primary))" />
                  : commercialRegVerify === 'valid'
                    ? <Check size={15} color="hsl(var(--success))" />
                    : commercialRegVerify === 'invalid'
                      ? <X size={15} color="hsl(var(--destructive))" />
                      : <Plus size={15} color="hsl(var(--primary))" />
                }
              </button>
            </div>
            {commercialRegFile && commercialRegVerify === 'valid' && (
              <p style={{ margin: '-6px 0 0', fontSize: 11, color: 'hsl(var(--success))', display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
                <Check size={11} /> {commercialRegFile.name}
                <button type="button" onClick={() => { setCommercialRegFile(null); setCommercialRegVerify('idle'); setCommercialRegVerifyMessage(''); }} style={{ background: 'none', border: 'none', color: 'hsl(var(--destructive)/0.7)', cursor: 'pointer', padding: 0, marginRight: 4, display: 'flex', alignItems: 'center' }}>
                  <X size={11} />
                </button>
              </p>
            )}
            {commercialRegVerify === 'invalid' && (
              <p style={{ margin: '-6px 0 0', fontSize: 11, color: 'hsl(var(--destructive))', display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
                <AlertTriangle size={11} /> {commercialRegVerifyMessage || (authLang === 'en' ? 'Upload failed' : 'فشل الرفع')}
              </p>
            )}

            {/* Trade license certificate — label + upload (no number required) */}
            <div style={{ position: 'relative' }}>
              <div style={{
                ...fieldCss(),
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                paddingRight: 48, cursor: 'default',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(200,230,230,0.95)', fontWeight: 700, fontSize: '0.9rem' }}>
                  <FileText size={16} color={T.primaryDim} />
                  {authLang === 'en' ? 'Trade license certificate' : 'شهادة الترخيص التجاري'}
                </span>
              </div>
              <input
                id="trade-license-file"
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setError('');
                  setTradeLicenseFile(null);
                  setTradeLicenseVerify('checking');
                  setTradeLicenseVerifyMessage('');
                  try {
                    const result = await verifyCertificateFile(file, 'trade_license', '');
                    if (result.valid) {
                      setTradeLicenseFile({ dataUrl: result.dataUrl, name: file.name });
                      setTradeLicenseVerify('valid');
                      setTradeLicenseVerifyMessage('');
                    } else {
                      setTradeLicenseVerify('invalid');
                      setTradeLicenseFile(null);
                      const msg = result.message || (authLang === 'en' ? 'Upload failed' : 'فشل الرفع');
                      setTradeLicenseVerifyMessage(msg);
                      setError(msg);
                    }
                  } catch {
                    setTradeLicenseVerify('invalid');
                    setTradeLicenseVerifyMessage(authLang === 'en' ? 'Upload failed' : 'فشل الرفع');
                  }
                }}
              />
              <button
                type="button"
                title={authLang === 'en' ? 'Upload trade license certificate' : 'رفع شهادة الترخيص التجاري'}
                disabled={tradeLicenseVerify === 'checking'}
                onClick={() => document.getElementById('trade-license-file')?.click()}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: tradeLicenseVerify === 'valid' ? 'hsl(var(--success)/0.18)' : tradeLicenseVerify === 'invalid' ? 'hsl(var(--destructive)/0.18)' : 'hsl(var(--primary)/0.12)',
                  border: `1px solid ${tradeLicenseVerify === 'valid' ? 'hsl(var(--success)/0.5)' : tradeLicenseVerify === 'invalid' ? 'hsl(var(--destructive)/0.5)' : 'hsl(var(--primary)/0.35)'}`,
                  borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: tradeLicenseVerify === 'checking' ? 'wait' : 'pointer', flexShrink: 0,
                  opacity: tradeLicenseVerify === 'checking' ? 0.6 : 1,
                }}
              >
                {tradeLicenseVerify === 'checking'
                  ? <Clock size={15} color="hsl(var(--primary))" />
                  : tradeLicenseVerify === 'valid'
                    ? <Check size={15} color="hsl(var(--success))" />
                    : tradeLicenseVerify === 'invalid'
                      ? <X size={15} color="hsl(var(--destructive))" />
                      : <Plus size={15} color="hsl(var(--primary))" />
                }
              </button>
            </div>
            {tradeLicenseFile && tradeLicenseVerify === 'valid' && (
              <p style={{ margin: '-6px 0 0', fontSize: 11, color: 'hsl(var(--success))', display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
                <Check size={11} /> {tradeLicenseFile.name}
                <button type="button" onClick={() => { setTradeLicenseFile(null); setTradeLicenseVerify('idle'); setTradeLicenseVerifyMessage(''); }} style={{ background: 'none', border: 'none', color: 'hsl(var(--destructive)/0.7)', cursor: 'pointer', padding: 0, marginRight: 4, display: 'flex', alignItems: 'center' }}>
                  <X size={11} />
                </button>
              </p>
            )}
            {tradeLicenseVerify === 'invalid' && (
              <p style={{ margin: '-6px 0 0', fontSize: 11, color: 'hsl(var(--destructive))', display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
                <AlertTriangle size={11} /> {tradeLicenseVerifyMessage || (authLang === 'en' ? 'Upload failed' : 'فشل الرفع')}
              </p>
            )}

            {/* Both certificates required */}
            {(!commercialRegFile || !tradeLicenseFile || commercialRegVerify !== 'valid' || tradeLicenseVerify !== 'valid') && (
              <div style={{
                background: 'hsl(var(--gold)/0.08)', border: '1px solid hsl(var(--gold)/0.3)',
                borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <AlertTriangle size={14} color="hsl(var(--gold))" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'hsl(var(--gold)/0.9)', lineHeight: 1.5 }}>
                  {authLang === 'en'
                    ? 'Upload both the commercial registration certificate and the trade license certificate — the request will not be accepted without them'
                    : 'يجب رفع شهادة السجل التجاري وشهادة الترخيص التجاري — لن يُقبل الطلب بدونهما'}
                </p>
              </div>
            )}
                <div style={{ position: 'relative' }}>
                  <button type="button" onClick={() => setSectorOpen(o => !o)}
                    style={{ ...fieldCss(), borderColor: 'rgba(239,68,68,0.35)', paddingLeft: 14, paddingRight: 36, textAlign: isEn ? 'left' : 'right', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: (companySector || companySectorCustom) ? 'inherit' : 'rgba(150,200,200,0.55)' }}>
                      {companySector || companySectorCustom || L.sector}
                    </span>
                    <ChevronDown size={16} color="rgba(150,200,200,0.8)" style={{ flexShrink: 0 }} />
                  </button>
                  {sectorOpen && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 40, marginTop: 4, background: 'rgba(8,20,22,0.98)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 10px 24px rgba(0,0,0,0.4)' }}>
                      {(isEn ? [
                        'Electronics & Electrical appliances',
                        'Perfume, beauty & personal care',
                        'Furniture, décor & furnishings',
                        'Fashion & clothing',
                        'Watches, jewelry & accessories',
                        'Stationery, hobbies & books',
                      ] : [
                        'قطاع الأجهزة الإلكترونية والكهربائية',
                        'قطاع العطور والتجميل والعناية',
                        'قطاع الأثاث والديكور والمفروشات',
                        'قطاع الأزياء والموضة والملابس',
                        'قطاع الساعات والمجوهرات والإكسسوارات',
                        'قطاع القرطاسية والهوايات والكتب',
                      ]).map(s => (
                        <button key={s} type="button" onClick={() => { setCompanySector(s); setCompanySectorCustom(''); setSectorOpen(false); }}
                          style={{ width: '100%', padding: '10px 12px', border: 'none', background: companySector === s ? 'rgba(0,188,212,0.12)' : 'transparent', color: 'rgba(200,230,230,0.95)', textAlign: isEn ? 'left' : 'right', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
                          {s}
                        </button>
                      ))}
                      <div style={{ padding: 10, borderTop: '1px solid rgba(0,188,212,0.15)' }}>
                        <input type="text" value={companySectorCustom} onChange={e => { setCompanySectorCustom(e.target.value); if (e.target.value.trim()) setCompanySector(''); }} placeholder={L.sectorHint} style={{ ...fieldCss(), margin: 0, fontSize: '0.8rem' }} />
                      </div>
                    </div>
                  )}
                </div>

            <div style={{ position: 'relative' }}>
              <Phone size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="tel" placeholder={L.phone} value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} required
                style={fieldCss()} dir="ltr" />
            </div>
            <div style={{ position: 'relative' }}>
              <Phone size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="tel" placeholder={L.phoneAlt} value={companyPhone2} onChange={e => setCompanyPhone2(e.target.value)}
                style={fieldCss()} dir="ltr" />
            </div>
          </>
        )}

        {/* ── Personal registration: name + username ── */}
        {isRegister && !isCompany && (
          <>
            <div style={{ position: 'relative' }}>
              <User size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="text" placeholder={L.name} value={name} onChange={e => setName(e.target.value)} required
                style={fieldCss()} />
            </div>
            <div style={{ position: 'relative' }}>
              <AtSign size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder={L.username}
                value={username}
                onChange={e => setUsername(e.target.value.replace(/\s/g, ''))}
                required
                autoCapitalize="none"
                autoCorrect="off"
                style={{
                  ...fieldCss(),
                  direction: 'ltr',
                  border: `1px solid ${
                    usernameStatus === 'taken' ? 'hsl(var(--destructive))'
                    : usernameStatus === 'available' ? 'rgba(34,197,94,0.55)'
                    : T.surfaceBorder
                  }`,
                }}
                dir="ltr"
              />
            </div>
            {username.trim() && (
              <p style={{
                margin: '-6px 0 0', fontSize: 12, fontWeight: 700, textAlign: 'center',
                color: usernameStatus === 'available' ? '#22c55e'
                  : usernameStatus === 'taken' ? 'hsl(var(--destructive))'
                  : usernameStatus === 'invalid' ? '#eab308'
                  : usernameStatus === 'checking' ? T.primaryDim
                  : 'transparent',
              }}>
                {usernameStatus === 'checking' && L.checkingUser}
                {usernameStatus === 'available' && L.userAvailable}
                {usernameStatus === 'taken' && L.userTaken}
                {usernameStatus === 'invalid' && L.userInvalid}
              </p>
            )}
          </>
        )}

        {/* Email only — no mobile login/signup */}
        <div style={{ position: 'relative' }}>
          <Mail size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={authLang === 'en' ? 'Email' : 'البريد الإلكتروني'}
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={fieldCss()}
            dir="ltr"
          />
        </div>

        {/* Confirm email — shown on every register form (same behaviour as confirm password) */}
        {isRegister && (
          <div style={{ position: 'relative' }}>
            <Mail size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="email"
              placeholder={L.confirmEmail}
              value={confirmEmail}
              onChange={e => setConfirmEmail(e.target.value)}
              required
              style={{
                ...fieldCss(),
                border: `1px solid ${confirmEmail && confirmEmail.trim().toLowerCase() !== email.trim().toLowerCase() ? 'hsl(var(--destructive))' : T.surfaceBorder}`,
              }}
              dir="ltr"
            />
            {confirmEmail && confirmEmail.trim().toLowerCase() === email.trim().toLowerCase() && (
              <Check size={14} color="hsl(var(--primary))" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            )}
          </div>
        )}

        {isRegister && !isCompany && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', width: 92, flex: '0 0 92px' }}>
              <button type="button" onClick={() => { setDialOpen(v => !v); setDialQuery(''); }} style={{ ...fieldCss(), width: '100%', textAlign: 'center', cursor: 'pointer', paddingLeft: 8, paddingRight: 8 }}>
                {signupDial}
              </button>
              {dialOpen && (
                <div style={{ position: 'absolute', zIndex: 30, top: 'calc(100% + 6px)', left: 0, width: 260, background: '#f7f7f8', borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 12px 30px rgba(0,0,0,0.28)', overflow: 'hidden' }}>
                  <input value={dialQuery} onChange={e => setDialQuery(e.target.value)} placeholder="Search country" autoFocus style={{ width: '100%', boxSizing: 'border-box', border: 'none', borderBottom: '1px solid #e5e7eb', padding: '12px 12px', fontSize: 14, outline: 'none' }} />
                  <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    {DIAL_CODES.filter(c => `${c.name} ${c.iso} ${c.dial}`.toLowerCase().includes(dialQuery.trim().toLowerCase())).map(c => (
                      <button key={c.iso + c.dial} type="button" onClick={() => { setSignupDial(c.dial); setDialOpen(false); setDialQuery(''); }} style={{ width: '100%', textAlign: 'left', padding: '11px 12px', border: 'none', borderBottom: '1px solid #eee', background: c.dial === signupDial ? '#e8f8fb' : '#fff', color: '#111', cursor: 'pointer', fontSize: 14 }}>
                        {c.name} {c.dial}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ position: 'relative', flex: 1 }}>
              <Phone size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="tel" inputMode="numeric" placeholder={isEn ? 'Mobile number' : 'رقم الموبايل'} value={signupPhone} onChange={e => setSignupPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 15))} required style={{ ...fieldCss(), paddingLeft: 40 }} dir="ltr" />
            </div>
          </div>
        )}

        {/* Password */}
        <div style={{ position: 'relative' }}>
          <Lock size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input type={showPw ? 'text' : 'password'} placeholder={L.password} value={password} onChange={e => setPassword(e.target.value)} required
            style={{ ...fieldCss(), paddingRight: 44 }} dir="ltr" />
          <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.primaryDim }}>
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* Confirm password — register only */}
        {isRegister && (
          <div style={{ position: 'relative' }}>
            <ShieldCheck size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type={showConfirmPw ? 'text' : 'password'}
              placeholder={L.confirmPassword}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              style={{
                ...fieldCss(),
                paddingRight: 44,
                border: `1px solid ${confirmPassword && confirmPassword !== password ? 'hsl(var(--destructive))' : T.surfaceBorder}`,
              }}
              dir="ltr"
            />
            <button type="button" onClick={() => setShowConfirmPw(v => !v)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.primaryDim }}>
              {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            {confirmPassword && confirmPassword === password && (
              <Check size={14} color="hsl(var(--primary))" style={{ position: 'absolute', right: 40, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            )}
          </div>
        )}

        {error && (
          <div style={{ background: 'hsl(var(--destructive)/0.15)', border: '1px solid hsl(var(--destructive)/0.4)', borderRadius: 10, padding: '10px 14px', color: 'hsl(var(--destructive))', fontSize: 13, textAlign: 'center' }}>
            {error}
          </div>
        )}
        {companyPendingMsg && !error && (
          <div style={{
            background: 'rgba(0,188,212,0.12)',
            border: '1px solid rgba(0,188,212,0.4)',
            borderRadius: 12,
            padding: '14px 16px',
            color: '#00BCD4',
            fontSize: 14,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.55,
          }}>
            {companyPendingMsg}
          </div>
        )}

        <button type="submit" disabled={loading || (isRegister && (usernameStatus === 'taken' || usernameStatus === 'invalid' || usernameStatus === 'checking'))}
          style={{ background: (loading || (isRegister && (usernameStatus === 'taken' || usernameStatus === 'invalid'))) ? T.primaryFaint : T.primary, color: btnFg, border: 'none', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 700, cursor: (loading || (isRegister && usernameStatus === 'taken')) ? 'not-allowed' : 'pointer', marginTop: 4, transition: 'opacity 0.2s', opacity: (isRegister && usernameStatus === 'taken') ? 0.6 : 1 }}>
          {loading ? '...' : (isRegister ? L.submitCreate : L.submitLogin)}
        </button>
      </form>

      {!isRegister && (forgotStep === 'hidden' || forgotStep === 'email') && (
        <button type="button" onClick={() => { setForgotStep(forgotStep === 'email' ? 'hidden' : 'email'); setForgotMsg(''); setError(''); }}
          style={{ marginTop: 12, background: 'none', border: 'none', color: T.primary, fontSize: 13, fontWeight: 800, cursor: 'pointer', width: '100%' }}>
          {isEn ? 'Forgot password' : 'نسيت كلمة المرور'}
        </button>
      )}
      {!isRegister && forgotStep === 'email' && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: `1px solid ${T.surfaceBorder}`, background: 'rgba(0,188,212,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, color: T.text, fontWeight: 800, fontSize: 13 }}>{isEn ? 'Forgot password' : 'نسيت كلمة المرور'}</p>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={isEn ? 'Email' : 'البريد الإلكتروني'} dir="ltr" style={fieldCss()} />
          <button type="button" disabled={loading} onClick={async () => {
            const em = email.trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setForgotMsg(isEn ? 'Enter a valid email' : 'أدخل بريداً صحيحاً'); return; }
            setLoading(true); setForgotMsg('');
            try {
              const r = await fetch('/api/password/forgot', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em }) });
              const d = await r.json().catch(() => ({} as any));
              if (d.error === 'not_registered') {
                setForgotMsg(isEn ? 'This email is not registered' : 'هذا البريد غير مسجّل في التطبيق');
              } else {
                const fromLink = String(d.devLink || '').split('forgot=')[1] || '';
                const tok = String(d.appToken || fromLink || '').trim();
                setForgotToken(tok);
                let mask = String(d.phoneMask || '');
                if (!mask) {
                  try { mask = maskStoredPhone(localStorage.getItem(`stooorna_phone_${em}`) || ''); } catch { /* */ }
                }
                setForgotPhoneMask(mask);
                setForgotPhoneInput('');
                setForgotPw1(''); setForgotPw2('');
                setForgotMsg('');
                setForgotStep('icon');
              }
            } catch { setForgotMsg(isEn ? 'Network error' : 'خطأ في الشبكة'); }
            setLoading(false);
          }} style={{ padding: 10, borderRadius: 10, border: 'none', background: T.primary, color: '#041018', fontWeight: 800, cursor: 'pointer' }}>
            {loading ? '...' : (isEn ? 'Send' : 'إرسال الإيميل')}
          </button>
          {forgotMsg ? <p style={{ margin: 0, color: '#eab308', fontSize: 12 }}>{forgotMsg}</p> : null}
        </div>
      )}
      {!isRegister && (forgotStep === 'icon' || forgotStep === 'reset' || forgotStep === 'done') && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => { if (forgotStep === 'icon') { setForgotStep('email'); setForgotMsg(''); } }}
          style={{ position: 'fixed', inset: 0, zIndex: 14000, background: 'rgba(2,10,12,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 'min(92vw, 360px)', background: 'linear-gradient(180deg,#0e2c30,#071416)', border: '1px solid rgba(0,188,212,0.4)', borderRadius: 20, padding: '22px 18px 18px', boxShadow: '0 18px 50px rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
          >
            {forgotStep === 'icon' && (
              <>
                <p style={{ margin: 0, color: '#d7eeee', fontWeight: 900, fontSize: 16, textAlign: 'center' }}>{isEn ? 'Reset password' : 'استعادة كلمة المرور'}</p>
                <p style={{ margin: 0, color: 'rgba(190,220,220,0.75)', fontSize: 13, textAlign: 'center', lineHeight: 1.55 }}>
                  {isEn ? 'Tap the lock. Your mobile will show with the last 3 digits.' : 'اضغط القفل. يبين رقم موبايلك وآخر ٣ أرقام.'}
                </p>
                {forgotPhoneMask ? <p style={{ margin: 0, color: '#00BCD4', fontWeight: 900, letterSpacing: 1 }} dir="ltr">{forgotPhoneMask}</p> : null}
                <button
                  type="button"
                  aria-label={isEn ? 'Open password reset' : 'فتح تعيين كلمة المرور'}
                  onClick={() => { setForgotMsg(''); setForgotStep('reset'); }}
                  style={{ width: 92, height: 92, borderRadius: '50%', border: '1px solid rgba(0,188,212,0.55)', background: 'rgba(0,188,212,0.14)', color: '#00BCD4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Lock size={40} />
                </button>
                <button type="button" onClick={() => { setForgotStep('email'); setForgotMsg(''); }} style={{ background: 'none', border: 'none', color: 'rgba(190,220,220,0.65)', fontSize: 12, cursor: 'pointer' }}>
                  {isEn ? 'Back' : 'رجوع'}
                </button>
              </>
            )}
            {forgotStep === 'reset' && (
              <>
                <p style={{ margin: 0, color: '#d7eeee', fontWeight: 900, fontSize: 16, textAlign: 'center' }}>{isEn ? 'New password' : 'كلمة المرور الجديدة'}</p>
                <p style={{ margin: 0, color: '#00BCD4', fontWeight: 800, letterSpacing: 1, fontSize: 15 }} dir="ltr">{forgotPhoneMask}</p>
                <p style={{ margin: 0, color: 'rgba(190,220,220,0.7)', fontSize: 12, textAlign: 'center' }}>{isEn ? 'Last 3 digits of the mobile linked to this email' : 'آخر ٣ أرقام من موبايل هذا الإيميل'}</p>
                <input type="tel" value={forgotPhoneInput} onChange={e => setForgotPhoneInput(e.target.value.replace(/[^0-9+]/g, '').slice(0, 18))} placeholder={isEn ? 'Full mobile number' : 'رقم الموبايل كامل'} dir="ltr" style={{ ...fieldCss(), width: '100%' }} />
                <input type={showPw ? 'text' : 'password'} value={forgotPw1} onChange={e => setForgotPw1(e.target.value)} placeholder={isEn ? 'New password' : 'كلمة المرور الجديدة'} dir="ltr" style={{ ...fieldCss(), width: '100%' }} />
                <input type={showConfirmPw ? 'text' : 'password'} value={forgotPw2} onChange={e => setForgotPw2(e.target.value)} placeholder={isEn ? 'Repeat password' : 'أعد كتابة كلمة المرور'} dir="ltr" style={{ ...fieldCss(), width: '100%' }} />
                <button type="button" disabled={loading} onClick={async () => {
                  if (forgotPw1.length < 6 || forgotPw1 !== forgotPw2) { setForgotMsg(isEn ? 'Passwords must match (min 6)' : 'كلمتا المرور غير متطابقتين (٦ أحرف على الأقل)'); return; }
                  if (forgotPhoneInput.replace(/\D/g, '').length < 6) { setForgotMsg(isEn ? 'Enter the mobile number' : 'أدخل رقم الموبايل'); return; }
                  setLoading(true); setForgotMsg('');
                  try {
                    const r = await fetch('/api/password/forgot/confirm', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: forgotToken, email: email.trim(), password: forgotPw1, confirm: forgotPw2, phone: forgotPhoneInput }) });
                    const d = await r.json().catch(() => ({} as any));
                    if (!r.ok || d.ok === false || d.applied !== true) setForgotMsg(d.error === 'phone_mismatch' ? (isEn ? 'This mobile does not belong to the email' : 'رقم الموبايل لا يخص هذا الإيميل') : d.error === 'not_registered' ? (isEn ? 'This email is not registered' : 'هذا البريد غير مسجّل في التطبيق') : (isEn ? 'Password was not saved. Try again.' : 'ما انحفظت كلمة المرور. حاول مرة ثانية.'));
                    else { setPassword(''); setForgotMsg(isEn ? 'Password changed successfully' : 'تم تغيير كلمة المرور بنجاح'); setForgotStep('done'); }
                  } catch { setForgotMsg(isEn ? 'Network error' : 'خطأ في الشبكة'); }
                  setLoading(false);
                }} style={{ width: '100%', padding: 12, borderRadius: 12, border: 'none', background: '#00BCD4', color: '#041018', fontWeight: 900, cursor: 'pointer' }}>
                  {loading ? '...' : (isEn ? 'Save password' : 'حفظ كلمة المرور')}
                </button>
                {forgotMsg ? <p style={{ margin: 0, color: '#eab308', fontSize: 12, textAlign: 'center' }}>{forgotMsg}</p> : null}
                <button type="button" onClick={() => setForgotStep('icon')} style={{ background: 'none', border: 'none', color: 'rgba(190,220,220,0.65)', fontSize: 12, cursor: 'pointer' }}>
                  {isEn ? 'Back' : 'رجوع'}
                </button>
              </>
            )}
            {forgotStep === 'done' && (
              <>
                <div style={{ width: 74, height: 74, borderRadius: '50%', background: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle size={36} color="#86efac" />
                </div>
                <p style={{ margin: 0, color: '#86efac', fontWeight: 900, fontSize: 16, textAlign: 'center' }}>{isEn ? 'Password changed successfully' : 'تم تغيير كلمة المرور بنجاح'}</p>
                <p style={{ margin: 0, color: 'rgba(190,220,220,0.75)', fontSize: 13, textAlign: 'center' }}>{isEn ? 'You can log in with the new password.' : 'تقدر تدخل الآن بكلمة المرور الجديدة.'}</p>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}

      <div style={{ marginTop: 20, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ color: T.primaryDim, fontSize: 13 }}>
          {isRegister ? L.haveAccount : L.noAccount}
        </span>
        <button
          type="button"
          onClick={() => switchMode(isRegister ? 'login' : 'register')}
          style={{ background: 'none', border: 'none', color: T.primary, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}
        >
          {isRegister ? L.goLogin : L.goRegister}
        </button>
      </div>
    </div>
  );
}

// ─── Music search modal (iTunes free previews) — opened from profile Music button ──
interface SettingsMusicTrack {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  previewUrl: string;
}
function SettingsMusicSearchModal({
  onClose,
  currentTrack,
  isPlaying,
  onPlayTrack,
  favorites,
  onToggleFavorite,
}: {
  onClose: () => void;
  currentTrack: SettingsMusicTrack | null;
  isPlaying: boolean;
  onPlayTrack: (track: SettingsMusicTrack) => void;
  favorites: SettingsMusicTrack[];
  onToggleFavorite: (track: SettingsMusicTrack) => void;
}) {
  const [tabKey, setTabKey] = useState<'search' | 'favorites'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SettingsMusicTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSearch = useCallback((term: string) => {
    if (!term.trim()) { setResults([]); setError(null); setSearching(false); return; }
    setSearching(true);
    setError(null);
    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=25`)
      .then(res => res.json())
      .then((data: { results?: Array<{ trackId: number; trackName: string; artistName: string; artworkUrl100?: string; previewUrl?: string }> }) => {
        setResults((data.results ?? [])
          .filter(r => !!r.previewUrl)
          .map(r => ({
            id: String(r.trackId),
            title: r.trackName,
            artist: r.artistName,
            artwork: r.artworkUrl100 ?? '',
            previewUrl: r.previewUrl as string,
          })));
      })
      .catch(() => setError('تعذر البحث، تحقق من الاتصال بالإنترنت'))
      .finally(() => setSearching(false));
  }, []);
  function onQueryChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(v), 450);
  }
  const isFav = (id: string) => favorites.some(f => f.id === id);
  const list = tabKey === 'search' ? results : favorites;
  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000,
        background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 18, overflow: 'hidden',
      }}
    >
      <motion.div
        role="presentation"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
        style={{
          width: '100%', maxWidth: 380, maxHeight: '78vh',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(12,10,8,0.97)',
          border: '1px solid rgba(0,188,212,0.28)',
          borderRadius: 20,
          boxShadow: '0 12px 50px rgba(0,0,0,0.55), 0 0 30px rgba(0,188,212,0.1)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Music size={16} color='#00BCD4' />
              الموسيقى
            </span>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 999, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={14} color="rgba(255,255,255,0.7)" />
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} color="rgba(255,255,255,0.4)" style={{ position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)' }} />
            <input
              autoFocus
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              placeholder="ابحث عن أغنية أو فنان..."
              style={{
                width: '100%', padding: '9px 36px 9px 12px', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', padding: '8px 14px 0' }}>
          {(['search', 'favorites'] as const).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setTabKey(k)}
              style={{
                flex: 1, padding: '8px 0', textAlign: 'center', background: 'transparent', border: 'none', cursor: 'pointer',
                color: tabKey === k ? '#00BCD4' : 'rgba(255,255,255,0.4)',
                fontSize: '0.72rem', fontWeight: 700,
                borderBottom: tabKey === k ? '2px solid #00BCD4' : '2px solid transparent',
              }}
            >
              {k === 'search' ? 'بحث' : `المفضلة${favorites.length ? ` (${favorites.length})` : ''}`}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 14px' }}>
          {tabKey === 'search' && searching && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>جاري البحث...</p>
          )}
          {tabKey === 'search' && !searching && error && (
            <p style={{ color: 'rgba(239,68,68,0.8)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>{error}</p>
          )}
          {tabKey === 'search' && !searching && !error && query.trim() && list.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>لا توجد نتائج</p>
          )}
          {tabKey === 'search' && !query.trim() && (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>اكتب اسم أغنية أو فنان للبحث</p>
          )}
          {tabKey === 'favorites' && favorites.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>لا توجد أغاني في المفضلة بعد</p>
          )}
          {list.map(track => {
            const active = currentTrack?.id === track.id;
            return (
              <div
                key={track.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 12,
                  background: active ? 'rgba(0,188,212,0.1)' : 'transparent', marginBottom: 4,
                }}
              >
                {track.artwork ? (
                  <img src={track.artwork} alt="" width={40} height={40} style={{ borderRadius: 8, flexShrink: 0, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: active ? '#00BCD4' : '#fff', fontSize: '0.74rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.64rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artist}</div>
                </div>
                <button type="button" onClick={() => onToggleFavorite(track)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                  <Heart size={16} color={isFav(track.id) ? '#ef4444' : 'rgba(255,255,255,0.35)'} fill={isFav(track.id) ? '#ef4444' : 'none'} />
                </button>
                <button
                  type="button"
                  onClick={() => onPlayTrack(track)}
                  style={{
                    background: active && isPlaying ? 'rgba(0,188,212,0.22)' : 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(0,188,212,0.3)', borderRadius: 999, width: 30, height: 30,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {active && isPlaying ? <Pause size={13} color='#00BCD4' /> : <Play size={13} color='#00BCD4' style={{ marginRight: -1 }} />}
                </button>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

// ─── Main settings page ───────────────────────────────────────────────────────

// ─── App short links (stooorna.com) — for text posts: paste any URL → short app link ──
const SHORT_LINKS_KEY = 'stooorna_short_links';
type ShortLinkEntry = { code: string; url: string; createdAt: number; shortUrl: string };

function loadShortLinks(): ShortLinkEntry[] {
  try {
    return JSON.parse(localStorage.getItem(SHORT_LINKS_KEY) || '[]') as ShortLinkEntry[];
  } catch {
    return [];
  }
}

export function saveShortLink(entry: ShortLinkEntry) {
  try {
    const prev = loadShortLinks().filter(e => e.code !== entry.code);
    localStorage.setItem(SHORT_LINKS_KEY, JSON.stringify([entry, ...prev].slice(0, 100)));
  } catch { /* ignore */ }
}

export function deleteShortLink(code: string) {
  try {
    const next = loadShortLinks().filter(e => e.code !== code);
    localStorage.setItem(SHORT_LINKS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadShortLinks();
  }
}

export function clearAllShortLinks() {
  try {
    localStorage.removeItem(SHORT_LINKS_KEY);
  } catch { /* ignore */ }
}

export function makeShortCode(len = 7): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  const arr = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
  else for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

function normalizeExternalUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}


const SETTINGS_IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?.*)?$/i;
const SETTINGS_VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg|ogv)(\?.*)?$/i;

function settingsParseXStatusId(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (!/(^|\.)((twitter|x)\.com)$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/status(?:es)?\/(\d+)/i);
    return m?.[1] ?? null;
  } catch { return null; }
}

function settingsClassifyMedia(raw: string): 'image' | 'video' | null {
  try {
    const u = new URL(raw.trim());
    if (SETTINGS_IMAGE_EXT.test(u.pathname) || SETTINGS_IMAGE_EXT.test(u.href)) return 'image';
    if (SETTINGS_VIDEO_EXT.test(u.pathname) || SETTINGS_VIDEO_EXT.test(u.href)) return 'video';
    if (/pbs\.twimg\.com/i.test(u.hostname)) return 'image';
    if (/video\.twimg\.com/i.test(u.hostname)) return 'video';
    return null;
  } catch { return null; }
}

async function settingsResolveXMedia(statusUrl: string): Promise<string[]> {
  const id = settingsParseXStatusId(statusUrl);
  if (!id) return [];
  for (const ep of [`https://api.fxtwitter.com/status/${id}`, `https://api.vxtwitter.com/status/${id}`]) {
    try {
      const r = await fetch(ep);
      if (!r.ok) continue;
      const data = await r.json() as any;
      const out: string[] = [];
      const media = data?.tweet?.media ?? data?.media ?? null;
      for (const p of media?.photos ?? []) {
        const url = p.url || p.media_url_https || p.src;
        if (url) out.push(url);
      }
      for (const v of (media?.videos ?? (media?.video ? [media.video] : []))) {
        const variants = v.variants || [];
        const mp4s = variants.filter((x: any) => String(x.content_type || '').includes('mp4') || String(x.url || '').includes('.mp4'));
        mp4s.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        const url = mp4s[0]?.url || v.url || v.video_url;
        if (url) out.push(url);
      }
      if (!out.length && Array.isArray(data?.mediaURLs)) {
        for (const url of data.mediaURLs) if (typeof url === 'string') out.push(url);
      }
      if (!out.length && data?.video?.url) out.push(data.video.url);
      if (!out.length && typeof data?.image === 'string') out.push(data.image);
      const all = media?.all;
      if (!out.length && Array.isArray(all)) {
        for (const item of all) {
          if (item.type === 'video' || item.type === 'gif') {
            const variants = item.variants || [];
            const mp4s = variants.filter((x: any) => String(x.content_type || '').includes('mp4'));
            mp4s.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
            if (mp4s[0]?.url) out.push(mp4s[0].url);
            else if (item.url) out.push(item.url);
          } else if (item.url) out.push(item.url);
        }
      }
      if (out.length) return out;
    } catch { /* next */ }
  }
  return [];
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [sharePageOpen, setSharePageOpen] = useState(false);
  const {
    user,
    isPending
  } = useSession();
  const [tab, setTab] = useState<Tab>('account');
  const [showSupportChat, setShowSupportChat] = useState(false);
  const [showSupportSentToast, setShowSupportSentToast] = useState(false);
  useEffect(() => {
    if (!showSupportSentToast) return;
    const id = window.setTimeout(() => setShowSupportSentToast(false), 2000);
    return () => window.clearTimeout(id);
  }, [showSupportSentToast]);
  const [supportReplyDot, setSupportReplyDot] = useState(false);
  const [supportReplies, setSupportReplies] = useState<SupportMsg[]>([]);
  const [showSupportReplies, setShowSupportReplies] = useState(false);
  const [showLiveLocation, setShowLiveLocation] = useState(false);
  const [showPublicVoice, setShowPublicVoice] = useState(false);
  const [profileCountry, setProfileCountry] = useState<string | null>(() => readSavedCountry()?.name || null);

  useEffect(() => {
    void ensureMyCountry(user?.id).then(info => {
      if (info?.name) setProfileCountry(info.name);
    });
  }, [user?.id]);

  // ── Music player (profile button) ──
  const [musicModalOpen, setMusicModalOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [musicCurrentTrack, setMusicCurrentTrack] = useState<SettingsMusicTrack | null>(null);
  const [musicIsPlaying, setMusicIsPlaying] = useState(false);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [musicFavorites, setMusicFavorites] = useState<SettingsMusicTrack[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('stooorna_music_favorites');
      return raw ? (JSON.parse(raw) as SettingsMusicTrack[]) : [];
    } catch { return []; }
  });
  const handleMusicPlayTrack = useCallback((track: SettingsMusicTrack) => {
    if (!musicAudioRef.current) {
      musicAudioRef.current = new Audio();
      musicAudioRef.current.onended = () => setMusicIsPlaying(false);
      musicAudioRef.current.onpause = () => setMusicIsPlaying(false);
      musicAudioRef.current.onplay = () => setMusicIsPlaying(true);
    }
    const a = musicAudioRef.current;
    if (musicCurrentTrack?.id === track.id) {
      if (a.paused) void a.play(); else a.pause();
      return;
    }
    setMusicCurrentTrack(track);
    a.src = track.previewUrl;
    void a.play();
  }, [musicCurrentTrack?.id]);
  const handleMusicToggleFavorite = useCallback((track: SettingsMusicTrack) => {
    setMusicFavorites(prev => {
      const exists = prev.some(f => f.id === track.id);
      const next = exists ? prev.filter(f => f.id !== track.id) : [track, ...prev];
      try { window.localStorage.setItem('stooorna_music_favorites', JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, []);

  // ── Short link builder (Settings → text posts) ──
  const [shortLinkInput, setShortLinkInput] = useState('');
  const [shortLinkResult, setShortLinkResult] = useState('');
  const [shortLinkBusy, setShortLinkBusy] = useState(false);
  const [shortLinkError, setShortLinkError] = useState('');
  const [shortLinkCopied, setShortLinkCopied] = useState(false);

  async function pasteIntoShortLink() {
    setShortLinkError('');
    setShortLinkCopied(false);
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip?.trim()) {
        setShortLinkError('الحافظة فارغة');
        return;
      }
      setShortLinkInput(clip.trim());
      // Paste ثم تحويل مباشرة بدون حفظ
      const normalized = normalizeExternalUrl(clip.trim());
      if (!normalized) {
        setShortLinkError('أدخل رابطًا صحيحًا');
        return;
      }
      setShortLinkBusy(true);
      try {
        if (settingsClassifyMedia(normalized)) {
          setShortLinkResult(normalized);
          return;
        }
        if (settingsParseXStatusId(normalized)) {
          const media = await settingsResolveXMedia(normalized);
          if (media.length) {
            setShortLinkResult(media.join('\n'));
            return;
          }
          setShortLinkResult(normalized);
          setShortLinkError('لم يتم العثور على صورة/فيديو — تم الإبقاء على الأصل');
          return;
        }
        setShortLinkResult(normalized);
      } finally {
        setShortLinkBusy(false);
      }
    } catch {
      setShortLinkError('تعذر القراءة من الحافظة — الصق يدويًا');
    }
  }

  async function createAppShortLink() {
    setShortLinkError('');
    setShortLinkCopied(false);
    const normalized = normalizeExternalUrl(shortLinkInput);
    if (!normalized) {
      setShortLinkError('أدخل رابطًا صحيحًا (مثال: https://...)');
      return;
    }
    setShortLinkBusy(true);
    try {
      // بدون حفظ — فقط تحويل ثم Copy
      if (settingsClassifyMedia(normalized)) {
        setShortLinkResult(normalized);
        return;
      }
      if (settingsParseXStatusId(normalized)) {
        const media = await settingsResolveXMedia(normalized);
        if (media.length) {
          setShortLinkResult(media.join('\n'));
          return;
        }
        setShortLinkResult(normalized);
        setShortLinkError('لم يتم العثور على صورة/فيديو — تم الإبقاء على الأصل');
        return;
      }
      setShortLinkResult(normalized);
    } finally {
      setShortLinkBusy(false);
    }
  }

  async function copyAppShortLink() {
    const value = shortLinkResult.trim();
    if (!value) {
      setShortLinkError('أنشئ الرابط أولًا');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setShortLinkCopied(true);
      setTimeout(() => setShortLinkCopied(false), 1800);
    } catch {
      setShortLinkError('تعذر النسخ — انسخ يدويًا');
    }
  }

  // Profile username — must be declared before support-owner checks / effects
  const [profileUsername, setProfileUsername] = useState<string>(() => {
    const fromSession = String((user as { username?: string | null })?.username ?? '').replace(/^@/, '').trim();
    if (fromSession) return fromSession;
    try {
      const pending = localStorage.getItem('stooorna_pending_username') || '';
      const em = String((user as { email?: string | null })?.email || '').toLowerCase();
      const byEmail = em ? (localStorage.getItem(`stooorna_username_${em}`) || '') : '';
      return (pending || byEmail).replace(/^@/, '').trim();
    } catch {
      return '';
    }
  });

  // هل الجلسة حساب شركة؟ وهل الأونر فعّل ميزة اليوزرنيم للشركات؟
  const sessionIsCompany = (() => {
    if (!user) return false;
    try {
      if (isCompanyAccountRow(user as any)) return true;
      const em = String((user as any).email || '').toLowerCase();
      if (em && findCompanyByEmail(em)) return true;
    } catch { /* */ }
    return false;
  })();
  const [coUsernameFeatureOn, setCoUsernameFeatureOn] = useState(() => {
    try { return isCompanyUsernameFeatureEnabled(); } catch { return false; }
  });
  useEffect(() => {
    const sync = () => { try { setCoUsernameFeatureOn(isCompanyUsernameFeatureEnabled()); } catch { /* */ } };
    window.addEventListener('stooorna:company-username-feature', sync as EventListener);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('stooorna:company-username-feature', sync as EventListener);
      window.removeEventListener('storage', sync);
    };
  }, []);
  // الشركات: قسم اليوزرنيم يظهر فقط إذا فعّل الأونر المفتاح — الأفراد دائماً
  const showUsernameSection = !sessionIsCompany || coUsernameFeatureOn;

  // Owner (@Stooorna) support inbox — open thread with a user
  type SupportPeer = {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    online?: boolean;
    lastIp?: string | null;
    country?: string | null;
    unread?: number;
    email?: string | null;
    lastMessage?: string | null;
    lastAt?: string | null;
  };
  const [ownerChatUser, setOwnerChatUser] = useState<SupportPeer | null>(null);
  const [showOwnerInbox, setShowOwnerInbox] = useState(false);
  const [supportInbox, setSupportInbox] = useState<SupportPeer[]>([]);
  const [supportInboxLoading, setSupportInboxLoading] = useState(false);
  const [supportUnreadTotal, setSupportUnreadTotal] = useState(0);

  // Support desk — full user control panel (list + detail box)
  type SupportCtrlUser = {
    id: string;
    name: string | null;
    username: string | null;
    email: string;
    isBanned: boolean | null;
    lastIp: string | null;
    country?: string | null;
    phone?: string | null;
    nameColor?: string | null;
    isRoomAdmin?: boolean | null;
    createdAt: string | null;
    online?: boolean;
    avatarUrl?: string | null;
  };
  const [showSupportUsers, setShowSupportUsers] = useState(false);
  const [supportCtrlUser, setSupportCtrlUser] = useState<SupportCtrlUser | null>(null);
  // ── Owner-only (@Stooorna): Companies registry admin ──
  const [showOwnerCompanies, setShowOwnerCompanies] = useState(false);
  const [showRecoveredUsers, setShowRecoveredUsers] = useState(false);
  const [showOwnerBusiness, setShowOwnerBusiness] = useState(false);
  const [recoveredUsers, setRecoveredUsers] = useState<DeletedUserRecord[]>([]);
  const [recoveredBusyId, setRecoveredBusyId] = useState<string>('');
  // ── Owner-only: Business manager ──
  const [showOwnerBiz, setShowOwnerBiz] = useState(false);
  const [showOwnerStoryMod, setShowOwnerStoryMod] = useState(false);
  const [clearStoriesFor, setClearStoriesFor] = useState<{ userId: string; username?: string | null; name?: string | null } | null>(null);
  const [ownerBizQuery, setOwnerBizQuery] = useState('');
  const [ownerBizSel, setOwnerBizSel] = useState<{ id: string; username: string | null; email: string } | null>(null);
  const [ownerBizProject, setOwnerBizProject] = useState('');
  const [ownerBizBusy, setOwnerBizBusy] = useState(false);
  const [ownerBizMsg, setOwnerBizMsg] = useState('');
  const [ownerBizTick, setOwnerBizTick] = useState(0);
  // ── Owner-only: VIP manager ──
  const [showOwnerVip, setShowOwnerVip] = useState(false);
  // ── Owner-only: Ads (paid feed ads) ──
  const [showOwnerAds, setShowOwnerAds] = useState(false);
  // ── Owner-only: STOOORNA note (written here, shown to everyone on the STOOORNA title) ──
  const [showOwnerNote, setShowOwnerNote] = useState(false);
  const [ownerVipQuery, setOwnerVipQuery] = useState('');
  const [ownerVipSel, setOwnerVipSel] = useState<{ id: string; username: string | null; email: string } | null>(null);
  const [ownerVipColor, setOwnerVipColor] = useState<string>('gold');
  const [ownerVipBusy, setOwnerVipBusy] = useState(false);
  const [ownerVipMsg, setOwnerVipMsg] = useState('');
  const [ownerVipTick, setOwnerVipTick] = useState(0);
  const [ownerCompanies, setOwnerCompanies] = useState<CompanyRegistration[]>([]);
  // New independent company registrations from the companies table
  const [ownerNewCompanies, setOwnerNewCompanies] = useState<{
    id: string; companyName: string; tradeName?: string; ownerName?: string;
    licenseNumber?: string; tradeLicenseNumber?: string; description?: string;
    logoUrl?: string; commercialRegFile?: string; tradeLicenseFile?: string;
    status: 'pending' | 'approved' | 'rejected'; rejectionReason?: string;
    createdAt: string; submitter: { id: string; name: string; username: string; email: string; avatar: string };
  }[]>([]);
  const [ownerNewCompaniesLoading, setOwnerNewCompaniesLoading] = useState(false);
  const [ownerNewCompaniesFilter, setOwnerNewCompaniesFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [ownerNewCompaniesRejectId, setOwnerNewCompaniesRejectId] = useState<string | null>(null);
  const [ownerNewCompaniesRejectReason, setOwnerNewCompaniesRejectReason] = useState('');

  const loadNewCompanies = async () => {
    setOwnerNewCompaniesLoading(true);
    try {
      const res = await fetch('/api/owner/companies', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setOwnerNewCompanies(data.companies ?? []);
      }
    } catch { /* ignore */ }
    finally { setOwnerNewCompaniesLoading(false); }
  };

  const reviewNewCompany = async (id: string, action: 'approve' | 'reject', rejectionReason?: string) => {
    try {
      const res = await fetch(`/api/owner/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, rejectionReason }),
      });
      if (res.ok) {
        await loadNewCompanies();
        setOwnerNewCompaniesRejectId(null);
        setOwnerNewCompaniesRejectReason('');
      }
    } catch { /* ignore */ }
  };
  const [ownerCompanyDetail, setOwnerCompanyDetail] = useState<CompanyRegistration | null>(null);
  const [ownerCompanyBusy, setOwnerCompanyBusy] = useState(false);
  const [ownerCoUsernameFeature, setOwnerCoUsernameFeature] = useState(() => {
    try { return isCompanyUsernameFeatureEnabled(); } catch { return false; }
  });
  useEffect(() => {
    const sync = () => setOwnerCoUsernameFeature(isCompanyUsernameFeatureEnabled());
    window.addEventListener('stooorna:company-username-feature', sync as EventListener);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('stooorna:company-username-feature', sync as EventListener);
      window.removeEventListener('storage', sync);
    };
  }, []);

  function refreshOwnerCompanies() {
    startTransition(() => { setOwnerCompanies(sanitizeCompaniesRegistry()); });
    (async () => {
      // 1) Dedicated company APIs + pending approval queues
      for (const url of [
        '/api/companies',
        '/api/company/list',
        '/api/owner/companies',
        '/api/owner/company-requests',
        '/api/companies/pending',
        '/api/company/pending',
        '/api/support/company-requests',
        '/api/users?accountType=company',
      ]) {
        try {
          const r = await fetch(url, { credentials: 'include' });
          if (!r.ok) continue;
          const d = await r.json();
          const list: any[] = Array.isArray(d) ? d : (d.companies || d.users || d.items || d.rows || []);
          for (const row of list) ensureCompanyInRegistry({ ...row, isCompany: true, accountType: row.accountType || 'company' });
        } catch { /* next */ }
      }
      // 2) Scan all owner users and peel companies out of User Control source
      try {
        const r = await fetch('/api/owner/users', { credentials: 'include' });
        if (r.ok) {
          const data = await r.json();
          const rows: any[] = Array.isArray(data) ? data : (data?.rows ?? []);
          const people: typeof allUsers = [];
          const companies: typeof allCompanyCtrlUsers = [];
          for (const row of rows) {
            if (isCompanyAccountRow(row)) {
              ensureCompanyInRegistry(row);
              companies.push(row);
            } else {
              people.push(row);
            }
          }
          setAllUsers(people);
          setAllCompanyCtrlUsers(companies);
        }
      } catch { /* ignore */ }
      startTransition(() => { setOwnerCompanies(sanitizeCompaniesRegistry()); });
    })();
  }

  // طلبات تسجيل الشركات تصل فوراً لحساب @Stooorna في قسم Companies
  useEffect(() => {
    if (!isSupportOwnerAccount(
      user as { email?: string | null; username?: string | null; name?: string | null },
      profileUsername,
    )) return;

    const ingest = (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      const row = raw as Partial<CompanyRegistration> & Record<string, unknown>;
      if (!row.email && !row.companyName && !row.id) return;
      upsertCompanyRegistration({
        id: String(row.id || `co-${Date.now()}`),
        companyName: String(row.companyName || row.name || 'Company'),
        tradeName: String(row.tradeName || ''),
        ownerName: String(row.ownerName || ''),
        licenseNumber: String(row.licenseNumber || ''),
        sector: row.sector as string | undefined,
        sectorCustom: row.sectorCustom as string | undefined,
        phone: String(row.phone || ''),
        phoneAlt: row.phoneAlt as string | undefined,
        email: String(row.email || ''),
        username: row.username as string | undefined,
        password: row.password as string | undefined,
        status: (row.status as CompanyRegStatus) || 'pending',
        createdAt: String(row.createdAt || new Date().toISOString()),
        updatedAt: new Date().toISOString(),
        userId: (row.userId as string | null) ?? null,
        approvedAt: (row.approvedAt as string | null) ?? null,
        approvedBy: (row.approvedBy as string | null) ?? null,
      });
      startTransition(() => { setOwnerCompanies(sanitizeCompaniesRegistry()); });
    };

    const onRequest = (e: Event) => ingest((e as CustomEvent).detail);
    const onRegistry = () => startTransition(() => { setOwnerCompanies(sanitizeCompaniesRegistry()); });
    const onStorage = (e: StorageEvent) => {
      if (e.key === COMPANIES_REGISTRY_KEY || e.key === 'stooorna_company_last_request') {
        if (e.key === 'stooorna_company_last_request' && e.newValue) {
          try { ingest(JSON.parse(e.newValue)); } catch { /* */ }
        }
        onRegistry();
      }
    };

    try {
      const last = localStorage.getItem('stooorna_company_last_request');
      if (last) ingest(JSON.parse(last));
    } catch { /* */ }

    window.addEventListener('stooorna:company-register-request', onRequest as EventListener);
    window.addEventListener('stooorna:companies-registry', onRegistry);
    window.addEventListener('storage', onStorage);
    refreshOwnerCompanies();
    try {
      if (!localStorage.getItem('stooorna_wiped_libra_v2')) {
        localStorage.setItem('stooorna_wiped_libra_v2', '1');
        markUsernameFreed('libra');
        markUsernameFreed('ليبرا');
        void permanentlyDeleteSupportUser({ id: 'libra', username: 'libra', email: 'account.kw@yahoo.com' });
      }
    } catch { /* */ }
    const poll = window.setInterval(() => refreshOwnerCompanies(), 8000);
    return () => {
      window.removeEventListener('stooorna:company-register-request', onRequest as EventListener);
      window.removeEventListener('stooorna:companies-registry', onRegistry);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(poll);
    };
  }, [user, profileUsername]);

  const ownerPendingCompanyCount = ownerCompanies.filter(
    c => !isPersonalBlockedAccount(c) && c.status === 'pending',
  ).length;

  // محسوبة مرة واحدة فقط عند تغيّر قائمة الشركات — لا تُعاد الحسابات في كل عملية render
  // (كانت سابقاً تُحسب داخل الـ JSX مباشرة، وهذا كان يُبطئ الواجهة ويسبب التجمّد
  // عند فتح تفاصيل الشركة أو حتى عند أي تفاعل آخر في صفحة الإعدادات)
  const ownerCompaniesSorted = useMemo(() => {
    return ownerCompanies
      .filter(co => !/nadoosha/i.test(`${co.email} ${co.username || co.companyName || ''}`))
      .slice()
      .sort((a, b) => {
        const rank = (st: CompanyRegStatus) => st === 'pending' ? 0 : st === 'active' ? 1 : 2;
        return rank(a.status) - rank(b.status);
      });
  }, [ownerCompanies]);

  const [scEditBox, setScEditBox] = useState<'color' | 'username' | 'password' | null>(null);
  const [scCoinsOpen, setScCoinsOpen] = useState(false);
  const [scCoins, setScCoins] = useState('');
  const [scCoinsMsg, setScCoinsMsg] = useState('');
  const [scUsername, setScUsername] = useState('');
  const [scPassword, setScPassword] = useState('');
  const [scColor, setScColor] = useState('#00BCD4');
  const [scMsg, setScMsg] = useState('');
  const [scSaving, setScSaving] = useState(false);
  const [scDeleteOpen, setScDeleteOpen] = useState(false);
  const [scDeleteText, setScDeleteText] = useState('');
  const [scDeleteError, setScDeleteError] = useState('');
  const [scDeleting, setScDeleting] = useState(false);
  const [ownerDeleteCompany, setOwnerDeleteCompany] = useState<CompanyRegistration | null>(null);
  const [supportUsersSearch, setSupportUsersSearch] = useState('');
  /** داخل كنترول المستخدمين: تبويب أفراد vs شركات (نفس أدوات التحكم) */
  const [supportUsersTab, setSupportUsersTab] = useState<'users' | 'companies'>('users');
  /** حسابات الشركات في تبويب الشركات داخل كنترول المستخدمين */
  const [allCompanyCtrlUsers, setAllCompanyCtrlUsers] = useState<{
    id: string;
    name: string | null;
    username: string | null;
    email: string;
    isBanned: boolean | null;
    lastIp: string | null;
    isRoomAdmin: boolean | null;
    createdAt: string | null;
    nameColor?: string | null;
    country?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    accountType?: string | null;
    type?: string | null;
    role?: string | null;
    isCompany?: boolean | null;
    companyName?: string | null;
    tradeName?: string | null;
    licenseNumber?: string | null;
  }[]>([]);

  // Hide global app bottom tabs while any support chat / inbox overlay is open
  useEffect(() => {
    const hidden = !!(showSupportChat || ownerChatUser || showOwnerInbox || showSupportUsers || supportCtrlUser || showOwnerCompanies || ownerCompanyDetail || showRecoveredUsers || showOwnerVip || showOwnerBiz || showOwnerStoryMod || showOwnerBusiness);
    try {
      document.body.classList.toggle('stooorna-support-chat-open', hidden);
      window.dispatchEvent(new CustomEvent('stooorna:bottom-nav', { detail: { hidden } }));
    } catch { /* ignore */ }
    return () => {
      try {
        document.body.classList.remove('stooorna-support-chat-open');
        window.dispatchEvent(new CustomEvent('stooorna:bottom-nav', { detail: { hidden: false } }));
      } catch { /* ignore */ }
    };
  }, [showSupportChat, ownerChatUser, showOwnerInbox, showSupportUsers, supportCtrlUser, showOwnerCompanies, ownerCompanyDetail, showRecoveredUsers, showOwnerVip, showOwnerBiz, showOwnerStoryMod, showOwnerBusiness]);

  async function patchSupportUser(userId: string, body: Record<string, unknown>) {
    // Prefer owner admin route; fallback to support-specific if added later
    const urls = [`/api/owner/users/${userId}`, `/api/support/users/${userId}`];
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (r.ok) return await r.json().catch(() => ({ ok: true }));
      } catch { /* next */ }
    }
    return null;
  }

  // ── Owner VIP grant: free VIP with frame + colored username + VIP header, no expiry ──
  function ownerVipActive(id: string): boolean {
    try {
      const all = JSON.parse(localStorage.getItem('stooorna_vip_plan') || '{}');
      return !!all?.[id]?.active;
    } catch { return false; }
  }
  function ownerVipColorOf(id: string): string | null {
    try {
      const c = JSON.parse(localStorage.getItem('stooorna_vip_color') || '{}');
      return c?.[id] || null;
    } catch { return null; }
  }
  async function ownerVipServerSync(id: string, body: Record<string, unknown>): Promise<boolean> {
    const eps: Array<{ url: string; method: string }> = [
      { url: `/api/owner/users/${encodeURIComponent(id)}/vip`, method: 'POST' },
      { url: `/api/owner/users/${encodeURIComponent(id)}`, method: 'PATCH' },
    ];
    for (const ep of eps) {
      try {
        const r = await fetch(ep.url, {
          method: ep.method, credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (r.ok) return true;
      } catch { /* next */ }
    }
    return false;
  }
  // ── Owner Business grant: approved Business account + Business header, no application needed ──
  function ownerBizActive(id: string): boolean {
    return isBusinessApproved(id);
  }
  async function ownerBizServerSync(id: string, body: Record<string, unknown>): Promise<boolean> {
    const eps: Array<{ url: string; method: string }> = [
      { url: `/api/owner/users/${encodeURIComponent(id)}/business`, method: 'POST' },
      { url: `/api/owner/users/${encodeURIComponent(id)}`, method: 'PATCH' },
    ];
    for (const ep of eps) {
      try {
        const r = await fetch(ep.url, {
          method: ep.method, credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (r.ok) return true;
      } catch { /* next */ }
    }
    return false;
  }
  async function ownerGrantBusiness(u: { id: string; username: string | null; email: string }, projectName: string) {
    const now = new Date().toISOString();
    const un = String(u.username || '').replace(/^@/, '').trim();
    const project = projectName.trim() || un || u.email;
    const list = loadBusinessRegistry();
    const mine = list.filter(x => String(x.userId) === String(u.id));
    // reuse the user's existing row (keeps any real application data), otherwise create one
    const base = mine.find(x => x.status === 'approved')
      || mine.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0]
      || null;
    const row: BusinessRegistration = {
      id: base?.id || `biz-owner-${u.id}`,
      userId: String(u.id),
      username: un || base?.username || null,
      email: u.email || base?.email || null,
      projectName: project,
      licenseNumber: base?.licenseNumber || 'OWNER-GRANTED',
      tradeLicenseNumber: base?.tradeLicenseNumber || 'OWNER-GRANTED',
      commercialRegCert: base?.commercialRegCert,
      commercialRegCertName: base?.commercialRegCertName,
      tradeLicenseCert: base?.tradeLicenseCert,
      tradeLicenseCertName: base?.tradeLicenseCertName,
      status: 'approved',
      createdAt: base?.createdAt || now,
      updatedAt: now,
      approvedAt: now,
      ownerNote: null,
      ownerNoteSeen: true,
      grantedByOwner: base ? (base.grantedByOwner ?? false) : true,
    };
    const next = [row, ...list.filter(x => String(x.userId) !== String(u.id))];
    saveBusinessRegistry(next);
    try {
      window.dispatchEvent(new CustomEvent('stooorna:business-posts-visibility', { detail: { userId: String(u.id), hidden: false } }));
    } catch { /* */ }
    return ownerBizServerSync(u.id, {
      business: true, isBusiness: true, businessApproved: true, businessHeader: 'Business',
      accountType: 'business', businessProjectName: project, businessGrantedByOwner: true,
    });
  }
  // ── حذف فعلي من السيرفر: نجرّب DELETE ثم POST ثم PATCH (كلها، مو أول نجاح) ──
  // السبب: مسار POST قد يرجع 200 وهو يتجاهل الحقول، فلو وقفنا عند أول نجاح يبقى الإطار/البنر على السيرفر
  // ثم يرجع للجهاز عبر المزامنة الدورية (كل 15 ثانية).
  async function ownerServerClear(id: string, kind: 'vip' | 'business', body: Record<string, unknown>): Promise<boolean> {
    const base = `/api/owner/users/${encodeURIComponent(id)}`;
    const eps: Array<{ url: string; method: string }> = [
      { url: `${base}/${kind}`, method: 'DELETE' },
      { url: `${base}/${kind}`, method: 'POST' },
      { url: base, method: 'PATCH' },
    ];
    let anyOk = false;
    const info: string[] = [];
    for (const ep of eps) {
      try {
        const r = await fetch(ep.url, {
          method: ep.method, credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: ep.method === 'DELETE' ? undefined : JSON.stringify(body),
        });
        if (r.ok) anyOk = true;
        else {
          let bodyTxt = '';
          try { bodyTxt = (await r.text()).replace(/\s+/g, ' ').slice(0, 80); } catch { /* */ }
          info.push(`${ep.method} ${r.status}${bodyTxt ? ' ' + bodyTxt : ''}`);
        }
      } catch { info.push(`${ep.method} network`); }
    }
    try { (window as any).__ownerClearInfo = anyOk ? '' : info.join(', '); } catch { /* */ }
    return anyOk;
  }
  function ownerClearInfoSuffix(ok: boolean): string {
    let i = '';
    try { i = String((window as any).__ownerClearInfo || ''); } catch { /* */ }
    return !ok && i ? ` [${i}]` : '';
  }
  async function ownerRemoveBusiness(u: { id: string }): Promise<boolean> {
    const uid = String(u.id);
    // 1) محلياً: نحذف كل سجلات البزنس لهذا المستخدم (مو مجرد تحويلها إلى rejected)
    const list = loadBusinessRegistry();
    const next = list.filter(x => String(x.userId) !== uid);
    saveBusinessRegistry(next); // يعيد بناء الدليل العام (stooorna_business_directory) ويرسل الحدث
    try {
      window.dispatchEvent(new CustomEvent('stooorna:business-posts-visibility', { detail: { userId: uid, hidden: false } }));
    } catch { /* */ }
    // 2) السيرفر: نصفّر كل خصائص البزنس (البنر/الهيدر/اسم المشروع/نوع الحساب)
    const wasBizType = String((allUsers as any[]).find(x => String(x?.id) === uid)?.accountType || '').toLowerCase() === 'business';
    const ok = await ownerServerClear(uid, 'business', {
      business: false, isBusiness: false, businessApproved: false,
      businessHeader: null, businessProjectName: null, businessGrantedByOwner: false,
      banner: null, remove: true, action: 'remove',
      ...(wasBizType ? { accountType: 'user' } : {}),
    });
    // 3) نتحقق من دليل السيرفر: لو لسا موجود، نعتبر الحذف ما تم
    try {
      const r = await fetch('/api/business/directory', { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        const users = Array.isArray(d?.users) ? d.users : [];
        if (users.some((x: any) => String(x?.userId ?? x?.id) === uid)) return false;
        localStorage.setItem('stooorna_business_directory', JSON.stringify(users));
        window.dispatchEvent(new CustomEvent('stooorna:business-registry'));
      }
    } catch { /* */ }
    return ok;
  }
  async function ownerGrantVip(u: { id: string }, color: string) {
    const FAR = new Date('2099-12-31T00:00:00Z').getTime();
    try { activateVip(u.id); } catch { /* */ }
    try { persistVipColor(u.id, color as never); } catch { /* */ }
    try {
      const plan = JSON.parse(localStorage.getItem('stooorna_vip_plan') || '{}');
      plan[u.id] = { ...(plan[u.id] || {}), active: true, expiresAt: FAR, grantedByOwner: true };
      localStorage.setItem('stooorna_vip_plan', JSON.stringify(plan));
      const colors = JSON.parse(localStorage.getItem('stooorna_vip_color') || '{}');
      colors[u.id] = color;
      localStorage.setItem('stooorna_vip_color', JSON.stringify(colors));
    } catch { /* */ }
    return ownerVipServerSync(u.id, {
      vip: true, isVip: true, vipActive: true, vipColor: color, vipHeader: 'VIP',
      vipExpiresAt: FAR, vipGrantedByOwner: true, color,
    });
  }
  async function ownerRemoveVip(u: { id: string }): Promise<boolean> {
    const uid = String(u.id);
    // 1) محلياً: نحذف كل شي عن VIP لهذا المستخدم (الخطة، اللون/الإطار، الميزات، الانتهاء)
    try { deactivateVip(uid); } catch { /* */ }
    try {
      for (const k of Object.keys(localStorage)) {
        if (!/^stooorna_vip/i.test(k) || /rename/i.test(k)) continue; // لا نمسح علامة "استُخدم تغيير الاسم"
        if (k.includes(uid)) { localStorage.removeItem(k); continue; }
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { continue; }
        let changed = false;
        if (Array.isArray(parsed)) {
          const f = parsed.filter((x: any) => String(x?.userId ?? x?.id ?? x?.user_id ?? '') !== uid);
          if (f.length !== parsed.length) { parsed = f; changed = true; }
        } else if (parsed && typeof parsed === 'object') {
          if (uid in parsed) { delete parsed[uid]; changed = true; }
          if (Array.isArray(parsed.users)) {
            const f = parsed.users.filter((x: any) => String(x?.userId ?? x?.id ?? x?.user_id ?? '') !== uid);
            if (f.length !== parsed.users.length) { parsed.users = f; changed = true; }
          }
        }
        if (changed) localStorage.setItem(k, JSON.stringify(parsed));
      }
    } catch { /* */ }
    // 2) السيرفر: نصفّر الإطار واللون وهيدر VIP وتاريخ الانتهاء
    const ok = await ownerServerClear(uid, 'vip', {
      vip: false, isVip: false, vipActive: false,
      vipColor: null, vipHeader: null, vipExpiresAt: null, vipGrantedByOwner: false,
      color: null, frame: null, vipFrame: null, banner: null, remove: true, action: 'remove',
    });
    // 3) نحدّث الدليل العام من السيرفر عشان يظهر الوضع الحقيقي
    try { await hydrateVipDirectory(); } catch { /* */ }
    try { window.dispatchEvent(new CustomEvent('stooorna:vip-changed', { detail: { userId: uid } })); } catch { /* */ }
    return ok;
  }

  async function permanentlyDeleteSupportUser(target: { id: string; email?: string | null; username?: string | null }) {
    if (!target?.id && !target?.email && !target?.username) return { ok: false as const, status: 0, body: 'no-id' };
    if (isUserWiped(target)) return { ok: true as const, status: 200, body: 'already-wiped' };
    markUserDeleted(target);
    markUsernameFreed(target.username);
    try {
      const em = String(target.email || '').toLowerCase();
      const un = String(target.username || '').replace(/^@/, '').toLowerCase();
      const nextReg = loadCompaniesRegistry().filter(c => {
        const cem = String(c.email || '').toLowerCase();
        const cun = String(c.username || '').replace(/^@/, '').toLowerCase();
        if (target.id && (c.id === target.id || c.userId === target.id)) return false;
        if (em && cem === em) return false;
        if (un && (cun === un || /libra/i.test(un) && /libra|ليبر/i.test(`${c.username} ${c.companyName} ${c.email}`))) return false;
        return true;
      });
      saveCompaniesRegistry(nextReg);
      startTransition(() => { setOwnerCompanies(nextReg.map(stripCompanyCerts)); });
    } catch { /* */ }
    try {
      {
        const origUn = String(target.username || '').replace(/^@/, '').trim();
        markUserDeleted({
          id: target.id,
          email: target.email,
          username: `deleted_${Date.now()}`,
          originalUsername: origUn && !origUn.startsWith('deleted_') ? origUn : undefined,
          name: (target as { name?: string }).name,
        });
        await patchSupportUser(target.id, {
          isBanned: true,
          banned: true,
          deleted: true,
          isDeleted: true,
          status: 'deleted',
          username: `deleted_${Date.now()}`,
        });
      }
    } catch { /* */ }
    const confirmBody = {
      confirm: true,
      confirmed: true,
      permanent: true,
      deleteAccount: true,
      permanentlyDelete: true,
      action: 'delete',
      targetId: target.id,
      email: target.email || undefined,
      username: target.username || undefined,
      text: 'حذف',
    };
    const uname = String(target.username || '').replace(/^@/, '');
    const endpoints: Array<{ url: string; method: string; body?: object }> = [
      { url: `/api/owner/users/${encodeURIComponent(target.id)}`, method: 'DELETE', body: confirmBody },
      { url: `/api/support/users/${encodeURIComponent(target.id)}`, method: 'DELETE', body: confirmBody },
      { url: `/api/owner/users/${encodeURIComponent(target.id)}/delete`, method: 'POST', body: confirmBody },
      { url: `/api/support/users/${encodeURIComponent(target.id)}/delete`, method: 'POST', body: confirmBody },
      { url: `/api/users/${encodeURIComponent(target.id)}`, method: 'DELETE', body: confirmBody },
      { url: `/api/users/delete`, method: 'POST', body: confirmBody },
      { url: `/api/users/delete-account`, method: 'POST', body: confirmBody },
      { url: `/api/account/delete`, method: 'POST', body: confirmBody },
      { url: `/api/auth/delete-user`, method: 'POST', body: confirmBody },
      { url: `/api/owner/users/${encodeURIComponent(target.id)}`, method: 'PATCH', body: { ...confirmBody, deleted: true, isDeleted: true } },
      { url: `/api/users/by-username/${encodeURIComponent(uname || target.id)}`, method: 'DELETE', body: confirmBody },
      { url: `/api/owner/users/by-username/${encodeURIComponent(uname || target.id)}`, method: 'DELETE', body: confirmBody },
      { url: `/api/owner/username/${encodeURIComponent(uname || target.id)}`, method: 'DELETE', body: confirmBody },
      { url: `/api/users/release-username`, method: 'POST', body: { ...confirmBody, username: uname } },
    ];
    let lastStatus = 0;
    let lastBody = '';
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep.url, {
          method: ep.method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(ep.body || confirmBody),
        });
        lastStatus = r.status;
        try { lastBody = await r.text(); } catch { lastBody = ''; }
        if (r.ok || r.status === 204 || r.status === 200 || r.status === 201) {
          return { ok: true as const, status: lastStatus, body: lastBody };
        }
        if (r.status === 401 && /deleted|removed|حذف/i.test(lastBody)) {
          return { ok: true as const, status: lastStatus, body: lastBody };
        }
      } catch { /* next */ }
    }
    // حتى لو السيرفر لم يدعم الحذف بعد: الحساب موسوم محلياً وممنوع من الدخول
    markUserDeleted(target);
    return { ok: true as const, status: lastStatus || 200, body: lastBody || 'local-deleted' };
  }

  async function loadSupportInbox() {
    if (!isSupportOwnerAccount(user as { email?: string | null; username?: string | null }, profileUsername)) return;
    setSupportInboxLoading(true);
    try {
      let list: SupportPeer[] = [];

      // 1) Dedicated inbox if backend adds it
      try {
        const r = await fetch('/api/support/inbox', { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          list = Array.isArray(d) ? d : (d.conversations || d.inbox || []);
        }
      } catch { /* */ }

      // 2) Real conversations / messages list
      if (!list.length) {
        for (const url of ['/api/messages', '/api/messages?inbox=1', '/api/conversations', '/api/chats']) {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) continue;
            const d = await r.json();
            const raw = Array.isArray(d) ? d : (d.conversations || d.messages || d.items || []);
            if (!raw.length) continue;
            list = raw.map((x: any) => ({
              id: String(x.userId || x.peerId || x.fromUserId || x.senderId || x.id || x._id),
              name: x.name || x.fromName || x.user?.name || null,
              username: x.username || x.fromUsername || x.user?.username || null,
              email: x.email || x.fromEmail || x.user?.email || null,
              avatarUrl: x.avatarUrl || x.user?.avatarUrl || null,
              online: !!(x.online ?? x.user?.online),
              lastIp: x.lastIp || null,
              country: x.country || null,
              unread: Number(x.unread || x.unreadCount || 0),
              lastMessage: x.lastMessage || x.text || x.content || null,
              lastAt: x.lastAt || x.updatedAt || x.createdAt || null,
            }));
            break;
          } catch { /* next */ }
        }
      }

      // 2b) رسائل المستخدمين قد تصل عبر قناة الدعم أو كرسائل عادية (بدون قائمة محادثات) → نجمّعها حسب المستخدم
      try {
        const ownIdForGroup = String((user as { id?: string } | null)?.id || '');
        const grouped = new Map<string, SupportPeer>();
        const addGrouped = (rawList: any[]) => {
          for (const m of rawList || []) {
            if (!m || typeof m !== 'object') continue;
            const text = String(m.text || m.content || m.body || m.message || '');
            if (!text && !m.mediaUrl) continue;
            if (text.includes('[[support-thread-deleted]]')) continue;
            const sender = pickId(m.fromUserId ?? m.senderId ?? m.authorId ?? m.sender_id ?? m.fromId ?? m.from_user_id ?? m.sender ?? m.author ?? (typeof m.from === 'object' ? m.from : ''));
            const receiver = pickId(m.toUserId ?? m.recipientId ?? m.receiverId ?? m.to_user_id ?? m.toId ?? m.receiver ?? m.recipient ?? (typeof m.to === 'object' ? m.to : ''));
            const peerId = sender && sender !== ownIdForGroup ? sender : receiver;
            if (!peerId || peerId === ownIdForGroup) continue;
            const at = toMs(m.at ?? m.createdAt ?? m.sentAt ?? m.created_at ?? m.timestamp);
            const cur = grouped.get(peerId);
            const fromThem = sender === peerId;
            const unreadFlag = fromThem && (m.read === false || m.isRead === false) ? 1 : 0;
            if (!cur) {
              grouped.set(peerId, {
                id: peerId,
                name: m.fromName || m.sender?.name || m.user?.name || null,
                username: m.fromUsername || m.senderUsername || m.sender?.username || m.user?.username || null,
                email: m.fromEmail || m.sender?.email || m.user?.email || null,
                avatarUrl: m.sender?.avatarUrl || m.user?.avatarUrl || null,
                online: false,
                lastIp: null,
                country: null,
                unread: unreadFlag,
                lastMessage: stripSupportHeader(text) || text,
                lastAt: at ? new Date(at).toISOString() : null,
              } as SupportPeer);
            } else {
              cur.unread = (cur.unread || 0) + unreadFlag;
              cur.name = cur.name || m.fromName || m.sender?.name || null;
              cur.username = cur.username || m.fromUsername || m.senderUsername || m.sender?.username || null;
              cur.email = cur.email || m.fromEmail || m.sender?.email || null;
              if (at >= toMs(cur.lastAt)) { cur.lastMessage = stripSupportHeader(text) || text; cur.lastAt = at ? new Date(at).toISOString() : cur.lastAt; }
            }
          }
        };
        // رسائل عادية جاءت بدون شكل "محادثة" (لا فيها lastMessage) نجمّعها نحن
        const looksLikePlainMessages = list.length > 0 && list.every((x: any) => x && x.lastMessage == null && (x.text || x.content || x.body || x.message));
        if (looksLikePlainMessages) { addGrouped(list as any[]); list = []; }
        for (const url of ['/api/support/messages?role=owner', '/api/support/messages']) {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) continue;
            const d = await r.json();
            const rawS = Array.isArray(d) ? d : (d.messages || d.items || []);
            if (rawS.length) { addGrouped(rawS); break; }
          } catch { /* next */ }
        }
        for (const gp of grouped.values()) {
          const ex = list.find(x => String(x.id) === gp.id);
          if (!ex) list.push(gp);
          else {
            ex.name = ex.name || gp.name;
            ex.username = ex.username || gp.username;
            ex.email = ex.email || gp.email;
            if (toMs(gp.lastAt) > toMs(ex.lastAt)) { ex.lastAt = gp.lastAt; ex.lastMessage = gp.lastMessage || ex.lastMessage; }
          }
        }
      } catch { /* */ }

      // 3) Local tickets queue (same browser) — merged so each user appears ONCE
      const localTickets = readLocalSupportTickets();
      const deletedIds = getDeletedThreadIds();
      const normUn = (v?: string | null) => String(v || '').replace(/^@/, '').trim().toLowerCase();
      const ownId = String((user as { id?: string } | null)?.id || '');
      const byUser = new Map<string, SupportPeer>();
      for (const p of list) {
        const k = String(p.id || '');
        if (!k) continue;
        const prev = byUser.get(k);
        if (!prev) { byUser.set(k, { ...p, id: k }); continue; }
        prev.unread = (prev.unread || 0) + (p.unread || 0);
        if (toMs(p.lastAt) >= toMs(prev.lastAt)) {
          prev.lastAt = p.lastAt ?? prev.lastAt;
          prev.lastMessage = p.lastMessage || prev.lastMessage;
        }
        prev.name = prev.name || p.name;
        prev.username = prev.username || p.username;
        prev.avatarUrl = prev.avatarUrl || p.avatarUrl;
        prev.email = prev.email || p.email;
        prev.online = prev.online || p.online;
      }
      const idByUsername = new Map<string, string>();
      for (const p of byUser.values()) { const u = normUn(p.username); if (u) idByUsername.set(u, p.id); }
      for (const t of localTickets) {
        const un = normUn(t.fromUsername);
        // تذاكر قديمة كانت محفوظة بمعرّف cmt-… لكل رسالة → نعيد تجميعها حسب المستخدم الحقيقي
        const realId = t.fromUserId && !String(t.fromUserId).startsWith('cmt-') ? String(t.fromUserId) : '';
        const key = realId || (un && idByUsername.get(un)) || (un ? `user:${un}` : 'guest');
        if (deletedIds.has(key) && toMs(t.at) <= getSupportWipedAt(key)) continue; // skip deleted threads (unless newer message)
        const existing = byUser.get(key);
        if (existing) {
          if (toMs(t.at) >= toMs(existing.lastAt)) {
            existing.lastMessage = t.text || existing.lastMessage;
            existing.lastAt = t.at || existing.lastAt;
          }
          existing.unread = (existing.unread || 0) + (t.unread || 1);
          existing.name = existing.name || t.fromName || null;
          existing.username = existing.username || t.fromUsername || null;
          existing.email = existing.email || t.fromEmail || null;
        } else {
          byUser.set(key, {
            id: key,
            name: t.fromName || null,
            username: t.fromUsername || null,
            email: t.fromEmail || null,
            avatarUrl: null,
            online: false,
            unread: t.unread || 1,
            lastMessage: t.text,
            lastAt: t.at,
          });
          if (un) idByUsername.set(un, key);
        }
      }
      list = Array.from(byUser.values())
        .filter(p => !ownId || p.id !== ownId)
        .sort((x, y) => toMs(y.lastAt) - toMs(x.lastAt));

      setSupportInbox(list.filter(p => !getDeletedThreadIds().has(p.id) || toMs(p.lastAt) > getSupportWipedAt(p.id)));
      setSupportUnreadTotal(list.reduce((s, x) => s + (x.unread || 0), 0));
    } catch { /* silent */ } finally {
      setSupportInboxLoading(false);
    }
  }

  useEffect(() => {
    if (!user || !isSupportOwnerAccount(user as { email?: string | null; username?: string | null }, profileUsername)) return;
    // Only poll while settings is open; use longer interval to avoid jank
    const boot = window.setTimeout(() => { loadSupportInbox(); }, 50);
    const id = setInterval(loadSupportInbox, 20000);
    const onTicket = () => { loadSupportInbox(); };
    window.addEventListener('stooorna:support-ticket', onTicket);
    window.addEventListener('storage', onTicket);
    return () => {
      clearTimeout(boot);
      clearInterval(id);
      window.removeEventListener('stooorna:support-ticket', onTicket);
      window.removeEventListener('storage', onTicket);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profileUsername]);

  // أيقونتا الدعم تتحولان للبرتقالي طالما فيه رد من الدعم لم يُحذف
  useEffect(() => {
    const uid = (user as { id?: string } | null)?.id;
    if (!uid || isSupportOwnerAccount(user as { email?: string | null; username?: string | null }, profileUsername)) {
      setSupportReplyDot(false);
      setSupportReplies([]);
      return;
    }
    let cancelled = false;
    const check = async () => {
      const list = await fetchSupportReplies(uid, (user as { username?: string | null } | null)?.username);
      if (cancelled) return;
      setSupportReplies(prev => (
        prev.length === list.length && prev[prev.length - 1]?.id === list[list.length - 1]?.id ? prev : list
      ));
      setSupportReplyDot(list.length > 0);
    };
    const boot = window.setTimeout(() => { void check(); }, 800);
    const id = window.setInterval(() => { void check(); }, 8000);
    const onReply = () => { void check(); };
    window.addEventListener('stooorna:support-reply', onReply);
    window.addEventListener('focus', onReply);
    return () => {
      cancelled = true;
      clearTimeout(boot);
      clearInterval(id);
      window.removeEventListener('stooorna:support-reply', onReply);
      window.removeEventListener('focus', onReply);
    };
  }, [user, profileUsername]);

  function deleteSupportReply(id: string) {
    const uid = (user as { id?: string } | null)?.id;
    if (!uid) return;
    const gone = supportReplies.find(m => m.id === id);
    hideSupportReply(uid, id, gone);
    try {
      if (gone) {
        const sig = supportReplySig(gone);
        const rest = readQueuedSupportReplies().filter(q => supportReplySig(q) !== sig);
        localStorage.setItem(SUPPORT_REPLY_QUEUE_KEY, JSON.stringify(rest));
      }
      // حذف من السيرفر إن كان يدعم ذلك (صامت) — حتى لا يرجع بعد تسجيل الخروج/الدخول
      if (/^[A-Za-z0-9_-]{8,}$/.test(id) && !id.startsWith('qreply-')) {
        for (const url of [`/api/support/messages/${encodeURIComponent(id)}`, `/api/notifications/${encodeURIComponent(id)}`]) {
          void fetch(url, { method: 'DELETE', credentials: 'include' }).catch(() => {});
        }
      }
    } catch { /* ignore */ }
    setSupportReplies(prev => {
      const next = prev.filter(m => m.id !== id);
      setSupportReplyDot(next.length > 0);
      if (!next.length) setShowSupportReplies(false);
      return next;
    });
  }

  // Load recordings only when Live tab is active (deferred to keep tab switch smooth)
  useEffect(() => {
    if (!user || tab !== 'live') return;
    const id = window.setTimeout(() => {
      loadRecordings();
      loadLiveRecs();
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab]);

  // Username edit state (for logged-in users)
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState('');

  // Avatar upload state
  const [avatarUrl, setAvatarUrl] = useState<string | null>((user as {
    avatarUrl?: string | null;
    image?: string | null;
  })?.avatarUrl ?? (user as {
    image?: string | null;
  })?.image ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Cover photo state
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Bio state
  const [bio, setBio] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [bioLoading, setBioLoading] = useState(false);
  const [bioMsg, setBioMsg] = useState('');

  // Display name (nickname) edit state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameMsg, setNameMsg] = useState('');
  const [displayNameState, setDisplayNameState] = useState<string>(user?.name ?? '');

  // Business registration (regular user -> Business after owner approval)
  const [businessModalOpen, setBusinessModalOpen] = useState(false);
  const [businessRow, setBusinessRow] = useState<BusinessRegistration | null>(null);
  const [bizBalance, setBizBalance] = useState(0);
  const [bizTopUpOpen, setBizTopUpOpen] = useState(false);
  const [bizCardName, setBizCardName] = useState('');
  const [bizCardNumber, setBizCardNumber] = useState('');
  const [bizCardExp, setBizCardExp] = useState('');
  const [bizCardCvv, setBizCardCvv] = useState('');
  const [vipOn, setVipOn] = useState(false);
  const [appProfits, setAppProfits] = useState(() => getAppProfitsSnapshot());
  const [payoutEmail, setPayoutEmail] = useState(() => {
    try { return localStorage.getItem('stooorna_owner_paypal_email') || ''; } catch { return ''; }
  });
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [profitActionMsg, setProfitActionMsg] = useState('');
  useEffect(() => {
    const syncLocal = () => {
      const base = getAppProfitsSnapshot();
      const own = readOwnerSupportProfit();
      setAppProfits({ coins: Math.max(Number(base.coins) || 0, own.coins), usd: Math.max(Number(base.usd) || 0, own.usd) });
    };
    const syncServer = () => {
      void syncAppProfitsFromServer().then((snap) => {
        const own = readOwnerSupportProfit();
        setAppProfits({ coins: Math.max(Number(snap?.coins) || 0, own.coins), usd: Math.max(Number(snap?.usd) || 0, own.usd) });
      });
      void syncOwnerSupportProfit().then(syncLocal);
    };
    window.addEventListener('stooorna:app-profits', syncLocal);
    window.addEventListener('stooorna:owner-support-profit', syncLocal);
    window.addEventListener('storage', syncLocal);
    // Immediate + interval + when tab becomes visible (other phone sent gifts)
    syncServer();
    const id = window.setInterval(syncServer, 4000);
    const onVis = () => { if (document.visibilityState === 'visible') syncServer(); };
    const onFocus = () => syncServer();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('stooorna:app-profits', syncLocal);
      window.removeEventListener('stooorna:owner-support-profit', syncLocal);
      window.removeEventListener('storage', syncLocal);
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const [vipPayOpen, setVipPayOpen] = useState(false);
  const [vipColor, setVipColor] = useState<'blue' | 'gold' | 'red' | 'green' | 'gray'>('gold');
  const [vipNewUser, setVipNewUser] = useState('');
  const [vipRenameMsg, setVipRenameMsg] = useState('');
  const [vipFeaturesOpen, setVipFeaturesOpen] = useState(false);
  const [vipEightMics, setVipEightMics] = useState(false);
  const [vipRoomMusic, setVipRoomMusic] = useState(false);
  const [vipExpiresAt, setVipExpiresAt] = useState<number | null>(null);
  const [vipTick, setVipTick] = useState(0);
  const [vipInfoOpen, setVipInfoOpen] = useState(false);
  const [vipConfirm, setVipConfirm] = useState<null | { kind: 'color' | 'rename' | 'eightMics' | 'roomMusic'; color?: 'blue' | 'gold' | 'red' | 'green' | 'gray' | 'pink'; nextOn?: boolean }>(null);
  // ── Unsubscribe confirmation (VIP / Business) — shown before anything is cancelled ──
  const [cancelSubConfirm, setCancelSubConfirm] = useState<null | 'vip' | 'business'>(null);
  const [cancellingSub, setCancellingSub] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setVipTick(t => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!user?.id) return;
    const exp = getVipExpiry(user.id);
    setVipExpiresAt(exp);
    if (exp && Date.now() > exp) {
      deactivateVip(user.id);
      setVipOn(false);
    }
  }, [user?.id, vipTick]);
  const [bizTopUpAmount, setBizTopUpAmount] = useState('10');
  const [bizProjectName, setBizProjectName] = useState('');
  const [bizLicense, setBizLicense] = useState('');
  const [bizTradeLicense, setBizTradeLicense] = useState('');
  const [bizCommCert, setBizCommCert] = useState<string>('');
  const [bizCommCertName, setBizCommCertName] = useState('');
  const [bizTradeCert, setBizTradeCert] = useState<string>('');
  const [bizTradeCertName, setBizTradeCertName] = useState('');
  const [bizSubmitting, setBizSubmitting] = useState(false);
  const [ownerBusinessList, setOwnerBusinessList] = useState<BusinessRegistration[]>([]);
  const [ownerBizNotes, setOwnerBizNotes] = useState<Record<string, string>>({});
  const [bizOwnerNoteOpen, setBizOwnerNoteOpen] = useState(false);
  const bizCommFileRef = useRef<HTMLInputElement | null>(null);
  const bizTradeFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setBusinessRow(null);
      setBizBalance(0);
      return;
    }
    const row = getBusinessForUser(user.id);
    setBusinessRow(row);
    if (row?.ownerNote && !row.ownerNoteSeen) setBizOwnerNoteOpen(true);
    try {
      const bal = Number(localStorage.getItem(`stooorna_biz_balance_${user.id}`) || '0') || 0;
      setBizBalance(bal);
    } catch { setBizBalance(0); }
    try {
      const all = JSON.parse(localStorage.getItem('stooorna_vip_plan') || '{}');
      setVipOn(!!all?.[user.id]?.active);
      const colors = JSON.parse(localStorage.getItem('stooorna_vip_color') || '{}');
      if (colors?.[user.id]) setVipColor(colors[user.id]);
      const feats = JSON.parse(localStorage.getItem('stooorna_vip_feats') || '{}');
      const f = feats?.[user.id] || {};
      setVipEightMics(!!f.eightMics);
      setVipRoomMusic(!!f.roomMusic);
      setVipExpiresAt(all?.[user.id]?.expiresAt || null);
    } catch { setVipOn(false); }
    void hydrateVipFromServer(user.id).then(() => {
      try {
        const all = JSON.parse(localStorage.getItem('stooorna_vip_plan') || '{}');
        setVipOn(!!all?.[user.id]?.active);
        const colors = JSON.parse(localStorage.getItem('stooorna_vip_color') || '{}');
        if (colors?.[user.id]) setVipColor(colors[user.id]);
        const feats = JSON.parse(localStorage.getItem('stooorna_vip_feats') || '{}');
        const f = feats?.[user.id] || {};
        setVipEightMics(!!f.eightMics);
        setVipRoomMusic(!!f.roomMusic);
      } catch { /* ignore */ }
    });
    const onBiz = () => {
      const r = getBusinessForUser(user.id);
      setBusinessRow(r);
      if (r?.ownerNote && !r.ownerNoteSeen) setBizOwnerNoteOpen(true);
    };
    window.addEventListener('stooorna:business-registry', onBiz);
    return () => window.removeEventListener('stooorna:business-registry', onBiz);
  }, [user?.id]);

  useEffect(() => {
    const owner = isPrivilegedUser(user as { email?: string | null; username?: string | null; name?: string | null } | null);
    if (!owner) return;
    const refresh = () => setOwnerBusinessList(loadBusinessRegistry());
    refresh();
    window.addEventListener('stooorna:business-registry', refresh);
    return () => window.removeEventListener('stooorna:business-registry', refresh);
  }, [user, tab]);

  // Change email state
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [showEmailPw, setShowEmailPw] = useState(false);

  // Change password state
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmNewPw, setConfirmNewPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // Phone state
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [phoneChecked, setPhoneChecked] = useState(false);

  // Share / QR state
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  // Sync avatarUrl + profileUsername when user object changes — always fetch fresh from DB
  useEffect(() => {
    if (!user) return;
    // Prefer session username immediately (no empty field after signup)
    const sessionUn = String((user as { username?: string | null }).username || '').replace(/^@/, '').trim();
    if (sessionUn) setProfileUsername(sessionUn);
    try {
      const pending = localStorage.getItem('stooorna_pending_username') || '';
      const byEmail = localStorage.getItem(`stooorna_username_${String(user.email || '').toLowerCase()}`) || '';
      const localUn = (pending || byEmail).replace(/^@/, '').trim();
      if (localUn && !sessionUn) setProfileUsername(localUn);
    } catch { /* ignore */ }
    fetch('/api/users/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(async d => {
      if (d?.avatarUrl) {
        const resolved = resolveMediaUrl(d.avatarUrl);
        const probe = new Image();
        probe.onload = () => setAvatarUrl(resolved);
        probe.onerror = () => {
          const cached = readCachedProfileMedia((user as { id?: string }).id, 'avatar');
          if (cached) setAvatarUrl(cached);
        };
        probe.src = resolved;
      } else {
        const cached = readCachedProfileMedia((user as { id?: string }).id, 'avatar');
        if (cached) setAvatarUrl(cached);
      }
      if (d?.username) {
        setProfileUsername(d.username);
        try {
          localStorage.setItem('stooorna_pending_username', String(d.username).replace(/^@/, ''));
          if (user.email) localStorage.setItem(`stooorna_username_${String(user.email).toLowerCase()}`, String(d.username).replace(/^@/, ''));
        } catch { /* */ }
      } else {
        // DB missing username — apply local/session value once
        const fallback = sessionUn || (() => {
          try {
            return (localStorage.getItem('stooorna_pending_username')
              || localStorage.getItem(`stooorna_username_${String(user.email || '').toLowerCase()}`)
              || '').replace(/^@/, '').trim();
          } catch { return ''; }
        })();
        if (fallback) {
          setProfileUsername(fallback);
          try {
            await fetch('/api/users/me', {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: fallback }),
            });
          } catch { /* ignore */ }
        }
      }
      if (d?.phoneNumber) setProfilePhone(d.phoneNumber);
      if (d?.coverUrl) {
        const resolved = resolveMediaUrl(d.coverUrl);
        const probe = new Image();
        probe.onload = () => setCoverUrl(resolved);
        probe.onerror = () => {
          const cached = readCachedProfileMedia((user as { id?: string }).id, 'cover');
          if (cached) setCoverUrl(cached);
        };
        probe.src = resolved;
      } else {
        const cached = readCachedProfileMedia((user as { id?: string }).id, 'cover');
        if (cached) setCoverUrl(cached);
      }
      if (d?.name) setDisplayNameState(d.name);
      const serverPhone = String(d?.phone || d?.phoneNumber || d?.mobile || '').trim();
      let localPhone = '';
      try { localPhone = localStorage.getItem(`stooorna_phone_${String(user.email || '').toLowerCase()}`) || ''; } catch { /* */ }
      setProfilePhone(serverPhone || localPhone);
      if (serverPhone || localPhone) setPhoneInput(serverPhone || localPhone);
      setPhoneChecked(true);
    }).catch(() => setPhoneChecked(true));
  }, [user]);

  // Load bio when user is available
  useEffect(() => {
    if (!user) return;
    fetch('/api/users/me/bio').then(r => r.ok ? r.json() : null).then(d => {
      if (d) setBio(d.bio ?? '');
    });
  }, [user]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  // Live recordings (past broadcasts saved as MP4)
  interface LiveRec {
    id: number;
    title: string | null;
    startedAt: string;
    endedAt: string | null;
    videoUrl: string | null;
    duration: number | null;
    fileSize: number | null;
  }
  const [liveRecs, setLiveRecs] = useState<LiveRec[]>([]);
  const [liveRecsLoading, setLiveRecsLoading] = useState(false);
  const [liveRecDeleting, setLiveRecDeleting] = useState<number | null>(null); // id being deleted
  const [liveRecDeleteConfirm, setLiveRecDeleteConfirm] = useState<number | null>(null); // confirm dialog
  const [liveRecShareId, setLiveRecShareId] = useState<number | null>(null); // share sheet open
  const [liveRecShareCopied, setLiveRecShareCopied] = useState(false);

  // Owner: all users + highlights
  const isOwner = isPrivilegedUser(user as { email?: string | null; username?: string | null; name?: string | null } | null);
  const [ownerSupportEarn, setOwnerSupportEarn] = useState(0);
  const [ownerSupportAlert, setOwnerSupportAlert] = useState<string | null>(null);
  useEffect(() => {
    if (!isOwner) return;
    const read = () => {
      try {
        const raw = JSON.parse(localStorage.getItem('stooorna_owner_support_alerts') || '[]');
        const list = Array.isArray(raw) ? raw.filter((x: any) => x && x.unread !== false) : [];
        setOwnerSupportAlert(list.length ? String(list[list.length - 1].from || 'مستخدم') : null);
      } catch { setOwnerSupportAlert(null); }
    };
    read();
    const onAlert = (e: Event) => {
      const from = String((e as CustomEvent).detail?.from || 'مستخدم');
      setOwnerSupportAlert(from);
    };
    window.addEventListener('stooorna:owner-support-alert', onAlert);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener('stooorna:owner-support-alert', onAlert);
      window.removeEventListener('storage', read);
    };
  }, [isOwner]);
  const [ownerControlOn, setOwnerControlOn] = useState(() => {
    try { return localStorage.getItem('stooorna_owner_control_on') !== '0'; } catch { return true; }
  });
  useEffect(() => {
    if (!isOwner) return;
    const uid = String(
      (user as { id?: string; username?: string } | null)?.id
      || (user as { username?: string } | null)?.username
      || 'stooorna',
    );
    const pull = () => {
      void syncEarningsFromServer(uid).then((n) => {
        const v = Math.max(
          n,
          readUserEarnings(uid),
          readUserEarnings('stooorna'),
          readUserEarnings('Stooorna'),
        );
        setOwnerSupportEarn(v);
      });
    };
    pull();
    const id = window.setInterval(pull, 5000);
    const onVis = () => { if (document.visibilityState === 'visible') pull(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isOwner, user]);

  const [ownerDockOnly] = useState(() => {
    try {
      if (sessionStorage.getItem('stooorna_owner_dock_only') === '1') {
        sessionStorage.removeItem('stooorna_owner_dock_only');
        return true;
      }
    } catch { /* */ }
    return false;
  });
  useEffect(() => {
    if (!ownerDockOnly) return;
    startTransition(() => setTab('companies'));
    try { loadOwnerData(); } catch { /* */ }
    try { refreshOwnerCompanies(); } catch { /* */ }
  }, [isOwner, ownerDockOnly]);

  // Non-owners never stay on the Company tab
  useEffect(() => {
    if (tab !== 'companies') return;
    if (!isSupportOwnerAccount(
      user as { email?: string | null; username?: string | null; name?: string | null },
      profileUsername,
    )) {
      setTab('account');
    }
  }, [tab, user, profileUsername]);


  // Load owner data (users list) when logged in as owner
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Defer heavy owner fetches until Company tab or admin panels open (prevents settings freeze)
  useEffect(() => {
    if (!user || !isOwner) return;
    if (tab !== 'companies' && !showSupportUsers && !showOwnerCompanies) return;
    const id = window.setTimeout(() => {
      void loadOwnerData();
      void loadNewCompanies();
      if (tab === 'companies' || showOwnerCompanies) refreshOwnerCompanies();
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isOwner, tab, showSupportUsers, showOwnerCompanies]);
  const [allUsers, setAllUsers] = useState<{
    id: string;
    name: string | null;
    username: string | null;
    email: string;
    isBanned: boolean | null;
    lastIp: string | null;
    isRoomAdmin: boolean | null;
    createdAt: string | null;
    nameColor?: string | null;
    country?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    accountType?: string | null;
    type?: string | null;
    role?: string | null;
    isCompany?: boolean | null;
    companyName?: string | null;
    tradeName?: string | null;
    licenseNumber?: string | null;
  }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  // Presence for owner users list (أفراد + شركات داخل كنترول المستخدمين)
  const ownerUserIds = useMemo(
    () => [...allUsers.map(u => u.id), ...allCompanyCtrlUsers.map(u => u.id)],
    [allUsers, allCompanyCtrlUsers],
  );
  const ownerPresence = usePresenceQuery(isOwner ? ownerUserIds : []);



  async function loadRecordings() {
    setRecLoading(true);
    try {
      const res = await fetch('/api/recordings', {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setRecordings(data);
      }
    } catch {
      // silent
    } finally {
      setRecLoading(false);
    }
  }
  async function loadLiveRecs() {
    setLiveRecsLoading(true);
    try {
      const res = await fetch('/api/live/recordings', {
        credentials: 'include'
      });
      if (res.ok) setLiveRecs(await res.json());
    } catch {/* silent */} finally {
      setLiveRecsLoading(false);
    }
  }
  async function deleteLiveRec(id: number) {
    setLiveRecDeleting(id);
    try {
      const res = await fetch(`/api/live/recordings/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) setLiveRecs(prev => prev.filter(r => r.id !== id));
    } catch {/* silent */} finally {
      setLiveRecDeleting(null);
      setLiveRecDeleteConfirm(null);
    }
  }
  function shareLiveRec(rec: LiveRec) {
    setLiveRecShareId(rec.id);
    setLiveRecShareCopied(false);
  }
  function copyLiveRecLink(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setLiveRecShareCopied(true);
      setTimeout(() => setLiveRecShareCopied(false), 2000);
    }).catch(() => {});
  }
  async function loadOwnerData() {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const usersRes = await fetch('/api/owner/users', { credentials: 'include' });
      if (usersRes.ok) {
        const data = await usersRes.json();
        const rows: any[] = Array.isArray(data) ? data : (data?.rows ?? []);

        // Split: people → تبويب مستخدمين | companies → تبويب شركات داخل كنترول + سجل الشركات
        const people: typeof allUsers = [];
        const companies: typeof allCompanyCtrlUsers = [];
        for (const row of rows) {
          if (isUserWiped(row)) {
            // محذوف نهائياً: نخفيه تماماً ونعيد محاولة المسح من السيرفر بصمت (بدون وسمه كمحذوف من جديد)
            void purgeUserOnServer({ id: String(row.id || ''), email: row.email, username: row.username });
            continue;
          }
          if (isUserDeleted(row)) {
            void permanentlyDeleteSupportUser({
              id: String(row.id || ''),
              email: row.email,
              username: row.username,
            });
            continue;
          }
          if (isCompanyAccountRow(row)) {
            ensureCompanyInRegistry(row);
            companies.push(row);
          } else {
            people.push(row);
          }
        }
        setAllUsers(people);
        setAllCompanyCtrlUsers(companies);
        startTransition(() => { setOwnerCompanies(sanitizeCompaniesRegistry()); });
      } else {
        const errText = await usersRes.text().catch(() => String(usersRes.status));
        setUsersError(`Error ${usersRes.status}: ${errText}`);
        console.error('[loadOwnerData] status', usersRes.status, errText);
      }
    } catch (e) {
      setUsersError(`Network error: ${String(e)}`);
      console.error('[loadOwnerData] error', e);
    } finally {
      setUsersLoading(false);
    }
  }
  async function saveEmail() {
    setEmailLoading(true);
    setEmailMsg('');
    try {
      const r = await fetch('/api/users/me/email', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          newEmail,
          currentPassword: emailPassword
        })
      });
      const d = await r.json();
      if (r.ok) {
        setEmailMsg('Email updated!');
        setEditingEmail(false);
        setEmailPassword('');
        setNewEmail('');
      } else setEmailMsg(d.error || 'Failed');
    } catch {
      setEmailMsg('Network error');
    } finally {
      setEmailLoading(false);
    }
  }
  async function savePassword() {
    setPwLoading(true);
    setPwMsg('');
    if (newPw !== confirmNewPw) {
      setPwMsg('New passwords do not match');
      setPwLoading(false);
      return;
    }
    if (newPw.length < 8) {
      setPwMsg('Password must be at least 8 characters');
      setPwLoading(false);
      return;
    }
    try {
      const r = await fetch('/api/users/me/password', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentPassword: currentPw,
          newPassword: newPw
        })
      });
      const d = await r.json();
      if (r.ok) {
        setPwMsg('Password changed!');
        setEditingPassword(false);
        setCurrentPw('');
        setNewPw('');
        setConfirmNewPw('');
      } else setPwMsg(d.error || 'Failed');
    } catch {
      setPwMsg('Network error');
    } finally {
      setPwLoading(false);
    }
  }
  async function savePhone() {
    setPhoneLoading(true);
    setPhoneMsg('');
    try {
      const bind = await fetch('/api/password/phone-bind', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user?.email || '', phone: phoneInput }) });
      const bindData = await bind.json().catch(() => ({} as any));
      if (!bind.ok && (bind.status === 409 || bindData.error === 'phone_taken')) {
        setPhoneMsg('هذا الرقم مستخدم على حساب آخر');
        setPhoneLoading(false);
        return;
      }
      const r = await fetch('/api/users/me/phone', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput, email: user?.email || '' })
      });
      const d = await r.json().catch(() => ({} as any));
      if (r.status === 409 || d.error === 'phone_taken') {
        setPhoneMsg('هذا الرقم مستخدم على حساب آخر');
        return;
      }
      if (r.ok) {
        if (user?.email) localStorage.setItem(`stooorna_phone_${String(user.email).toLowerCase()}`, phoneInput);
        setPhoneMsg('Saved!');
        setEditingPhone(false);
        setProfilePhone(d.phone || phoneInput);
      } else setPhoneMsg(d.error || 'Failed');
    } catch {
      setPhoneMsg('Network error');
    } finally {
      setPhoneLoading(false);
    }
  }
  async function saveBio() {
    setBioLoading(true);
    setBioMsg('');
    try {
      const r = await fetch('/api/users/me/bio', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bio: bioInput
        })
      });
      const d = await r.json();
      if (r.ok) {
        setBio(d.bio);
        setEditingBio(false);
      } else setBioMsg(d.error || 'Failed');
    } catch {
      setBioMsg('Error saving');
    } finally {
      setBioLoading(false);
    }
  }
  async function saveName() {
    setNameLoading(true);
    setNameMsg('');
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameMsg('Name cannot be empty');
      setNameLoading(false);
      return;
    }
    if (trimmed.length > 60) {
      setNameMsg('Max 60 characters');
      setNameLoading(false);
      return;
    }
    try {
      const r = await fetch('/api/users/me/name', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: trimmed
        })
      });
      const d = await r.json();
      if (r.ok) {
        setDisplayNameState(d.name);
        setEditingName(false);
        setNameMsg('');
      } else {
        setNameMsg(d.error || 'Failed to update name');
      }
    } catch {
      setNameMsg('Error saving');
    } finally {
      setNameLoading(false);
    }
  }
  function copyLink(profileUrl: string) {
    navigator.clipboard.writeText(profileUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  async function saveUsername() {
    setUsernameLoading(true);
    setUsernameMsg('');
    const un = newUsername.trim().replace(/^@/, '');
    if (!/^[a-zA-Z0-9_]{2,30}$/.test(un)) {
      setUsernameMsg('2–30 حرفاً — حروف/أرقام/_ فقط · 2–30 chars');
      setUsernameLoading(false);
      return;
    }
    // Check availability (skip if unchanged)
    if (un !== String((user as { username?: string }).username || profileUsername || '').replace(/^@/, '')) {
      try {
        const chk = await fetch(`/api/users/check-username?username=${encodeURIComponent(un)}`);
        const d = await chk.json();
        if (d.available === false || d.taken === true) {
          setUsernameMsg('غير متاح — اليوزر مستخدم · Username taken');
          setUsernameLoading(false);
          return;
        }
        // سجل الشركات المحلي
        try {
          const reg = loadCompaniesRegistry();
          if (reg.some(c => String(c.username || '').replace(/^@/, '').toLowerCase() === un.toLowerCase()
            && String(c.email || '').toLowerCase() !== String((user as any)?.email || '').toLowerCase())) {
            setUsernameMsg('غير متاح — اليوزر مستخدم · Username taken');
            setUsernameLoading(false);
            return;
          }
        } catch { /* */ }
      } catch {/* network error — proceed */}
    }
    try {
      const r = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: un
        })
      });
      const d = await r.json();
      if (!r.ok) setUsernameMsg(d.error || 'Failed'); else {
        setUsernameMsg('متاح وتم الحفظ · Saved!');
        setEditingUsername(false);
        setProfileUsername(un);
        setNewUsername(un);
        // حدّث سجل الشركة إن وُجد
        try {
          const em = String((user as any)?.email || '').toLowerCase();
          if (em) {
            const co = findCompanyByEmail(em);
            if (co) {
              upsertCompanyRegistration({ ...co, username: un, updatedAt: new Date().toISOString() });
            }
          }
        } catch { /* */ }
      }
    } catch {
      setUsernameMsg('Error saving');
    } finally {
      setUsernameLoading(false);
    }
  }
  async function uploadAvatar(file: File) {
    setAvatarUploading(true);
    try {
      const localPreview = await fileToDataUrl(file);
      setAvatarUrl(localPreview);
      cacheProfileMedia(user?.id, 'avatar', localPreview);
      window.dispatchEvent(new CustomEvent('stooorna:avatar-updated', { detail: { avatarUrl: localPreview, userId: user?.id } }));
      try {
        await fetch('/api/users/me', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatarUrl: localPreview }),
        });
      } catch { /* optional */ }
      const r = await fetch('/api/users/me/avatar', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': file.type || 'image/jpeg'
        },
        body: file
      });
      const d = await r.json().catch(() => ({} as { avatarUrl?: string; url?: string; image?: string }));
      const remote = d?.avatarUrl || d?.url || d?.image;
      if (r.ok && remote) {
        const resolved = resolveMediaUrl(remote);
        const fresh = resolved + (resolved.includes('?') ? '&' : '?') + 't=' + Date.now();
        const probe = new Image();
        probe.onload = () => {
          setAvatarUrl(fresh);
          window.dispatchEvent(new CustomEvent('stooorna:avatar-updated', { detail: { avatarUrl: fresh, userId: user?.id } }));
        };
        probe.onerror = () => {
          window.dispatchEvent(new CustomEvent('stooorna:avatar-updated', { detail: { avatarUrl: localPreview, userId: user?.id } }));
        };
        probe.src = fresh;
      }
    } catch {/* silent */} finally {
      setAvatarUploading(false);
    }
  }
  async function uploadCover(file: File) {
    setCoverUploading(true);
    try {
      const localPreview = await fileToDataUrl(file);
      setCoverUrl(localPreview);
      cacheProfileMedia(user?.id, 'cover', localPreview);
      try {
        await fetch('/api/users/me', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coverUrl: localPreview }),
        });
      } catch { /* optional */ }
      const r = await fetch('/api/users/me/cover', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': file.type || 'image/jpeg'
        },
        body: file
      });
      const d = await r.json();
      if (r.ok && d.coverUrl) {
        const resolved = resolveMediaUrl(d.coverUrl);
        const fresh = resolved + (resolved.includes('?') ? '&' : '?') + 't=' + Date.now();
        const probe = new Image();
        probe.onload = () => setCoverUrl(fresh);
        probe.src = fresh;
      }
    } catch {/* silent */} finally {
      setCoverUploading(false);
    }
  }
  async function handleLogout() {
    await signOut();
  }
  function handleDelete(id: number) {
    fetch(`/api/recordings/${id}`, {
      method: 'DELETE'
    }).catch(() => {});
    setRecordings(prev => prev.filter(r => r.id !== id));
  }
  return <>
      <Helmet>
        <title>Settings | Stooorna</title>
        <meta name="description" content="Manage your Stooorna account — update your profile, change your username, manage recordings, and configure your app." />
        <link rel="canonical" href="https://stooorna.com/settings" />
        <meta property="og:title" content="Settings | Stooorna" />
        <meta property="og:description" content="Manage your Stooorna account — profile, username, recordings, and app settings." />
        <meta property="og:image" content="https://stooorna.com/og-image.svg" />
        <meta property="og:url" content="https://stooorna.com/settings" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://stooorna.com/og-image.svg" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="relative flex flex-col overflow-hidden select-none min-h-0" style={{
      height: '100dvh',
      minHeight: '100dvh',
      background: T.bg,
      fontFamily: 'var(--font-sans)'
    }}>
        <h1 className="sr-only">Settings</h1>

        {/* صفحة المشاركة داخل فقاعة الإعدادات (بدل صفحة مستقلة) */}
        {sharePageOpen && (
          <SharePageView
            embedded
            username={profileUsername ?? ''}
            onBack={() => setSharePageOpen(false)}
          />
        )}

        {/* Background glow */}
        <motion.div className="pointer-events-none absolute" style={{
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: `radial-gradient(circle, rgba(0,188,212,0.1) 0%, transparent 70%)`,
        top: '20%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }} animate={{
        opacity: [0.4, 0.7, 0.4]
      }} transition={{
        duration: 4,
        repeat: Infinity,
        ease: 'easeInOut'
      }} />

        {/* Header — map pin (GPS live) left + Settings title + Support icon right */}
        <div className="flex items-center justify-between px-5 pt-10 pb-4 z-10" style={{
        borderBottom: `1px solid ${T.navBorder}`
      }}>
          {/* أيقونة الخريطة نُقلت لصفحة القصة بجانب أيقونة البث — مساحة فارغة تحافظ على توسّط العنوان */}
          <span aria-hidden="true" style={{ width: 36, height: 36, flexShrink: 0 }} />
          <p style={{
          letterSpacing: '0.3em',
          fontSize: '0.7rem',
          color: T.primaryDim,
          fontWeight: 600,
          textTransform: 'uppercase',
          margin: 0
        }}>
            Settings
          </p>
          {/*
            أيقونة الدعم فوق:
            - مستخدم عادي مسجّل → تظهر
            - حساب الدعم @Stooorna / Stooorna@mail.com فقط → تُخفى (له قسم تحت الأصدقاء)
            - غير مسجّل → تُخفى
          */}
          {shouldShowSupportHeaderIcon(
            user as { email?: string | null; username?: string | null; name?: string | null } | null,
            profileUsername,
          ) ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* زر قراءة رد الدعم — برتقالي عند وجود رسالة */}
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => setShowSupportReplies(true)}
                title="Support replies"
                aria-label="Support replies"
                animate={supportReplyDot ? { boxShadow: ['0 0 6px rgba(249,115,22,0.35)', '0 0 16px rgba(249,115,22,0.8)', '0 0 6px rgba(249,115,22,0.35)'] } : { boxShadow: '0 0 0px rgba(0,0,0,0)' }}
                transition={supportReplyDot ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: (supportReplyDot || showSupportReplies) ? 'rgba(249,115,22,0.16)' : 'rgba(148,163,184,0.12)',
                  border: `1px solid ${(supportReplyDot || showSupportReplies) ? 'rgba(249,115,22,0.7)' : 'rgba(148,163,184,0.35)'}`,
                  color: (supportReplyDot || showSupportReplies) ? '#f97316' : '#94a3b8',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s, border-color 0.2s, color 0.2s',
                }}
              >
                <MessageCircle size={18} strokeWidth={2.2} />
                {supportReplies.length > 0 && (
                  <span style={{
                    position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 8, padding: '0 4px',
                    background: '#f97316', color: '#fff', fontSize: '0.6rem', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #ffffff',
                    boxSizing: 'content-box',
                  }}>
                    {supportReplies.length > 9 ? '9+' : supportReplies.length}
                  </span>
                )}
              </motion.button>

              {/* أيقونة الدعم (كتابة المشكلة) — تتحول للبرتقالي عند وجود رد */}
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={() => setShowSupportChat(true)}
                title="Support"
                aria-label="Support"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: supportReplyDot ? 'rgba(249,115,22,0.16)' : 'rgba(0,188,212,0.12)',
                  border: `1px solid ${supportReplyDot ? 'rgba(249,115,22,0.7)' : 'rgba(0,188,212,0.4)'}`,
                  color: supportReplyDot ? '#f97316' : '#00BCD4',
                  cursor: 'pointer',
                  boxShadow: supportReplyDot ? '0 0 12px rgba(249,115,22,0.4)' : '0 0 12px rgba(0,188,212,0.25)',
                  position: 'relative',
                  transition: 'background 0.2s, border-color 0.2s, color 0.2s',
                }}
              >
                <Headphones size={18} strokeWidth={2.2} />
              </motion.button>
            </div>
          ) : (
            <div style={{ width: 36 }} />
          )}
        </div>

        {/* Tabs — only when logged in */}
        {user && <div className="flex z-10 px-5 pt-4 gap-3">
            {((isSupportOwnerAccount(
              user as { email?: string | null; username?: string | null; name?: string | null },
              profileUsername,
            ) ? (['account', 'live', 'companies'] as Tab[]) : (['account', 'live'] as Tab[]))).filter(t => ownerDockOnly ? t === 'companies' : true).map(t => <button key={t} type="button" onClick={() => startTransition(() => setTab(t))} style={{
          flex: 1,
          padding: '8px 0',
          borderRadius: 8,
          border: `1px solid ${tab === t ? T.tabBorder : T.surfaceBorder}`,
          background: tab === t ? T.tabActive : 'transparent',
          color: tab === t ? T.primary : T.textMuted,
          fontSize: '0.72rem',
          fontWeight: 600,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}>
                {t === 'account' ? 'Profile' : t === 'live' ? 'Live' : 'Company'}
              </button>)}
          </div>}

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain z-10 px-5 pt-6 pb-28" style={{
        WebkitOverflowScrolling: 'touch'
      }}>
          <AnimatePresence initial={false}>

            {/* ── LOADING ── */}
            {isPending && <motion.div key="loading" initial={{
            opacity: 0
          }} animate={{
            opacity: 1
          }} exit={{
            opacity: 0
          }} className="flex items-center justify-center pt-20">
                <motion.div animate={{
              rotate: 360
            }} transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'linear'
            }} style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: `2px solid ${T.primaryBorder}`,
              borderTopColor: T.primary
            }} />
              </motion.div>}

            {/* ── NOT LOGGED IN ── */}
            {!isPending && !user && <motion.div key="auth" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
              <AuthScreen T={T} />
            </motion.div>}

            {/* ── LOGGED IN — ACCOUNT (MY PROFILE) TAB ── */}
            {!isPending && user && tab === 'account' && (() => {
            const displayName = displayNameState || user.name || profileUsername || 'User';
            const profileUrl = profileUsername ? `https://stooorna.com/u/${profileUsername}` : '';
            return <motion.div key="account" initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} className="flex flex-col gap-5">
                  {/* ── Hero: Cover + Avatar + Name ── */}
                  <div style={{
                borderRadius: 16,
                overflow: 'hidden',
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                position: 'relative',
              }}>

                    {/* Cover photo strip */}
                    <div style={{
                  position: 'relative',
                  width: '100%',
                  height: 110,
                  background: coverUrl ? 'transparent' : T.primaryFaint,
                  cursor: 'pointer'
                }} onClick={() => coverInputRef.current?.click()}>
                      {coverUrl ? <img src={resolveMediaUrl(coverUrl) || coverUrl} alt="cover" style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }} /> : <div style={{
                    width: '100%',
                    height: '100%'
                  }} />}
                      {/* dark overlay on hover hint */}
                      <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: coverUploading ? 1 : 0,
                    transition: 'opacity 0.2s',
                    pointerEvents: 'none'
                  }}>
                        {coverUploading && <motion.div animate={{
                      rotate: 360
                    }} transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      ease: 'linear'
                    }} style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: `2px solid ${T.primary}`,
                      borderTopColor: 'transparent'
                    }} />}
                      </div>
                      {/* camera badge top-right */}
                      {!coverUploading && <div style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.55)',
                    border: `1.5px solid rgba(255,255,255,0.15)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none'
                  }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        </div>}
                      <input ref={coverInputRef} type="file" accept="image/*" style={{
                    display: 'none'
                  }} onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) uploadCover(f);
                    e.target.value = '';
                  }} />
                    </div>

                    {/* Avatar overlapping the cover */}
                    <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  paddingBottom: 18,
                  marginTop: -40
                }}>
                      <div className="relative" style={{
                    flexShrink: 0
                  }}>
                        <>
                        <motion.button whileTap={{
                      scale: 0.92
                    }} onClick={() => avatarInputRef.current?.click()} style={{
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      background: avatarUrl ? 'transparent' : T.primaryFaint,
                      border: isOwner ? '3px solid #2563eb' : `3px solid rgba(6,14,14,0.95)`,
                      boxShadow: isOwner ? '0 0 0 2px rgba(37,99,235,0.35), 0 0 18px rgba(37,99,235,0.45)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      position: 'relative'
                    }}>
                          {avatarUrl ? <img src={resolveMediaUrl(avatarUrl) || avatarUrl} alt="avatar" style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }} /> : <User size={30} style={{
                        color: T.primary
                      }} />}
                          <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.45)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: avatarUploading ? 1 : 0,
                        transition: 'opacity 0.2s'
                      }}>
                            {avatarUploading && <motion.div animate={{
                          rotate: 360
                        }} transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          ease: 'linear'
                        }} style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          border: `2px solid ${T.primary}`,
                          borderTopColor: 'transparent'
                        }} />}
                          </div>
                        </motion.button>
                        </>
                        {/* camera badge — zIndex matches the online dot below so it renders above the VIP ring instead of behind it */}
                        <div style={{
                      position: 'absolute',
                      bottom: 2,
                      right: 2,
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: T.primary,
                      border: '2.5px solid rgba(6,14,14,0.95)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                      zIndex: 2
                    }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        </div>
                        {/* online dot */}
                        <span style={{
                      position: 'absolute',
                      top: 4,
                      right: 2,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: '#22c55e',
                      border: '2.5px solid rgba(6,14,14,0.95)',
                      boxShadow: '0 0 8px rgba(34,197,94,0.8)',
                      zIndex: 2
                    }} />
                        <input ref={avatarInputRef} type="file" accept="image/*" style={{
                      display: 'none'
                    }} onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) uploadAvatar(f);
                      e.target.value = '';
                    }} />
                      </div>

                      {/* Name + username + online label */}
                      <div style={{
                    textAlign: 'center',
                    marginTop: 10
                  }}>
                        {/* OWNER badge */}
                        {isOwner && <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 5
                    }}>
                            <span style={{
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        color: '#fff',
                        background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                        borderRadius: 6,
                        padding: '2px 8px',
                        boxShadow: '0 0 10px rgba(37,99,235,0.6)',
                        letterSpacing: '0.08em'
                      }}>OWNER</span>
                          </div>}
                        <p style={{
                      color: isOwner ? '#2563eb' : T.text,
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      lineHeight: 1.2,
                      textShadow: isOwner ? '0 0 12px rgba(37,99,235,0.6)' : 'none'
                    }}>{displayName}</p>
                        {profileUsername && <p style={{
                      color: isOwner ? '#2563eb' : T.primaryDim,
                      fontSize: '0.78rem',
                      marginTop: 3,
                      fontWeight: isOwner ? 700 : 400,
                      textShadow: isOwner ? '0 0 8px rgba(37,99,235,0.5)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap',
                    }}><span style={resolveVipNameStyle(user?.id)}>@{profileUsername}</span>
                      {false && <BusinessHeadBadge />}
                    </p>}
                    {profileCountry ? (
                      <p style={{ margin: '4px 0 0', color: 'rgba(160,200,200,0.75)', fontSize: '0.7rem', fontWeight: 700 }}>
                        {profileCountry}
                      </p>
                    ) : null}
                        <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      marginTop: 7
                    }}>
                          <span style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: '#22c55e',
                        boxShadow: '0 0 6px rgba(34,197,94,0.8)',
                        display: 'inline-block'
                      }} />
                          <span style={{
                        color: '#22c55e',
                        fontSize: '0.68rem',
                        fontWeight: 600
                      }}>Online</span>
                        </div>
                      </div>

                      {/* Music button — right side of profile card */}
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setMusicModalOpen(true)}
                        aria-label="Music"
                        title="Music"
                        style={{
                          position: 'absolute',
                          right: 14,
                          bottom: 18,
                          zIndex: 5,
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: musicIsPlaying ? 'rgba(0,188,212,0.22)' : 'rgba(0,188,212,0.1)',
                          border: `1px solid ${musicIsPlaying ? 'rgba(0,188,212,0.65)' : 'rgba(0,188,212,0.35)'}`,
                          color: '#00BCD4',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: musicIsPlaying
                            ? '0 0 10px rgba(0,188,212,0.4)'
                            : '0 1px 6px rgba(0,0,0,0.2)',
                        }}
                      >
                        <Music size={14} strokeWidth={2.2} />
                      </motion.button>

                      {/* Wallet ($) button — left side of profile card, same size as Music */}
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setWalletOpen(true)}
                        aria-label="Wallet"
                        title="Wallet"
                        style={{
                          position: 'absolute',
                          left: 14,
                          bottom: 18,
                          zIndex: 5,
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: walletOpen ? 'rgba(250,204,21,0.22)' : 'rgba(250,204,21,0.1)',
                          border: `1px solid ${walletOpen ? 'rgba(250,204,21,0.65)' : 'rgba(250,204,21,0.35)'}`,
                          color: '#facc15',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: walletOpen
                            ? '0 0 10px rgba(250,204,21,0.4)'
                            : '0 1px 6px rgba(0,0,0,0.2)',
                        }}
                      >
                        <DollarSign size={15} strokeWidth={2.6} />
                      </motion.button>
                    </div>
                  </div>

                  {/* ── شات الدعم + تحكم المستخدمين — فقط المالك والمشرفون ── */}
                  {isPrivilegedUser(
                    user as { email?: string | null; username?: string | null; name?: string | null },
                  ) && (
                    <>
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={() => {
                          loadSupportInbox();
                          setShowOwnerInbox(true);
                        }}
                        className="flex items-center justify-between"
                        style={{
                          width: '100%',
                          background: T.surface,
                          border: `1px solid ${supportUnreadTotal > 0 ? T.primaryBorder : T.surfaceBorder}`,
                          borderRadius: 14,
                          padding: '14px 16px',
                          color: T.text,
                          cursor: 'pointer',
                        }}
                        aria-label="Support Chat"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex items-center justify-center" style={{
                            width: 38, height: 38, borderRadius: 12, background: T.primaryFaint,
                            border: `1px solid ${T.primaryBorder}`, color: T.primary, position: 'relative',
                          }}>
                            <MessageCircle size={19} strokeWidth={2.1} />
                            {supportUnreadTotal > 0 && (
                              <span style={{
                                position: 'absolute', top: -4, right: -4,
                                minWidth: 16, height: 16, borderRadius: 8, padding: '0 4px',
                                background: '#ef4444', color: '#fff', fontSize: '0.55rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {supportUnreadTotal > 9 ? '9+' : supportUnreadTotal}
                              </span>
                            )}
                          </span>
                          <span style={{ textAlign: 'left' }}>
                            <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700 }}>Support Chat</span>
                            <span style={{ display: 'block', marginTop: 2, color: T.textMuted, fontSize: '0.68rem' }}>
                              {supportUnreadTotal > 0
                                ? `${supportUnreadTotal} new message${supportUnreadTotal > 1 ? 's' : ''} from users`
                                : supportInbox.length > 0
                                  ? `${supportInbox.length} conversation${supportInbox.length > 1 ? 's' : ''} — tap to enter`
                                  : 'Click to enter even if there are no messages'}
                            </span>
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {supportUnreadTotal > 0 && (
                            <Bell size={15} style={{ color: '#eab308' }} />
                          )}
                          <span style={{ color: T.primary, fontSize: '1.25rem', lineHeight: 1 }}>‹</span>
                        </div>
                      </motion.button>

                    </>
                  )}

                  {/* Wallet — always visible for Business and VIP */}
                  {false && (
                    <div style={{
                      background: T.surface,
                      border: `1px solid ${T.surfaceBorder}`,
                      borderRadius: 14,
                      padding: '14px 16px',
                      marginBottom: 10,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <p style={{
                            color: '#eab308', fontSize: '0.62rem', letterSpacing: '0.2em',
                            textTransform: 'uppercase', fontWeight: 700, margin: 0,
                          }}>My balance</p>
                          <p style={{ margin: '6px 0 0', color: '#eab308', fontSize: '1.15rem', fontWeight: 900 }}>
                            {bizBalance.toFixed(0)} KD
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="Add balance"
                          onClick={() => setBizTopUpOpen(true)}
                          style={{
                            width: 36, height: 36, borderRadius: '50%', border: '1.5px solid rgba(234,179,8,0.55)',
                            background: 'rgba(234,179,8,0.15)', color: '#eab308', fontWeight: 900,
                            fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1,
                          }}
                        >
                          +
                        </button>
                      </div>
                      <p style={{ margin: '10px 0 0', color: T.primaryDim, fontSize: '0.7rem', fontWeight: 600, lineHeight: 1.45 }}>
                        /* wallet copy removed */
                      </p>
                    </div>
                  )}

                  {/* Business + VIP account sections removed */}

                  {/* ── Display Name ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8
                }}>
                      <p style={{
                    color: T.textMuted,
                    fontSize: '0.62rem',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    fontWeight: 500
                  }}>Display Name</p>
                      {!editingName && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingName(true);
                    setNameInput(displayName === 'User' ? '' : displayName);
                    setNameMsg('');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={13} />
                        </motion.button>}
                    </div>
                    <AnimatePresence mode="wait">
                      {editingName ? <motion.div key="edit-name" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }}>
                          <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value.slice(0, 60))} placeholder="اكتب اسمك المستعار…" autoFocus style={{
                      width: '100%',
                      padding: '9px 11px',
                      background: T.inputBg,
                      border: `1px solid ${T.inputBorder}`,
                      borderRadius: 9,
                      color: T.text,
                      fontSize: '0.83rem',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)'
                    }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} onKeyDown={e => {
                      if (e.key === 'Enter') saveName();
                      if (e.key === 'Escape') {
                        setEditingName(false);
                        setNameMsg('');
                      }
                    }} />
                          <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 7
                    }}>
                            <p style={{
                        color: T.textMuted,
                        fontSize: '0.62rem'
                      }}>{nameInput.length}/60</p>
                            <div style={{
                        display: 'flex',
                        gap: 7
                      }}>
                              <motion.button whileTap={{
                          scale: 0.9
                        }} onClick={() => {
                          setEditingName(false);
                          setNameMsg('');
                        }} style={{
                          padding: '5px 9px',
                          background: 'none',
                          border: `1px solid ${T.surfaceBorder}`,
                          borderRadius: 7,
                          color: T.textMuted,
                          cursor: 'pointer'
                        }}>
                                <X size={12} />
                              </motion.button>
                              <motion.button whileTap={{
                          scale: 0.9
                        }} onClick={saveName} disabled={nameLoading} style={{
                          padding: '5px 13px',
                          background: T.primaryFaint,
                          border: `1px solid ${T.primaryBorder}`,
                          borderRadius: 7,
                          color: T.primary,
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}>
                                {nameLoading ? '…' : <Check size={12} />}
                              </motion.button>
                            </div>
                          </div>
                          {nameMsg && <p style={{
                      color: '#ef4444',
                      fontSize: '0.68rem',
                      marginTop: 3
                    }}>{nameMsg}</p>}
                        </motion.div> : <motion.p key="view-name" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} style={{
                    color: T.text,
                    fontSize: '0.83rem',
                    lineHeight: 1.55
                  }}>
                          {displayName && displayName !== 'User' ? displayName : <span style={{
                      color: T.textMuted,
                      fontStyle: 'italic'
                    }}>لم يتم تعيين اسم — اضغط تعديل</span>}
                        </motion.p>}
                    </AnimatePresence>
                  </div>
                  {/* ── Profits (Owner @Stooorna only) ── */}
                  {isOwner && ownerSupportAlert && (
                    <button
                      type="button"
                      onClick={() => { setShowOwnerInbox(true); setOwnerSupportAlert(null); try { localStorage.setItem('stooorna_owner_support_alerts', '[]'); } catch { /* */ } }}
                      style={{ width: '100%', marginTop: 10, padding: '12px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'right', background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.45)', color: '#fff', fontWeight: 800 }}
                    >
                      لديك رساله جديده
                      <span style={{ display: 'block', marginTop: 4, color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: '0.75rem' }}>{ownerSupportAlert}</span>
                    </button>
                  )}
                  {isOwner && (
                  <div style={{
                background: T.surface,
                border: '1px solid rgba(234,179,8,0.35)',
                borderRadius: 14,
                padding: '14px 16px',
                marginTop: 10,
              }}>
                    <p style={{
                    color: '#eab308',
                    fontSize: '0.62rem',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    margin: '0 0 10px',
                  }}>Profits</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                      <span style={{ color: '#fff', fontWeight: 900, fontSize: '1.45rem' }}>
                        {Number(appProfits.usd || 0).toFixed(2)}
                      </span>
                      <span style={{ color: 'rgba(200,220,220,0.55)', fontSize: '0.75rem', fontWeight: 700 }}>USD</span>
                    </div>
                    <p style={{ margin: '0 0 12px', color: 'rgba(200,220,220,0.7)', fontSize: '0.78rem' }}>
                      Coins · {Number(appProfits.coins || 0).toLocaleString('en-US')}
                      <span style={{ color: 'rgba(150,180,180,0.5)', marginLeft: 8 }}>(نصف الدعم وصل للأونر عبر السيرفر)</span>
                    </p>
                    {ownerSupportEarn > 0 ? (
                      <p style={{ margin: '0 0 10px', color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem', fontWeight: 700 }}>
                        دعم شخصي وصلك: {ownerSupportEarn.toLocaleString('en-US')} Coins
                      </p>
                    ) : null}
                    <input
                      value={payoutEmail}
                      onChange={e => setPayoutEmail(e.target.value.slice(0, 120))}
                      placeholder="PayPal email for Payout"
                      inputMode="email"
                      style={{
                        width: '100%', boxSizing: 'border-box', marginBottom: 8,
                        borderRadius: 10, padding: '10px 12px',
                        background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(250,204,21,0.35)',
                        color: '#fff', fontSize: '0.82rem', outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      disabled={payoutBusy || Number(appProfits.usd || 0) <= 0}
                      onClick={() => {
                        const email = payoutEmail.trim();
                        const amount = Number(appProfits.usd || 0);
                        if (!email || !email.includes('@')) { setProfitActionMsg('اكتب إيميل PayPal صحيح'); return; }
                        if (amount <= 0) { setProfitActionMsg('لا يوجد رصيد للسحب'); return; }
                        setPayoutBusy(true);
                        setProfitActionMsg('');
                        try { localStorage.setItem('stooorna_owner_paypal_email', email); } catch { /* */ }
                        const body = JSON.stringify({
                          email, amount, currency: 'USD',
                          coins: Number(appProfits.coins || 0),
                          method: 'paypal_payout',
                          note: 'Owner profits payout',
                        });
                        const urls = ['/api/owner/paypal-payout', '/api/paypal/payout', '/api/payments/paypal-payout'];
                        void (async () => {
                          let ok = false;
                          for (const url of urls) {
                            try {
                              const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body });
                              if (r.ok) { ok = true; break; }
                            } catch { /* try next */ }
                          }
                          setPayoutBusy(false);
                          setProfitActionMsg(ok ? 'تم إرسال طلب PayPal Payout' : 'تعذر إرسال Payout للسيرفر — افتح PayPal يدوياً');
                          try { window.open(PAYPAL_WITHDRAW_URL, '_blank', 'noopener,noreferrer'); } catch { /* */ }
                        })();
                      }}
                      style={{
                        width: '100%', padding: '12px 10px', borderRadius: 12, cursor: payoutBusy ? 'default' : 'pointer',
                        background: 'rgba(250,204,21,0.12)', border: '1.5px solid rgba(250,204,21,0.5)',
                        color: '#facc15', fontWeight: 800, fontSize: '0.88rem', marginBottom: 8,
                        opacity: payoutBusy || Number(appProfits.usd || 0) <= 0 ? 0.6 : 1,
                      }}
                    >
                      {payoutBusy ? 'جاري الإرسال…' : 'PayPal · Payout'}
                    </button>
                    <button
                      type="button"
                      disabled={resetBusy || Number(appProfits.usd || 0) <= 0}
                      onClick={() => {
                        const usd = Number(appProfits.usd || 0);
                        if (usd <= 0) { setProfitActionMsg('لا يوجد رصيد لاستبداله'); return; }
                        const gained = Math.floor(usd * 100);
                        if (!window.confirm(`استبدال ${usd.toFixed(2)} USD إلى ${gained.toLocaleString('en-US')} Coins؟`)) return;
                        const nextCoins = Math.floor(Number(appProfits.coins || 0)) + gained;
                        const next = { coins: nextCoins, usd: 0 };
                        setAppProfits(next);
                        try {
                          localStorage.setItem('stooorna_app_profits', JSON.stringify(next));
                          window.dispatchEvent(new CustomEvent('stooorna:app-profits', { detail: next }));
                        } catch { /* */ }
                        if (user?.id) grantAppCoins(String(user.id), gained);
                        const body = JSON.stringify({ usd, coins: gained, rate: 100, convert: 'usd_to_coins' });
                        for (const url of ['/api/owner/profits/convert', '/api/profits/convert', '/api/owner/profits']) {
                          void fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
                        }
                        setProfitActionMsg(`تم الاستبدال: +${gained.toLocaleString('en-US')} Coins`);
                      }}
                      style={{
                        width: '100%', padding: '11px 10px', borderRadius: 12, marginBottom: 8,
                        cursor: resetBusy || Number(appProfits.usd || 0) <= 0 ? 'default' : 'pointer',
                        background: 'rgba(0,188,212,0.12)', border: '1.5px solid rgba(0,188,212,0.45)',
                        color: '#67e8f9', fontWeight: 800, fontSize: '0.84rem',
                        opacity: Number(appProfits.usd || 0) <= 0 ? 0.6 : 1,
                      }}
                    >
                      استبدال الدولار إلى Coins · 1 USD = 100
                    </button>
                    <button
                      type="button"
                      disabled={resetBusy}
                      onClick={() => {
                        if (!window.confirm('تصفير رصيد الأرباح؟')) return;
                        setResetBusy(true);
                        setProfitActionMsg('');
                        const zero = { coins: 0, usd: 0 };
                        setAppProfits(zero);
                        setOwnerSupportEarn(0);
                        try {
                          localStorage.setItem('stooorna_app_profits', JSON.stringify(zero));
                          localStorage.setItem('stooorna_owner_support_profit', JSON.stringify(zero));
                          window.dispatchEvent(new CustomEvent('stooorna:app-profits', { detail: zero }));
                          window.dispatchEvent(new CustomEvent('stooorna:owner-support-profit', { detail: zero }));
                        } catch { /* */ }
                        const body = JSON.stringify({ coins: 0, usd: 0, reset: true });
                        void (async () => {
                          for (const url of ['/api/owner/profits/reset', '/api/profits/reset', '/api/owner/profits']) {
                            try {
                              await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body });
                            } catch { /* */ }
                          }
                          setResetBusy(false);
                          setProfitActionMsg('تم تصفير الرصيد');
                        })();
                      }}
                      style={{
                        width: '100%', padding: '11px 10px', borderRadius: 12, cursor: resetBusy ? 'default' : 'pointer',
                        background: 'rgba(239,68,68,0.12)', border: '1.5px solid rgba(239,68,68,0.45)',
                        color: '#ef4444', fontWeight: 800, fontSize: '0.84rem',
                      }}
                    >
                      {resetBusy ? '…' : 'تصفير الرصيد'}
                    </button>
                    {profitActionMsg ? (
                      <p style={{ margin: '8px 0 0', color: '#facc15', fontSize: '0.75rem', fontWeight: 700 }}>{profitActionMsg}</p>
                    ) : null}
                  </div>
                  )}

                  {isOwner && (
                  <div style={{
                    background: T.surface,
                    border: '1px solid rgba(234,179,8,0.45)',
                    borderRadius: 14,
                    padding: '14px 16px',
                    marginTop: 10,
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, color: '#eab308', fontWeight: 800, fontSize: '0.92rem' }}>Control Owner</p>
                      <p style={{ margin: '4px 0 0', color: 'rgba(200,220,220,0.62)', fontSize: '0.72rem', lineHeight: 1.4 }}>
                        أيقونة التطبيق الصفراء تبقى ظاهرة في كل مكان حتى البث. أطفئ المفتاح لإخفائها.
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Control Owner"
                      onClick={() => {
                        const next = !ownerControlOn;
                        setOwnerControlOn(next);
                        try { localStorage.setItem('stooorna_owner_control_on', next ? '1' : '0'); } catch { /* */ }
                        try { window.dispatchEvent(new CustomEvent('stooorna:owner-control', { detail: { on: next } })); } catch { /* */ }
                      }}
                      style={{
                        width: 52, height: 30, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
                        background: ownerControlOn ? '#eab308' : '#3f3f46', position: 'relative',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 3, width: 24, height: 24, borderRadius: '50%', background: '#fff',
                        left: ownerControlOn ? 25 : 3, transition: 'left 0.18s ease',
                      }} />
                    </button>
                  </div>
                  )}

                  {/* ── Bio ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8
                }}>
                      <p style={{
                    color: T.textMuted,
                    fontSize: '0.62rem',
                    letterSpacing: (businessRow?.status === 'approved' || isPublicBusinessAccount({ id: user?.id, username: profileUsername, email: user?.email })) ? '0.02em' : '0.2em',
                    textTransform: (businessRow?.status === 'approved' || isPublicBusinessAccount({ id: user?.id, username: profileUsername, email: user?.email })) ? 'none' : 'uppercase',
                    fontWeight: 500
                  }}>{'BIO'}</p>
                      {!editingBio && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingBio(true);
                    setBioInput(bio);
                    setBioMsg('');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={13} />
                        </motion.button>}
                    </div>
                    <AnimatePresence mode="wait">
                      {editingBio ? <motion.div key="edit" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }}>
                          <textarea value={bioInput} onChange={e => setBioInput(e.target.value.slice(0, 160))} rows={3} placeholder={'Write something about yourself'} style={{
                      width: '100%',
                      resize: 'none',
                      padding: '9px 11px',
                      background: T.inputBg,
                      border: `1px solid ${T.inputBorder}`,
                      borderRadius: 9,
                      color: T.text,
                      fontSize: '0.83rem',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)',
                      lineHeight: 1.5
                    }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                          <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 7
                    }}>
                            <p style={{
                        color: T.textMuted,
                        fontSize: '0.62rem'
                      }}>{bioInput.length}/160</p>
                            <div style={{
                        display: 'flex',
                        gap: 7
                      }}>
                              <motion.button whileTap={{
                          scale: 0.9
                        }} onClick={() => {
                          setEditingBio(false);
                          setBioMsg('');
                        }} style={{
                          padding: '5px 9px',
                          background: 'none',
                          border: `1px solid ${T.surfaceBorder}`,
                          borderRadius: 7,
                          color: T.textMuted,
                          cursor: 'pointer'
                        }}>
                                <X size={12} />
                              </motion.button>
                              <motion.button whileTap={{
                          scale: 0.9
                        }} onClick={saveBio} disabled={bioLoading} style={{
                          padding: '5px 13px',
                          background: T.primaryFaint,
                          border: `1px solid ${T.primaryBorder}`,
                          borderRadius: 7,
                          color: T.primary,
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}>
                                {bioLoading ? '…' : <Check size={12} />}
                              </motion.button>
                            </div>
                          </div>
                          {bioMsg && <p style={{
                      color: '#ef4444',
                      fontSize: '0.68rem',
                      marginTop: 3
                    }}>{bioMsg}</p>}
                        </motion.div> : <motion.p key="view" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} style={{
                    color: bio ? T.text : T.textMuted,
                    fontSize: '0.83rem',
                    lineHeight: 1.55,
                    fontStyle: bio ? 'normal' : 'italic'
                  }}>
                          {bio || 'No bio yet — tap the edit icon to add one'}
                        </motion.p>}
                    </AnimatePresence>
                  </div>

                  {/* ── Username — للشركات فقط إذا فعّل الأونر المفتاح ── */}
                  {showUsernameSection && (
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <p style={{
                  color: T.textMuted,
                  fontSize: '0.62rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  marginBottom: 10
                }}>{sessionIsCompany ? 'يوزرنيم الشركة · Username' : 'Username'}</p>
                    {editingUsername ? <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <div className="relative flex-1 flex items-center">
                            <AtSign size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="your_username" style={{
                        width: '100%',
                        paddingLeft: 30,
                        paddingRight: 10,
                        paddingTop: 8,
                        paddingBottom: 8,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 8,
                        color: T.text,
                        fontSize: '0.82rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} />
                          </div>
                          <motion.button whileTap={{
                      scale: 0.9
                    }} onClick={saveUsername} disabled={usernameLoading} style={{
                      padding: '8px 14px',
                      background: T.primaryFaint,
                      border: `1px solid ${T.primaryBorder}`,
                      borderRadius: 8,
                      color: T.primary,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}>
                            {usernameLoading ? '…' : 'Save'}
                          </motion.button>
                          <motion.button whileTap={{
                      scale: 0.9
                    }} onClick={() => {
                      setEditingUsername(false);
                      setUsernameMsg('');
                    }} style={{
                      padding: '8px 10px',
                      background: 'none',
                      border: `1px solid ${T.surfaceBorder}`,
                      borderRadius: 8,
                      color: T.textMuted,
                      cursor: 'pointer'
                    }}>
                            <X size={13} />
                          </motion.button>
                        </div>
                        {usernameMsg && <p style={{
                    color: usernameMsg === 'Saved!' ? T.primary : '#ef4444',
                    fontSize: '0.7rem'
                  }}>{usernameMsg}</p>}
                      </div> : <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AtSign size={14} style={{
                      color: T.primaryDim
                    }} />
                          <p style={{
                      color: T.textMuted,
                      fontSize: '0.78rem'
                    }}>
                            {profileUsername ? <span style={{
                        color: T.text
                      }}>{profileUsername}</span> : <span style={{
                        fontStyle: 'italic'
                      }}>No username set</span>}
                          </p>
                        </div>
                        <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingUsername(true);
                    setNewUsername(profileUsername ?? '');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={14} />
                        </motion.button>
                      </div>}
                  </div>
                  )}

                  {/* ── Phone Number ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10
                }}>
                      <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7
                  }}>
                        <Phone size={13} style={{
                      color: T.primaryDim
                    }} />
                        <p style={{
                      color: T.textMuted,
                      fontSize: '0.62rem',
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      fontWeight: 500
                    }}>Phone Number</p>
                      </div>
                      {!editingPhone && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingPhone(true);
                    setPhoneInput(profilePhone);
                    setPhoneMsg('');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={13} />
                        </motion.button>}
                    </div>
                    <AnimatePresence mode="wait">
                      {editingPhone ? <motion.div key="edit-phone" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} className="flex flex-col gap-2">
                          <div className="relative flex items-center">
                            <Phone size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="+965 XXXX XXXX" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 10,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                          </div>
                          <div style={{
                      display: 'flex',
                      gap: 7
                    }}>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => {
                        setEditingPhone(false);
                        setPhoneMsg('');
                      }} style={{
                        padding: '6px 10px',
                        background: 'none',
                        border: `1px solid ${T.surfaceBorder}`,
                        borderRadius: 7,
                        color: T.textMuted,
                        cursor: 'pointer'
                      }}>
                              <X size={12} />
                            </motion.button>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={savePhone} disabled={phoneLoading} style={{
                        flex: 1,
                        padding: '6px 0',
                        background: T.primaryFaint,
                        border: `1px solid ${T.primaryBorder}`,
                        borderRadius: 7,
                        color: T.primary,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}>
                              {phoneLoading ? '…' : 'Save'}
                            </motion.button>
                          </div>
                          {phoneMsg && <p style={{
                      color: phoneMsg === 'Saved!' ? T.primary : '#ef4444',
                      fontSize: '0.7rem'
                    }}>{phoneMsg}</p>}
                        </motion.div> : <motion.div key="view-phone" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                          <Phone size={14} style={{
                      color: T.primaryDim
                    }} />
                          <p style={{
                      color: profilePhone ? T.text : T.textMuted,
                      fontSize: '0.82rem',
                      fontStyle: profilePhone ? 'normal' : 'italic'
                    }}>
                            {profilePhone || 'No phone number added'}
                          </p>
                        </motion.div>}
                    </AnimatePresence>
                  </div>

                  {/* ── Change Email ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10
                }}>
                      <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7
                  }}>
                        <Mail size={13} style={{
                      color: T.primaryDim
                    }} />
                        <p style={{
                      color: T.textMuted,
                      fontSize: '0.62rem',
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      fontWeight: 500
                    }}>Email Address</p>
                      </div>
                      {!editingEmail && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingEmail(true);
                    setNewEmail(user?.email ?? '');
                    setEmailMsg('');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={13} />
                        </motion.button>}
                    </div>
                    <AnimatePresence mode="wait">
                      {editingEmail ? <motion.div key="edit-email" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} className="flex flex-col gap-2">
                          <div className="relative flex items-center">
                            <Mail size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@email.com" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 10,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                          </div>
                          <div className="relative flex items-center">
                            <Lock size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type={showEmailPw ? 'text' : 'password'} value={emailPassword} onChange={e => setEmailPassword(e.target.value)} placeholder="Current password to confirm" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 36,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                            <button type="button" onClick={() => setShowEmailPw(v => !v)} className="absolute right-3" style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: T.textMuted
                      }}>
                              {showEmailPw ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                          <div style={{
                      display: 'flex',
                      gap: 7
                    }}>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => {
                        setEditingEmail(false);
                        setEmailMsg('');
                      }} style={{
                        padding: '6px 10px',
                        background: 'none',
                        border: `1px solid ${T.surfaceBorder}`,
                        borderRadius: 7,
                        color: T.textMuted,
                        cursor: 'pointer'
                      }}>
                              <X size={12} />
                            </motion.button>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={saveEmail} disabled={emailLoading || !newEmail || !emailPassword} style={{
                        flex: 1,
                        padding: '6px 0',
                        background: T.primaryFaint,
                        border: `1px solid ${T.primaryBorder}`,
                        borderRadius: 7,
                        color: T.primary,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: !newEmail || !emailPassword ? 0.5 : 1
                      }}>
                              {emailLoading ? '…' : 'Update Email'}
                            </motion.button>
                          </div>
                          {emailMsg && <p style={{
                      color: emailMsg === 'Email updated!' ? T.primary : '#ef4444',
                      fontSize: '0.7rem'
                    }}>{emailMsg}</p>}
                        </motion.div> : <motion.div key="view-email" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                          <Mail size={14} style={{
                      color: T.primaryDim
                    }} />
                          <p style={{
                      color: T.text,
                      fontSize: '0.82rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                            {user?.email}
                          </p>
                        </motion.div>}
                    </AnimatePresence>
                  </div>

                  {/* ── Change Password ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: editingPassword ? 12 : 0
                }}>
                      <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7
                  }}>
                        <ShieldCheck size={13} style={{
                      color: T.primaryDim
                    }} />
                        <p style={{
                      color: T.textMuted,
                      fontSize: '0.62rem',
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      fontWeight: 500
                    }}>Password</p>
                      </div>
                      {!editingPassword && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingPassword(true);
                    setPwMsg('');
                    setCurrentPw('');
                    setNewPw('');
                    setConfirmNewPw('');
                  }} style={{
                    padding: '5px 12px',
                    background: T.primaryFaint,
                    border: `1px solid ${T.primaryBorder}`,
                    borderRadius: 7,
                    color: T.primary,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}>
                          Change
                        </motion.button>}
                    </div>
                    <AnimatePresence>
                      {editingPassword && <motion.div key="edit-pw" initial={{
                    opacity: 0,
                    height: 0
                  }} animate={{
                    opacity: 1,
                    height: 'auto'
                  }} exit={{
                    opacity: 0,
                    height: 0
                  }} style={{
                    overflow: 'hidden'
                  }} className="flex flex-col gap-2">
                          {/* Current password */}
                          <div className="relative flex items-center">
                            <Lock size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type={showCurrentPw ? 'text' : 'password'} value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Current password" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 36,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                            <button type="button" onClick={() => setShowCurrentPw(v => !v)} className="absolute right-3" style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: T.textMuted
                      }}>
                              {showCurrentPw ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                          {/* New password */}
                          <div className="relative flex items-center">
                            <Lock size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type={showNewPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password (min 8 chars)" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 36,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                            <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute right-3" style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: T.textMuted
                      }}>
                              {showNewPw ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                          {/* Confirm new password */}
                          <div className="relative flex items-center">
                            <Lock size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type="password" value={confirmNewPw} onChange={e => setConfirmNewPw(e.target.value)} placeholder="Confirm new password" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 10,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${confirmNewPw && confirmNewPw !== newPw ? 'rgba(239,68,68,0.5)' : T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = confirmNewPw && confirmNewPw !== newPw ? 'rgba(239,68,68,0.5)' : T.inputBorder} />
                          </div>
                          {/* Strength indicator */}
                          {newPw.length > 0 && <div style={{
                      display: 'flex',
                      gap: 4,
                      alignItems: 'center'
                    }}>
                              {[1, 2, 3, 4].map(i => <div key={i} style={{
                        flex: 1,
                        height: 3,
                        borderRadius: 2,
                        background: newPw.length >= i * 3 ? newPw.length >= 12 ? '#22c55e' : newPw.length >= 8 ? T.primary : '#f59e0b' : 'rgba(255,255,255,0.1)',
                        transition: 'background 0.2s'
                      }} />)}
                              <span style={{
                        color: T.textMuted,
                        fontSize: '0.6rem',
                        flexShrink: 0
                      }}>
                                {newPw.length < 8 ? 'Weak' : newPw.length < 12 ? 'Good' : 'Strong'}
                              </span>
                            </div>}
                          <div style={{
                      display: 'flex',
                      gap: 7
                    }}>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => {
                        setEditingPassword(false);
                        setPwMsg('');
                      }} style={{
                        padding: '6px 10px',
                        background: 'none',
                        border: `1px solid ${T.surfaceBorder}`,
                        borderRadius: 7,
                        color: T.textMuted,
                        cursor: 'pointer'
                      }}>
                              <X size={12} />
                            </motion.button>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={savePassword} disabled={pwLoading || !currentPw || !newPw || !confirmNewPw} style={{
                        flex: 1,
                        padding: '6px 0',
                        background: T.primaryFaint,
                        border: `1px solid ${T.primaryBorder}`,
                        borderRadius: 7,
                        color: T.primary,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: !currentPw || !newPw || !confirmNewPw ? 0.5 : 1
                      }}>
                              {pwLoading ? '…' : 'Change Password'}
                            </motion.button>
                          </div>
                          {pwMsg && <p style={{
                      color: pwMsg === 'Password changed!' ? T.primary : '#ef4444',
                      fontSize: '0.7rem'
                    }}>{pwMsg}</p>}
                        </motion.div>}
                    </AnimatePresence>
                  </div>

                  {/* ── Share Profile ── */}
                  {profileUsername && <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                      <p style={{
                  color: T.textMuted,
                  fontSize: '0.62rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  marginBottom: 12
                }}>Share Profile</p>

                      {/* Profile link row */}
                      <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 11px',
                  background: T.inputBg,
                  border: `1px solid ${T.inputBorder}`,
                  borderRadius: 9,
                  marginBottom: 10
                }}>
                        <p style={{
                    flex: 1,
                    color: T.primary,
                    fontSize: '0.76rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                          stooorna.com/u/{profileUsername}
                        </p>
                        <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => copyLink(profileUrl)} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: copied ? '#22c55e' : T.primaryDim,
                    flexShrink: 0
                  }}>
                          {copied ? <Check size={15} strokeWidth={2} /> : <Copy size={15} strokeWidth={2} />}
                        </motion.button>
                      </div>

                      {/* QR toggle */}
                      <motion.button whileTap={{
                  scale: 0.97
                }} onClick={() => setShowQR(!showQR)} style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '9px',
                  background: T.primaryFaint,
                  border: `1px solid ${T.primaryBorder}`,
                  borderRadius: 9,
                  color: T.primary,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                        <QrCode size={15} strokeWidth={2} />
                        {showQR ? 'Hide QR Code' : 'Show QR Code'}
                      </motion.button>

                      <AnimatePresence>
                        {showQR && <motion.div initial={{
                    opacity: 0,
                    height: 0
                  }} animate={{
                    opacity: 1,
                    height: 'auto'
                  }} exit={{
                    opacity: 0,
                    height: 0
                  }} style={{
                    overflow: 'hidden',
                    display: 'flex',
                    justifyContent: 'center',
                    paddingTop: 14
                  }}>
                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(profileUrl)}&bgcolor=0a1a1a&color=00BCD4&margin=10`} alt="QR code" width={180} height={180} style={{
                      borderRadius: 12,
                      border: `1px solid ${T.primaryBorder}`
                    }} />
                          </motion.div>}
                      </AnimatePresence>

                      {/* Native share */}
                      {typeof navigator !== 'undefined' && navigator.share && <motion.button whileTap={{
                  scale: 0.97
                }} onClick={async () => {
                  try {
                    await navigator.share({
                      title: `${displayName} on Stooorna`,
                      url: profileUrl
                    });
                  } catch {
                    // Fallback: copy to clipboard if share() is blocked (e.g. iframe)
                    try {
                      await navigator.clipboard.writeText(profileUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {/* ignore */}
                  }
                }} style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '9px',
                  marginTop: 8,
                  background: T.primaryFaint,
                  border: `1px solid ${T.primaryBorder}`,
                  borderRadius: 9,
                  color: T.primary,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                          <Share2 size={15} strokeWidth={2} />
                          Share via…
                        </motion.button>}

                      {/* Full share page */}
                      <motion.button whileTap={{
                  scale: 0.97
                }} onClick={() => setSharePageOpen(true)} style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '9px',
                  marginTop: 8,
                  background: 'rgba(0,188,212,0.06)',
                  border: `1px solid ${T.primaryBorder}`,
                  borderRadius: 9,
                  color: T.primaryDim,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                        <Share2 size={14} strokeWidth={2} />
                        Open Share Page
                      </motion.button>
                    </div>}

                  {/* ── Short link for text posts (stooorna.com) ── */}
                  <div style={{
                    borderRadius: 16,
                    background: T.surface,
                    border: `1px solid ${T.surfaceBorder}`,
                    padding: '14px 14px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10,
                        background: T.primaryFaint, border: `1px solid ${T.primaryBorder}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.primary,
                      }}>
                        <Link2 size={16} strokeWidth={2.2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, color: T.text, fontSize: '0.84rem', fontWeight: 800 }}>رابط قصير للتطبيق</p>
                        <p style={{ margin: '2px 0 0', color: T.textMuted, fontSize: '0.68rem', lineHeight: 1.45 }}>
                          الصق أي رابط (فيديو/صورة/صفحة) لتحصل على رابط stooorna.com تستخدمه في البوست النصي
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                      <input
                        value={shortLinkInput}
                        onChange={e => { setShortLinkInput(e.target.value); setShortLinkError(''); setShortLinkCopied(false); }}
                        placeholder="الصق الرابط هنا… https://"
                        dir="ltr"
                        style={{
                          flex: 1, minWidth: 0,
                          background: T.inputBg,
                          border: `1px solid ${T.inputBorder}`,
                          borderRadius: 12,
                          padding: '11px 12px',
                          color: T.text,
                          fontSize: '0.8rem',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') void createAppShortLink(); }}
                      />
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => void pasteIntoShortLink()}
                        style={{
                          flexShrink: 0, padding: '0 14px', borderRadius: 12, cursor: 'pointer',
                          background: T.primaryFaint, border: `1px solid ${T.primaryBorder}`,
                          color: T.primary, fontWeight: 800, fontSize: '0.75rem',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <ClipboardPaste size={14} strokeWidth={2.2} />
                        Paste
                      </motion.button>
                    </div>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      disabled={shortLinkBusy || !shortLinkInput.trim()}
                      onClick={() => void createAppShortLink()}
                      style={{
                        width: '100%', minHeight: 42, borderRadius: 12, border: 'none', cursor: shortLinkInput.trim() ? 'pointer' : 'default',
                        background: shortLinkInput.trim() ? T.primary : T.primaryFaint,
                        color: shortLinkInput.trim() ? '#041018' : T.textMuted,
                        fontWeight: 800, fontSize: '0.8rem',
                        opacity: shortLinkBusy ? 0.7 : 1,
                      }}
                    >
                      {shortLinkBusy ? 'جاري إنشاء الرابط…' : 'إنشاء رابط stooorna.com'}
                    </motion.button>

                    {shortLinkResult && (
                      <div style={{
                        display: 'flex', gap: 8, alignItems: 'center',
                        padding: '10px 10px', borderRadius: 12,
                        background: 'rgba(0,188,212,0.08)', border: `1px solid ${T.primaryBorder}`,
                      }}>
                        <input
                          readOnly
                          value={shortLinkResult}
                          dir="ltr"
                          style={{
                            flex: 1, minWidth: 0, background: 'transparent', border: 'none',
                            color: T.primary, fontSize: '0.78rem', fontWeight: 700, outline: 'none',
                          }}
                          onFocus={e => e.currentTarget.select()}
                        />
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => void copyAppShortLink()}
                          style={{
                            flexShrink: 0, padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                            background: shortLinkCopied ? 'rgba(34,197,94,0.18)' : T.primaryFaint,
                            border: `1px solid ${shortLinkCopied ? 'rgba(34,197,94,0.45)' : T.primaryBorder}`,
                            color: shortLinkCopied ? '#22c55e' : T.primary,
                            fontWeight: 800, fontSize: '0.72rem',
                            display: 'flex', alignItems: 'center', gap: 5,
                          }}
                        >
                          {shortLinkCopied ? <Check size={14} /> : <Copy size={14} />}
                          {shortLinkCopied ? 'Copied' : 'Copy'}
                        </motion.button>

                      </div>
                    )}

                    {shortLinkError && (
                      <p style={{ margin: 0, color: T.danger, fontSize: '0.72rem', textAlign: 'center' }}>{shortLinkError}</p>
                    )}
                  </div>

                  {/* ── Privacy + Sign Out ── */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => navigate('/privacy')}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3"
                      style={{
                        background: T.primaryFaint,
                        border: `1px solid ${T.primaryBorder}`,
                        color: T.primary,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Eye size={14} />
                      Privacy
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleLogout}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3"
                      style={{
                        background: 'transparent',
                        border: `1px solid ${T.dangerBorder}`,
                        color: T.danger,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <LogOut size={14} />
                      Sign Out
                    </motion.button>
                  </div>
                </motion.div>
          })()}

            {/* ── LOGGED IN — LIVE TAB ── */}
            {!isPending && user && tab === 'live' && <div key="live" className="flex flex-col gap-3">
                {/* ── Voice Recordings ── */}
                <div className="flex items-center justify-between mb-1">
                  <p style={{
                color: T.textMuted,
                fontSize: '0.68rem',
                letterSpacing: '0.2em',
                textTransform: 'uppercase'
              }}>
                    Voice Recordings
                  </p>
                  {recordings.length > 0 && <p style={{
                color: T.textMuted,
                fontSize: '0.62rem'
              }}>{recordings.length} saved</p>}
                </div>

                {recLoading && <div className="flex justify-center pt-8">
                    <motion.div animate={{
                rotate: 360
              }} transition={{
                duration: 1,
                repeat: Infinity,
                ease: 'linear'
              }} style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: `2px solid ${T.primaryBorder}`,
                borderTopColor: T.primary
              }} />
                  </div>}

                {!recLoading && recordings.length === 0 && <div className="flex flex-col items-center gap-3 rounded-xl py-10" style={{
              background: T.surface,
              border: `1px solid ${T.surfaceBorder}`
            }}>
                    <Mic size={32} style={{
                color: T.primaryBorder
              }} />
                    <p style={{
                color: T.textMuted,
                fontSize: '0.78rem',
                letterSpacing: '0.05em'
              }}>No recordings yet</p>
                    <p style={{
                color: T.textMuted,
                fontSize: '0.68rem',
                opacity: 0.7
              }}>Tap the knob to start recording</p>
                  </div>}

                {!recLoading && recordings.map(rec => <RecordingCard key={rec.id} rec={rec} onDelete={handleDelete} />)}

                {/* ── Live Broadcast Recordings ── */}
                <div className="flex items-center justify-between mt-4 mb-1">
                  <div className="flex items-center gap-2">
                    <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#ef4444',
                  boxShadow: '0 0 6px rgba(239,68,68,0.6)'
                }} />
                    <p style={{
                  color: T.textMuted,
                  fontSize: '0.68rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase'
                }}>
                      Live Recordings
                    </p>
                  </div>
                  {liveRecs.length > 0 && <p style={{
                color: T.textMuted,
                fontSize: '0.62rem'
              }}>{liveRecs.length} saved</p>}
                </div>

                {liveRecsLoading && <div className="flex justify-center pt-4">
                    <motion.div animate={{
                rotate: 360
              }} transition={{
                duration: 1,
                repeat: Infinity,
                ease: 'linear'
              }} style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: `2px solid ${T.primaryBorder}`,
                borderTopColor: T.primary
              }} />
                  </div>}

                {!liveRecsLoading && liveRecs.length === 0 && <div className="flex flex-col items-center gap-3 rounded-xl py-8" style={{
              background: T.surface,
              border: `1px solid ${T.surfaceBorder}`
            }}>
                    <Radio size={28} style={{
                color: T.primaryBorder
              }} />
                    <p style={{
                color: T.textMuted,
                fontSize: '0.78rem'
              }}>No live recordings yet</p>
                    <p style={{
                color: T.textMuted,
                fontSize: '0.68rem',
                opacity: 0.7
              }}>Your broadcasts will be saved here as MP4</p>
                  </div>}

                {!liveRecsLoading && liveRecs.map(rec => {
              const date = new Date(rec.startedAt).toLocaleDateString('ar-KW', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              });
              const time = new Date(rec.startedAt).toLocaleTimeString('ar-KW', {
                hour: '2-digit',
                minute: '2-digit'
              });
              const mins = rec.duration ? Math.floor(rec.duration / 60) : null;
              const secs = rec.duration ? rec.duration % 60 : null;
              const durationStr = mins !== null ? `${mins}:${String(secs).padStart(2, '0')}` : null;
              const sizeMB = rec.fileSize ? (rec.fileSize / 1024 / 1024).toFixed(1) : null;
              const isDeleting = liveRecDeleting === rec.id;
              const confirmOpen = liveRecDeleteConfirm === rec.id;
              const shareOpen = liveRecShareId === rec.id;
              return <motion.div key={rec.id} layout initial={{
                opacity: 0,
                scale: 0.9
              }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{
                opacity: 0,
                scale: 0.95
              }} className="rounded-xl p-4 flex flex-col gap-3" style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`
              }}>
                      {/* ── Header row ── */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      flexShrink: 0,
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                            <Radio size={14} color='#ef4444' strokeWidth={2} />
                          </div>
                          <div className="min-w-0">
                            <p style={{
                        color: T.text,
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                              {rec.title ?? 'بث مباشر'}
                            </p>
                            <p style={{
                        color: T.textMuted,
                        fontSize: '0.65rem',
                        margin: 0
                      }}>
                              {date} · {time}
                            </p>
                          </div>
                        </div>

                        {/* Badges + action icons */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {durationStr && <span style={{
                      background: 'rgba(0,188,212,0.1)',
                      border: `1px solid ${T.primaryBorder}`,
                      borderRadius: 6,
                      padding: '2px 7px',
                      color: T.primary,
                      fontSize: '0.65rem',
                      fontWeight: 700
                    }}>
                              {durationStr}
                            </span>}
                          {sizeMB && <span style={{
                      color: T.textMuted,
                      fontSize: '0.62rem'
                    }}>{sizeMB} MB</span>}

                          {/* Share button */}
                          {rec.videoUrl && <motion.button whileTap={{
                      scale: 0.88
                    }} onClick={() => shareLiveRec(rec)} title="Share" style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      background: 'rgba(0,188,212,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}>
                              <Share2 size={13} color={T.primary} strokeWidth={2} />
                            </motion.button>}

                          {/* Delete button */}
                          <motion.button whileTap={{
                      scale: 0.88
                    }} onClick={() => setLiveRecDeleteConfirm(rec.id)} title="Delete" style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      background: 'rgba(239,68,68,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}>
                            <Trash2 size={13} color='#ef4444' strokeWidth={2} />
                          </motion.button>
                        </div>
                      </div>

                      {/* ── Video player or pending ── */}
                      {rec.videoUrl ? <video src={rec.videoUrl} controls playsInline style={{
                  width: '100%',
                  borderRadius: 10,
                  background: '#000',
                  maxHeight: 220,
                  border: `1px solid ${T.surfaceBorder}`
                }} /> : <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 10,
                  padding: '16px',
                  textAlign: 'center',
                  border: `1px dashed ${T.surfaceBorder}`
                }}>
                          <p style={{
                    color: T.textMuted,
                    fontSize: '0.72rem',
                    margin: 0
                  }}>
                            جاري معالجة الفيديو...
                          </p>
                        </div>}

                      {/* ── Download button ── */}
                      {rec.videoUrl && <a href={rec.videoUrl} download={`live-${rec.id}.mp4`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: 'rgba(0,188,212,0.08)',
                  border: `1px solid ${T.primaryBorder}`,
                  borderRadius: 10,
                  padding: '9px 16px',
                  color: T.primary,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textDecoration: 'none'
                }}>
                          تحميل MP4
                        </a>}

                      {/* ── Delete confirm dialog ── */}
                      <AnimatePresence>
                        {confirmOpen && <motion.div initial={{
                    opacity: 0,
                    scale: 0.94
                  }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{
                    opacity: 0,
                    scale: 0.94
                  }} style={{
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.22)',
                    borderRadius: 12,
                    padding: '14px 16px'
                  }}>
                            <p style={{
                      color: '#ef4444',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      margin: '0 0 10px'
                    }}>
                              حذف هذا التسجيل؟
                            </p>
                            <p style={{
                      color: T.textMuted,
                      fontSize: '0.7rem',
                      margin: '0 0 14px',
                      lineHeight: 1.5
                    }}>
                              سيتم حذف الفيديو نهائياً ولا يمكن التراجع.
                            </p>
                            <div className="flex gap-2">
                              <motion.button whileTap={{
                        scale: 0.94
                      }} onClick={() => deleteLiveRec(rec.id)} disabled={isDeleting} style={{
                        flex: 1,
                        padding: '9px',
                        borderRadius: 9,
                        border: 'none',
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        opacity: isDeleting ? 0.6 : 1,
                        fontFamily: 'var(--font-sans)'
                      }}>
                                {isDeleting ? '...' : 'حذف'}
                              </motion.button>
                              <motion.button whileTap={{
                        scale: 0.94
                      }} onClick={() => setLiveRecDeleteConfirm(null)} style={{
                        flex: 1,
                        padding: '9px',
                        borderRadius: 9,
                        border: `1px solid ${T.surfaceBorder}`,
                        background: 'transparent',
                        color: T.textMuted,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)'
                      }}>
                                إلغاء
                              </motion.button>
                            </div>
                          </motion.div>}
                      </AnimatePresence>

                      {/* ── Share sheet ── */}
                      <AnimatePresence>
                        {shareOpen && rec.videoUrl && <motion.div initial={{
                    opacity: 0,
                    scale: 0.94
                  }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{
                    opacity: 0,
                    scale: 0.94
                  }} style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${T.surfaceBorder}`,
                    borderRadius: 12,
                    padding: '14px 16px'
                  }}>
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                              <p style={{
                        color: T.text,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        margin: 0
                      }}>
                                مشاركة التسجيل
                              </p>
                              <motion.button whileTap={{
                        scale: 0.88
                      }} onClick={() => setLiveRecShareId(null)} style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2
                      }}>
                                <X size={14} color={T.textMuted} />
                              </motion.button>
                            </div>

                            {/* Link copy row */}
                            <div className="flex gap-2 mb-3">
                              <div style={{
                        flex: 1,
                        background: 'rgba(0,0,0,0.25)',
                        borderRadius: 9,
                        border: `1px solid ${T.surfaceBorder}`,
                        padding: '8px 10px',
                        overflow: 'hidden'
                      }}>
                                <p style={{
                          color: T.textMuted,
                          fontSize: '0.65rem',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                                  {window.location.origin}{rec.videoUrl}
                                </p>
                              </div>
                              <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => copyLiveRecLink(`${window.location.origin}${rec.videoUrl}`)} style={{
                        padding: '8px 14px',
                        borderRadius: 9,
                        border: 'none',
                        background: liveRecShareCopied ? 'rgba(34,197,94,0.15)' : `rgba(0,188,212,0.12)`,
                        color: liveRecShareCopied ? '#22c55e' : T.primary,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        flexShrink: 0,
                        fontFamily: 'var(--font-sans)',
                        transition: 'background 0.2s, color 0.2s'
                      }}>
                                {liveRecShareCopied ? <><CheckCircle size={12} /> تم</> : <><Copy size={12} /> نسخ</>}
                              </motion.button>
                            </div>

                            {/* Native share (mobile) */}
                            {typeof navigator.share === 'function' && <motion.button whileTap={{
                      scale: 0.96
                    }} onClick={() => {
                      navigator.share({
                        title: rec.title ?? 'بث مباشر',
                        url: `${window.location.origin}${rec.videoUrl}`
                      }).catch(() => {});
                    }} style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: 10,
                      border: 'none',
                      background: `rgba(0,188,212,0.1)`,
                      outline: `1px solid ${T.primaryBorder}`,
                      color: T.primary,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 7,
                      fontFamily: 'var(--font-sans)'
                    } as React.CSSProperties}>
                                <Share2 size={13} />
                                مشاركة عبر التطبيقات
                              </motion.button>}
                          </motion.div>}
                      </AnimatePresence>

                    </motion.div>;
            })}



              </div>}

            {/* ── LOGGED IN — COMPANY TAB (owner only) ── */}
            {!isPending && user && tab === 'companies' && (
              <div key="companies" className="flex flex-col gap-3" style={{ paddingBottom: 8 }}>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    loadOwnerData();
                    startTransition(() => setShowSupportUsers(true));
                  }}
                  className="flex items-center justify-between"
                  style={{
                    width: '100%',
                    background: T.surface,
                    border: `1px solid ${T.surfaceBorder}`,
                    borderRadius: 14,
                    padding: '14px 16px',
                    color: T.text,
                    cursor: 'pointer',
                  }}
                  aria-label="User Control"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center" style={{
                      width: 38, height: 38, borderRadius: 12, background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444',
                    }}>
                      <Users size={19} strokeWidth={2.1} />
                    </span>
                    <span style={{ textAlign: 'left' }}>
                      <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700 }}>User Control</span>
                      <span style={{ display: 'block', marginTop: 2, color: T.textMuted, fontSize: '0.68rem' }}>
                        Color · Username · Password · Ban · VIP · Ads · Stories · Reset
                      </span>
                    </span>
                  </div>
                  <span style={{ color: T.primary, fontSize: '1.25rem', lineHeight: 1 }}>‹</span>
                </motion.button>

                {/* App Upload (Android / iOS boxes + live icons switch) — right under User Control */}
                <AppUploadSection T={T} />

                <OwnerLiveIconsControls />

              </div>
            )}


          </AnimatePresence>
        </div>

        {/* Bottom nav bar — hidden while support overlays are open */}
        {!showSupportChat && !ownerChatUser && !showOwnerInbox && !showSupportUsers && !supportCtrlUser && !showOwnerCompanies && !ownerCompanyDetail && !showRecoveredUsers && !showOwnerVip && !showOwnerBiz && !showOwnerStoryMod && !showOwnerBusiness && (
          <div className="w-full flex items-center justify-center px-10 py-4 z-10" style={{
            background: T.navBg,
            borderTop: `1px solid ${T.navBorder}`
          }}>
            <p style={{
              color: T.textMuted,
              fontSize: '0.6rem',
              letterSpacing: '0.25em',
              textTransform: 'uppercase'
            }}>
              Stooorna
            </p>
          </div>
        )}
      </div>

      {/* Support chat — regular users only → @stooorna */}
      <SupportChatOverlay
        open={showSupportChat}
        onClose={() => setShowSupportChat(false)}
        onSent={() => setShowSupportSentToast(true)}
        currentUser={user as { id?: string; name?: string | null; username?: string | null; email?: string | null } | null}
      />

      {/* فقاعة قراءة رد الدعم (للقراءة + حذف) */}
      <SupportRepliesBubble
        open={showSupportReplies}
        onClose={() => setShowSupportReplies(false)}
        replies={supportReplies}
        onDelete={deleteSupportReply}
      />

      {/* مربع تأكيد إرسال رسالة الدعم — يختفي بعد ثانيتين (أنميشن) */}
      <AnimatePresence>
        {showSupportSentToast && (
          <motion.div
            key="support-sent-toast"
            initial={{ opacity: 0, scale: 0.85, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -16 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            style={{
              position: 'fixed', top: '42%', left: '50%', x: '-50%', zIndex: 10400,
              width: 'min(86vw, 320px)', padding: '18px 20px', borderRadius: 18,
              background: '#ffffff', border: '1px solid #86efac',
              boxShadow: '0 18px 50px rgba(0,0,0,0.35)', textAlign: 'center',
              direction: 'rtl', pointerEvents: 'none',
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: '50%', margin: '0 auto 10px',
              background: '#dcfce7', color: '#16a34a', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 900,
            }}>✓</div>
            <p style={{ margin: 0, fontWeight: 900, fontSize: '0.95rem', color: '#15803d' }}>تم ارسال الرساله</p>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#166534' }}>سوف يتم الرد عليكم قريبا</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Owner: full inbox list — opens even when empty */}
      <AnimatePresence>
        {showOwnerInbox && !ownerChatUser && (
          <CommentsSheet
            onClose={() => setShowOwnerInbox(false)}
            count={supportInbox.length}
            subtitle="Stooorna · الدعم / Support"
          >
            {supportInboxLoading && supportInbox.length === 0 && (
              <p style={{ color: '#94a3b8', fontSize: '0.84rem', textAlign: 'center', marginTop: 48 }}>جاري التحميل…</p>
            )}
            {!supportInboxLoading && supportInbox.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: 56, padding: '0 20px' }}>
                <MessageCircle size={36} style={{ color: '#cbd5e1', marginBottom: 12 }} />
                <p style={{ color: '#0f172a', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 6px' }}>لا توجد تعليقات</p>
                <p style={{ color: '#94a3b8', fontSize: '0.78rem', margin: 0, lineHeight: 1.5 }}>
                  عند إرسال أي مستخدم لمشكلته ستظهر هنا باسمه ويمكنك الرد عليه مباشرة.
                </p>
              </div>
            )}

            {supportInbox.map(peer => {
              const handle = peer.username ? `@${String(peer.username).replace(/^@/, '')}` : (peer.name || 'User');
              const goProfile = () => {
                setShowOwnerInbox(false);
                const q = new URLSearchParams();
                q.set('openProfile', peer.id);
                if (peer.name) q.set('openProfileName', peer.name);
                if (peer.username) q.set('openProfileUsername', peer.username);
                if (peer.avatarUrl) q.set('openProfileAvatar', peer.avatarUrl);
                navigate(`/?${q.toString()}`);
              };
              return (
                <div key={peer.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
                  background: peer.unread ? '#f8fafc' : 'transparent', borderBottom: '1px solid #f1f5f9',
                }}>
                  <button type="button" onClick={goProfile} aria-label="Profile" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ position: 'relative', width: 42, height: 42 }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: '50%', overflow: 'hidden', background: '#e5e7eb',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0a0a', fontWeight: 700,
                      }}>
                        {peer.avatarUrl
                          ? <img src={peer.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : ((peer.name || peer.username || '?')[0] || '?').toUpperCase()}
                      </div>
                      <span style={{
                        position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: '50%',
                        background: peer.online ? '#22c55e' : '#64748b', border: '2px solid #ffffff',
                      }} />
                    </div>
                  </button>

                  <motion.button
                    whileTap={{ scale: 0.99 }}
                    type="button"
                    onClick={() => setOwnerChatUser(peer)}
                    style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'start', color: '#0f172a' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0a0a0a', direction: 'ltr' }}>{handle}</span>
                      <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{relTimeAr(peer.lastAt)}</span>
                      {!!peer.unread && peer.unread > 0 && (
                        <span style={{
                          minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px', background: '#0a0a0a', color: '#fff',
                          fontSize: '0.64rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}>{peer.unread}</span>
                      )}
                    </div>
                    <p dir="auto" style={{
                      textAlign: 'left',
                      margin: '4px 0 0', color: '#334155', fontSize: '0.9rem', lineHeight: 1.55,
                      display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap',
                    }}>
                      {supportPreview(peer.lastMessage) || peer.lastMessage || 'فتح المحادثة'}
                    </p>
                    <span style={{ display: 'inline-block', marginTop: 6, fontSize: '0.78rem', fontWeight: 700, color: '#64748b' }}>رد</span>
                  </motion.button>

                  {/* حذف المحادثة — للدعم فقط */}
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    title="حذف المحادثة"
                    data-peerid={peer.id}
                    data-peername={peer.name || peer.username || ''}
                    onClick={(e) => {
                      e.stopPropagation();
                      const btn = e.currentTarget as HTMLButtonElement;
                      const pid = btn.dataset.peerid || '';
                      const pname = btn.dataset.peername || 'هذا المستخدم';
                      if (!window.confirm(`حذف محادثة ${pname}؟`)) return;
                      clearSupportThread(pid);
                      const tickets = readLocalSupportTickets().filter((t: { fromUserId?: string }) => t.fromUserId !== pid);
                      try { localStorage.setItem('stooorna_support_tickets', JSON.stringify(tickets)); } catch { /* */ }
                      setSupportInbox(prev => prev.filter(x => x.id !== pid));
                      setOwnerChatUser(prev => (prev && (prev as { id?: string }).id === pid ? null : prev));
                    }}
                    style={{
                      width: 36, height: 36, flexShrink: 0, borderRadius: 10, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
                    }}
                  >
                    <Trash2 size={16} />
                  </motion.button>
                </div>
              );
            })}
          </CommentsSheet>
        )}
      </AnimatePresence>

      {/* Owner support thread with a specific user */}
      {ownerChatUser && (
        <OwnerSupportThread
          peer={ownerChatUser}
          onClose={() => {
            setOwnerChatUser(null);
            // stay in inbox list after closing a thread
            setShowOwnerInbox(true);
            loadSupportInbox();
          }}
          currentUser={user as { id?: string; name?: string | null; username?: string | null; email?: string | null } | null}
        />
      )}

      {/* ══ Support: full users control list ══ */}
      <AnimatePresence>
        {showSupportUsers && !supportCtrlUser && (
          <motion.div
            key="support-users"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: ownerDockOnly ? 'absolute' : 'fixed', inset: 0, zIndex: 10370,
              background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(10px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(239,68,68,0.3)',
              background: 'linear-gradient(180deg, #1a0a0e 0%, #0c0608 100%)',
              minHeight: 52, flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => {
                  const dock = ownerDockOnly;
                  startTransition(() => setShowSupportUsers(false));
                  setSupportUsersSearch('');
                  setSupportUsersTab('users');
                  if (dock) window.dispatchEvent(new CustomEvent('stooorna:close-owner-dock'));
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
              <Users size={18} style={{ color: '#ef4444' }} />
              <p style={{ margin: 0, flex: 1, color: '#fca5a5', fontWeight: 800, fontSize: '0.9rem' }}>
                تحكم المستخدمين
              </p>
              <button
                type="button"
                onClick={() => loadOwnerData()}
                disabled={usersLoading}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--primary))', padding: 4, opacity: usersLoading ? 0.4 : 1, fontSize: '1.1rem', fontWeight: 700 }}
                title="إعادة تحميل"
              >
                {usersLoading ? '…' : '↻'}
              </button>
              <span style={{ color: 'rgba(200,180,180,0.6)', fontSize: '0.7rem' }}>
                {allUsers.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px 0', flexShrink: 0 }}>
              <button type="button" onClick={() => { setRecoveredUsers(loadDeletedUsers()); startTransition(() => setShowRecoveredUsers(true)); }}
                style={{ width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.35)', color: '#eab308', fontWeight: 800, fontSize: '0.82rem' }}>
                المحظورون / المحذوفون · استعادة ورفع الحظر
              </button>
              <button type="button" onClick={() => startTransition(() => setShowOwnerAds(true))}
                style={{ width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.35)', color: '#7dd3fc', fontWeight: 800, fontSize: '0.82rem' }}>
                الإعلانات · نشر إعلان بين البوستات
              </button>
              <button type="button" onClick={() => startTransition(() => setShowOwnerStoryMod(true))}
                style={{ width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.4)', color: '#fdba74', fontWeight: 800, fontSize: '0.82rem' }}>
                إدارة الستوريات · حذف / تحذير / مشرفين
              </button>
              <button type="button" onClick={() => startTransition(() => setShowOwnerNote(true))}
                style={{ width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', background: 'rgba(249,115,22,0.14)', border: '1px solid rgba(249,115,22,0.55)', color: '#f97316', fontWeight: 800, fontSize: '0.82rem' }}>
                ملاحظة STOOORNA · اكتب ملاحظة تظهر للجميع
              </button>
            </div>

            <div style={{ padding: '10px 14px', flexShrink: 0 }}>
              <input
                value={supportUsersSearch}
                onChange={e => setSupportUsersSearch(e.target.value)}
                placeholder="بحث باليوزر / الإيميل / الاسم…" 
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 12px', borderRadius: 12,
                  background: supportUsersTab === 'companies' ? 'rgba(0,188,212,0.06)' : 'rgba(239,68,68,0.06)',
                  border: `1px solid ${supportUsersTab === 'companies' ? 'rgba(0,188,212,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  color: 'rgba(240,220,220,0.95)', fontSize: '0.85rem', outline: 'none',
                }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {usersLoading && (
                <p style={{ textAlign: 'center', color: 'rgba(180,150,150,0.55)', marginTop: 40, fontSize: '0.8rem' }}>جاري التحميل…</p>
              )}
              {!usersLoading && usersError && (
                <div style={{ margin: '20px 0', padding: '14px', borderRadius: 12, background: 'hsl(var(--destructive)/0.1)', border: '1px solid hsl(var(--destructive)/0.35)', color: 'hsl(var(--destructive))', fontSize: '0.78rem', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 700 }}>فشل تحميل المستخدمين</p>
                  <p style={{ margin: '0 0 10px', opacity: 0.8, wordBreak: 'break-all' }}>{usersError}</p>
                  <button type="button" onClick={() => loadOwnerData()} style={{ background: 'hsl(var(--destructive)/0.2)', border: '1px solid hsl(var(--destructive)/0.4)', borderRadius: 8, padding: '6px 14px', color: 'hsl(var(--destructive))', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                    إعادة المحاولة
                  </button>
                </div>
              )}
              {!usersLoading && !usersError && (() => {
                const source = supportUsersTab === 'companies' ? allCompanyCtrlUsers : allUsers;
                const filtered = source.filter(u => {
                  if (isUserDeleted(u)) return false;
                  const q = supportUsersSearch.trim().toLowerCase();
                  if (!q) return true;
                  const companyBlob = `${u.companyName || ''} ${u.tradeName || ''} ${u.name || ''}`.toLowerCase();
                  return (
                    (u.username || '').toLowerCase().includes(q) ||
                    (u.name || '').toLowerCase().includes(q) ||
                    (u.email || '').toLowerCase().includes(q) ||
                    (u.lastIp || '').includes(q) ||
                    companyBlob.includes(q)
                  );
                });
                if (filtered.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', marginTop: 48, padding: '0 16px' }}>
                      {supportUsersTab === 'companies'
                        ? <Building2 size={32} style={{ color: 'rgba(0,188,212,0.35)', marginBottom: 10 }} />
                        : <Users size={32} style={{ color: 'rgba(239,68,68,0.35)', marginBottom: 10 }} />}
                      <p style={{ color: 'rgba(200,230,230,0.85)', fontSize: '0.88rem', fontWeight: 700, margin: '0 0 6px' }}>
                        {supportUsersTab === 'companies' ? 'لا حسابات شركات' : 'لا مستخدمين'}
                      </p>
                      <p style={{ color: 'rgba(150,190,190,0.55)', fontSize: '0.75rem', margin: 0, lineHeight: 1.5 }}>
                        {supportUsersTab === 'companies'
                          ? 'حسابات الشركات المسجّلة تظهر هنا مع نفس أدوات التحكم (لون اليوزر · تعديل اليوزر · كلمة المرور · حظر).'
                          : 'لا نتائج مطابقة للبحث.'}
                      </p>
                    </div>
                  );
                }
                return filtered.map(u => {
                  const online = ownerPresence[u.id]?.online ?? false;
                  const color = (u as SupportCtrlUser).nameColor || (supportUsersTab === 'companies' ? '#00BCD4' : '#00BCD4');
                  const isCo = supportUsersTab === 'companies';
                  const title = isCo
                    ? preferredCompanyDisplayName(u)
                    : `@${u.username || '—'}`;
                  const bizOk = !isCo && isPublicBusinessAccount(u);
                  const subtitle = isCo
                    ? `${u.username ? `@${u.username} · ` : ''}${u.email}${u.lastIp ? ` · ${u.lastIp}` : ''}`
                    : `${u.email}${u.lastIp ? ` · ${u.lastIp}` : ''}`;
                  return (
                    <motion.button
                      key={u.id}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => {
                        setSupportCtrlUser({
                          ...u,
                          country: (u as SupportCtrlUser).country ?? null,
                          phone: (u as SupportCtrlUser).phone ?? null,
                          nameColor: (u as SupportCtrlUser).nameColor ?? null,
                          avatarUrl: (u as SupportCtrlUser).avatarUrl ?? null,
                          online,
                        });
                        setScUsername(u.username || '');
                        setScPassword('');
                        setScColor((u as SupportCtrlUser).nameColor || '#00BCD4');
                        setScMsg('');
                        setScEditBox(null);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '12px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                        background: u.isBanned
                          ? 'rgba(239,68,68,0.1)'
                          : isCo ? 'rgba(0,188,212,0.05)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${u.isBanned
                          ? 'rgba(239,68,68,0.35)'
                          : isCo ? 'rgba(0,188,212,0.2)' : 'rgba(255,255,255,0.08)'}`,
                        color: 'rgba(230,220,220,0.95)',
                      }}
                    >
                      <div style={{ position: 'relative', width: 42, height: 42, flexShrink: 0 }}>
                        <div style={{
                          width: 42, height: 42, borderRadius: '50%',
                          background: isCo ? 'rgba(0,188,212,0.12)' : 'rgba(0,0,0,0.35)',
                          border: `2px solid ${color}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color, fontWeight: 800, fontSize: '0.8rem',
                          overflow: 'hidden',
                        }}>
                          {(u as SupportCtrlUser).avatarUrl
                            ? <img src={(u as SupportCtrlUser).avatarUrl!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : isCo
                              ? <Building2 size={18} strokeWidth={2.2} />
                              : (u.username || u.name || u.email || '?')[0].toUpperCase()}
                        </div>
                        <span style={{
                          position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: '50%',
                          background: online ? '#22c55e' : '#64748b',
                          border: '2px solid #0c0608',
                        }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          margin: 0, fontSize: '0.88rem', fontWeight: 700,
                          color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                          {bizOk && <BusinessHeadBadge compact />}
                        </p>
                        <p style={{
                          margin: '2px 0 0', color: 'rgba(180,160,160,0.65)', fontSize: '0.68rem',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {subtitle}
                        </p>
                      </div>
                      {isCo && (
                        <span style={{
                          fontSize: '0.58rem', fontWeight: 800, color: '#00BCD4',
                          background: 'rgba(0,188,212,0.12)', padding: '3px 7px', borderRadius: 8,
                          border: '1px solid rgba(0,188,212,0.3)', flexShrink: 0,
                        }}>شركة</span>
                      )}
                      {u.isBanned && (
                        <span style={{
                          fontSize: '0.6rem', fontWeight: 800, color: '#ef4444',
                          background: 'rgba(239,68,68,0.15)', padding: '3px 7px', borderRadius: 8,
                        }}>BAN</span>
                      )}
                    </motion.button>
                  );
                });
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ Support: user detail + actions box ══ */}
      <AnimatePresence>
        {supportCtrlUser && (
          <motion.div
            key="support-ctrl-detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: ownerDockOnly ? 'absolute' : 'fixed', inset: 0, zIndex: 10380,
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
            onClick={() => { setSupportCtrlUser(null); setScEditBox(null); }}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 60 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 480, maxHeight: '92dvh',
                overflowY: 'auto',
                background: 'linear-gradient(180deg, #1a1014 0%, #0c080a 100%)',
                borderTopLeftRadius: 22, borderTopRightRadius: 22,
                border: '1px solid rgba(239,68,68,0.3)',
                padding: '16px 16px max(20px, env(safe-area-inset-bottom))',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${supportCtrlUser.nameColor || 'hsl(var(--primary))'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: supportCtrlUser.nameColor || 'hsl(var(--primary))', fontWeight: 800, fontSize: '1rem',
                  background: 'rgba(0,0,0,0.35)',
                  overflow: 'hidden',
                }}>
                  {supportCtrlUser.avatarUrl
                    ? <img src={supportCtrlUser.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (supportCtrlUser.username || supportCtrlUser.name || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontWeight: 800, fontSize: '1rem',
                    color: supportCtrlUser.nameColor || 'hsl(var(--primary))',
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  }}>
                    @{supportCtrlUser.username || '—'}
                    {isPublicBusinessAccount(supportCtrlUser) && <BusinessHeadBadge compact />}
                  </p>
                  <p style={{ margin: '2px 0 0', color: 'hsl(var(--muted-foreground))', fontSize: '0.72rem' }}>
                    {supportCtrlUser.name || 'بدون اسم'}
                  </p>
                </div>
                {/* View profile button */}
                {supportCtrlUser.username && (
                  <button
                    type="button"
                    title="عرض البروفايل"
                    onClick={() => {
                      setSupportCtrlUser(null);
                      setScEditBox(null);
                      // البروفايل الجديد (نفس بروفايل البوست/المنتج) — ليس صفحة /u/ القديمة بالشات
                      const q = new URLSearchParams();
                      q.set('openProfile', supportCtrlUser.id);
                      if (supportCtrlUser.name) q.set('openProfileName', supportCtrlUser.name);
                      if (supportCtrlUser.username) q.set('openProfileUsername', supportCtrlUser.username);
                      if (supportCtrlUser.avatarUrl) q.set('openProfileAvatar', supportCtrlUser.avatarUrl);
                      if (supportUsersTab === 'companies' || isCompanyAccountRow(supportCtrlUser)) {
                        q.set('openProfileCompany', '1');
                      }
                      if (isPublicBusinessAccount(supportCtrlUser)) {
                        q.set('openProfileBusiness', '1');
                      }
                      navigate(`/?${q.toString()}`);
                    }}
                    style={{
                      background: 'hsl(var(--primary) / 0.12)', border: '1px solid hsl(var(--primary) / 0.35)',
                      borderRadius: 10, padding: '6px 10px', cursor: 'pointer',
                      color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    بروفايل
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setSupportCtrlUser(null); setScEditBox(null); }}
                  style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', padding: 4 }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Info card */}
              <div style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14,
                fontSize: '0.78rem', color: 'rgba(220,200,200,0.9)',
              }}>
                {[
                  ['المعرّف', supportCtrlUser.id],
                  ['الإيميل', supportCtrlUser.email],
                  ['IP', supportCtrlUser.lastIp || '—'],
                  ['الدولة', supportCtrlUser.country || '—'],
                  ['الهاتف', supportCtrlUser.phone || '—'],
                  ['محظور', supportCtrlUser.isBanned ? 'نعم' : 'لا'],
                  ['تاريخ التسجيل', supportCtrlUser.createdAt ? new Date(supportCtrlUser.createdAt).toLocaleString('ar-KW') : '—'],
                  ['الحالة', supportCtrlUser.online ? '🟢 أونلاين' : '⚫ أوفلاين'],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'rgba(180,150,150,0.65)', flexShrink: 0 }}>{k}</span>
                    <span style={{ textAlign: 'right', wordBreak: 'break-all', fontWeight: 600 }}>{v as string}</span>
                  </div>
                ))}
              </div>

              {/* Owner: grant 8 speakers (VIP mic cap) — User Control only */}
                <div style={{
                  marginTop: 12, padding: '12px 12px', borderRadius: 12,
                  background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, color: '#eab308', fontWeight: 800, fontSize: '0.82rem' }}>مميزات VIP · عدد المتحدثين</p>
                      <p style={{ margin: '4px 0 0', color: 'rgba(200,220,220,0.65)', fontSize: '0.7rem', lineHeight: 1.4 }}>
                        تفعيل 8 متحدثين في البث الصوتي والمرئي للحساب (بدلاً من 4)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const uid = supportCtrlUser.id;
                        if (!uid) return;
                        const cur = getVipFeats(uid).eightMics;
                        ownerGrantEightMics(uid, !cur);
                        setScMsg(!cur ? 'تم تفعيل 8 متحدثين' : 'تم إلغاء 8 متحدثين');
                      }}
                      style={{
                        width: 48, height: 28, borderRadius: 999, border: 'none', flexShrink: 0,
                        background: getVipFeats(supportCtrlUser.id).eightMics ? '#eab308' : '#4b5563',
                        position: 'relative', cursor: 'pointer',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 4,
                        width: 20, height: 20, borderRadius: '50%', background: '#fff',
                        left: getVipFeats(supportCtrlUser.id).eightMics ? 24 : 4,
                        transition: 'left 0.15s ease',
                      }} />
                    </button>
                  </div>
                  <p style={{ margin: '8px 0 0', color: getVipFeats(supportCtrlUser.id).eightMics ? '#86efac' : 'rgba(150,180,180,0.55)', fontSize: '0.72rem', fontWeight: 700 }}>
                    {getVipFeats(supportCtrlUser.id).eightMics ? 'الحالة: 1/8 متحدثين' : 'الحالة: 1/4 متحدثين'}
                  </p>
                </div>

              {scMsg && (
                <p style={{
                  margin: '0 0 12px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 600,
                  color: scMsg.includes('تم') || scMsg.toLowerCase().includes('ok') ? '#22c55e' : '#ef4444',
                }}>
                  {scMsg}
                </p>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <motion.button whileTap={{ scale: 0.98 }} type="button"
                  onClick={() => { setScEditBox(scEditBox === 'color' ? null : 'color'); setScMsg(''); }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(0,188,212,0.1)', border: '1px solid rgba(0,188,212,0.35)',
                    color: '#00BCD4', fontWeight: 700, fontSize: '0.85rem',
                  }}>
                  🎨 تغيير لون اليوزر
                </motion.button>
                {scEditBox === 'color' && (
                  <div style={{
                    padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(0,188,212,0.2)', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    {/* Quick color swatches — each with instant activate button */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {([
                        ['#00BCD4','سماوي'],['#22c55e','أخضر'],['#eab308','ذهبي'],['#ef4444','أحمر'],
                        ['#a855f7','بنفسجي'],['#f97316','برتقالي'],['#ec4899','وردي'],['#3b82f6','أزرق'],
                        ['#ffffff','أبيض'],['#94a3b8','رمادي'],['#14b8a6','زمردي'],['#f43f5e','قرمزي'],
                      ] as [string, string][]).map(([c, label]) => (
                        <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => setScColor(c)}
                            style={{
                              width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0,
                              border: scColor === c ? '2px solid #fff' : '2px solid transparent',
                              boxShadow: scColor === c ? '0 0 0 2px rgba(0,188,212,0.6)' : 'none',
                            }}
                          />
                          <span style={{ fontSize: '0.78rem', color: c, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {label} — @{supportCtrlUser.username || 'user'}
                          </span>
                          <motion.button
                            whileTap={{ scale: 0.93 }}
                            type="button"
                            disabled={scSaving}
                            onClick={async () => {
                              setScColor(c);
                              setScSaving(true); setScMsg('');
                              const res = await patchSupportUser(supportCtrlUser.id, { nameColor: c, usernameColor: c, color: c });
                              setScSaving(false);
                              if (res) {
                                setScMsg('تم تفعيل اللون ✓');
                                setSupportCtrlUser(prev => prev ? { ...prev, nameColor: c } : prev);
                                setAllUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, nameColor: c } as typeof x & { nameColor?: string } : x));
                                setAllCompanyCtrlUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, nameColor: c } as typeof x & { nameColor?: string } : x));
                                setScEditBox(null);
                              } else setScMsg('فشل التفعيل');
                            }}
                            style={{
                              padding: '4px 10px', borderRadius: 8, border: `1px solid ${c}`,
                              background: `${c}22`, color: c, fontSize: '0.72rem', fontWeight: 700,
                              cursor: 'pointer', flexShrink: 0,
                            }}
                          >
                            {scSaving ? '…' : 'تفعيل'}
                          </motion.button>
                        </div>
                      ))}
                    </div>

                    {/* Custom color picker */}
                    <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>لون مخصص</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input type="color" value={scColor} onChange={e => setScColor(e.target.value)}
                          style={{ width: 44, height: 36, border: 'none', background: 'none', cursor: 'pointer' }} />
                        <input
                          value={scColor}
                          onChange={e => setScColor(e.target.value)}
                          placeholder='#00BCD4'
                          style={{
                            flex: 1, padding: '8px 10px', borderRadius: 8, outline: 'none',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                            color: '#fff', fontSize: '0.85rem',
                          }}
                        />
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: scColor, fontWeight: 700 }}>
                        معاينة: @{supportCtrlUser.username || 'user'}
                      </p>
                      <motion.button whileTap={{ scale: 0.97 }} type="button" disabled={scSaving}
                        onClick={async () => {
                          setScSaving(true); setScMsg('');
                          const res = await patchSupportUser(supportCtrlUser.id, { nameColor: scColor, usernameColor: scColor, color: scColor });
                          setScSaving(false);
                          if (res) {
                            setScMsg('تم تفعيل اللون ✓');
                            setSupportCtrlUser(prev => prev ? { ...prev, nameColor: scColor } : prev);
                            setAllUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, nameColor: scColor } as typeof x & { nameColor?: string } : x));
                            setAllCompanyCtrlUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, nameColor: scColor } as typeof x & { nameColor?: string } : x));
                            setScEditBox(null);
                          } else setScMsg('فشل الحفظ — تحقق من صلاحيات السيرفر');
                        }}
                        style={{
                          padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                          background: scColor, color: '#041018', fontWeight: 800, fontSize: '0.85rem',
                        }}>
                        {scSaving ? '…' : 'تفعيل اللون المخصص'}
                      </motion.button>
                    </div>
                  </div>
                )}

                <motion.button whileTap={{ scale: 0.98 }} type="button"
                  onClick={() => { setScEditBox(scEditBox === 'username' ? null : 'username'); setScMsg(''); setScUsername(supportCtrlUser.username || ''); }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.35)',
                    color: '#c084fc', fontWeight: 700, fontSize: '0.85rem',
                  }}>
                  ✏️ تعديل اليوزر
                </motion.button>
                {scEditBox === 'username' && (
                  <div style={{
                    padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(168,85,247,0.2)', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <input
                      value={scUsername}
                      onChange={e => setScUsername(e.target.value)}
                      placeholder="اليوزر الجديد (حرف واحد فأكثر)"
                      style={{
                        padding: '10px 12px', borderRadius: 10, outline: 'none',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#fff', fontSize: '0.9rem',
                      }}
                    />
                    <motion.button whileTap={{ scale: 0.97 }} type="button" disabled={scSaving || !scUsername.trim()}
                      onClick={async () => {
                        const next = scUsername.trim().replace(/^@/, '');
                        if (!next) return;
                        setScSaving(true); setScMsg('');
                        const res = await patchSupportUser(supportCtrlUser.id, { username: next });
                        setScSaving(false);
                        if (res) {
                          setScMsg('تم حفظ اليوزر');
                          setSupportCtrlUser(prev => prev ? { ...prev, username: next } : prev);
                          setAllUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, username: next } : x));
                          setAllCompanyCtrlUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, username: next } : x));
                          setScEditBox(null);
                        } else setScMsg('فشل الحفظ — قد يكون اليوزر مستخدماً');
                      }}
                      style={{
                        padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: '#a855f7', color: '#fff', fontWeight: 800, fontSize: '0.85rem',
                        opacity: !scUsername.trim() ? 0.5 : 1,
                      }}>
                      {scSaving ? '…' : 'حفظ اليوزر'}
                    </motion.button>
                  </div>
                )}

                <motion.button whileTap={{ scale: 0.97 }} type="button" onClick={() => { setScCoinsOpen(v => !v); setScCoinsMsg(''); }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(139,18,255,0.12)', border: '1px solid rgba(139,18,255,0.4)',
                    color: '#c084fc', fontWeight: 700, fontSize: '0.85rem',
                  }}>
                  إهداء Coins من التطبيق (1 → 1,000,000)
                </motion.button>
                {scCoinsOpen && (
                  <div style={{
                    padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(139,18,255,0.25)', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <p style={{ margin: 0, color: 'rgba(220,200,255,0.8)', fontSize: '0.75rem', lineHeight: 1.45 }}>
                      يدخل الرصيد فوراً ويظهر إشعار على بوكس الهدايا: تم اعطاؤك دعم من التطبيق
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={scCoins}
                      onChange={e => setScCoins(e.target.value.replace(/\D/g, '').slice(0, 7))}
                      placeholder="عدد الكوينز"
                      style={{
                        padding: '10px 12px', borderRadius: 10, outline: 'none',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#fff', fontSize: '0.9rem',
                      }}
                    />
                    <motion.button whileTap={{ scale: 0.97 }} type="button" disabled={scSaving}
                      onClick={() => {
                        if (!supportCtrlUser?.id) return;
                        const n = Math.floor(Number(scCoins) || 0);
                        setScSaving(true);
                        const res = grantAppCoins(String(supportCtrlUser.id), n);
                        setScSaving(false);
                        if (!res.ok) { setScCoinsMsg(res.error || 'تعذر الإهداء'); return; }
                        setScCoinsMsg(`تم تنفيذ الأمر · +${n.toLocaleString('en-US')} Coins`);
                        setScCoins('');
                      }}
                      style={{
                        padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: '#8b12ff', color: '#fff', fontWeight: 800, fontSize: '0.85rem',
                      }}>
                      تنفيذ الأمر
                    </motion.button>
                    {scCoinsMsg ? <p style={{ margin: 0, color: '#c084fc', fontSize: '0.75rem' }}>{scCoinsMsg}</p> : null}
                  </div>
                )}
                <motion.button whileTap={{ scale: 0.98 }} type="button"
                  onClick={() => { setScEditBox(scEditBox === 'password' ? null : 'password'); setScMsg(''); setScPassword(''); }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.35)',
                    color: '#eab308', fontWeight: 700, fontSize: '0.85rem',
                  }}>
                  🔑 تغيير كلمة المرور (بدون معرفة القديمة)
                </motion.button>
                {scEditBox === 'password' && (
                  <div style={{
                    padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(234,179,8,0.2)', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <input
                      type="text"
                      value={scPassword}
                      onChange={e => setScPassword(e.target.value)}
                      placeholder="كلمة المرور الجديدة"
                      style={{
                        padding: '10px 12px', borderRadius: 10, outline: 'none',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#fff', fontSize: '0.9rem',
                      }}
                    />
                    <motion.button whileTap={{ scale: 0.97 }} type="button" disabled={scSaving || scPassword.length < 1}
                      onClick={async () => {
                        if (!scPassword) return;
                        setScSaving(true); setScMsg('');
                        const res = await patchSupportUser(supportCtrlUser.id, {
                          password: scPassword,
                          newPassword: scPassword,
                          forcePassword: scPassword,
                        });
                        setScSaving(false);
                        if (res) {
                          setScMsg('تم تغيير كلمة المرور');
                          setScPassword('');
                          setScEditBox(null);
                        } else setScMsg('فشل الحفظ — تحقق من صلاحيات السيرفر');
                      }}
                      style={{
                        padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: '#eab308', color: '#1a1400', fontWeight: 800, fontSize: '0.85rem',
                        opacity: scPassword.length < 1 ? 0.5 : 1,
                      }}>
                      {scSaving ? '…' : 'حفظ كلمة المرور'}
                    </motion.button>
                  </div>
                )}

                <motion.button whileTap={{ scale: 0.98 }} type="button" disabled={scSaving}
                  onClick={async () => {
                    const label = supportCtrlUser.username ? `@${supportCtrlUser.username}` : supportCtrlUser.email;
                    if (!window.confirm(`منح VIP لـ ${label}؟ (إطار + لون + هيدر)`)) return;
                    setScSaving(true); setScMsg('');
                    const ok = await ownerGrantVip(supportCtrlUser, scColor || 'gold');
                    setScSaving(false);
                    setScMsg(ok ? 'تم منح VIP' : 'تم التفعيل محلياً — تحقق من السيرفر');
                  }}
                  style={{ padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', background: 'rgba(234,179,8,0.16)', border: '1px solid rgba(234,179,8,0.45)', color: '#eab308', fontWeight: 800, fontSize: '0.85rem' }}>
                  👑 منح VIP (إطار + لون + هيدر)
                </motion.button>

                <motion.button whileTap={{ scale: 0.98 }} type="button" disabled={scSaving}
                  onClick={async () => {
                    const label = supportCtrlUser.username ? `@${supportCtrlUser.username}` : supportCtrlUser.email;
                    if (!window.confirm(`إزالة خاصية VIP من ${label}؟ (الإطار + اللون + الهيدر)`)) return;
                    setScSaving(true); setScMsg('');
                    const ok = await ownerRemoveVip(supportCtrlUser);
                    setScSaving(false);
                    setScMsg(ok ? 'تم إزالة خاصية VIP' : 'فشلت الإزالة من السيرفر — حاول مرة ثانية' + ownerClearInfoSuffix(ok));
                    setSupportCtrlUser(prev => prev ? { ...prev } : prev);
                  }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.4)',
                    color: '#eab308', fontWeight: 700, fontSize: '0.85rem',
                    opacity: scSaving ? 0.6 : 1,
                  }}>
                  👑 إزالة خاصية VIP{ownerVipActive(supportCtrlUser.id) ? ' (مفعّل)' : ''}
                </motion.button>

                <motion.button whileTap={{ scale: 0.98 }} type="button" disabled={scSaving}
                  onClick={async () => {
                    const label = supportCtrlUser.username ? `@${supportCtrlUser.username}` : supportCtrlUser.email;
                    if (!window.confirm(`إزالة خاصية Business من ${label}؟`)) return;
                    setScSaving(true); setScMsg('');
                    const ok = await ownerRemoveBusiness(supportCtrlUser);
                    setScSaving(false);
                    setScMsg(ok ? 'تم إزالة خاصية Business' : 'فشلت الإزالة من السيرفر — حاول مرة ثانية' + ownerClearInfoSuffix(ok));
                    const cid = supportCtrlUser.id;
                    setAllUsers(prev => prev.map(x => (x.id === cid && String(x.accountType || '').toLowerCase() === 'business') ? { ...x, accountType: 'user' } : x));
                    setSupportCtrlUser(prev => prev ? { ...prev } : prev);
                  }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.35)',
                    color: '#facc15', fontWeight: 700, fontSize: '0.85rem',
                    opacity: scSaving ? 0.6 : 1,
                  }}>
                  💼 إزالة خاصية Business{isPublicBusinessAccount(supportCtrlUser) ? ' (مفعّل)' : ''}
                </motion.button>

                <motion.button whileTap={{ scale: 0.98 }} type="button" disabled={scSaving}
                  onClick={async () => {
                    const next = !supportCtrlUser.isBanned;
                    if (next && !window.confirm(`حظر @${supportCtrlUser.username || supportCtrlUser.email} وطرده من التطبيق؟`)) return;
                    setScSaving(true); setScMsg('');
                    const res = await patchSupportUser(supportCtrlUser.id, { isBanned: next, banned: next });
                    setScSaving(false);
                    if (res) {
                      setScMsg(next ? 'تم الحظر' : 'تم رفع الحظر');
                      setSupportCtrlUser(prev => prev ? { ...prev, isBanned: next } : prev);
                      setAllUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, isBanned: next } : x));
                      setAllCompanyCtrlUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, isBanned: next } : x));
                    } else setScMsg('فشل تنفيذ الحظر');
                  }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: supportCtrlUser.isBanned ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    border: `1px solid ${supportCtrlUser.isBanned ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                    color: supportCtrlUser.isBanned ? '#22c55e' : '#ef4444',
                    fontWeight: 800, fontSize: '0.85rem',
                  }}>
                  {supportCtrlUser.isBanned ? '✅ رفع الحظر' : '🚫 حظر / طرد من التطبيق'}
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    if (isSupportOwnerAccount(supportCtrlUser, supportCtrlUser.username)) { setScMsg('لا يمكن تفريغ قصة حساب الدعم'); return; }
                    setClearStoriesFor({ userId: supportCtrlUser.id, username: supportCtrlUser.username, name: supportCtrlUser.name });
                  }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(249,115,22,0.16)',
                    border: '1px solid rgba(249,115,22,0.5)',
                    color: '#f97316',
                    fontWeight: 800, fontSize: '0.85rem',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                  <Trash2 size={15} strokeWidth={2} />
                  تفريغ قصة المستخدم (حذف كل ستوريه)
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  disabled={scSaving || scDeleting || isSupportOwnerAccount(supportCtrlUser, supportCtrlUser.username)}
                  onClick={async () => {
                    if (isSupportOwnerAccount(supportCtrlUser, supportCtrlUser.username)) { setScMsg('لا يمكن ريست حساب الدعم'); return; }
                    const label = supportCtrlUser.username ? `@${supportCtrlUser.username}` : supportCtrlUser.email;
                    if (!window.confirm(`ريست ${label}؟ تنمسح كل بياناته ويصير اليوزر والإيميل قابلين لإنشاء حساب جديد.`)) return;
                    setScSaving(true); setScMsg('');
                    const target = supportCtrlUser;
                    try { markUsernameFreed(target.username); } catch { /* */ }
                    try { markUserDeleted({ id: target.id, email: target.email, username: target.username }); } catch { /* */ }
                    try {
                      const uid = String(target.id);
                      const uname = String(target.username || '').replace(/^@/, '').toLowerCase();
                      for (const k of Object.keys(localStorage)) {
                        const lk = k.toLowerCase();
                        if (lk.includes(uid) || (uname && lk.includes(uname))) localStorage.removeItem(k);
                      }
                    } catch { /* */ }
                    await permanentlyDeleteSupportUser({ id: target.id, email: target.email, username: target.username });
                    setAllUsers(prev => prev.filter(x => x.id !== target.id));
                    setAllCompanyCtrlUsers(prev => prev.filter(x => x.id !== target.id));
                    setSupportCtrlUser(null);
                    setScEditBox(null);
                    setScSaving(false);
                    setScMsg('تم الريست — الحساب قابل للإنشاء من جديد');
                  }}
                  style={{ padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', background: 'rgba(168,85,247,0.16)', border: '1px solid rgba(168,85,247,0.45)', color: '#d8b4fe', fontWeight: 800, fontSize: '0.85rem' }}>
                  ♻️ ريست الحساب (مسح البيانات وإتاحة التسجيل من جديد)
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  disabled={scSaving || scDeleting || isSupportOwnerAccount(supportCtrlUser, supportCtrlUser.username)}
                  onClick={() => {
                    if (isSupportOwnerAccount(supportCtrlUser, supportCtrlUser.username)) {
                      setScMsg('لا يمكن حذف حساب الدعم');
                      return;
                    }
                    setScDeleteText('');
                    setScDeleteError('');
                    setScDeleteOpen(true);
                  }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(239,68,68,0.18)',
                    border: '1px solid rgba(239,68,68,0.45)',
                    color: '#ef4444',
                    fontWeight: 800, fontSize: '0.85rem',
                    display: 'flex', alignItems: 'center', gap: 8,
                    opacity: isSupportOwnerAccount(supportCtrlUser, supportCtrlUser.username) ? 0.45 : 1,
                  }}>
                  <Trash2 size={15} strokeWidth={2} />
                  حذف الحساب من التطبيق نهائياً
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ تأكيد الحذف النهائي لأي مستخدم — @Stooorna فقط ══ */}
      <AnimatePresence>
        {scDeleteOpen && (supportCtrlUser || ownerDeleteCompany) && (
          <motion.div
            key="support-user-delete-confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!scDeleting) { setScDeleteOpen(false); setOwnerDeleteCompany(null); } }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10480,
              background: 'rgba(0,0,0,0.72)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 340,
                background: 'linear-gradient(160deg, #1a1212 0%, #0e0a0a 100%)',
                border: '1px solid rgba(239,68,68,0.35)',
                borderRadius: 16,
                padding: '22px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Trash2 size={22} color='#ef4444' strokeWidth={2} />
                </div>
                <p style={{ color: 'rgba(200,230,230,0.95)', fontSize: '0.92rem', fontWeight: 800, margin: 0, textAlign: 'center' }}>
                  تأكيد حذف الحساب
                </p>
              </div>
              <p style={{
                color: 'rgba(150,190,190,0.7)', fontSize: '0.78rem', lineHeight: 1.55,
                textAlign: 'center', margin: 0,
              }}>
                سيتم حذف
                {' '}
                <span style={{ color: '#ef4444', fontWeight: 800 }}>
                  @{(supportCtrlUser?.username || ownerDeleteCompany?.username || supportCtrlUser?.email || ownerDeleteCompany?.email)}
                </span>
                {' '}
                وكل بياناته من التطبيق نهائياً. لا يمكن التراجع.
              </p>
              <p style={{ color: 'rgba(150,190,190,0.65)', fontSize: '0.72rem', textAlign: 'center', margin: 0 }}>
                اكتب <span style={{ color: '#ef4444', fontWeight: 700 }}>حذف</span> أو <span style={{ color: '#ef4444', fontWeight: 700 }}>delete</span> للتأكيد
              </p>
              <input
                value={scDeleteText}
                onChange={e => { setScDeleteText(e.target.value); setScDeleteError(''); }}
                disabled={scDeleting}
                placeholder="حذف"
                autoFocus
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '11px 12px',
                  borderRadius: 10, border: '1px solid rgba(239,68,68,0.35)',
                  background: 'rgba(0,0,0,0.35)', color: 'rgba(200,230,230,0.95)',
                  fontSize: '0.88rem', outline: 'none', textAlign: 'center',
                }}
              />
              {scDeleteError ? (
                <p style={{ color: '#ef4444', fontSize: '0.72rem', margin: 0, textAlign: 'center' }}>{scDeleteError}</p>
              ) : null}
              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  disabled={scDeleting}
                  onClick={() => setScDeleteOpen(false)}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 10,
                    border: '1px solid rgba(0,188,212,0.2)',
                    background: 'rgba(0,188,212,0.08)',
                    color: 'rgba(200,230,230,0.9)',
                    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  إلغاء
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  disabled={scDeleting}
                  onClick={async () => {
                    const normalized = scDeleteText.trim().toLowerCase();
                    if (normalized !== 'حذف' && normalized !== 'delete') {
                      setScDeleteError('اكتب «حذف» أو «delete» للتأكيد');
                      return;
                    }
                    const targetUser = supportCtrlUser;
                    const targetCo = ownerDeleteCompany;
                    if (!targetUser && !targetCo) return;
                    setScDeleting(true);
                    setScDeleteError('');
                    const target = targetUser
                      ? { id: targetUser.id, email: targetUser.email, username: targetUser.username }
                      : { id: targetCo!.userId || targetCo!.id, email: targetCo!.email, username: targetCo!.username || targetCo!.companyName };
                    markUserDeleted(target);
                    markUsernameFreed(target.username);
                    setAllUsers(prev => prev.filter(x => x.id !== target.id && String(x.username || '').toLowerCase() !== String(target.username || '').toLowerCase()));
                    setAllCompanyCtrlUsers(prev => prev.filter(x => x.id !== target.id));
                    const res = await permanentlyDeleteSupportUser(target);
                    startTransition(() => { setOwnerCompanies(loadCompaniesRegistryLight()); });
                    setOwnerDeleteCompany(null);
                    if (!res.ok) {
                      // الحذف المحلي تم — نعيد المحاولة على السيرفر دون إرجاع الحساب للقائمة
                      console.warn('[delete-user] server path failed', res.status, res.body);
                    }
                    try {
                      const list = loadCompaniesRegistry().filter(c =>
                        c.userId !== target.id && c.email.toLowerCase() !== String(target.email || '').toLowerCase(),
                      );
                      saveCompaniesRegistry(list);
                      startTransition(() => { setOwnerCompanies(sanitizeCompaniesRegistry()); });
                    } catch { /* */ }
                    setScDeleting(false);
                    setScDeleteOpen(false);
                    setSupportCtrlUser(null);
                    setScEditBox(null);
                    setScMsg('تم حذف الحساب نهائياً');
                  }}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 10,
                    border: '1px solid rgba(239,68,68,0.4)',
                    background: 'rgba(239,68,68,0.22)',
                    color: '#ef4444',
                    fontSize: '0.82rem', fontWeight: 800,
                    cursor: scDeleting ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: scDeleting ? 0.7 : 1,
                  }}
                >
                  {scDeleting ? '…' : 'حذف نهائي'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      
      {/* ══ Owner (@Stooorna only): Companies registry ══ */}
      <AnimatePresence>
        {showOwnerCompanies && !ownerCompanyDetail && isSupportOwnerAccount(
          user as { email?: string | null; username?: string | null; name?: string | null },
          profileUsername,
        ) && (
          <motion.div
            key="owner-companies"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10390,
              background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(10px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(0,188,212,0.25)',
              background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
              minHeight: 52, flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => startTransition(() => setShowOwnerCompanies(false))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00BCD4', padding: 2 }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
              <Building2 size={18} style={{ color: '#00BCD4' }} />
              <p style={{ margin: 0, flex: 1, color: '#00BCD4', fontWeight: 800, fontSize: '0.9rem' }}>
                Companies
              </p>
              <button
                type="button"
                onClick={() => refreshOwnerCompanies()}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00BCD4', fontWeight: 700, fontSize: '1.1rem' }}
                title="تحديث"
              >
                ↻
              </button>
              <span style={{ color: 'rgba(150,190,190,0.6)', fontSize: '0.7rem' }}>{ownerCompanies.filter(c => !/nadoosha/i.test(`${c.email} ${c.username || c.companyName || ''}`)).length}</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ownerCompanies.length === 0 && (
                <div style={{ textAlign: 'center', marginTop: 48, padding: '0 16px' }}>
                  <Building2 size={32} style={{ color: 'rgba(0,188,212,0.35)', marginBottom: 10 }} />
                  <p style={{ color: 'rgba(200,230,230,0.85)', fontSize: '0.88rem', fontWeight: 700, margin: '0 0 6px' }}>
                    No registered companies yet
                  </p>
                  <p style={{ color: 'rgba(150,190,190,0.55)', fontSize: '0.75rem', margin: 0, lineHeight: 1.5 }}>
                    Companies that register from the auth screen (Companies tab) appear here only — separate from User Control.
                  </p>
                </div>
              )}
              {ownerPendingCompanyCount > 0 && (
                <p style={{ margin: '4px 0 2px', color: '#eab308', fontWeight: 800, fontSize: '0.78rem', textAlign: 'right' }}>
                  طلبات بانتظار الموافقة ({ownerPendingCompanyCount})
                </p>
              )}
              {/* مفتاح الأونر: تفعيل يوزرنيم للشركات في إعداداتها */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '12px 14px', borderRadius: 14, marginBottom: 8,
                background: 'rgba(0,188,212,0.08)', border: '1px solid rgba(0,188,212,0.3)',
              }}>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                  <p style={{ margin: 0, color: '#00BCD4', fontWeight: 800, fontSize: '0.82rem' }}>
                    يوزرنيم للشركات
                  </p>
                  <p style={{ margin: '4px 0 0', color: 'rgba(150,190,190,0.75)', fontSize: '0.7rem', lineHeight: 1.4 }}>
                    عند التشغيل تظهر للشركات إضافة يوزرنيم في إعداداتهم. عند الإيقاف تختفي الميزة.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !isCompanyUsernameFeatureEnabled();
                    setCompanyUsernameFeatureEnabled(next);
                    setOwnerCoUsernameFeature(next);
                  }}
                  style={{
                    width: 52, height: 30, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
                    background: ownerCoUsernameFeature ? '#00BCD4' : 'rgba(100,130,140,0.35)',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                  aria-label="Toggle company username feature"
                >
                  <span style={{
                    position: 'absolute', top: 3, width: 24, height: 24, borderRadius: '50%', background: '#fff',
                    left: ownerCoUsernameFeature ? 25 : 3, transition: 'left 0.2s',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  }} />
                </button>
              </div>
              {ownerCompaniesSorted
                .map(co => {
                const isActive = co.status === 'active';
                const isPending = co.status === 'pending';
                const displayName = co.username
                  ? `@${String(co.username).replace(/^@/, '')}`
                  : preferredCompanyDisplayName(co);
                const displayTrade = co.companyName && co.username
                  ? `${co.companyName}${co.tradeName ? ' · ' + co.tradeName : ''}`
                  : (co.tradeName || co.companyName || co.email);
                return (
                  <div
                    key={co.id}
                    style={{
                      display: 'flex', alignItems: 'stretch', gap: 0,
                      borderRadius: 14, overflow: 'hidden',
                      border: `1px solid ${isActive ? 'rgba(34,197,94,0.35)' : isPending ? 'rgba(234,179,8,0.35)' : 'rgba(239,68,68,0.3)'}`,
                      background: isActive ? 'rgba(34,197,94,0.06)' : isPending ? 'rgba(234,179,8,0.06)' : 'rgba(239,68,68,0.06)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        // startTransition: يخلي الضغطة تستجيب فوراً بدون تجمّد
                        // بينما يُعاد رسم التفاصيل الثقيلة (الصور) بشكل غير عاجل
                        startTransition(() => {
                          const full = loadCompanyRegistrationFull(co.id || co.email) || co;
                          setOwnerCompanyDetail({
                            ...full,
                            companyName: displayName,
                            tradeName: displayTrade || full.tradeName || co.tradeName,
                          });
                        });
                      }}
                      style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                        padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right',
                        color: 'rgba(200,230,230,0.95)',
                      }}
                    >
                      <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#00BCD4' }}>{displayName}</span>
                      <span style={{ fontSize: '0.72rem', color: 'rgba(150,190,190,0.75)' }}>{displayTrade}</span>
                      <span style={{ fontSize: '0.65rem', color: 'rgba(150,190,190,0.55)' }}>{co.email}</span>
                    </button>
                    <button
                      type="button"
                      title="عرض كامل بيانات التسجيل"
                      onClick={(e) => {
                        e.stopPropagation();
                        // startTransition: يخلي الضغطة تستجيب فوراً بدون تجمّد
                        // بينما يُعاد رسم التفاصيل الثقيلة (الصور) بشكل غير عاجل
                        startTransition(() => {
                          const full = loadCompanyRegistrationFull(co.id || co.email) || co;
                          setOwnerCompanyDetail({
                            ...full,
                            companyName: displayName,
                            tradeName: displayTrade || full.tradeName || co.tradeName,
                          });
                        });
                      }}
                      style={{
                        width: 44, flexShrink: 0, border: 'none', cursor: 'pointer',
                        background: 'rgba(0,188,212,0.1)',
                        borderLeft: '1px solid rgba(0,188,212,0.2)',
                        color: '#00BCD4',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Menu size={18} strokeWidth={2.4} />
                    </button>
                    <button
                      type="button"
                      title="حذف نهائي"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOwnerDeleteCompany(co);
                        setScDeleteText('');
                        setScDeleteError('');
                        setScDeleteOpen(true);
                      }}
                      style={{
                        width: 44, flexShrink: 0, border: 'none', cursor: 'pointer',
                        background: 'rgba(239,68,68,0.12)',
                        borderLeft: '1px solid rgba(239,68,68,0.25)',
                        color: '#ef4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Trash2 size={16} strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      disabled={ownerCompanyBusy}
                      onClick={() => {
                        const next: CompanyRegStatus = isActive ? 'inactive' : 'active';
                        setOwnerCompanyBusy(true);
                        rememberCompanyActivation(co.email, next);
                        setCompanyRegStatus(co.email || co.id, next, {
                          approvedBy: profileUsername || 'stooorna',
                        });
                        if (co.id && co.email) setCompanyRegStatus(co.id, next, { approvedBy: profileUsername || 'stooorna' });
                        const updated = loadCompaniesRegistry();
                        startTransition(() => { setOwnerCompanies(updated.map(stripCompanyCerts)); });
                        void (async () => {
                          try {
                            await pushCompanyStatusToServer({ ...co, status: next }, next);
                            if (next === 'active') {
                              try { restoreDeletedUser({ id: co.userId || co.id, email: co.email, username: co.username }); } catch { /* */ }
                              await provisionCompanyAuthAccount({ ...co, status: 'active' });
                            }
                          } finally {
                            startTransition(() => { setOwnerCompanies(loadCompaniesRegistryLight()); });
                            setOwnerCompanyBusy(false);
                          }
                        })();
                      }}
                      style={{
                        width: 88, flexShrink: 0, border: 'none', cursor: 'pointer',
                        background: isActive ? 'rgba(34,197,94,0.18)' : isPending ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
                        color: isActive ? '#22c55e' : isPending ? '#eab308' : '#ef4444',
                        fontWeight: 800, fontSize: '0.72rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        writingMode: 'horizontal-tb',
                      }}
                    >
                      {isActive ? 'Active' : isPending ? 'Approve' : 'Inactive'}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ Owner: company full registration details ══ */}
      <AnimatePresence>
        {ownerCompanyDetail && isSupportOwnerAccount(
          user as { email?: string | null; username?: string | null; name?: string | null },
          profileUsername,
        ) && (
          <motion.div
            key="owner-company-detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10400,
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
            onClick={() => setOwnerCompanyDetail(null)}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 60 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto',
                background: 'linear-gradient(180deg, #0d2a2e 0%, #0a1a1a 100%)',
                borderTopLeftRadius: 22, borderTopRightRadius: 22,
                border: '1px solid rgba(0,188,212,0.3)',
                padding: '16px 16px max(20px, env(safe-area-inset-bottom))',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Building2 size={22} color='#00BCD4' />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, color: '#00BCD4', fontWeight: 800, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ownerCompanyDetail.companyName}
                  </p>
                  <p style={{ margin: '2px 0 0', color: 'rgba(150,190,190,0.7)', fontSize: '0.7rem' }}>
                    كامل بيانات تسجيل الشركة — للدعم فقط
                  </p>
                </div>
                <button type="button" onClick={() => setOwnerCompanyDetail(null)} style={{ background: 'none', border: 'none', color: '#00BCD4', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14,
                fontSize: '0.8rem', color: 'rgba(220,230,230,0.95)',
              }}>
                {[
                  ['اسم الشركة', ownerCompanyDetail.companyName],
                  ['الاسم التجاري', ownerCompanyDetail.tradeName],
                  ['صاحب الشركة', ownerCompanyDetail.ownerName],
                  ['رقم السجل التجاري', ownerCompanyDetail.licenseNumber],
                  ['رقم الترخيص التجاري', ownerCompanyDetail.tradeLicenseNumber || '—'],
                  ['القطاع', [ownerCompanyDetail.sector, ownerCompanyDetail.sectorCustom].filter(Boolean).join(' — ')],
                  ['رقم الهاتف', ownerCompanyDetail.phone],
                  ['رقم هاتف آخر (اختياري)', ownerCompanyDetail.phoneAlt || '—'],
                  ['البريد الإلكتروني', ownerCompanyDetail.email],
                  ['كلمة المرور', ownerCompanyDetail.password || '— (غير محفوظة محلياً)'],
                  ['الحالة', ownerCompanyDetail.status === 'active' ? 'مفعّل (Active)' : ownerCompanyDetail.status === 'pending' ? 'قيد المراجعة (Pending)' : 'غير مفعّل (Inactive)'],
                  ['تاريخ الطلب', ownerCompanyDetail.createdAt ? new Date(ownerCompanyDetail.createdAt).toLocaleString('ar-KW') : '—'],
                  ['تاريخ الموافقة', ownerCompanyDetail.approvedAt ? new Date(ownerCompanyDetail.approvedAt).toLocaleString('ar-KW') : '—'],
                  ['المعرّف', ownerCompanyDetail.id],
                  ['معرّف المستخدم', ownerCompanyDetail.userId || '—'],
                  ['وافق بواسطة', ownerCompanyDetail.approvedBy || '—'],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: 'rgba(150,190,190,0.65)', flexShrink: 0, minWidth: 110 }}>{k}</span>
                    <span style={{
                      textAlign: 'right', wordBreak: 'break-all', fontWeight: 600,
                      color: k === 'كلمة المرور' && ownerCompanyDetail.password ? '#eab308' : undefined,
                      fontFamily: k === 'كلمة المرور' ? 'ui-monospace, monospace' : undefined,
                      direction: k === 'كلمة المرور' || k === 'البريد الإلكتروني' || k === 'رقم الهاتف' || k === 'رقم هاتف آخر (اختياري)' || k === 'رقم السجل التجاري' || k === 'المعرّف' || k === 'معرّف المستخدم' ? 'ltr' : undefined,
                    }}>{v as string}</span>
                  </div>
                ))}

                {/* شهادة السجل التجاري */}
                {ownerCompanyDetail.commercialRegCert && (
                  <div style={{ borderTop: '1px solid hsl(var(--primary)/0.15)', paddingTop: 10, marginTop: 4 }}>
                    <p style={{ margin: '0 0 6px', color: 'hsl(var(--primary)/0.7)', fontSize: '0.75rem', fontWeight: 700 }}>
                      شهادة السجل التجاري
                    </p>
                    {ownerCompanyDetail.commercialRegCert.startsWith('data:image') ? (
                      <img
                        src={ownerCompanyDetail.commercialRegCert}
                        alt="شهادة السجل التجاري"
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', borderRadius: 10, border: '1px solid hsl(var(--primary)/0.2)', objectFit: 'contain', maxHeight: 260 }}
                      />
                    ) : (
                      <a
                        href={ownerCompanyDetail.commercialRegCert}
                        download={ownerCompanyDetail.commercialRegCertName || 'commercial-reg.pdf'}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'hsl(var(--primary)/0.1)', border: '1px solid hsl(var(--primary)/0.25)', borderRadius: 10, color: 'hsl(var(--primary))', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700 }}
                      >
                        <FileText size={16} />
                        {ownerCompanyDetail.commercialRegCertName || 'تحميل الشهادة'}
                      </a>
                    )}
                  </div>
                )}

                {/* شهادة الترخيص التجاري */}
                {ownerCompanyDetail.tradeLicenseCert && (
                  <div style={{ borderTop: '1px solid hsl(var(--gold)/0.15)', paddingTop: 10, marginTop: 4 }}>
                    <p style={{ margin: '0 0 6px', color: 'hsl(var(--gold)/0.8)', fontSize: '0.75rem', fontWeight: 700 }}>
                      شهادة الترخيص التجاري
                    </p>
                    {ownerCompanyDetail.tradeLicenseCert.startsWith('data:image') ? (
                      <img
                        src={ownerCompanyDetail.tradeLicenseCert}
                        alt="شهادة الترخيص التجاري"
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', borderRadius: 10, border: '1px solid hsl(var(--gold)/0.2)', objectFit: 'contain', maxHeight: 260 }}
                      />
                    ) : (
                      <a
                        href={ownerCompanyDetail.tradeLicenseCert}
                        download={ownerCompanyDetail.tradeLicenseCertName || 'trade-license.pdf'}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'hsl(var(--gold)/0.1)', border: '1px solid hsl(var(--gold)/0.25)', borderRadius: 10, color: 'hsl(var(--gold))', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700 }}
                      >
                        <FileText size={16} />
                        {ownerCompanyDetail.tradeLicenseCertName || 'تحميل الشهادة'}
                      </a>
                    )}
                  </div>
                )}

                {/* تنبيه إذا لم ترفق الشهادات */}
                {(!ownerCompanyDetail.commercialRegCert || !ownerCompanyDetail.tradeLicenseCert) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'hsl(var(--destructive)/0.08)', border: '1px solid hsl(var(--destructive)/0.25)', borderRadius: 10, marginTop: 4 }}>
                    <AlertTriangle size={14} color="hsl(var(--destructive))" style={{ flexShrink: 0 }} />
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'hsl(var(--destructive)/0.85)' }}>
                      {!ownerCompanyDetail.commercialRegCert && !ownerCompanyDetail.tradeLicenseCert
                        ? 'لم يتم رفع شهادة السجل التجاري ولا شهادة الترخيص التجاري'
                        : !ownerCompanyDetail.commercialRegCert
                          ? 'لم يتم رفع شهادة السجل التجاري'
                          : 'لم يتم رفع شهادة الترخيص التجاري'
                      }
                    </p>
                  </div>
                )}
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => {
                  setOwnerDeleteCompany(ownerCompanyDetail);
                  setScDeleteText('');
                  setScDeleteError('');
                  setScDeleteOpen(true);
                }}
                style={{
                  width: '100%', padding: '12px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.14)', color: '#ef4444', fontWeight: 800, fontSize: '0.85rem',
                  cursor: 'pointer', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Trash2 size={15} />
                حذف الحساب نهائياً وتحرير اليوزر
              </motion.button>
              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  disabled={ownerCompanyBusy || ownerCompanyDetail.status === 'active'}
                  onClick={() => {
                    setOwnerCompanyBusy(true);
                    rememberCompanyActivation(ownerCompanyDetail.email, 'active');
                    setCompanyRegStatus(ownerCompanyDetail.email || ownerCompanyDetail.id, 'active', {
                      approvedBy: profileUsername || 'stooorna',
                    });
                    if (ownerCompanyDetail.id) setCompanyRegStatus(ownerCompanyDetail.id, 'active', { approvedBy: profileUsername || 'stooorna' });
                    const updated = loadCompaniesRegistry();
                    startTransition(() => { setOwnerCompanies(updated.map(stripCompanyCerts)); });
                    setOwnerCompanyDetail(prev => prev ? { ...prev, status: 'active', approvedAt: new Date().toISOString() } : prev);
                    void (async () => {
                      try {
                        await pushCompanyStatusToServer({ ...ownerCompanyDetail, status: 'active' }, 'active');
                        try { restoreDeletedUser({ id: ownerCompanyDetail.userId || ownerCompanyDetail.id, email: ownerCompanyDetail.email, username: ownerCompanyDetail.username }); } catch { /* */ }
                        await provisionCompanyAuthAccount({ ...ownerCompanyDetail, status: 'active' });
                      } finally {
                        startTransition(() => { setOwnerCompanies(loadCompaniesRegistryLight()); });
                        setOwnerCompanyBusy(false);
                      }
                    })();
                  }}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: ownerCompanyDetail.status === 'active' ? 'rgba(34,197,94,0.2)' : '#22c55e',
                    color: ownerCompanyDetail.status === 'active' ? '#86efac' : '#041018',
                    fontWeight: 800, fontSize: '0.85rem',
                    opacity: ownerCompanyDetail.status === 'active' ? 0.7 : 1,
                  }}
                >
                  Activate
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  disabled={ownerCompanyBusy || ownerCompanyDetail.status === 'inactive'}
                  onClick={() => {
                    setOwnerCompanyBusy(true);
                    rememberCompanyActivation(ownerCompanyDetail.email, 'inactive');
                    setCompanyRegStatus(ownerCompanyDetail.email || ownerCompanyDetail.id, 'inactive');
                    if (ownerCompanyDetail.id) setCompanyRegStatus(ownerCompanyDetail.id, 'inactive');
                    const updated = loadCompaniesRegistry();
                    startTransition(() => { setOwnerCompanies(updated.map(stripCompanyCerts)); });
                    setOwnerCompanyDetail(prev => prev ? { ...prev, status: 'inactive' } : prev);
                    void pushCompanyStatusToServer({ ...ownerCompanyDetail, status: 'inactive' }, 'inactive').finally(() => {
                      startTransition(() => { setOwnerCompanies(loadCompaniesRegistryLight()); });
                      setOwnerCompanyBusy(false);
                    });
                  }}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: ownerCompanyDetail.status === 'inactive' ? 'rgba(239,68,68,0.2)' : '#ef4444',
                    color: ownerCompanyDetail.status === 'inactive' ? '#fca5a5' : '#fff',
                    fontWeight: 800, fontSize: '0.85rem',
                    opacity: ownerCompanyDetail.status === 'inactive' ? 0.7 : 1,
                  }}
                >
                  Deactivate
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Owner: New Company Registration Requests — removed */}
      {false && isOwner && tab === 'companies' && ownerNewCompanies.length > 0 && (
        <div style={{
          margin: '0 20px 20px',
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 16,
          padding: 16,
          direction: 'rtl',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontWeight: 800, fontSize: 14, color: 'hsl(var(--foreground))' }}>
              طلبات تسجيل الشركات
              {ownerNewCompanies.filter(c => c.status === 'pending').length > 0 && (
                <span style={{
                  marginRight: 8, padding: '2px 8px', borderRadius: 20,
                  background: 'hsl(var(--primary)/0.2)', color: 'hsl(var(--primary))',
                  fontSize: 11, fontWeight: 700,
                }}>
                  {ownerNewCompanies.filter(c => c.status === 'pending').length} جديد
                </span>
              )}
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setOwnerNewCompaniesFilter(f)}
                  style={{
                    padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600,
                    background: ownerNewCompaniesFilter === f ? 'hsl(var(--primary))' : 'hsl(var(--muted)/0.5)',
                    color: ownerNewCompaniesFilter === f ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {f === 'pending' ? 'انتظار' : f === 'approved' ? 'معتمد' : f === 'rejected' ? 'مرفوض' : 'الكل'}
                </button>
              ))}
            </div>
          </div>

          {ownerNewCompaniesLoading ? (
            <p style={{ textAlign: 'center', color: 'hsl(var(--muted-foreground))', fontSize: 13, padding: 12 }}>جاري التحميل…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ownerNewCompanies
                .filter(c => ownerNewCompaniesFilter === 'all' || c.status === ownerNewCompaniesFilter)
                .map(c => (
                  <div key={c.id} style={{
                    background: 'hsl(var(--muted)/0.3)',
                    border: `1px solid ${c.status === 'pending' ? 'hsl(var(--primary)/0.3)' : c.status === 'approved' ? 'hsl(var(--success)/0.3)' : 'hsl(var(--destructive)/0.3)'}`,
                    borderRadius: 12, padding: 12,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: 'hsl(var(--foreground))' }}>{c.companyName}</p>
                        {c.tradeName && <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{c.tradeName}</p>}
                        <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
                          مقدّم من: {c.submitter.name || c.submitter.username || c.submitter.email}
                        </p>
                        {c.licenseNumber && <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>سجل: {c.licenseNumber}</p>}
                        {c.tradeLicenseNumber && <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>رخصة: {c.tradeLicenseNumber}</p>}
                        {c.description && <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>{c.description}</p>}
                        {/* Documents */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          {c.commercialRegFile ? (
                            <a href={c.commercialRegFile} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 11, color: 'hsl(var(--primary))', textDecoration: 'underline' }}>
                              📄 السجل التجاري
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: 'hsl(var(--destructive))' }}>⚠ لا يوجد سجل تجاري</span>
                          )}
                          {c.tradeLicenseFile ? (
                            <a href={c.tradeLicenseFile} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 11, color: 'hsl(var(--primary))', textDecoration: 'underline' }}>
                              📄 الترخيص التجاري
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: 'hsl(var(--destructive))' }}>⚠ لا يوجد ترخيص</span>
                          )}
                        </div>
                      </div>
                      <span style={{
                        padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                        background: c.status === 'pending' ? 'hsl(var(--primary)/0.15)' : c.status === 'approved' ? 'hsl(var(--success)/0.15)' : 'hsl(var(--destructive)/0.15)',
                        color: c.status === 'pending' ? 'hsl(var(--primary))' : c.status === 'approved' ? 'hsl(var(--success))' : 'hsl(var(--destructive))',
                      }}>
                        {c.status === 'pending' ? 'انتظار' : c.status === 'approved' ? 'معتمد ✓' : 'مرفوض'}
                      </span>
                    </div>

                    {/* Reject reason input */}
                    {ownerNewCompaniesRejectId === c.id && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                        <input
                          value={ownerNewCompaniesRejectReason}
                          onChange={e => setOwnerNewCompaniesRejectReason(e.target.value)}
                          placeholder="سبب الرفض (اختياري)"
                          style={{
                            flex: 1, padding: '8px 10px', borderRadius: 8,
                            border: '1px solid hsl(var(--border))',
                            background: 'hsl(var(--muted)/0.4)',
                            color: 'hsl(var(--foreground))', fontSize: 12, direction: 'rtl',
                          }}
                        />
                        <button
                          onClick={() => reviewNewCompany(c.id, 'reject', ownerNewCompaniesRejectReason)}
                          style={{
                            padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))',
                            fontSize: 12, fontWeight: 700,
                          }}
                        >
                          تأكيد الرفض
                        </button>
                        <button
                          onClick={() => setOwnerNewCompaniesRejectId(null)}
                          style={{
                            padding: '8px 12px', borderRadius: 8, border: '1px solid hsl(var(--border))',
                            background: 'transparent', color: 'hsl(var(--muted-foreground))',
                            fontSize: 12, cursor: 'pointer',
                          }}
                        >
                          إلغاء
                        </button>
                      </div>
                    )}

                    {/* Action buttons */}
                    {c.status === 'pending' && ownerNewCompaniesRejectId !== c.id && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          onClick={() => reviewNewCompany(c.id, 'approve')}
                          style={{
                            flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: 'hsl(var(--success))', color: 'hsl(var(--success-foreground))',
                            fontSize: 12, fontWeight: 700,
                          }}
                        >
                          ✓ قبول
                        </button>
                        <button
                          onClick={() => { setOwnerNewCompaniesRejectId(c.id); setOwnerNewCompaniesRejectReason(''); }}
                          style={{
                            flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))',
                            fontSize: 12, fontWeight: 700,
                          }}
                        >
                          ✕ رفض
                        </button>
                      </div>
                    )}
                    {c.status === 'approved' && (
                      <button
                        onClick={() => reviewNewCompany(c.id, 'reject', 'تم إلغاء الاعتماد')}
                        style={{
                          marginTop: 8, padding: '6px 14px', borderRadius: 8,
                          border: '1px solid hsl(var(--destructive)/0.5)',
                          background: 'transparent', color: 'hsl(var(--destructive))',
                          fontSize: 11, cursor: 'pointer',
                        }}
                      >
                        إلغاء الاعتماد
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}


      {/* ── Owner: Banned / soft-deleted recovery ── */}
      <AnimatePresence>
        {showRecoveredUsers && isSupportOwnerAccount(
          user as { email?: string | null; username?: string | null; name?: string | null },
          profileUsername,
        ) && (
          <motion.div
            key="recovered-users"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10350,
              background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(10px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(234,179,8,0.25)',
              background: 'linear-gradient(180deg, #1a1608 0%, #0a0e0e 100%)',
              minHeight: 52, flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => setShowRecoveredUsers(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#eab308', padding: 2 }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900, fontSize: '0.95rem' }}>Banned / Deleted</p>
                <p style={{ margin: '1px 0 0', color: 'rgba(200,190,150,0.75)', fontSize: '0.68rem', fontWeight: 600 }}>
                  Restore accounts or permanent wipe
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRecoveredUsers(loadDeletedUsers())}
                style={{
                  border: '1px solid rgba(234,179,8,0.35)', background: 'rgba(234,179,8,0.1)',
                  color: '#eab308', borderRadius: 8, padding: '6px 10px', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer',
                }}
              >
                Refresh
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
              {recoveredUsers.length === 0 && (
                <div style={{
                  padding: 24, textAlign: 'center', color: 'rgba(180,180,160,0.7)',
                  border: '1px dashed rgba(234,179,8,0.25)', borderRadius: 14,
                }}>
                  No banned or soft-deleted accounts in recovery list
                </div>
              )}
              {recoveredUsers.map((row) => {
                const key = String(row.id || row.email || row.username || row.deletedAt || 'row');
                const busy = recoveredBusyId === key;
                return (
                  <div
                    key={key}
                    style={{
                      marginBottom: 10, padding: '12px 14px', borderRadius: 14,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(234,179,8,0.2)',
                    }}
                  >
                    <p style={{ margin: 0, color: '#f5e6a8', fontWeight: 800, fontSize: '0.88rem' }}>
                      {row.username ? `@${String(row.username).replace(/^@/, '')}` : (row.email || row.id)}
                    </p>
                    {row.email && (
                      <p style={{ margin: '4px 0 0', color: 'rgba(180,180,160,0.75)', fontSize: '0.72rem' }}>{row.email}</p>
                    )}
                    <p style={{ margin: '4px 0 0', color: 'rgba(150,150,130,0.6)', fontSize: '0.65rem' }}>
                      Soft-deleted {row.deletedAt ? new Date(row.deletedAt).toLocaleString() : ''}
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setRecoveredBusyId(key);
                          try {
                            let orig = String(row.originalUsername || '').replace(/^@/, '').trim()
                              || (String(row.username || '').startsWith('deleted_') ? '' : String(row.username || '').replace(/^@/, '').trim());
                            if (!orig) {
                              // الحساب أُعيدت تسميته deleted_* ولا نعرف يوزره الأصلي — اسأل المالك
                              const guess = String(row.email || '').split('@')[0] || '';
                              const entered = window.prompt('Username to restore (without @):', guess);
                              if (entered === null) return;
                              orig = entered.replace(/^@/, '').trim();
                            }
                            try {
                              await restoreOwnerAccount({
                                id: row.id,
                                email: row.email,
                                username: row.username,
                                originalUsername: orig || row.originalUsername,
                                lastIp: (row as any).lastIp || null,
                              });
                            } catch (libErr) { console.warn('[restore] lib', libErr); }
                            // ضمان الاستعادة: علامة محلية + إلغاء الحظر/الحذف على السيرفر + إرجاع اليوزر الأصلي
                            markUserRestored({ id: row.id });
                            if (row.id) {
                              try {
                                await patchSupportUser(String(row.id), {
                                  isBanned: false, banned: false, deleted: false, isDeleted: false, status: 'active',
                                  ...(orig ? { username: orig } : {}),
                                });
                              } catch { /* */ }
                            }
                            restoreDeletedUser({ id: row.id, email: row.email, username: row.username, originalUsername: orig || row.originalUsername });
                            setRecoveredUsers(loadDeletedUsers());
                            try { await loadOwnerData(); } catch { /* */ }
                          } catch (err) {
                            console.error('[restore]', err);
                            alert('Restore failed: ' + String(err));
                          } finally {
                            setRecoveredBusyId('');
                          }
                        }}
                        style={{
                          flex: 1, minWidth: 100, padding: '10px 12px', borderRadius: 10, border: 'none',
                          background: '#22c55e', color: '#041018', fontWeight: 800, fontSize: '0.78rem',
                          cursor: 'pointer', opacity: busy ? 0.6 : 1,
                        }}
                      >
                        Restore / Unban
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const ok = window.confirm('PERMANENT delete: the account disappears completely with all its content, and the email can be used again. This cannot be undone.');
                          if (!ok) return;
                          setRecoveredBusyId(key);
                          try {
                            // 1) علامة "محذوف نهائياً" أولاً حتى لا يعيده أي تحديث في الخلفية لهذا القسم
                            markUserWiped({ id: row.id, username: row.username });
                            // Optimistic UI remove
                            setRecoveredUsers(prev => prev.filter(x => {
                              if (row.id && x.id === row.id) return false;
                              if (row.email && String(x.email || '').toLowerCase() === String(row.email || '').toLowerCase()) return false;
                              return true;
                            }));
                            setAllUsers(prev => prev.filter(x => x.id !== row.id));
                            setAllCompanyCtrlUsers(prev => prev.filter(x => x.id !== row.id));
                            try {
                              await wipeOwnerAccount({
                                id: row.id,
                                email: row.email,
                                username: row.username,
                                originalUsername: (row as any).originalUsername || row.username,
                                lastIp: (row as any).lastIp || null,
                              });
                            } catch (libErr) { console.warn('[wipe] lib', libErr); }
                            const purged = await permanentlyWipeUser(row);
                            setRecoveredUsers(loadDeletedUsers());
                            try { await loadOwnerData(); } catch { /* */ }
                            if (!purged) {
                              alert('Removed from the app. The server has no hard-delete route yet, so the email may still be reserved until the server purges this account.');
                            }
                          } catch (err) {
                            console.error('[wipe]', err);
                            alert('Permanent wipe failed: ' + String(err));
                            setRecoveredUsers(loadDeletedUsers());
                          } finally {
                            setRecoveredBusyId('');
                          }
                        }}
                        style={{
                          flex: 1, minWidth: 100, padding: '10px 12px', borderRadius: 10, border: 'none',
                          background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: '0.78rem',
                          cursor: 'pointer', opacity: busy ? 0.6 : 1,
                        }}
                      >
                        Permanent wipe
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>



      {/* ── Owner: Ads — paid feed ads (owner only) ── */}
      <AnimatePresence>
        {showOwnerAds && isSupportOwnerAccount(
          user as { email?: string | null; username?: string | null; name?: string | null },
          profileUsername,
        ) && (
          <React.Suspense fallback={null}>
            <OwnerAdsPanelLazy onClose={() => setShowOwnerAds(false)} />
          </React.Suspense>
        )}
      </AnimatePresence>

      {/* ── Owner: STOOORNA note — one note for everybody (+ image / video / PDF), new replaces old ── */}
      <AnimatePresence>
        {showOwnerNote && isSupportOwnerAccount(
          user as { email?: string | null; username?: string | null; name?: string | null },
          profileUsername,
        ) && (
          <React.Suspense fallback={null}>
            <OwnerNotePanelLazy onClose={() => setShowOwnerNote(false)} />
          </React.Suspense>
        )}
      </AnimatePresence>

      {/* ── Owner: VIP manager — give any user VIP (frame + color + VIP header) ── */}
      <AnimatePresence>
        {showOwnerVip && isSupportOwnerAccount(
          user as { email?: string | null; username?: string | null; name?: string | null },
          profileUsername,
        ) && (
          <motion.div
            key="owner-vip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10350,
              background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(10px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(234,179,8,0.25)',
              background: 'linear-gradient(180deg, #1a1608 0%, #0a0e0e 100%)',
              minHeight: 52, flexShrink: 0,
            }}>
              <button type="button" onClick={() => setShowOwnerVip(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#eab308', padding: 2 }} aria-label="Close">
                <X size={20} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900, fontSize: '0.95rem' }}>VIP Manager</p>
                <p style={{ margin: '1px 0 0', color: 'rgba(200,190,150,0.75)', fontSize: '0.68rem', fontWeight: 600 }}>
                  Owner only · give VIP with frame, color and VIP header
                </p>
              </div>
              <button type="button" onClick={() => { void loadOwnerData(); setOwnerVipTick(t => t + 1); }}
                style={{ border: '1px solid rgba(234,179,8,0.35)', background: 'rgba(234,179,8,0.1)', color: '#eab308', borderRadius: 8, padding: '6px 10px', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer' }}>
                Refresh
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }} data-tick={ownerVipTick}>
              {ownerVipSel && (
                <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.35)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
                      border: `3px solid ${(VIP_COLORS as Record<string, string>)[ownerVipColor] || '#eab308'}`,
                      boxShadow: `0 0 12px ${(VIP_COLORS as Record<string, string>)[ownerVipColor] || '#eab308'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f5e6a8', fontWeight: 900,
                    }}>
                      {(ownerVipSel.username || ownerVipSel.email || '?').replace(/^@/, '').slice(0, 1).toUpperCase()}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: '0.9rem', color: (VIP_COLORS as Record<string, string>)[ownerVipColor] || '#f5e6a8' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ownerVipSel.username ? `@${String(ownerVipSel.username).replace(/^@/, '')}` : ownerVipSel.email}
                        </span>
                        <span style={{ padding: '1px 7px', borderRadius: 999, fontSize: '0.6rem', fontWeight: 900, background: (VIP_COLORS as Record<string, string>)[ownerVipColor] || '#eab308', color: '#111' }}>VIP</span>
                      </p>
                      <p style={{ margin: '3px 0 0', color: 'rgba(180,180,160,0.75)', fontSize: '0.68rem' }}>{ownerVipSel.email}</p>
                    </div>
                  </div>
                  <p style={{ margin: '12px 0 6px', color: 'rgba(200,190,150,0.8)', fontSize: '0.68rem', fontWeight: 700 }}>Frame &amp; header color</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {Object.keys(VIP_COLORS as Record<string, string>).map(c => (
                      <button key={c} type="button" onClick={() => setOwnerVipColor(c)} aria-label={c}
                        style={{
                          width: 30, height: 30, borderRadius: '50%', cursor: 'pointer',
                          background: (VIP_COLORS as Record<string, string>)[c],
                          border: ownerVipColor === c ? '3px solid #fff' : '3px solid transparent',
                        }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <button type="button" disabled={ownerVipBusy}
                      onClick={async () => {
                        if (!ownerVipSel) return;
                        setOwnerVipBusy(true); setOwnerVipMsg('');
                        try {
                          const synced = await ownerGrantVip(ownerVipSel, ownerVipColor);
                          setOwnerVipMsg(synced ? 'VIP saved for this user.' : 'VIP saved on this device. The server did not accept the VIP update yet, so other devices will not see it until the server route exists.');
                          setOwnerVipTick(t => t + 1);
                        } finally { setOwnerVipBusy(false); }
                      }}
                      style={{ flex: 1, minWidth: 110, padding: '10px 12px', borderRadius: 10, border: 'none', background: '#eab308', color: '#111', fontWeight: 900, fontSize: '0.78rem', cursor: 'pointer', opacity: ownerVipBusy ? 0.6 : 1 }}>
                      {ownerVipActive(ownerVipSel.id) ? 'Update VIP' : 'Give VIP'}
                    </button>
                    {ownerVipActive(ownerVipSel.id) && (
                      <button type="button" disabled={ownerVipBusy}
                        onClick={async () => {
                          if (!ownerVipSel) return;
                          if (!window.confirm('Remove VIP from this user?')) return;
                          setOwnerVipBusy(true); setOwnerVipMsg('');
                          try {
                            const ok = await ownerRemoveVip(ownerVipSel);
                            setOwnerVipMsg(ok
                              ? 'VIP removed completely (frame, color and VIP header).'
                              : 'Removed on this device only. The server did not accept the removal, so VIP may come back until the server route clears it.' + ownerClearInfoSuffix(ok));
                            setOwnerVipTick(t => t + 1);
                          } finally { setOwnerVipBusy(false); }
                        }}
                        style={{ flex: 1, minWidth: 110, padding: '10px 12px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', opacity: ownerVipBusy ? 0.6 : 1 }}>
                        Remove VIP
                      </button>
                    )}
                  </div>
                  {ownerVipMsg && <p style={{ margin: '10px 0 0', color: '#f5e6a8', fontSize: '0.72rem' }}>{ownerVipMsg}</p>}
                </div>
              )}

              <input
                value={ownerVipQuery}
                onChange={e => setOwnerVipQuery(e.target.value)}
                placeholder="Search username or email…"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px', marginBottom: 10, borderRadius: 10,
                  border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(255,255,255,0.04)', color: '#f5e6a8', fontSize: '0.8rem', outline: 'none',
                }}
              />
              {allUsers
                .filter(u => {
                  if (isUserDeleted(u)) return false;
                  const q = ownerVipQuery.trim().toLowerCase().replace(/^@/, '');
                  if (!q) return true;
                  return `${u.username || ''} ${u.email || ''} ${u.name || ''}`.toLowerCase().includes(q);
                })
                .slice(0, 60)
                .map(u => {
                  const on = ownerVipActive(u.id);
                  const col = ownerVipColorOf(u.id);
                  const selected = ownerVipSel?.id === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setOwnerVipSel({ id: u.id, username: u.username, email: u.email });
                        setOwnerVipColor(col || 'gold');
                        setOwnerVipMsg('');
                      }}
                      style={{
                        width: '100%', textAlign: 'left', marginBottom: 8, padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                        background: selected ? 'rgba(234,179,8,0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${selected ? 'rgba(234,179,8,0.5)' : 'rgba(234,179,8,0.15)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', color: '#f5e6a8', fontWeight: 800, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.username ? `@${String(u.username).replace(/^@/, '')}` : (u.name || u.email)}
                        </span>
                        <span style={{ display: 'block', color: 'rgba(180,180,160,0.7)', fontSize: '0.66rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</span>
                      </span>
                      {on && (
                        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.62rem', fontWeight: 900, background: (VIP_COLORS as Record<string, string>)[col || 'gold'] || '#eab308', color: '#111', flexShrink: 0 }}>VIP</span>
                      )}
                    </button>
                  );
                })}
              {allUsers.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'rgba(180,180,160,0.7)', border: '1px dashed rgba(234,179,8,0.25)', borderRadius: 14 }}>
                  No users loaded yet — tap Refresh
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Owner: Business manager — give any user Business (approved account + Business header) ── */}
      <AnimatePresence>
        {showOwnerBiz && isSupportOwnerAccount(
          user as { email?: string | null; username?: string | null; name?: string | null },
          profileUsername,
        ) && (
          <motion.div
            key="owner-biz"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10350,
              background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(10px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(234,179,8,0.25)',
              background: 'linear-gradient(180deg, #1a1608 0%, #0a0e0e 100%)',
              minHeight: 52, flexShrink: 0,
            }}>
              <button type="button" onClick={() => setShowOwnerBiz(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#eab308', padding: 2 }} aria-label="Close">
                <X size={20} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900, fontSize: '0.95rem' }}>Business Manager</p>
                <p style={{ margin: '1px 0 0', color: 'rgba(200,190,150,0.75)', fontSize: '0.68rem', fontWeight: 600 }}>
                  Owner only · give Business with the Business header
                </p>
              </div>
              <button type="button" onClick={() => { void loadOwnerData(); setOwnerBizTick(t => t + 1); }}
                style={{ border: '1px solid rgba(234,179,8,0.35)', background: 'rgba(234,179,8,0.1)', color: '#eab308', borderRadius: 8, padding: '6px 10px', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer' }}>
                Refresh
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }} data-tick={ownerBizTick}>
              {ownerBizSel && (
                <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.35)' }}>
                  <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: '0.9rem', color: '#f5e6a8' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ownerBizSel.username ? `@${String(ownerBizSel.username).replace(/^@/, '')}` : ownerBizSel.email}
                    </span>
                    <BusinessHeadBadge compact />
                  </p>
                  <p style={{ margin: '3px 0 0', color: 'rgba(180,180,160,0.75)', fontSize: '0.68rem' }}>{ownerBizSel.email}</p>
                  <p style={{ margin: '12px 0 6px', color: 'rgba(200,190,150,0.8)', fontSize: '0.68rem', fontWeight: 700 }}>Business / project name (optional)</p>
                  <input
                    value={ownerBizProject}
                    onChange={e => setOwnerBizProject(e.target.value)}
                    placeholder={String(ownerBizSel.username || '').replace(/^@/, '') || 'Project name'}
                    style={{
                      width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
                      border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(255,255,255,0.04)', color: '#f5e6a8', fontSize: '0.8rem', outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <button type="button" disabled={ownerBizBusy}
                      onClick={async () => {
                        if (!ownerBizSel) return;
                        setOwnerBizBusy(true); setOwnerBizMsg('');
                        try {
                          const synced = await ownerGrantBusiness(ownerBizSel, ownerBizProject);
                          setOwnerBizMsg(synced ? 'Business saved for this user.' : 'Business saved on this device. The server did not accept the Business update yet, so other devices will not see it until the server route exists.');
                          setOwnerBizTick(t => t + 1);
                        } finally { setOwnerBizBusy(false); }
                      }}
                      style={{ flex: 1, minWidth: 110, padding: '10px 12px', borderRadius: 10, border: 'none', background: '#eab308', color: '#111', fontWeight: 900, fontSize: '0.78rem', cursor: 'pointer', opacity: ownerBizBusy ? 0.6 : 1 }}>
                      {ownerBizActive(ownerBizSel.id) ? 'Update Business' : 'Give Business'}
                    </button>
                    {ownerBizActive(ownerBizSel.id) && (
                      <button type="button" disabled={ownerBizBusy}
                        onClick={async () => {
                          if (!ownerBizSel) return;
                          if (!window.confirm('Remove Business from this user?')) return;
                          setOwnerBizBusy(true); setOwnerBizMsg('');
                          try {
                            const ok = await ownerRemoveBusiness(ownerBizSel);
                            setOwnerBizMsg(ok
                              ? 'Business removed completely (banner and account).'
                              : 'Removed on this device only. The server still lists this user as Business, so it may come back until the server route clears it.' + ownerClearInfoSuffix(ok));
                            setOwnerBizTick(t => t + 1);
                          } finally { setOwnerBizBusy(false); }
                        }}
                        style={{ flex: 1, minWidth: 110, padding: '10px 12px', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', opacity: ownerBizBusy ? 0.6 : 1 }}>
                        Remove Business
                      </button>
                    )}
                  </div>
                  {ownerBizMsg && <p style={{ margin: '10px 0 0', color: '#f5e6a8', fontSize: '0.72rem' }}>{ownerBizMsg}</p>}
                </div>
              )}

              <input
                value={ownerBizQuery}
                onChange={e => setOwnerBizQuery(e.target.value)}
                placeholder="Search username or email…"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px', marginBottom: 10, borderRadius: 10,
                  border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(255,255,255,0.04)', color: '#f5e6a8', fontSize: '0.8rem', outline: 'none',
                }}
              />
              {allUsers
                .filter(u => {
                  if (isUserDeleted(u)) return false;
                  const q = ownerBizQuery.trim().toLowerCase().replace(/^@/, '');
                  if (!q) return true;
                  return `${u.username || ''} ${u.email || ''} ${u.name || ''}`.toLowerCase().includes(q);
                })
                .slice(0, 60)
                .map(u => {
                  const on = ownerBizActive(u.id);
                  const selected = ownerBizSel?.id === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setOwnerBizSel({ id: u.id, username: u.username, email: u.email });
                        const row = getBusinessForUser(u.id);
                        setOwnerBizProject(row?.status === 'approved' ? (row.projectName || '') : '');
                        setOwnerBizMsg('');
                      }}
                      style={{
                        width: '100%', textAlign: 'left', marginBottom: 8, padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                        background: selected ? 'rgba(234,179,8,0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${selected ? 'rgba(234,179,8,0.5)' : 'rgba(234,179,8,0.15)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', color: '#f5e6a8', fontWeight: 800, fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.username ? `@${String(u.username).replace(/^@/, '')}` : (u.name || u.email)}
                        </span>
                        <span style={{ display: 'block', color: 'rgba(180,180,160,0.7)', fontSize: '0.66rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</span>
                      </span>
                      {on && <BusinessHeadBadge compact />}
                    </button>
                  );
                })}
              {allUsers.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'rgba(180,180,160,0.7)', border: '1px dashed rgba(234,179,8,0.25)', borderRadius: 14 }}>
                  No users loaded yet — tap Refresh
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {clearStoriesFor && (
        <ClearUserStoriesDialog target={clearStoriesFor} onClose={() => setClearStoriesFor(null)} />
      )}

      {/* ── Owner: Story moderation (moderators + notices log) ── */}
      {showOwnerStoryMod && isSupportOwnerAccount(
        user as { email?: string | null; username?: string | null; name?: string | null },
        profileUsername,
      ) && (
        <StoryModerationManager
          users={allUsers as unknown as { id: string; username: string | null; email: string; name?: string | null }[]}
          onClose={() => setShowOwnerStoryMod(false)}
          onRefreshUsers={() => { void loadOwnerData(); }}
        />
      )}

      {/* ── Owner note for Business applicant (one-time) ── */}
      <AnimatePresence>
        {bizOwnerNoteOpen && businessRow?.ownerNote && !businessRow?.ownerNoteSeen && (
          <motion.div
            key="biz-owner-note"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10500,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '16px 18px calc(72px + env(safe-area-inset-bottom))',
              boxSizing: 'border-box',
            }}
            onClick={() => {
              if (user?.id) dismissBusinessOwnerNote(user.id);
              setBizOwnerNoteOpen(false);
              const r = getBusinessForUser(user?.id);
              setBusinessRow(r);
            }}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              style={{
                width: 'min(92vw, 360px)',
                background: 'linear-gradient(180deg, #0a1f22 0%, #061014 100%)',
                border: '1px solid rgba(234,179,8,0.4)',
                borderRadius: 16,
                padding: '16px 14px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900, fontSize: '0.9rem' }}>Message from owner</p>
                <button
                  type="button"
                  onClick={() => {
                    if (user?.id) dismissBusinessOwnerNote(user.id);
                    setBizOwnerNoteOpen(false);
                    const r = getBusinessForUser(user?.id);
                    setBusinessRow(r);
                  }}
                  style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>
              <p style={{ margin: 0, color: 'rgba(200,230,230,0.9)', fontSize: '0.88rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {businessRow.ownerNote}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (user?.id) dismissBusinessOwnerNote(user.id);
                  setBizOwnerNoteOpen(false);
                  const r = getBusinessForUser(user?.id);
                  setBusinessRow(r);
                }}
                style={{
                  marginTop: 14, width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                  background: '#eab308', color: '#0a0a0a', fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer',
                }}
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Business registration modal ── */}
      <AnimatePresence>
        {businessModalOpen && (
          <motion.div
            key="biz-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10400,
              background: 'rgba(0,0,0,0.72)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '12px 14px calc(72px + env(safe-area-inset-bottom))',
              boxSizing: 'border-box',
            }}
            onClick={() => setBusinessModalOpen(false)}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              style={{
                width: 'min(94vw, 400px)',
                maxHeight: 'min(78vh, calc(100dvh - 120px - env(safe-area-inset-bottom)))',
                overflowY: 'auto',
                background: 'linear-gradient(180deg, #0a1f22 0%, #061014 100%)',
                border: '1px solid rgba(234,179,8,0.35)',
                borderRadius: 18,
                padding: '16px 14px 18px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
                direction: 'rtl',
                marginBottom: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900, fontSize: '0.95rem' }}>Business</p>
                <button type="button" onClick={() => setBusinessModalOpen(false)} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              {businessRow?.status === 'approved' ? (
                <div style={{ textAlign: 'center', padding: '18px 8px' }}>
                  <span style={{
                    display: 'inline-block', fontSize: '0.75rem', fontWeight: 900, color: '#0a0a0a',
                    background: '#eab308', borderRadius: 8, padding: '6px 14px',
                  }}>Business</span>
                  <p style={{ margin: '12px 0 0', color: 'rgba(200,230,230,0.85)', fontSize: '0.82rem', fontWeight: 700 }}>
                    {businessRow.projectName}
                  </p>
                </div>
              ) : businessRow?.status === 'pending' ? (
                <button type="button" disabled style={{
                  width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                  background: 'rgba(0,188,212,0.18)', color: '#00BCD4', fontWeight: 900, fontSize: '0.88rem',
                }}>
                  Under review
                </button>
              ) : (
                <>
                  <label style={{ display: 'block', color: 'rgba(180,210,210,0.75)', fontSize: '0.68rem', fontWeight: 700, marginBottom: 6 }}>
                    Project name
                  </label>
                  <input
                    value={bizProjectName}
                    onChange={e => setBizProjectName(e.target.value.slice(0, 80))}
                    placeholder="Project name"
                    style={{
                      width: '100%', boxSizing: 'border-box', marginBottom: 12, padding: '11px 12px', borderRadius: 11,
                      border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)',
                      color: '#d7eeee', fontSize: '0.88rem', outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ display: 'block', color: 'rgba(180,210,210,0.75)', fontSize: '0.65rem', fontWeight: 700, marginBottom: 6 }}>
                        Commercial registration
                      </label>
                      <input
                        value={bizLicense}
                        onChange={e => setBizLicense(e.target.value.slice(0, 40))}
                        placeholder="No."
                        style={{
                          width: '100%', boxSizing: 'border-box', padding: '10px 10px', borderRadius: 11,
                          border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)',
                          color: '#d7eeee', fontSize: '0.82rem', outline: 'none',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ display: 'block', color: 'rgba(180,210,210,0.75)', fontSize: '0.65rem', fontWeight: 700, marginBottom: 6 }}>
                        Trade license
                      </label>
                      <input
                        value={bizTradeLicense}
                        onChange={e => setBizTradeLicense(e.target.value.slice(0, 40))}
                        placeholder="No."
                        style={{
                          width: '100%', boxSizing: 'border-box', padding: '10px 10px', borderRadius: 11,
                          border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)',
                          color: '#d7eeee', fontSize: '0.82rem', outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  <input ref={bizCommFileRef} type="file" accept="image/*,.pdf" hidden onChange={e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setBizCommCert(String(reader.result || ''));
                      setBizCommCertName(f.name);
                    };
                    reader.readAsDataURL(f);
                  }} />
                  <input ref={bizTradeFileRef} type="file" accept="image/*,.pdf" hidden onChange={e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setBizTradeCert(String(reader.result || ''));
                      setBizTradeCertName(f.name);
                    };
                    reader.readAsDataURL(f);
                  }} />

                  <p style={{ margin: '0 0 6px', color: 'rgba(180,210,210,0.75)', fontSize: '0.68rem', fontWeight: 700 }}>
                    Commercial registration certificate
                  </p>
                  <button type="button" onClick={() => bizCommFileRef.current?.click()} style={{
                    width: '100%', marginBottom: 10, padding: '12px', borderRadius: 12,
                    border: '1px dashed rgba(234,179,8,0.4)', background: 'rgba(234,179,8,0.06)',
                    color: '#eab308', fontWeight: 800, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <Plus size={16} />
                    {bizCommCertName || 'Add file'}
                  </button>

                  <p style={{ margin: '0 0 6px', color: 'rgba(180,210,210,0.75)', fontSize: '0.68rem', fontWeight: 700 }}>
                    Trade license certificate
                  </p>
                  <button type="button" onClick={() => bizTradeFileRef.current?.click()} style={{
                    width: '100%', marginBottom: 14, padding: '12px', borderRadius: 12,
                    border: '1px dashed rgba(234,179,8,0.4)', background: 'rgba(234,179,8,0.06)',
                    color: '#eab308', fontWeight: 800, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <Plus size={16} />
                    {bizTradeCertName || 'Add file'}
                  </button>

                  <button
                    type="button"
                    disabled={bizSubmitting || !bizProjectName.trim() || !bizLicense.trim() || !bizTradeLicense.trim() || !bizCommCert || !bizTradeCert}
                    onClick={() => {
                      if (!user?.id) return;
                      setBizSubmitting(true);
                      const row: BusinessRegistration = {
                        id: `biz-${user.id}-${Date.now()}`,
                        userId: String(user.id),
                        username: profileUsername || (user as any).username || null,
                        email: user.email || null,
                        projectName: bizProjectName.trim(),
                        licenseNumber: bizLicense.trim(),
                        tradeLicenseNumber: bizTradeLicense.trim(),
                        commercialRegCert: bizCommCert,
                        commercialRegCertName: bizCommCertName,
                        tradeLicenseCert: bizTradeCert,
                        tradeLicenseCertName: bizTradeCertName,
                        status: 'pending',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                      };
                      upsertBusinessRegistration(row);
                      setBusinessRow(row);
                      setBizSubmitting(false);
                    }}
                    style={{
                      width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                      background: (bizProjectName.trim() && bizLicense.trim() && bizTradeLicense.trim() && bizCommCert && bizTradeCert)
                        ? '#eab308' : 'rgba(234,179,8,0.2)',
                      color: (bizProjectName.trim() && bizLicense.trim() && bizTradeLicense.trim() && bizCommCert && bizTradeCert)
                        ? '#0a0a0a' : 'rgba(150,150,130,0.7)',
                      fontWeight: 900, fontSize: '0.9rem',
                      cursor: (bizProjectName.trim() && bizLicense.trim() && bizTradeLicense.trim() && bizCommCert && bizTradeCert) ? 'pointer' : 'default',
                    }}
                  >
                    {bizSubmitting ? '...' : (businessRow?.status === 'pending' ? 'Under review' : 'Submit registration')}
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Owner: Business applications overlay (not mixed into company registry) ── */}
      <AnimatePresence>
        {showOwnerBusiness && isSupportOwnerAccount(
          user as { email?: string | null; username?: string | null; name?: string | null },
          profileUsername,
        ) && (
          <motion.div
            key="owner-business-apps"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10370,
              background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(10px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(234,179,8,0.25)',
              background: 'linear-gradient(180deg, #1a1608 0%, #0a0e0e 100%)',
              minHeight: 52, flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => setShowOwnerBusiness(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#eab308', padding: 2 }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
              <Briefcase size={18} style={{ color: '#eab308' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900, fontSize: '0.95rem' }}>Business applications</p>
                <p style={{ margin: '1px 0 0', color: 'rgba(200,190,150,0.75)', fontSize: '0.68rem', fontWeight: 600 }}>
                  Full request data · Approve / Reject · Note to user
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOwnerBusinessList(loadBusinessRegistry())}
                style={{
                  border: '1px solid rgba(234,179,8,0.35)', background: 'rgba(234,179,8,0.1)',
                  color: '#eab308', borderRadius: 8, padding: '6px 10px', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer',
                }}
              >
                Refresh
              </button>
              <span style={{ color: 'rgba(200,190,150,0.7)', fontSize: '0.7rem' }}>{ownerBusinessList.length}</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ownerBusinessList.length === 0 && (
                <div style={{
                  padding: 24, textAlign: 'center', color: 'rgba(180,180,160,0.7)',
                  border: '1px dashed rgba(234,179,8,0.25)', borderRadius: 14,
                }}>
                  No business applications
                </div>
              )}
              {ownerBusinessList.map(row => (
                <div key={row.id} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${row.status === 'pending' ? 'rgba(234,179,8,0.35)' : row.status === 'approved' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.3)'}`,
                  borderRadius: 14, padding: 14,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: '#f5e6a8' }}>{row.projectName}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(180,180,160,0.8)' }}>
                        @{String(row.username || '').replace(/^@/, '') || 'user'} · {row.email || ''}
                      </p>
                      <p style={{ margin: '6px 0 0', fontSize: 11, color: 'rgba(180,180,160,0.7)' }}>
                        Commercial registration: {row.licenseNumber}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(180,180,160,0.7)' }}>
                        Trade license: {row.tradeLicenseNumber}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 10, color: 'rgba(150,150,130,0.6)' }}>
                        Submitted: {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 10, color: 'rgba(150,150,130,0.6)' }}>
                        User ID: {row.userId}
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {row.commercialRegCert && (
                          <a href={row.commercialRegCert} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#00BCD4' }}>
                            Commercial cert{row.commercialRegCertName ? ` (${row.commercialRegCertName})` : ''}
                          </a>
                        )}
                        {row.tradeLicenseCert && (
                          <a href={row.tradeLicenseCert} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#00BCD4' }}>
                            Trade cert{row.tradeLicenseCertName ? ` (${row.tradeLicenseCertName})` : ''}
                          </a>
                        )}
                      </div>
                    </div>
                    <span style={{
                      padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                      background: row.status === 'pending' ? 'rgba(234,179,8,0.15)' : row.status === 'approved' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: row.status === 'pending' ? '#eab308' : row.status === 'approved' ? '#22c55e' : '#ef4444',
                    }}>
                      {row.status}
                    </span>
                  </div>
                  {row.status === 'pending' && (
                    <div style={{ marginTop: 12 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(180,180,160,0.75)', marginBottom: 6 }}>
                        Note for user (shown once in their settings, then disappears after they close it)
                      </label>
                      <textarea
                        value={ownerBizNotes[row.id] || ''}
                        onChange={e => setOwnerBizNotes(prev => ({ ...prev, [row.id]: e.target.value.slice(0, 500) }))}
                        placeholder="Write instructions or rejection reason for the user..."
                        rows={3}
                        style={{
                          width: '100%', boxSizing: 'border-box', borderRadius: 10, padding: '10px 12px',
                          border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.55)',
                          color: 'rgba(220,230,230,0.95)', fontSize: 12, outline: 'none', resize: 'vertical',
                          fontFamily: 'inherit', marginBottom: 8,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            reviewBusinessRegistration(row.id, 'approve', ownerBizNotes[row.id] || null);
                            setOwnerBusinessList(loadBusinessRegistry());
                            setOwnerBizNotes(prev => {
                              const n = { ...prev };
                              delete n[row.id];
                              return n;
                            });
                          }}
                          style={{
                            flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: '#22c55e', color: '#041018', fontSize: 12, fontWeight: 800,
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            reviewBusinessRegistration(row.id, 'reject', ownerBizNotes[row.id] || null);
                            setOwnerBusinessList(loadBusinessRegistry());
                            setOwnerBizNotes(prev => {
                              const n = { ...prev };
                              delete n[row.id];
                              return n;
                            });
                          }}
                          style={{
                            flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 800,
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                  {row.ownerNote && row.status !== 'pending' && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(180,180,160,0.7)' }}>
                      Note sent: {row.ownerNote}
                    </p>
                  )}
                  {row.status === 'cancelled' && (
                    <div style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm('Delete this business account? This only deletes the Business account, not the user, and cannot be undone.')) return;
                          deleteBusinessAccount(row.id);
                          setOwnerBusinessList(loadBusinessRegistry());
                        }}
                        style={{
                          width: '100%', padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                          background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 800,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visa top-up for Business balance */}
      <AnimatePresence>
        {bizTopUpOpen && (
          <motion.div
            key="biz-topup"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10500, background: 'rgba(0,0,0,0.75)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
            onClick={() => setBizTopUpOpen(false)}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              style={{
                width: 'min(94vw, 380px)', background: 'linear-gradient(180deg, #0a1f22 0%, #061014 100%)',
                border: '1px solid rgba(234,179,8,0.35)', borderRadius: 16, padding: 18,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900 }}>Add balance (Visa)</p>
                <button type="button" onClick={() => setBizTopUpOpen(false)} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <label style={{ display: 'block', color: 'rgba(180,210,210,0.7)', fontSize: '0.68rem', marginBottom: 6 }}>Full name</label>
              <input value={bizCardName} onChange={e => setBizCardName(e.target.value.slice(0, 60))}
                placeholder="Name on card"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)', color: '#d7eeee', outline: 'none' }} />
              <label style={{ display: 'block', color: 'rgba(180,210,210,0.7)', fontSize: '0.68rem', marginBottom: 6 }}>Card number</label>
              <input value={bizCardNumber} onChange={e => setBizCardNumber(e.target.value.replace(/[^0-9 ]/g, '').slice(0, 19))}
                placeholder="XXXX XXXX XXXX XXXX"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)', color: '#d7eeee', outline: 'none' }} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: 'rgba(180,210,210,0.7)', fontSize: '0.68rem', marginBottom: 6 }}>Expiry</label>
                  <input value={bizCardExp} onChange={e => setBizCardExp(e.target.value.slice(0, 5))} placeholder="MM/YY"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)', color: '#d7eeee', outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: 'rgba(180,210,210,0.7)', fontSize: '0.68rem', marginBottom: 6 }}>CVV</label>
                  <input value={bizCardCvv} onChange={e => setBizCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="***"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)', color: '#d7eeee', outline: 'none' }} />
                </div>
              </div>
              <label style={{ display: 'block', color: 'rgba(180,210,210,0.7)', fontSize: '0.68rem', marginBottom: 6 }}>Amount (KD)</label>
              <input value={bizTopUpAmount} onChange={e => setBizTopUpAmount(e.target.value.replace(/[^0-9.]/g, '').slice(0, 8))}
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 14, padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)', color: '#eab308', fontWeight: 800, outline: 'none' }} />
              <button
                type="button"
                onClick={() => {
                  if (!user?.id) return;
                  const amt = Math.max(1, Math.floor(Number(bizTopUpAmount) || 0));
                  if (!bizCardName.trim()) return;
                  if (bizCardNumber.replace(/\s/g, '').length < 12) return;
                  const next = bizBalance + amt;
                  try {
                    localStorage.setItem(`stooorna_biz_balance_${user.id}`, String(next));
                    window.dispatchEvent(new CustomEvent('stooorna:biz-balance', { detail: { userId: user.id, balance: next } }));
                  } catch { /* */ }
                  setBizBalance(next);
                  setBizCardName('');
                  setBizCardNumber('');
                  setBizCardExp('');
                  setBizCardCvv('');
                  setBizTopUpOpen(false);
                }}
                style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: '#eab308', color: '#0a0a0a', fontWeight: 900, cursor: 'pointer' }}
              >
                Pay & add balance
              </button>
              <p style={{ margin: '10px 0 0', color: 'rgba(180,210,210,0.55)', fontSize: '0.65rem', textAlign: 'center' }}>
                Demo top-up (local). Connect a payment gateway for production.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {false && vipPayOpen && (
          <motion.div
            key="vip-pay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 10520, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={() => setVipPayOpen(false)}
          >
            <motion.div onClick={e => e.stopPropagation()} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              style={{ width: 'min(92vw, 340px)', maxHeight: '88vh', overflowY: 'auto', background: '#0a1f22', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 10, boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900 }}>VIP Subscription Features</p>
                <button type="button" onClick={() => setVipPayOpen(false)} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer' }}><X size={18} /></button>
              </div>
                            <p style={{ margin: 0, color: '#eab308', fontWeight: 800 }}>5 KD / 30 days</p>
              <div style={{ color: '#d7eeee', fontSize: 13, lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 900, color: '#fff' }}>1. VIP Profile Customization</p>
                  <p style={{ margin: 0, color: 'rgba(200,220,220,0.8)' }}>Features an exclusive animated golden border around your profile picture, paired with a matching golden VIP header banner.</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 900, color: '#fff' }}>2. Advanced Room Stage Access</p>
                  <p style={{ margin: 0, color: 'rgba(200,220,220,0.8)' }}>Empowers hosts of audio or video rooms to invite up to 8 speakers simultaneously to the stage upon request.</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 900, color: '#fff' }}>3. Custom Username Colors</p>
                  <p style={{ margin: 0, color: 'rgba(200,220,220,0.8)' }}>Personalize your username with a selection of vibrant colors: Blue, Gold, Red, Green, or Grey.</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 900, color: '#fff' }}>4. Advanced Music &amp; Media Player</p>
                  <p style={{ margin: 0, color: 'rgba(200,220,220,0.8)' }}>Includes a dedicated search button for advanced music browsing. Play any song, track, or Quranic recitation for everyone in the room to hear. Features a personal favorites list and independent volume control for background music—allowing you to adjust the music volume without affecting normal microphone voice levels.</p>
                </div>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 900, color: '#fff' }}>5. One-Time Username Change</p>
                  <p style={{ margin: 0, color: 'rgba(200,220,220,0.8)' }}>Allows a one-time username change, supporting short usernames down to a single character.</p>
                </div>
              </div>
              {bizBalance < VIP_PRICE_KD ? (
                <p style={{ margin: 0, color: '#facc15', fontSize: 13, lineHeight: 1.45 }}>
                  Your My Balance is {bizBalance.toFixed(0)} KD. Add at least {VIP_PRICE_KD} KD in My Balance, then subscribe.
                </p>
              ) : (
                <p style={{ margin: 0, color: '#86efac', fontSize: 13 }}>My Balance {bizBalance.toFixed(0)} KD. Subscribe to deduct {VIP_PRICE_KD} KD for 30 days.</p>
              )}
              <button type="button" onClick={() => {
                if (!user?.id) return;
                if (bizBalance < VIP_PRICE_KD) return;
                const next = bizBalance - VIP_PRICE_KD;
                try {
                  localStorage.setItem(`stooorna_biz_balance_${user.id}`, String(next));
                  window.dispatchEvent(new CustomEvent('stooorna:biz-balance', { detail: { userId: user.id, balance: next } }));
                } catch { /* */ }
                setBizBalance(next);
                activateVip(user.id);
                setVipExpiresAt(Date.now() + 30 * 24 * 60 * 60 * 1000);
                setVipOn(true);
                setVipPayOpen(false);
              }} disabled={bizBalance < VIP_PRICE_KD} style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: bizBalance < VIP_PRICE_KD ? '#4b5563' : '#eab308', color: bizBalance < VIP_PRICE_KD ? '#ccc' : '#111', fontWeight: 900, cursor: bizBalance < VIP_PRICE_KD ? 'default' : 'pointer' }}>
                {bizBalance < VIP_PRICE_KD ? 'Add balance first' : `Subscribe · ${VIP_PRICE_KD} KD`}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {false && vipInfoOpen && vipOn && (
          <motion.div key="vip-info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 10540, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={() => setVipInfoOpen(false)}>
            <motion.div onClick={e => e.stopPropagation()} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              style={{ width: 'min(92vw, 340px)', background: '#0a1f22', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900 }}>VIP period</p>
                <button type="button" onClick={() => setVipInfoOpen(false)} style={{ background: 'none', border: 'none', color: '#eab308' }}><X size={18} /></button>
              </div>
              {(() => {
                const c = formatVipCountdown(vipExpiresAt);
                return (
                  <div style={{ marginTop: 12, color: '#d7eeee' }}>
                    <p style={{ margin: '0 0 8px', fontWeight: 800, color: '#eab308', fontSize: 22 }}>{c.days}d {String(c.hours).padStart(2,'0')}:{String(c.minutes).padStart(2,'0')}:{String(c.seconds).padStart(2,'0')}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'rgba(200,220,220,0.75)' }}>Ends {c.date || '—'}</p>
                    <p style={{ margin: '10px 0 0', fontSize: 12, color: 'rgba(200,220,220,0.7)' }}>When the 30 days end, VIP locks and features stop. You can subscribe again anytime from My Balance ({VIP_PRICE_KD} KD).</p>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {false && vipFeaturesOpen && vipOn && (
          <motion.div key="vip-feats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 10530, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={() => setVipFeaturesOpen(false)}>
            <motion.div onClick={e => e.stopPropagation()} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              style={{ width: 'min(92vw, 360px)', maxHeight: '88vh', overflowY: 'auto', background: '#0a1f22', border: '1px solid rgba(234,179,8,0.4)', borderRadius: 16, padding: 16, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900 }}>VIP features</p>
                <button type="button" onClick={() => { setVipFeaturesOpen(false); setVipConfirm(null); }} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <p style={{ margin: '0 0 8px', color: '#eab308', fontSize: 12, fontWeight: 700 }}>Username color</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {(['blue', 'gold', 'red', 'green', 'gray', 'pink'] as const).map(c => (
                  <button key={c} type="button" onClick={() => setVipConfirm({ kind: 'color', color: c })}
                    style={{ width: 24, height: 24, borderRadius: '50%', background: VIP_COLORS[c], border: vipColor === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }} />
                ))}
              </div>
              <p style={{ margin: '0 0 6px', color: '#eab308', fontSize: 12, fontWeight: 700 }}>Change username once</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                <input value={vipNewUser} onChange={e => setVipNewUser(e.target.value)} disabled={vipRenameUsed(user.id)}
                  placeholder="new username" style={{ width: '100%', boxSizing: 'border-box', borderRadius: 8, border: '1px solid rgba(234,179,8,0.35)', background: 'transparent', color: T.text, padding: '10px 10px' }} />
                <button type="button" disabled={vipRenameUsed(user.id) || !vipNewUser.trim()}
                  onClick={() => setVipConfirm({ kind: 'rename' })}
                  style={{ width: '100%', borderRadius: 8, border: 'none', background: '#eab308', color: '#111', fontWeight: 800, padding: '10px 10px' }}>Save username</button>
              </div>
              {vipRenameMsg ? <p style={{ margin: '0 0 10px', color: '#eab308', fontSize: 12 }}>{vipRenameMsg}</p> : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ color: T.text, fontSize: 13 }}>8 speakers on live mic</span>
                <button type="button" onClick={() => setVipConfirm({ kind: 'eightMics', nextOn: !vipEightMics })}
                  style={{ width: 46, height: 26, borderRadius: 999, border: 'none', background: vipEightMics ? '#eab308' : '#4b5563', position: 'relative' }}>
                  <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', left: vipEightMics ? 23 : 3 }} />
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: T.text, fontSize: 13 }}>Room music search</span>
                <button type="button" onClick={() => setVipConfirm({ kind: 'roomMusic', nextOn: !vipRoomMusic })}
                  style={{ width: 46, height: 26, borderRadius: 999, border: 'none', background: vipRoomMusic ? '#eab308' : '#4b5563', position: 'relative' }}>
                  <span style={{ position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', left: vipRoomMusic ? 23 : 3 }} />
                </button>
              </div>
              {vipOn && vipRoomMusic && (
                <button type="button" onClick={() => setMusicModalOpen(true)}
                  style={{ marginTop: 14, width: '100%', padding: 10, borderRadius: 10, border: '1px solid rgba(234,179,8,0.4)', background: 'rgba(234,179,8,0.12)', color: '#eab308', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Music size={16} /> Open room music
                </button>
              )}
              {vipConfirm && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 16 }}>
                  <div style={{ width: '100%', background: '#0d2428', border: '1px solid rgba(234,179,8,0.45)', borderRadius: 12, padding: 14 }}>
                    <p style={{ margin: '0 0 6px', color: '#eab308', fontWeight: 900 }}>
                      {vipConfirm.kind === 'color' ? 'Confirm username color' : vipConfirm.kind === 'rename' ? 'Confirm username change' : vipConfirm.kind === 'eightMics' ? (vipConfirm.nextOn ? 'Enable 8 live speakers' : 'Disable 8 live speakers') : (vipConfirm.nextOn ? 'Enable room music search' : 'Disable room music search')}
                    </p>
                    <p style={{ margin: '0 0 12px', color: T.text, fontSize: 13 }}>
                      {vipConfirm.kind === 'color' ? `Apply ${vipConfirm.color} to your public username?` : vipConfirm.kind === 'rename' ? `Save @${vipNewUser.trim().replace(/^@/, '')}? This can be used only once.` : vipConfirm.kind === 'eightMics' ? (vipConfirm.nextOn ? 'Your live rooms will accept up to 8 speakers on the mic.' : 'Live rooms will go back to 4 speakers.') : (vipConfirm.nextOn ? 'A Music button will appear on your live room.' : 'The Music button will be hidden on your live room.')}
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => setVipConfirm(null)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid rgba(234,179,8,0.35)', background: 'transparent', color: T.text, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                      <button type="button" onClick={async () => {
                        if (!user?.id || !vipConfirm) return;
                        if (vipConfirm.kind === 'color' && vipConfirm.color) {
                          setVipColor(vipConfirm.color);
                          persistVipColor(user.id, vipConfirm.color);
                        } else if (vipConfirm.kind === 'rename') {
                          if (vipRenameUsed(user.id)) { setVipRenameMsg('Already used'); setVipConfirm(null); return; }
                          const next = vipNewUser.trim().replace(/^@/, '');
                          try {
                            const r = await fetch('/api/users/me', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: next }) });
                            if (!r.ok) { setVipRenameMsg('Could not save username'); setVipConfirm(null); return; }
                          } catch { setVipRenameMsg('Could not save username'); setVipConfirm(null); return; }
                          markVipRenameUsed(user.id);
                          setVipRenameMsg('Saved');
                          setProfileUsername(next);
                        } else if (vipConfirm.kind === 'eightMics') {
                          const n = !!vipConfirm.nextOn;
                          setVipEightMics(n);
                          setVipFeat(user.id, 'eightMics', n);
                        } else if (vipConfirm.kind === 'roomMusic') {
                          const n = !!vipConfirm.nextOn;
                          setVipRoomMusic(n);
                          setVipFeat(user.id, 'roomMusic', n);
                        }
                        setVipConfirm(null);
                      }} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#eab308', color: '#111', fontWeight: 900, cursor: 'pointer' }}>Confirm</button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Unsubscribe confirmation — VIP / Business, bilingual warning before anything is cancelled ── */}
      <AnimatePresence>
        {false && cancelSubConfirm && (
          <motion.div
            key="cancel-sub-confirm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !cancellingSub && setCancelSubConfirm(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', zIndex: 12500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
              style={{ width: '100%', maxWidth: 340, background: '#101f22', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 16, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={18} color='#ef4444' />
                </div>
                <p style={{ margin: 0, color: T.text, fontSize: '0.9rem', fontWeight: 800, textAlign: 'center' }}>
                  {cancelSubConfirm === 'vip' ? 'إلغاء اشتراك VIP · Cancel VIP subscription' : 'إلغاء اشتراك Business · Cancel Business subscription'}
                </p>
              </div>
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 12px' }}>
                <p style={{ margin: '0 0 8px', color: T.text, fontSize: '0.78rem', lineHeight: 1.6, textAlign: 'right', direction: 'rtl' }}>
                  {cancelSubConfirm === 'vip'
                    ? 'عند إلغاء اشتراك الحساب سوف تكون على مسؤوليتك الخاصة، لأنه سوف يتم إزالة كل مميزات الاشتراك التي كانت على حسابك.'
                    : 'عند إلغاء اشتراك الحساب سوف تكون على مسؤوليتك الخاصة، لأنه سوف يتم تغيير حسابك من حساب الأعمال إلى حساب مستخدم عادي مع إلغاء جميع البوستات الخاصة بكم التي تم نشرها على الحساب وتعطيلها تمامًا.'}
                </p>
                <p style={{ margin: 0, color: T.textMuted, fontSize: '0.72rem', lineHeight: 1.55 }}>
                  {cancelSubConfirm === 'vip'
                    ? 'By cancelling, this is entirely at your own responsibility — every VIP feature on your account will be removed.'
                    : 'By cancelling, this is entirely at your own responsibility — your account will switch from a Business account to a regular user account, and every post you published on it will be disabled completely.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  disabled={cancellingSub}
                  onClick={() => setCancelSubConfirm(null)}
                  style={{ flex: 1, padding: 10, borderRadius: 10, border: `1px solid ${T.surfaceBorder}`, background: T.surface, color: T.text, fontWeight: 700, cursor: cancellingSub ? 'default' : 'pointer' }}
                >
                  تراجع · Keep it
                </button>
                <button
                  type="button"
                  disabled={cancellingSub}
                  onClick={async () => {
                    if (!user?.id || cancellingSub) { setCancelSubConfirm(null); return; }
                    setCancellingSub(true);
                    try {
                      if (cancelSubConfirm === 'vip') {
                        deactivateVip(user.id);
                        setVipOn(false);
                      } else if (cancelSubConfirm === 'business') {
                        cancelBusinessSubscription(user.id);
                        setBusinessRow(getBusinessForUser(user.id));
                      }
                    } finally {
                      setCancellingSub(false);
                      setCancelSubConfirm(null);
                    }
                  }}
                  style={{
                    flex: 1, padding: 10, borderRadius: 10, border: '1px solid rgba(239,68,68,0.4)',
                    background: 'rgba(239,68,68,0.18)', color: '#ef4444', fontWeight: 800,
                    cursor: cancellingSub ? 'default' : 'pointer',
                  }}
                >
                  {cancellingSub ? '…' : 'تأكيد الإلغاء · Confirm cancellation'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLiveLocation && (
          <motion.div
            key="live-location-map"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 12000,
              background: 'rgba(4,12,14,0.96)',
              display: 'flex',
              flexDirection: 'column',
              paddingTop: 'max(10px, env(safe-area-inset-top))',
            }}
          >
            <LiveLocationMap
              currentUserId={user?.id}
              currentName={(user as any)?.name || (user as any)?.username || 'Me'}
              currentUsername={(user as any)?.username || profileUsername || null}
              currentAvatar={(user as any)?.avatarUrl || (user as any)?.image || null}
              onClose={() => setShowLiveLocation(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {showPublicVoice && user?.id && (
        <LiveVipDock hostId={user.id} currentUserId={user.id} />
      )}
      {showPublicVoice && (
        <PublicVoiceLive
          userId={user?.id}
          userName={(user as any)?.name || profileUsername || 'Me'}
          userUsername={profileUsername || (user as any)?.username || null}
          userAvatar={avatarUrl || (user as any)?.avatarUrl || (user as any)?.image || null}
          onClose={() => setShowPublicVoice(false)}
        />
      )}

      {/* ── Wallet (Balance | Deposit) — from profile $ button ── */}
      {user?.id && phoneChecked && !String(profilePhone || '').trim() && createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 15000, background: 'rgba(2,10,12,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div style={{ width: 'min(92vw, 360px)', background: '#0e2c30', border: '1px solid rgba(0,188,212,0.4)', borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, color: '#d7eeee', fontWeight: 900, textAlign: 'center' }}>رقم الموبايل مطلوب</p>
              <p style={{ margin: 0, color: 'rgba(190,220,220,0.75)', fontSize: 13, textAlign: 'center' }}>لا يمكن استخدام الحساب بدون رقم موبايل. اختر المفتاح ثم أدخل الرقم.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={(DIAL_CODES.slice().sort((a,b) => b.dial.length - a.dial.length).find(c => phoneInput.startsWith(c.dial))?.dial || '+965')} onChange={e => {
                  const dial = (DIAL_CODES.slice().sort((a,b) => b.dial.length - a.dial.length).find(c => phoneInput.startsWith(c.dial))?.dial || '+965');
                  const national = phoneInput.startsWith(dial) ? phoneInput.slice(dial.length) : '';
                  setPhoneInput(e.target.value + national);
                }} style={{ width: 92, borderRadius: 10, background: '#062024', color: '#d7eeee', border: '1px solid rgba(0,188,212,0.35)', padding: 8 }}>
                  {DIAL_CODES.map(c => <option key={c.iso + c.dial} value={c.dial}>{c.dial}</option>)}
                </select>
                <input value={(() => { const dial = (DIAL_CODES.slice().sort((a,b) => b.dial.length - a.dial.length).find(c => phoneInput.startsWith(c.dial))?.dial || '+965'); return phoneInput.startsWith(dial) ? phoneInput.slice(dial.length) : ''; })()} onChange={e => {
                  const dial = (DIAL_CODES.slice().sort((a,b) => b.dial.length - a.dial.length).find(c => phoneInput.startsWith(c.dial))?.dial || '+965');
                  setPhoneInput(dial + e.target.value.replace(/\D/g, '').slice(0, 12));
                }} inputMode="numeric" placeholder="Mobile" dir="ltr" style={{ flex: 1, borderRadius: 10, background: '#062024', color: '#d7eeee', border: '1px solid rgba(0,188,212,0.35)', padding: 10 }} />
              </div>
              <button type="button" disabled={phoneLoading} onClick={() => { void savePhone(); }} style={{ padding: 12, borderRadius: 12, border: 'none', background: '#00BCD4', color: '#041018', fontWeight: 900, cursor: 'pointer' }}>{phoneLoading ? '...' : 'حفظ الرقم'}</button>
              {phoneMsg ? <p style={{ margin: 0, color: '#eab308', fontSize: 12, textAlign: 'center' }}>{phoneMsg}</p> : null}
            </div>
          </div>,
          document.body,
      )}
      {user?.id && (
        <WalletSheet open={walletOpen} onClose={() => setWalletOpen(false)} userId={user.id} allowWithdraw />
      )}

      {/* ── Music modal — from profile Music button ── */}
      <AnimatePresence>
        {musicModalOpen && (
          <SettingsMusicSearchModal
            onClose={() => setMusicModalOpen(false)}
            currentTrack={musicCurrentTrack}
            isPlaying={musicIsPlaying}
            onPlayTrack={handleMusicPlayTrack}
            favorites={musicFavorites}
            onToggleFavorite={handleMusicToggleFavorite}
          />
        )}
      </AnimatePresence>
    </>;
}