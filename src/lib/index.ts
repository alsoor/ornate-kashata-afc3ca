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
 *  6) InfernoDragon → تنين جهنمي (7,000 Coins, ~22s / ~27s) — المربع الأوسط بالصف الثالث (المربع اللي عليه الدائرة الصفراء) — فهرس 4 داخل GIFTS ويُعرض بالمربع الأوسط عبر MAIN_GIFT_ORDER بـ LiveCoinsDock (السعر 7,000 مضبوط بـ GIFT_PRICE_BY_INDEX)
 *              (يستبدل هدية DragonFire القديمة اللي حُذفت ملفاتها وأُعيد بناؤها بالكامل)
 *              (البث يتحول لظلام وسماء حمراء ومؤثرات نار، ثم يدخل فيديو التنين 1080p بألوانه الكاملة (public/gifts/inferno-dragon.mp4) —
 *               الموسيقى وزئير التنين (الصوت الأصلي كاملاً) يشتغلون تلقائياً مع بدء الفيديو —
 *               للمضيف (لما المستخدم يدعمه): هالة نار على صورته أثناء نفث التنين —
 *               لمستخدم (لما المضيف يعطيه): بعد نهاية الفيديو إطار صورته يرتفع لمنتصف الشاشة بحلقة نار)
 *              مربع الهدية قبل النقر: تنين صغير متحرك ينفث نار وجمرات
 *              الملفات: components/gifts/InfernoDragonGift.tsx + lib/infernoDragonSounds.ts (الصوت مضمّن) + public/gifts/inferno-dragon.mp4
 *  7) Meteor → نيزك الدمار (15,000 Coins, 25s) — المربع الأخير بالشبكة (فهرس 5 داخل GIFTS)
 *              (ظلام وسماء حمراء + أمطار وعواصف وبرق + زلزال يهز البث ويرجّ الأزرار → نيزك ينزل ويضرب البث فتتطاير الأزرار →
 *               أيقونة التطبيق (دائرة كبيرة بسنون حديد على إطارها) تنزل من السماء وتدور —
 *               للمضيف (لما المستخدم يدعمه): تحفر البث من الأسفل بشرار وانفجارات ورياح وأمطار حتى النهاية —
 *               لمستخدم (لما المضيف يعطيه): الأيقونة تتحول لإطار صورته، يصعد للأعلى وأطرافه شرار نار وينتهي)
 *              مربع الهدية قبل النقر: نيزك ينزل + أيقونة بسنون تدور + مطر وبرق
 *              الملفات: components/gifts/MeteorGift.tsx + lib/meteorSounds.ts (Web Audio) + lib/meteorIcon.ts (الأيقونة مضمّنة)
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
import { InfernoDragonGift } from '../components/gifts/InfernoDragonGift';
import { MeteorGift } from '../components/gifts/MeteorGift';
import { RoseGift } from '../components/gifts/RoseGift';
import { BalloonGift } from '../components/gifts/BalloonGift';
import { StarryPianoGift } from '../components/gifts/StarryPianoGift';

export const GIFTS: GiftDefinition[] = [
  GardenGift,  // مكان الزومبي (كان مكان القلب)
  VolcanoGift, // مكان الساحرة
  StormGift,
  CastleGift,  // الصف الثالث — المربع الأول (3,500 Coins) — مكان الصقر
  // DragonGift,  // التنين (6,000 Coins, 16s) — أُلغيت
  InfernoDragonGift, // تنين جهنمي (يُعرض بسعر 7,000 Coins) — فهرس 4 داخل المصفوفة، ويُعرض بالمربع الأوسط بالصف الثالث (MAIN_GIFT_ORDER بـ LiveCoinsDock)
  MeteorGift, // نيزك الدمار (15,000 Coins, 25s) — فهرس 5 داخل المصفوفة، ويُعرض بآخر مربع بالشبكة
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
