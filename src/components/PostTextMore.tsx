/**
 * Long post text: show preview (default 50 lines) + "More" opens a white full-page reader.
 * English-only UI strings in code.
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  POST_PREVIEW_LINES,
  postNeedsMore,
  postPreviewText,
} from '@/lib/postStoryPatch';

type Props = {
  text: string | null | undefined;
  maxLines?: number;
  /** Color of collapsed body text */
  color?: string;
  className?: string;
  style?: React.CSSProperties;
};

export default function PostTextMore({
  text,
  maxLines = POST_PREVIEW_LINES,
  color = 'rgba(220,235,235,0.95)',
  style,
}: Props) {
  const [open, setOpen] = useState(false);
  const full = String(text || '');
  const needs = postNeedsMore(full, maxLines);
  const preview = needs ? postPreviewText(full, maxLines) : full;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color, lineHeight: 1.45, ...style }}>
        {preview}
        {needs ? '…' : null}
      </div>
      {needs && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          style={{
            marginTop: 6,
            border: 'none',
            background: 'none',
            color: '#00BCD4',
            fontWeight: 800,
            fontSize: '0.85rem',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          More
        </button>
      )}

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Full post"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 14000,
              background: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                paddingTop: 'max(12px, env(safe-area-inset-top))',
                borderBottom: '1px solid rgba(0,0,0,0.08)',
                background: '#fff',
              }}
            >
              <p style={{ margin: 0, flex: 1, color: '#111', fontWeight: 800, fontSize: '1.05rem' }}>
                Post
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(0,0,0,0.06)',
                  color: '#111',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={18} strokeWidth={2.4} />
              </button>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                padding: '16px 16px max(20px, env(safe-area-inset-bottom))',
                background: '#fff',
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: '#111',
                  fontSize: '1rem',
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {full}
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
