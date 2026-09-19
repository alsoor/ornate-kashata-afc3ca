warning: in the working copy of 'src/pages/settings.tsx', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/src/pages/settings.tsx b/src/pages/settings.tsx[m
[1mindex 343f2ea..404104a 100644[m
[1m--- a/src/pages/settings.tsx[m
[1m+++ b/src/pages/settings.tsx[m
[36m@@ -3,238 +3,10 @@[m [mimport { createPortal } from 'react-dom';[m
 import { useNavigate } from "react-router";[m
 import { Helmet } from '@dr.pogodin/react-helmet';[m
 import { motion, AnimatePresence } from 'motion/react';[m
[31m-import { User, Mail, Lock, Eye, EyeOff, LogOut, Mic, Play, Pause, Trash2, Clock, CheckCircle, Share2, X, AtSign, Edit2, Users, Copy, Check, QrCode, Phone, ShieldCheck, Radio, Headphones, Send, Plus, MessageCircle, Bell, Music, Heart, Search, Link2, ClipboardPaste, Building2, Briefcase, Menu, ChevronDown, AlertTriangle, FileText } from 'lucide-react';[m
[32m+[m[32mimport { User, Mail, Lock, Eye, EyeOff, LogOut, Mic, Play, Pause, Trash2, Clock, CheckCircle, Share2, X, AtSign, Edit2, Users, Copy, Check, QrCode, Phone, ShieldCheck, Radio, Headphones, Send, Plus, MessageCircle, Bell, Music, Heart, Search, Link2, ClipboardPaste } from 'lucide-react';[m
 import { useSession, signOut, signIn, signUp } from '@/lib/auth/auth-client';[m
 import { usePresenceQuery } from '@/hooks/usePresence';[m
[31m-[m
[31m-// ─── Replaced virtual:content ───────────────────────────────────────────────[m
[31m-const settings = {[m
[31m-  supportHeader: 'Support',[m
[31m-  chooseLang: 'Choose language / اختر اللغة',[m
[31m-  langEn: 'English',[m
[31m-  langAr: 'العربية',[m
[31m-  taskDone: 'المهمة مكتملة',[m
[31m-  taskDoneSimple: 'تم',[m
[31m-  deleteCountdown: 'سيتم حذف المحادثة خلال',[m
[31m-  noMessages: 'لا توجد رسائل بعد',[m
[31m-  supportReplyPlaceholder: 'اكتب ردك...',[m
[31m-};[m
[31m-[m
[31m-// ─── Inlined SUPPORT_COPY (was @/lib/support-copy) ──────────────────────────[m
[31m-type SupportLang = 'ar' | 'en';[m
[31m-type SupportCopy = {[m
[31m-  askRole: string;[m
[31m-  roleUser: string;[m
[31m-  roleCompany: string;[m
[31m-  greetingUser: (name: string) => string;[m
[31m-  greetingCompany: (companyName: string, license?: string) => string;[m
[31m-  howHelp: string;[m
[31m-  btnForgotPw: string;[m
[31m-  btnTalkSupport: string;[m
[31m-  waitForgot: string;[m
[31m-  waitSupport: string;[m
[31m-  waiting: string;[m
[31m-  supportJoined: string;[m
[31m-  blocked: string;[m
[31m-  askTitle: string;[m
[31m-  unavailable: string;[m
[31m-  notFound: string;[m
[31m-  playing: string;[m
[31m-  attach: string;[m
[31m-  placeholder: string;[m
[31m-};[m
[31m-[m
[31m-const SUPPORT_COPY: Record<SupportLang, SupportCopy> = {[m
[31m-  ar: {[m
[31m-    askRole: 'هل أنت مستخدم فردي أم شركة؟',[m
[31m-    roleUser: 'مستخدم',[m
[31m-    roleCompany: 'شركة',[m
[31m-    greetingUser: (name) => `أهلاً ${name} 👋\nكيف نقدر نساعدك؟`,[m
[31m-    greetingCompany: (companyName, license) =>[m
[31m-      `أهلاً بكم من ${companyName}${license ? ` (ترخيص: ${license})` : ''} 👋\nكيف نقدر نساعدكم؟`,[m
[31m-    howHelp: 'اختر نوع المساعدة:',[m
[31m-    btnForgotPw: 'نسيت كلمة المرور',[m
[31m-    btnTalkSupport: 'التحدث مع الدعم',[m
[31m-    waitForgot: 'تم استلام طلبك بخصوص كلمة المرور. سيتم الرد عليك قريباً...',[m
[31m-    waitSupport: 'تم تحويل طلبك للدعم. سيتم الرد عليك قريباً...',[m
[31m-    waiting: 'نعتذر عن التأخير، الدعم سيتواصل معك في أقرب وقت...',[m
[31m-    supportJoined: 'انضم فريق الدعم للمحادثة 👋',[m
[31m-    blocked: 'عذراً، لا يمكن معالجة هذا النوع من الرسائل.',[m
[31m-    askTitle: 'ما اسم الأغنية أو السورة التي تريد سماعها؟',[m
[31m-    unavailable: 'عذراً، هذه الخدمة غير متوفرة حالياً.',[m
[31m-    notFound: 'لم يتم العثور على الملف المطلوب.',[m
[31m-    playing: 'جارٍ التشغيل:',[m
[31m-    attach: 'إرفاق ملف',[m
[31m-    placeholder: 'اكتب رسالتك...',[m
[31m-  },[m
[31m-  en: {[m
[31m-    askRole: 'Are you an individual user or a company?',[m
[31m-    roleUser: 'User',[m
[31m-    roleCompany: 'Company',[m
[31m-    greetingUser: (name) => `Hello ${name} 👋\nHow can we help you?`,[m
[31m-    greetingCompany: (companyName, license) =>[m
[31m-      `Welcome from ${companyName}${license ? ` (License: ${license})` : ''} 👋\nHow can we help you?`,[m
[31m-    howHelp: 'Choose the type of help:',[m
[31m-    btnForgotPw: 'Forgot password',[m
[31m-    btnTalkSupport: 'Talk to support',[m
[31m-    waitForgot: 'Your password request has been received. We will reply soon...',[m
[31m-    waitSupport: 'Your request has been forwarded to support. We will reply soon...',[m
[31m-    waiting: 'Sorry for the delay, support will contact you shortly...',[m
[31m-    supportJoined: 'Support has joined the chat 👋',[m
[31m-    blocked: 'Sorry, this type of message cannot be processed.',[m
[31m-    askTitle: 'What song or surah would you like to listen to?',[m
[31m-    unavailable: 'Sorry, this service is currently unavailable.',[m
[31m-    notFound: 'The requested file was not found.',[m
[31m-    playing: 'Now playing:',[m
[31m-    attach: 'Attach file',[m
[31m-    placeholder: 'Type your message...',[m
[31m-  },[m
[31m-};[m
[31m-[m
[31m-// ─── Inlined auth-copy (was @/lib/auth-copy) ────────────────────────────────[m
[31m-export type AuthLang = 'ar' | 'en';[m
[31m-[m
[31m-type AuthCopy = {[m
[31m-  enterEmailPw: string;[m
[31m-  pwMismatch: string;[m
[31m-  pwShort: string;[m
[31m-  needUsername: string;[m
[31m-  userFmt: string;[m
[31m-  userTaken: string;[m
[31m-  needCompanyName: string;[m
[31m-  needTradeName: string;[m
[31m-  needOwnerName: string;[m
[31m-  needLicense: string;[m
[31m-  needSector: string;[m
[31m-  needPhone: string;[m
[31m-  needName: string;[m
[31m-  joinNow: string;[m
[31m-  welcomeBack: string;[m
[31m-  createAccount: string;[m
[31m-  login: string;[m
[31m-  companyToggle: string;[m
[31m-  companyToggleHint: string;[m
[31m-  companyName: string;[m
[31m-  tradeName: string;[m
[31m-  ownerName: string;[m
[31m-  username: string;[m
[31m-  checkingUser: string;[m
[31m-  userAvailable: string;[m
[31m-  userInvalid: string;[m
[31m-  license: string;[m
[31m-  sector: string;[m
[31m-  sectorHint: string;[m
[31m-  phone: string;[m
[31m-  phoneAlt: string;[m
[31m-  email: string;[m
[31m-  password: string;[m
[31m-  confirmPassword: string;[m
[31m-  confirmEmail: string;[m
[31m-  name: string;[m
[31m-  submitCreate: string;[m
[31m-  submitLogin: string;[m
[31m-  haveAccount: string;[m
[31m-  noAccount: string;[m
[31m-  goLogin: string;[m
[31m-  goRegister: string;[m
[31m-};[m
[31m-[m
[31m-const AUTH_COPY: Record<AuthLang, AuthCopy> = {[m
[31m-  ar: {[m
[31m-    enterEmailPw: 'أدخل البريد وكلمة المرور',[m
[31m-    pwMismatch: 'كلمتا المرور غير متطابقتين',[m
[31m-    pwShort: 'كلمة المرور قصيرة جداً (٦ أحرف على الأقل)',[m
[31m-    needUsername: 'اليوزرنيم مطلوب',[m
[31m-    userFmt: 'صيغة اليوزرنيم غير صحيحة',[m
[31m-    userTaken: 'اليوزرنيم مستخدم مسبقاً',[m
[31m-    needCompanyName: 'اسم الشركة مطلوب',[m
[31m-    needTradeName: 'الاسم التجاري مطلوب',[m
[31m-    needOwnerName: 'اسم الما�