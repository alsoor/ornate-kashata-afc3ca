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
 *
 * الصف العلوي (المربعات الصغيرة) — TOP_GIFTS:
 *  1) Rose   → وردة حمراء صغيرة (25 Coins, 6s) — المربع الأول يسار الصف العلوي
 *              (للمضيف: وردة تطلع بمنتصف البث — لمستخدم: صورته تصعد والورود تتساقط على إطارها فقط)
 *  2) Balloons → بالونات ودببة صغيرة (150 Coins, 9s) — المربع الثاني بالصف العلوي
 *              (للمضيف: بالونات تتصاعد ودببة تتساقط على البالونات والأزرار —
 *               لمستخدم: بالونة بحبلها تسحب إطار صورته لمنتصف البث ثم بالونة ثانية تاخذه للأعلى)
 */
import type { GiftDefinition } from './types';
// import { HeartGift } from '../components/gifts/HeartGift'; // هدية القلب: استُبدلت بالزومبي (الملف باقي، شيل // ورجّعها بالمصفوفة لو تبي)
// import { ZombieGift } from '../components/gifts/ZombieGift'; // هدية الزومبي: استُبدلت بالحديقة (الملف باقي، شيل // ورجّعها بالمصفوفة لو تبي)
import { GardenGift } from '../components/gifts/GardenGift';
// import { WitchGift } from '../components/gifts/WitchGift'; // هدية الساحرة: استُبدلت بالبركان (الملف باقي، شيل // ورجّعها بالمصفوفة لو تبي)
import { StormGift } from '../components/gifts/StormGift';
import { VolcanoGift } from '../components/gifts/VolcanoGift';
import { RoseGift } from '../components/gifts/RoseGift';
import { BalloonGift } from '../components/gifts/BalloonGift';

export const GIFTS: GiftDefinition[] = [
  GardenGift,  // مكان الزومبي (كان مكان القلب)
  VolcanoGift, // مكان الساحرة
  StormGift,
  // remaining three squares: add more gifts here later
];

// الصف العلوي (3 مربعات صغيرة): الأول = الوردة، الثاني = البالونات، الثالث + للمستقبل
export const TOP_GIFTS: GiftDefinition[] = [
  RoseGift,
  BalloonGift,
];

// كل الهدايا (للبحث بالـ id عند الإرسال والتشغيل)
export const ALL_GIFTS: GiftDefinition[] = [...GIFTS, ...TOP_GIFTS];

export type { GiftDefinition };
