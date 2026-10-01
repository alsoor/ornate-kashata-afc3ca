/**
 * سجل الهدايا — ترتيب المصفوفة = ترتيب المربعات في نافذة الهدايا.
 * لإضافة هدية: أنشئ ملفها في components/gifts (انسخ ZombieGift.tsx) ثم أضفها هنا.
 *
 * الحالي:
 *  1) Garden → حديقة وقلوب (500 Coins, 20s) — تستبدل هدية الزومبي
 *              (للمضيف: حديقة بعصافير وقلوب بشرية ملونة تتساقط على أزرار البث —
 *               لمستخدم: إطار صورته يصعد ويتحول لقلب ملون)
 *     (هدية الزومبي ZombieGift: استُبدلت بالحديقة، الملف باقي — شيل // ورجّعها بالمصفوفة لو تبي)
 *  2) Volcano → بركان (1,000 Coins, 20s)
 *  3) Storm  → مطر/عاصفة (مع رفع صورة المستخدم + برق على الإطار)
 */
import type { GiftDefinition } from './types';
// import { HeartGift } from '../components/gifts/HeartGift'; // هدية القلب: استُبدلت بالزومبي (الملف باقي، شيل // ورجّعها بالمصفوفة لو تبي)
// import { ZombieGift } from '../components/gifts/ZombieGift'; // هدية الزومبي: استُبدلت بالحديقة (الملف باقي، شيل // ورجّعها بالمصفوفة لو تبي)
import { GardenGift } from '../components/gifts/GardenGift';
// import { WitchGift } from '../components/gifts/WitchGift'; // هدية الساحرة: استُبدلت بالبركان (الملف باقي، شيل // ورجّعها بالمصفوفة لو تبي)
import { StormGift } from '../components/gifts/StormGift';
import { VolcanoGift } from '../components/gifts/VolcanoGift';

export const GIFTS: GiftDefinition[] = [
  GardenGift,  // مكان الزومبي (كان مكان القلب)
  VolcanoGift, // مكان الساحرة
  StormGift,
  // remaining three squares: add more gifts here later
];

export type { GiftDefinition };
