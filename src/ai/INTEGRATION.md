/**
 * Stooorna Ai — Integration Patch (v1.0.1 — Fixed)
 *
 * Place these files in your project under: src/ai/
 *
 * 1. StooornaAiSheet.tsx   — full AI chat sheet (slides up from bottom)
 * 2. StooornaAiIcon.tsx    — bottom bar icon (dark green-black rounded square + white S)
 * 3. index.ts              — re-exports
 *
 * ============================================================
 * IMPORTANT: These files alone do NOTHING.
 * You MUST add the icon + sheet into your bottom navigation component.
 * ============================================================
 *
 * Step-by-step (in GlobalBottomNavigation or RootLayout):
 *
 * 1. Import:
 *    import { StooornaAiIcon, StooornaAiSheet } from '@/ai';
 *
 * 2. Add state (near other useState):
 *    const [aiOpen, setAiOpen] = useState(false);
 *
 * 3. Inside the bottom bar flex/row (BETWEEN the LIVE button and the Templates button):
 *
 *    {/* LIVE button */}
 *    <StooornaAiIcon
 *      active={aiOpen}
 *      onClick={() => setAiOpen(v => !v)}
 *    />
 *    {/* Templates button */}
 *
 * 4. At the very end of the component return (sibling to the bottom bar, not inside it):
 *
 *    <StooornaAiSheet
 *      open={aiOpen}
 *      onClose={() => setAiOpen(false)}
 *      user={user}
 *    />
 *
 * ------------------------------------------------------------
 * Behavior after correct integration:
 * - Click the dark "S" icon → AI sheet slides UP from bottom
 * - Click again or tap outside → sheet slides DOWN
 *
 * Design:
 * - Icon: rounded-square, dark green-black, white "S"
 * - Header: user avatar + red "Stooorna Ai" banner (silver text + shimmer)
 * - Right icons: Clock (history) + Pen (new chat)
 * - Center greeting: "What should we explore?"
 * - Input bar: dark green-black, white +, white text, red send circle
 *
 * Fixed in v1.0.1: missing showHistory state that caused runtime error.
 */
export const STOOORNA_AI_PATCH_VERSION = '1.0.1';
