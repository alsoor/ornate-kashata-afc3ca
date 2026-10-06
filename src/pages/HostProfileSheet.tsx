/**
 * HostProfileSheet — opens the broadcast owner's profile over a live room.
 * - Rises straight up from the bottom the moment the host avatar is tapped.
 * - The profile's own X button closes it: the page drops back down and the
 *   live keeps running (the viewer never leaves the broadcast).
 * Used by live.tsx (voice) and live-camera.tsx (video).
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const FriendStoryProfileLazy = React.lazy(() =>
  import('./add-friend').then((m) => ({ default: m.FriendStoryProfile })),
);

const DROP_MS = 300;

export interface HostProfileSheetProps {
  authorId: string;
  authorName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  /** Called after the drop-down animation finished */
  onClose: () => void;
}

export default function HostProfileSheet({
  authorId,
  authorName,
  authorUsername,
  authorAvatarUrl,
  onClose,
}: HostProfileSheetProps) {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    timerRef.current = window.setTimeout(onClose, DROP_MS);
  };

  if (!authorId || typeof document === 'undefined') return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 13040,
        transform: closing ? 'translateY(100%)' : 'none',
        transition: `transform ${DROP_MS}ms ease-in`,
        pointerEvents: closing ? 'none' : 'auto',
      }}
    >
      <React.Suspense fallback={null}>
        <FriendStoryProfileLazy
          authorId={authorId}
          authorName={authorName}
          authorUsername={authorUsername}
          authorAvatarUrl={authorAvatarUrl}
          onClose={handleClose}
          onOpenPost={() => {}}
          riseFromBottom
        />
      </React.Suspense>
    </div>,
    document.body,
  );
}
