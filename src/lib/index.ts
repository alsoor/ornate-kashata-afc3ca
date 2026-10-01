/**
 * سجل الهدايا — ترتيب المصفوفة = ترتيب المربعات في نافذة الهدايا.
 * لإضافة هدية: أنشئ ملفها في components/gifts (انسخ HeartGift.tsx) ثم أضفها هنا.
 */
import type { GiftDefinition } from './types';
import { HeartGift } from '../components/gifts/HeartGift';
import { WitchGift } from '../components/gifts/WitchGift';
import { StormGift } from '../components/gifts/StormGift';

export const GIFTS: GiftDefinition[] = [
  HeartGift,
  WitchGift,
  StormGift,
  // remaining three squares: add more gifts here later
];

export type { GiftDefinition };
