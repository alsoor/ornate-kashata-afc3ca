/**
 * Stooorna Ai — Save to photo library (v1.1.0)
 * Place at: src/ai/saveMedia.ts
 *
 * Tries, in order:
 *  1. window.__STOOORNA_SAVE_TO_GALLERY__(blob, filename, mime) -> Promise<boolean>
 *       (optional hook: define it in your native shell if it can write to the gallery / MediaStore)
 *  2. Capacitor "Media" + "Filesystem" plugins, when the app has them (saves into the phone Photos / Gallery)
 *  3. Share sheet with the file (Android / iOS: "Save image" / "Save to Gallery" goes straight to Photos)
 *  4. normal browser download (same as before)
 * Returns where the file went: 'gallery' | 'share' | 'download'.
 */

const toBase64 = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });

export function cleanMime(blob: Blob, fallback: string): string {
  const t = (blob.type || '').split(';')[0].trim().toLowerCase();
  return t || fallback;
}

export async function saveToLibrary(input: Blob, filename: string): Promise<'gallery' | 'share' | 'download'> {
  const isVideo = /^video\//.test(input.type) || /\.(mp4|webm|mov|m4v)$/i.test(filename);
  const mime = cleanMime(input, isVideo ? 'video/mp4' : 'image/jpeg');
  const blob = new Blob([input], { type: mime }); // strips codec parameters (";codecs=...") that make some WebViews refuse the file
  const w: any = window;

  // 1) hook from the native shell
  try {
    if (typeof w.__STOOORNA_SAVE_TO_GALLERY__ === 'function') {
      const ok = await w.__STOOORNA_SAVE_TO_GALLERY__(blob, filename, mime);
      if (ok) return 'gallery';
    }
  } catch { /* next */ }

  // 2) Capacitor plugins (only if the app ships them)
  try {
    const P = w.Capacitor?.Plugins;
    if (P?.Media && P?.Filesystem) {
      const data = await toBase64(blob);
      const ext = (filename.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase();
      const path = `stooorna-${Date.now()}.${ext}`;
      await P.Filesystem.writeFile({ path, data, directory: 'CACHE' });
      const { uri } = await P.Filesystem.getUri({ path, directory: 'CACHE' });
      // Android needs an album to save into (without it the file never reaches the Gallery) -> use / create "Stooorna"
      let albumIdentifier: string | undefined;
      try {
        const getAlbums = async () => ((await P.Media.getAlbums?.())?.albums || []) as Array<{ identifier: string; name: string }>;
        let albums = await getAlbums();
        let album = albums.find(a => /^stooorna$/i.test(a.name));
        if (!album && P.Media.createAlbum) {
          try { await P.Media.createAlbum({ name: 'Stooorna' }); } catch { /* may already exist */ }
          albums = await getAlbums();
          album = albums.find(a => /^stooorna$/i.test(a.name));
        }
        albumIdentifier = (album || albums.find(a => /^(camera|dcim|pictures)$/i.test(a.name)))?.identifier;
      } catch { /* iOS has no albums requirement */ }
      const opts: any = { path: uri };
      if (albumIdentifier) opts.albumIdentifier = albumIdentifier;
      if (isVideo) await P.Media.saveVideo(opts);
      else await P.Media.savePhoto(opts);
      return 'gallery';
    }
  } catch { /* next */ }

  // 3) share sheet with the file (phones: "Save to device / Gallery" is one tap)
  try {
    const nav: any = navigator;
    const file = new File([blob], filename, { type: mime });
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file] });
      return 'share';
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return 'share'; // user closed the sheet - not an error
  }

  // 4) normal download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 15000);
  return 'download';
}
