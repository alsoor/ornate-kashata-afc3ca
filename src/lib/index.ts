/**
 * سجل الهدايا — ترتيب المصفوفة = ترتيب المربعات في نافذة الهدايا.
 * لإضافة هدية: أنشئ ملفها في components/gifts (انسخ HeartGift.tsx) ثم أضفها هنا.
 */
import type { GiftDefinition } from './types';
import { HeartGift } from '../components/gifts/HeartGift';
import { WitchGift } from '../components/gifts/WitchGift';

export const GIFTS: GiftDefinition[] = [
  HeartGift,
  WitchGift,
  // المربعات الأربعة الباقية: أضف هداياك هنا لاحقاً
];

export type { GiftDefinition };
