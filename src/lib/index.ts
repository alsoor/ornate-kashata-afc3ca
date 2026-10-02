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
 *  4) Castle → قلعة ملكية (3,500 Coins, 20s) — المربع الأول بالصف الثالث — تستبدل هدية الصقر
 *              (للمضيف: البث يتحول لقلعة كبيرة بأبراجها وأعلامها، بوابتها تنفتح وتنفرد منها سجادة حمراء
 *               وبمنتصفها بلورة لامعة مع صوت دخول ملكي (بوق + طبول) وألعاب نارية وقصاصات ذهبية —
 *               لمستخدم: نفس المشهد، وبالنهاية إطار صورته يصعد للأعلى وتطير البلورة وتحوم فوق إطاره)
 *              الأصوات: src/lib/castleSounds.ts
 *     (هدية الصقر FalconGift: استُبدلت بالقلعة، الملف وملف أصواته falconSounds.ts باقيين — شيل // ورجّعها بالمصفوفة لو تبي)
 *  5) Dragon → تنين ضخم (6,000 Coins, 16s) — أُلغيت (الملف DragonGift.tsx وملف أصواته باقيين — شيل // ورجّعها بالمصفوفة لو تبي)
 *  6) Wolf   → ذئب العاصفة (6,000 Coins, ~19.5s) — الهدية الثامنة: الصف الثاني — المربع الثاني (أول مربع + بعد هدية المطر)
 *              (البث يتحول لظلام وسماء نجوم وبرق، ثم يدخل الذئب بزئيره الأصلي من مشهد GIF مدمج بدون ما يبان إنه ملف —
 *               للمضيف: هالة قمر وشرارات ذهبية على صورته —
 *               لمستخدم: بعد نهاية المشهد إطار صورته يرتفع لمنتصف الشاشة)
 *              المشهد: GIF + صوته الأصلي مدمجين داخل src/lib/wolfSounds.ts (ما عاد نحتاج public/gifts/wolf-howl.mp4) — الأصوات المساندة: src/lib/wolfSounds.ts
 *  7) DragonFire → تنين ناري (10,000 Coins, ~22s / ~27s) — الهدية التاسعة: المربع الأخير بالشبكة (فهرس 5 — المربع اللي عليه الدائرة الصفراء)
 *              (البث يتحول لظلام وسماء حمراء ومؤثرات نار، ثم يدخل مشهد التنين بصرخته الأصلية من ملف الفيديو
 *               مدمجاً مع المؤثرات بدون ما يبان إنه فيديو — الصوت يشتغل تلقائياً —
 *               للمضيف (لما المستخدم يدعمه): هالة نار على صورته أثناء نفث التنين —
 *               لمستخدم (لما المضيف يعطيه): بعد نهاية الفيديو إطار صورته يرتفع لمنتصف الشاشة بحلقة نار)
 *              مربع الهدية قبل النقر: تنين صغير متحرك ينفث نار وجمرات
 *              المشهد: GIF مدمج داخل DragonFireGift.tsx (ما عاد نحتاج public/gifts/dragon-roar.mp4) — الأصوات المساندة: src/lib/dragonFireSounds.ts
 *
 * الصف العلوي (المربعات الصغيرة) — TOP_GIFTS:
 *  1) Rose   → وردة حمراء صغيرة (25 Coins, 6s) — المربع الأول يسار الصف العلوي
 *              (للمضيف: وردة تطلع بمنتصف البث — لمستخدم: صورته تصعد والورود تتساقط على إطارها فقط)
 *  2) Balloons → بالونات ودببة صغيرة (150 Coins, 9s) — المربع الثاني بالصف العلوي
 *              (للمضيف: بالونات تتصاعد ودببة تتساقط على البالونات والأزرار —
 *               لمستخدم: بالونة بحبلها تسحب إطار صورته لمنتصف البث ثم بالونة ثانية تاخذه للأعلى)
 *  3) StarryPiano → سماء نجوم + عازفة بيانو + بلورات مضيئة على الأزرار (400 Coins, 15s) — المربع الثالث بالصف العلوي
 *              (للمضيف: هالة نجوم وموجات تهتز حول صورته مع الموسيقى —
 *               لمستخدم: إطار صورته يصعد لمنتصف البث ويهتز مع صوت البيانو)
 *              الأصوات: src/lib/starryPianoSounds.ts
 */
import type { GiftDefinition } from './types';
// import { HeartGift } from '../components/gifts/HeartGift'; // هدية القلب: استُبدلت بالزومبي (الملف باقي، شيل // ورجّعها بالمصفوفة لو تبي)
// import { ZombieGift } from '../components/gifts/ZombieGift'; // هدية الزومبي: استُبدلت بالحديقة (الملف باقي، شيل // ورجّعها بالمصفوفة لو تبي)
import { GardenGift } from '../components/gifts/GardenGift';
// import { WitchGift } from '../components/gifts/WitchGift'; // هدية الساحرة: استُبدلت بالبركان (الملف باقي، شيل // ورجّعها بالمصفوفة لو تبي)
import { StormGift } from '../components/gifts/StormGift';
import { VolcanoGift } from '../components/gifts/VolcanoGift';
// import { FalconGift } from '../components/gifts/FalconGift'; // هدية الصقر: استُبدلت بالقلعة (الملف باقي، شيل // ورجّعها بالمصفوفة لو تبي)
import { CastleGift } from '../components/gifts/CastleGift';
// import { DragonGift } from '../components/gifts/DragonGift'; // هدية التنين: أُلغيت (الملف باقي — شيل // ورجّعها بالمصفوفة لو تبي)
import { WolfGift } from '../components/gifts/WolfGift';
import { DragonFireGift } from '../components/gifts/DragonFireGift';
import { RoseGift } from '../components/gifts/RoseGift';
import { BalloonGift } from '../components/gifts/BalloonGift';
import { StarryPianoGift } from '../components/gifts/StarryPianoGift';

export const GIFTS: GiftDefinition[] = [
  GardenGift,  // مكان الزومبي (كان مكان القلب)
  VolcanoGift, // مكان الساحرة
  StormGift,
  CastleGift,  // الصف الثالث — المربع الأول (3,500 Coins) — مكان الصقر
  // DragonGift,  // التنين (6,000 Coins, 16s) — أُلغيت
  WolfGift,    // الهدية الثامنة — ذئب (6,000 Coins, ~19.5s) — فهرس 4 = الصف الثاني، المربع الثاني (مكان أول +)
  DragonFireGift, // الهدية التاسعة — تنين ناري (10,000 Coins) — فهرس 5 = المربع الأخير (مكان الـ + الثاني)
  // لا يوجد مربع فاضي بعد الآن: لإضافة هدايا جديدة وسّع الشبكة بـ LiveCoinsDock (MAIN_GIFT_ORDER)
];

// الصف العلوي (3 مربعات صغيرة): الأول = الوردة، الثاني = البالونات، الثالث = البيانو والنجوم
export const TOP_GIFTS: GiftDefinition[] = [
  RoseGift,
  BalloonGift,
  StarryPianoGift,
];

// كل الهدايا (للبحث بالـ id عند الإرسال والتشغيل)
export const ALL_GIFTS: GiftDefinition[] = [...GIFTS, ...TOP_GIFTS];

export type { GiftDefinition };
