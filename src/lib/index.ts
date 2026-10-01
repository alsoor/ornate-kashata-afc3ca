/**
 * سجل الهدايا — ترتيب المصفوفة = ترتيب المربعات في نافذة الهدايا.
 * لإضافة هدية: أنشئ ملفها في components/gifts (انسخ HeartGift.tsx) ثم أضفها هنا.
 */
import type { GiftDefinition } from './types';
import { HeartGift } from '../components/gifts/HeartGift';
// import { WitchGift } from '../components/gifts/WitchGift'; // هدية الساحرة: استُبدلت بالبركان (الملف باقي، شيل // ورجّعها بالمصفوفة لو تبي)
import { StormGift } from '../components/gifts/StormGift';
import { VolcanoGift } from '../components/gifts/VolcanoGift';

export const GIFTS: GiftDefinition[] = [
  HeartGift,
  VolcanoGift, // مكان الساحرة
  StormGift,
  // remaining three squares: add more gifts here later
];

export type { GiftDefinition };
