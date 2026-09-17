/**
 * BanGuard — wraps the entire app.
 * Polls /api/me/ban-status every 2s.
 * If the user is banned → signs them out and shows a ban screen.
 * Also calls /api/me/update-ip once on mount to track IP.
 */
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useSession, signOut } from '@/lib/auth/auth-client';
import { ShieldOff } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

export default function BanGuard({ children }: Props) {
  const sessionResult = useSession();
  const user = (sessionResult as any)?.data?.user ?? (sessionResult as any)?.user ?? null;
  const [banned, setBanned] = useState(false);

  // Track IP once on mount when logged in
  useEffect(() => {
    if (!user) return;
    fetch('/api/me/update-ip', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, [user?.id]);

  // Poll ban status every 2s
  useEffect(() => {
    if (!user) return;

    async function check() {
      try {
        const r = await fetch('/api/me/ban-status', { credentials: 'include' });
        if (!r.ok) return;
        const d = await r.json() as { isBanned: boolean };
        if (d.isBanned) {
          setBanned(true);
          await signOut();
        }
      } catch { /* silent */ }
    }

    void check();
    const t = setInterval(check, 2_000);
    return () => clearInterval(t);
  }, [user?.id]);

  if (banned) {
    return <BanScreen />;
  }

  return <>{children}</>;
}

function BanScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'hsl(var(--background))',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px', textAlign: 'center',
    }}>
      {/* Red glow circle */}
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 100, height: 100, borderRadius: '50%',
          background: 'hsl(var(--destructive) / 0.15)',
          border: '2px solid hsl(var(--destructive) / 0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 28,
          boxShadow: '0 0 40px hsl(var(--destructive) / 0.3)',
        }}
      >
        <ShieldOff size={44} color="hsl(var(--destructive))" strokeWidth={1.5} />
      </motion.div>

      {/* Title */}
      <h1 style={{
        color: 'hsl(var(--destructive))',
        fontSize: '1.4rem', fontWeight: 800,
        letterSpacing: '0.05em', marginBottom: 16,
      }}>
        تم حظر حسابك
      </h1>

      {/* Message */}
      <div style={{
        background: 'hsl(var(--destructive) / 0.08)',
        border: '1px solid hsl(var(--destructive) / 0.25)',
        borderRadius: 16, padding: '20px 24px',
        maxWidth: 340, width: '100%',
      }}>
        <p style={{
          color: 'hsl(var(--foreground))',
          fontSize: '0.92rem', lineHeight: 1.7,
          fontWeight: 500,
        }}>
          لقد تم تعليق حسابك من قِبل إدارة التطبيق.
          <br />
          إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع الدعم.
        </p>
      </div>

      {/* Decorative bottom line */}
      <motion.div
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ duration: 3, repeat: Infinity }}
        style={{
          marginTop: 40,
          width: 60, height: 2,
          background: 'hsl(var(--destructive) / 0.4)',
          borderRadius: 2,
        }}
      />
    </div>
  );
}