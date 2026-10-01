/**
 * سجل الهدايا — ترتيب المصفوفة = ترتيب المربعات في نافذة الهدايا.
 * لإضافة هدية: أنشئ ملفها في components/gifts (انسخ HeartGift.tsx) ثم أضفها هنا.
 */
import type { GiftDefinition } from './types';
import { HeartGift } from '../components/gifts/HeartGift';
import { WitchGift } from '../components/gifts/WitchGift';
import { StormGift } from '../components/gifts/StormGift';
import { HorseGift } from '../components/gifts/HorseGift';

export const GIFTS: GiftDefinition[] = [
  HeartGift,
  WitchGift,
  StormGift,
  HorseGift,
  // remaining two squares: add more gifts here later
];

export type { GiftDefinition };
