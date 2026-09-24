let watchId = 0;

export function startChatLiveShare(userId?: string) {
  stopChatLiveShare();
  if (!navigator.geolocation || !userId) return;
  watchId = navigator.geolocation.watchPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      void fetch('/api/live-location', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, lat, lng, sharing: true, at: Date.now() }),
      }).catch(() => {});
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 2000 },
  );
}

export function stopChatLiveShare() {
  if (watchId) {
    navigator.geolocation.clearWatch(watchId);
    watchId = 0;
  }
}
