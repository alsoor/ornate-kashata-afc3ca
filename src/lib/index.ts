/**
 * سجل الهدايا — ترتيب المصفوفة = ترتيب المربعات في نافذة الهدايا.
 * لإضافة هدية: أنشئ ملفها في components/gifts (انسخ HeartGift.tsx) ثم أضفها هنا.
 */
import type { GiftDefinition } from './types';
import { HeartGift } from '@/components/gifts/HeartGift';

export const GIFTS: GiftDefinition[] = [
  HeartGift,
  // المربعات الخمسة الباقية: أضف هداياك هنا لاحقاً
];

export type { GiftDefinition };
