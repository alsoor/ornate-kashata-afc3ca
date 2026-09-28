import { useEffect, useRef, useState } from 'react';

const SECTIONS = [
  {
    title: 'Welcome to Stooorna!',
    body: 'Your ultimate social hub for voice, video, and real-time connections.',
  },
  {
    title: 'Live Audio & Video Broadcasts',
    body: 'Host or join live audio rooms, video streams, and crystal-clear voice/video calls with friends.',
  },
  {
    title: 'Share Your Moments',
    body: 'Post photos, videos, and text updates, and explore an endless engaging media feed.',
  },
  {
    title: 'Friends on Map',
    body: 'See your friends in real-time on the live map and stay connected wherever you go.',
  },
  {
    title: 'Grow Your Network',
    body: 'Track your followers, views, and interactions with a powerful and dynamic engagement system.',
  },
];

export default function WelcomeGuide({ onEnter }: { onEnter: () => void }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const check = () => {
      const remain = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remain < 28) setAtBottom(true);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    return () => el.removeEventListener('scroll', check);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 210000,
        background: 'radial-gradient(ellipse 70% 50% at 50% 0%, #123033 0%, #071112 58%)',
        color: '#d7eeee',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '16px 18px 8px' }}>
        <p style={{ margin: 0, color: '#00BCD4', fontWeight: 900, letterSpacing: '0.14em', fontSize: 12 }}>STOOORNA</p>
        <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 800 }}>Welcome</p>
      </div>
      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 18px 24px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {SECTIONS.map(s => (
          <section key={s.title} style={{ marginBottom: 22 }}>
            <h2 style={{ margin: '0 0 6px', color: '#00BCD4', fontSize: 16 }}>{s.title}</h2>
            <p style={{ margin: 0, lineHeight: 1.55, color: 'rgba(210,230,230,0.88)', fontSize: 14 }}>{s.body}</p>
          </section>
        ))}

        <section style={{ marginBottom: 22 }}>
          <h2 style={{ margin: '0 0 8px', color: '#00BCD4', fontSize: 16 }}>App features</h2>
          <p style={{ margin: '0 0 8px', lineHeight: 1.55, fontSize: 14 }}>
            Live audio rooms with speaker and listener roles, walkie-talkie style talk turns, and private rooms.
          </p>
          <p style={{ margin: '0 0 8px', lineHeight: 1.55, fontSize: 14 }}>
            Live video streaming plus 1-on-1 voice and video calls.
          </p>
          <p style={{ margin: '0 0 8px', lineHeight: 1.55, fontSize: 14 }}>
            Multimedia feed for text, photos, and video with likes, comments, shares, and view counts.
          </p>
          <p style={{ margin: '0 0 8px', lineHeight: 1.55, fontSize: 14 }}>
            Followers, profile analytics, and content views.
          </p>
          <p style={{ margin: '0 0 8px', lineHeight: 1.55, fontSize: 14 }}>
            Live map with privacy toggle so you control when your location is visible.
          </p>
          <p style={{ margin: 0, lineHeight: 1.55, fontSize: 14 }}>
            Real-time private and group chat with media.
          </p>
        </section>

        <section style={{ marginBottom: 22 }}>
          <h2 style={{ margin: '0 0 8px', color: '#00BCD4', fontSize: 16 }}>Guidelines and safety</h2>
          <p style={{ margin: '0 0 8px', lineHeight: 1.55, fontSize: 14 }}>
            Treat members with respect. Harassment, hate speech, bullying, or abuse can lead to account suspension.
          </p>
          <p style={{ margin: '0 0 8px', lineHeight: 1.55, fontSize: 14 }}>
            Do not share explicit, violent, illegal, or inappropriate content in posts, rooms, or streams.
          </p>
          <p style={{ margin: '0 0 8px', lineHeight: 1.55, fontSize: 14 }}>
            Live map needs location permission. You can hide your location or turn sharing off at any time.
          </p>
          <p style={{ margin: 0, lineHeight: 1.55, fontSize: 14 }}>
            Impersonation and fake accounts used to deceive others are not allowed.
          </p>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2 style={{ margin: '0 0 8px', color: '#00BCD4', fontSize: 16 }}>Copyright</h2>
          <p style={{ margin: '0 0 8px', lineHeight: 1.55, fontSize: 14 }}>
            Copyright 2026 Stooorna. All rights reserved.
          </p>
          <p style={{ margin: '0 0 8px', lineHeight: 1.55, fontSize: 14 }}>
            The app name, logo, design, and source code belong to Stooorna. Copying or redistributing them is not allowed.
          </p>
          <p style={{ margin: 0, lineHeight: 1.55, fontSize: 14 }}>
            You keep ownership of content you post. Stooorna may display it inside the app and may remove content that breaks the law or these rules.
          </p>
        </section>
      </div>

      <div style={{ padding: '10px 18px max(16px, env(safe-area-inset-bottom))' }}>
        {!atBottom && (
          <p style={{ margin: '0 0 8px', textAlign: 'center', fontSize: 12, color: 'rgba(150,200,200,0.7)' }}>
            Scroll to the end to continue
          </p>
        )}
        <button
          type="button"
          disabled={!atBottom}
          onClick={onEnter}
          style={{
            width: '100%',
            height: 46,
            border: 'none',
            borderRadius: 14,
            fontWeight: 900,
            fontSize: 15,
            background: atBottom ? '#00BCD4' : 'rgba(0,188,212,0.18)',
            color: atBottom ? '#041414' : 'rgba(180,210,210,0.5)',
            cursor: atBottom ? 'pointer' : 'default',
          }}
        >
          Enter
        </button>
      </div>
    </div>
  );
}
