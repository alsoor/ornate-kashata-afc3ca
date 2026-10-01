/**
 * تعريف الهدية — كل هدية لها ملف خاص فيها (مثل HeartGift.tsx) وتُسجَّل في gifts/index.ts.
 * لإضافة هدية جديدة: انسخ HeartGift.tsx، غيّر الاسم/السعر/الأنميشن/الصوت، وأضفها في index.ts.
 */
import type React from 'react';

export interface GiftDefinition {
  /** معرّف ثابت (يُستخدم في الأحداث والسيرفر) */
  id: string;
  /** اسم الهدية */
  name: string;
  /** السعر بالـ Coins */
  price: number;
  /** مدة الأنميشن بالميلي ثانية */
  durationMs: number;
  /** الشكل داخل مربع الهدايا (قبل الاختيار) — حركة خفيفة */
  Preview: React.ComponentType<{ size?: number }>;
  /** أنميشن ملء الشاشة بعد الاختيار؛ لازم يستدعي onDone عند الانتهاء */
  Animation: React.ComponentType<{ onDone: () => void }>;
}
