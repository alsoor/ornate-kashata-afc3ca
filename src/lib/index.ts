/**
 * سجل الهدايا — ترتيب المصفوفة = ترتيب المربعات في نافذة الهدايا.
 * لإضافة هدية: أنشئ ملفها في components/gifts (انسخ HeartGift.tsx) ثم أضفها هنا.
 */
import type { GiftDefinition } from './types';
import { HeartGift } from '../components/gifts/HeartGift';
import { WitchGift } from '../components/gifts/WitchGift';
import { WolfGift } from '../components/gifts/WolfGift';

export const GIFTS: GiftDefinition[] = [
  HeartGift,
  WitchGift,
  WolfGift,
  // remaining three squares: add more gifts here later
];

export type { GiftDefinition };
