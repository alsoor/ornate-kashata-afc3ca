export type CameraFilterId =
  | 'none'
  | 'beauty'
  | 'makeup'
  | 'glow'
  | 'warm'
  | 'cool'
  | 'vivid'
  | 'dramatic'
  | 'vintage'
  | 'fade'
  | 'bw';

export type CameraFilter = {
  id: CameraFilterId;
  label: string;
  css: string;
};

export const CAMERA_FILTERS: CameraFilter[] = [
  { id: 'none', label: 'Original', css: 'none' },
  { id: 'beauty', label: 'Beauty', css: 'brightness(1.08) contrast(0.94) saturate(1.08) blur(0.15px)' },
  { id: 'makeup', label: 'Makeup', css: 'brightness(1.1) contrast(1.04) saturate(1.22) hue-rotate(-6deg)' },
  { id: 'glow', label: 'Glow', css: 'brightness(1.14) contrast(0.96) saturate(1.18)' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.22) saturate(1.28) contrast(1.06) brightness(1.04)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(168deg) saturate(1.12) brightness(1.04)' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.55) contrast(1.14) brightness(1.03)' },
  { id: 'dramatic', label: 'Drama', css: 'contrast(1.28) brightness(0.92) saturate(1.12)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.42) contrast(0.94) brightness(1.04) saturate(0.88)' },
  { id: 'fade', label: 'Fade', css: 'contrast(0.86) brightness(1.1) saturate(0.72)' },
  { id: 'bw', label: 'B&W', css: 'grayscale(1) contrast(1.08)' },
];

export function cameraFilterCss(id: CameraFilterId): string {
  return CAMERA_FILTERS.find(f => f.id === id)?.css ?? 'none';
}
