/**
 * ChannelWaves — 8 channels in a 4×2 grid (two rows of 4)
 * Shows live member count, LIVE badge + speaker name per channel.
 * Tapping a channel navigates to /room?id=chN
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from 'motion/react';
interface ChannelWavesProps {
  theme: 'cyan' | 'bronze';
}
interface ChannelStatus {
  live: boolean;
  speakerName: string | null;
  count: number;
}
const CHANNELS = Array.from({
  length: 8
}, (_, i) => `ch${i + 1}`);
export default function ChannelWaves({
  theme
}: ChannelWavesProps) {
  const navigate = useNavigate();
  const isCyan = theme === 'cyan';
  const accent = isCyan ? '#00BCD4' : '#CD8C32';
  const accentDim = isCyan ? 'rgba(0,188,212,0.35)' : 'rgba(200,130,30,0.35)';
  const accentFaint = isCyan ? 'rgba(0,188,212,0.08)' : 'rgba(180,100,20,0.1)';
  const accentBorder = isCyan ? 'rgba(0,188,212,0.2)' : 'rgba(180,100,20,0.22)';
  const textDim = isCyan ? 'rgba(150,200,200,0.5)' : 'rgba(150,120,70,0.55)';
  const liveRed = '#ef4444';
  const liveRedFaint = 'rgba(239,68,68,0.12)';
  const liveRedDim = 'rgba(239,68,68,0.45)';
  const [status, setStatus] = useState<Record<string, ChannelStatus>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll live-status (counts + floor holder) every 4s
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/room/live-status');
        if (r.ok) setStatus(await r.json());
      } catch {/* silent */}
    };
    load();
    timerRef.current = setInterval(load, 4000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Load custom room names (less frequent)
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/room/names');
        if (r.ok) setNames(await r.json());
      } catch {/* silent */}
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);
  function handleTap(chId: string) {
    setActive(chId);
    setTimeout(() => navigate(`/room?id=${chId}`), 120);
  }
  return <div style={{
    width: '100%',
    maxWidth: 340
  }}>
      <p style={{
      color: textDim,
      fontSize: '0.52rem',
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      textAlign: 'center',
      marginBottom: 10,
      fontWeight: 500
    }}>
        Channels
      </p>

      {/* 4 × 2 grid */}
      <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 8,
      paddingLeft: 4,
      paddingRight: 4
    }}>
        {CHANNELS.map(ch => {
        const st = status[ch];
        const count = st?.count ?? 0;
        const isLive = st?.live ?? false;
        const speaker = st?.speakerName ?? null;
        const isActive = active === ch;
        const hasUsers = count > 0;
        const label = names[ch] || ch.replace('ch', '');
        const hasName = !!names[ch];
        return <motion.button key={ch} whileTap={{
          scale: 0.88
        }} onClick={() => handleTap(ch)} style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          padding: '10px 6px',
          borderRadius: 12,
          background: isActive ? `rgba(${isCyan ? '0,188,212' : '200,130,30'},0.18)` : isLive ? liveRedFaint : accentFaint,
          border: `1px solid ${isLive ? liveRedDim : hasUsers ? accentDim : accentBorder}`,
          cursor: 'pointer',
          outline: 'none',
          transition: 'all 0.15s',
          boxShadow: isLive ? `0 0 12px rgba(239,68,68,0.25)` : hasUsers ? `0 0 10px ${accentFaint}` : 'none',
          minWidth: 0,
          overflow: 'hidden'
        }}>
              {/* LIVE badge — top-right corner */}
              <AnimatePresence>
                {isLive && <motion.div key="live-badge" initial={{
              opacity: 0,
              scale: 0.6
            }} animate={{
              opacity: 1,
              scale: 1
            }} exit={{
              opacity: 0,
              scale: 0.6
            }} style={{
              position: 'absolute',
              top: 4,
              right: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              background: liveRed,
              borderRadius: 4,
              padding: '1px 4px'
            }}>
                    {/* Pulsing dot */}
                    <motion.div animate={{
                opacity: [1, 0.3, 1]
              }} transition={{
                duration: 0.9,
                repeat: Infinity,
                ease: 'easeInOut'
              }} style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: 'white'
              }} />
                    <span style={{
                color: 'white',
                fontSize: '0.42rem',
                fontWeight: 800,
                letterSpacing: '0.05em'
              }}>
                      LIVE
                    </span>
                  </motion.div>}
              </AnimatePresence>

              {/* Channel label */}
              <span style={{
            color: isLive ? liveRed : hasUsers ? accent : textDim,
            fontSize: hasName ? '0.55rem' : '0.8rem',
            fontWeight: hasUsers ? 700 : 500,
            lineHeight: 1.2,
            textAlign: 'center',
            wordBreak: 'break-word',
            maxWidth: '100%',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            marginTop: isLive ? 6 : 0 // push down to avoid badge overlap
          }}>
                {label}
              </span>

              {/* Wave bars */}
              <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 1.5,
            height: 14
          }}>
                {[0, 1, 2, 3].map(bar => <motion.div key={bar} animate={isLive ? {
              height: [3, 10 + bar * 2, 3],
              opacity: [0.6, 1, 0.6]
            } : hasUsers ? {
              height: [4, 8 + bar * 2, 4],
              opacity: [0.5, 1, 0.5]
            } : {
              height: 3,
              opacity: 0.25
            }} transition={hasUsers ? {
              duration: isLive ? 0.55 + bar * 0.1 : 0.8 + bar * 0.15,
              repeat: Infinity,
              ease: 'easeInOut' as const,
              delay: bar * 0.1
            } : {}} style={{
              width: 2.5,
              borderRadius: 1.5,
              background: isLive ? liveRed : hasUsers ? accent : textDim
            }} />)}
              </div>

              {/* Speaker name (when LIVE) or member count */}
              <AnimatePresence mode="wait">
                {isLive && speaker ? <motion.span key="speaker" initial={{
              opacity: 0,
              y: 3
            }} animate={{
              opacity: 1,
              y: 0
            }} exit={{
              opacity: 0,
              y: -3
            }} style={{
              color: liveRed,
              fontSize: '0.44rem',
              fontWeight: 700,
              lineHeight: 1,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'center'
            }}>
                    {speaker.length > 8 ? speaker.slice(0, 7) + '…' : speaker}
                  </motion.span> : <motion.div key="count" initial={{
              opacity: 0
            }} animate={{
              opacity: 1
            }} exit={{
              opacity: 0
            }} style={{
              minWidth: 18,
              height: 14,
              borderRadius: 7,
              background: hasUsers ? `rgba(${isCyan ? '0,188,212' : '200,130,30'},0.18)` : 'transparent',
              border: hasUsers ? `1px solid ${accentDim}` : '1px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px'
            }}>
                    <span style={{
                color: hasUsers ? accent : textDim,
                fontSize: '0.52rem',
                fontWeight: 700,
                lineHeight: 1
              }}>
                      {count}
                    </span>
                  </motion.div>}
              </AnimatePresence>
            </motion.button>;
      })}
      </div>
    </div>;
}
