/**
 * Stooorna Ai — Integration Patch
 *
 * Place these files in your project under: src/ai/
 *
 * 1. StooornaAiSheet.tsx   — full AI chat sheet (slides up from bottom)
 * 2. StooornaAiIcon.tsx    — bottom bar icon (dark green-black rounded square + white S)
 * 3. index.ts              — re-exports
 *
 * How to wire it into RootLayout.tsx (or your bottom navigation):
 *
 * ------------------------------------------------------------
 * In GlobalBottomNavigation (or wherever the bottom bar is rendered):
 *
 * import { StooornaAiIcon, StooornaAiSheet } from '@/ai';
 *
 * const [aiOpen, setAiOpen] = useState(false);
 *
 * // Inside the bottom bar flex row, BETWEEN the LIVE button and the Templates button:
 * <StooornaAiIcon
 *   active={aiOpen}
 *   onClick={() => setAiOpen(v => !v)}
 * />
 *
 * // At the end of the component return (before closing tags), render the sheet:
 * <StooornaAiSheet
 *   open={aiOpen}
 *   onClose={() => setAiOpen(false)}
 *   user={user}
 * />
 *
 * ------------------------------------------------------------
 * Behavior:
 * - First click on the S icon  → sheet slides UP from the bottom
 * - Second click (or overlay tap / future close) → sheet slides DOWN
 *
 * Design matches request:
 * - Icon: rounded-square, dark green leaning black, white "S"
 * - Header: user avatar + red "Stooorna Ai" banner with silver text + running shimmer
 * - Right icons: Clock (history) + Pen (new chat)
 * - Center greeting: "What should we explore?"
 * - Input bar: dark green-black, white +, white text, red send circle
 *
 * The module is fully independent (src/ai). You can later replace the mock
 * responses with real model calls, image generation, table builders, and merge tools.
 *
 * All animations and styles are self-contained.
 */
export const STOOORNA_AI_PATCH_VERSION = '1.0.0';
