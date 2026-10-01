/**
 * سجل الهدايا — ترتيب المصفوفة = ترتيب المربعات في نافذة الهدايا.
 * لإضافة هدية: أنشئ ملفها في components/gifts (انسخ ZombieGift.tsx) ثم أضفها هنا.
 *
 * الحالي:
 *  1) Zombie → زومبي / مقبرة (500 Coins, 20s) — يستبدل هدية القلب
 *              (للمضيف: قلب ينبض يُرمى له — لمستخدم: الزومبي يبتلع صورته ويضحك)
 *  2) Volcano → بركان (1,000 Coins, 20s)
 *  3) Storm  → مطر/عاصفة (مع رفع صورة المستخدم + برق على الإطار)
 */
import type { GiftDefinition } from './types';
// import { HeartGift } from '../components/gifts/HeartGift'; // هدية القلب: استُبدلت بالزومبي (الملف باقي، شيل // ورجّعها بالمصفوفة لو تبي)
import { ZombieGift } from '../components/gifts/ZombieGift';
// import { WitchGift } from '../components/gifts/WitchGift'; // هدية الساحرة: استُبدلت بالبركان (الملف باقي، شيل // ورجّعها بالمصفوفة لو تبي)
import { StormGift } from '../components/gifts/StormGift';
import { VolcanoGift } from '../components/gifts/VolcanoGift';

export const GIFTS: GiftDefinition[] = [
  ZombieGift,  // مكان القلب
  VolcanoGift, // مكان الساحرة
  StormGift,
  // remaining three squares: add more gifts here later
];

export type { GiftDefinition };
