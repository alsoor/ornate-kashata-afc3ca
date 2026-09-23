import { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { User, Mail, Lock, Eye, EyeOff, LogOut, Mic, Play, Pause, Trash2, Clock, CheckCircle, Share2, X, AtSign, Edit2, Users, Copy, Check, QrCode, Phone, ShieldCheck, Radio, Headphones, Send, Plus, MessageCircle, Bell, Music, Heart, Search, Link2, ClipboardPaste, Building2, Briefcase, Menu, ChevronDown, AlertTriangle, FileText, MapPin } from 'lucide-react';
import { useSession, signOut, signIn, signUp } from '@/lib/auth/auth-client';
import { usePresenceQuery } from '@/hooks/usePresence';

// ─── Replaced virtual:content ───────────────────────────────────────────────
const settings = {
  supportHeader: 'Support',
  chooseLang: 'Choose language / اختر اللغة',
  langEn: 'English',
  langAr: 'العربية',
  taskDone: 'المهمة مكتملة',
  taskDoneSimple: 'تم',
  deleteCountdown: 'سيتم حذف المحادثة خلال',
  noMessages: 'لا توجد رسائل بعد',
  supportReplyPlaceholder: 'اكتب ردك...',
};

// ─── Inlined SUPPORT_COPY (was @/lib/support-copy) ──────────────────────────
type SupportLang = 'ar' | 'en';
type SupportCopy = {
  askRole: string;
  roleUser: string;
  roleCompany: string;
  greetingUser: (name: string) => string;
  greetingCompany: (companyName: string, license?: string) => string;
  howHelp: string;
  btnForgotPw: string;
  btnTalkSupport: string;
  waitForgot: string;
  waitSupport: string;
  waiting: string;
  supportJoined: string;
  blocked: string;
  askTitle: string;
  unavailable: string;
  notFound: string;
  playing: string;
  attach: string;
  placeholder: string;
};

const SUPPORT_COPY: Record<SupportLang, SupportCopy> = {
  ar: {
    askRole: 'هل أنت مستخدم فردي أم شركة؟',
    roleUser: 'مستخدم',
    roleCompany: 'شركة',
    greetingUser: (name) => `أهلاً ${name} 👋\nكيف نقدر نساعدك؟`,
    greetingCompany: (companyName, license) =>
      `أهلاً بكم من ${companyName}${license ? ` (ترخيص: ${license})` : ''} 👋\nكيف نقدر نساعدكم؟`,
    howHelp: 'اختر نوع المساعدة:',
    btnForgotPw: 'نسيت كلمة المرور',
    btnTalkSupport: 'التحدث مع الدعم',
    waitForgot: 'تم استلام طلبك بخصوص كلمة المرور. سيتم الرد عليك قريباً...',
    waitSupport: 'تم تحويل طلبك للدعم. سيتم الرد عليك قريباً...',
    waiting: 'نعتذر عن التأخير، الدعم سيتواصل معك في أقرب وقت...',
    supportJoined: 'انضم فريق الدعم للمحادثة 👋',
    blocked: 'عذراً، لا يمكن معالجة هذا النوع من الرسائل.',
    askTitle: 'ما اسم الأغنية أو السورة التي تريد سماعها؟',
    unavailable: 'عذراً، هذه الخدمة غير متوفرة حالياً.',
    notFound: 'لم يتم العثور على الملف المطلوب.',
    playing: 'جارٍ التشغيل:',
    attach: 'إرفاق ملف',
    placeholder: 'اكتب رسالتك...',
  },
  en: {
    askRole: 'Are you an individual user or a company?',
    roleUser: 'User',
    roleCompany: 'Company',
    greetingUser: (name) => `Hello ${name} 👋\nHow can we help you?`,
    greetingCompany: (companyName, license) =>
      `Welcome from ${companyName}${license ? ` (License: ${license})` : ''} 👋\nHow can we help you?`,
    howHelp: 'Choose the type of help:',
    btnForgotPw: 'Forgot password',
    btnTalkSupport: 'Talk to support',
    waitForgot: 'Your password request has been received. We will reply soon...',
    waitSupport: 'Your request has been forwarded to support. We will reply soon...',
    waiting: 'Sorry for the delay, support will contact you shortly...',
    supportJoined: 'Support has joined the chat 👋',
    blocked: 'Sorry, this type of message cannot be processed.',
    askTitle: 'What song or surah would you like to listen to?',
    unavailable: 'Sorry, this service is currently unavailable.',
    notFound: 'The requested file was not found.',
    playing: 'Now playing:',
    attach: 'Attach file',
    placeholder: 'Type your message...',
  },
};

// ─── Inlined auth-copy (was @/lib/auth-copy) ────────────────────────────────
export type AuthLang = 'ar' | 'en';

type AuthCopy = {
  enterEmailPw: string;
  pwMismatch: string;
  pwShort: string;
  needUsername: string;
  userFmt: string;
  userTaken: string;
  needCompanyName: string;
  needTradeName: string;
  needOwnerName: string;
  needLicense: string;
  needSector: string;
  needPhone: string;
  needName: string;
  joinNow: string;
  welcomeBack: string;
  createAccount: string;
  login: string;
  companyToggle: string;
  companyToggleHint: string;
  companyName: string;
  tradeName: string;
  ownerName: string;
  username: string;
  checkingUser: string;
  userAvailable: string;
  userInvalid: string;
  license: string;
  sector: string;
  sectorHint: string;
  phone: string;
  phoneAlt: string;
  email: string;
  password: string;
  confirmPassword: string;
  confirmEmail: string;
  name: string;
  submitCreate: string;
  submitLogin: string;
  haveAccount: string;
  noAccount: string;
  goLogin: string;
  goRegister: string;
};

const AUTH_COPY: Record<AuthLang, AuthCopy> = {
  ar: {
    enterEmailPw: 'أدخل البريد وكلمة المرور',
    pwMismatch: 'كلمتا المرور غير متطابقتين',
    pwShort: 'كلمة المرور قصيرة جداً (٦ أحرف على الأقل)',
    needUsername: 'اليوزرنيم مطلوب',
    userFmt: 'صيغة اليوزرنيم غير صحيحة',
    userTaken: 'اليوزرنيم مستخدم مسبقاً',
    needCompanyName: 'اسم الشركة مطلوب',
    needTradeName: 'الاسم التجاري مطلوب',
    needOwnerName: 'اسم المالك مطلوب',
    needLicense: 'رقم السجل التجاري مطلوب',
    needSector: 'القطاع مطلوب',
    needPhone: 'رقم الهاتف مطلوب',
    needName: 'الاسم مطلوب',
    joinNow: 'انضم الآن',
    welcomeBack: 'مرحباً بعودتك',
    createAccount: 'إنشاء حساب',
    login: 'تسجيل الدخول',
    companyToggle: 'حساب شركة',
    companyToggleHint: 'سجّل كشركة بدلاً من فرد',
    companyName: 'اسم الشركة',
    tradeName: 'الاسم التجاري',
    ownerName: 'اسم المالك',
    username: 'اليوزرنيم',
    checkingUser: 'جاري التحقق...',
    userAvailable: 'متاح ✓',
    userInvalid: 'غير صالح',
    license: 'رقم السجل التجاري',
    sector: 'القطاع',
    sectorHint: 'اكتب القطاع',
    phone: 'رقم الهاتف',
    phoneAlt: 'رقم هاتف آخر (اختياري)',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    confirmPassword: 'تأكيد كلمة المرور',
    confirmEmail: 'تأكيد البريد',
    name: 'الاسم',
    submitCreate: 'إنشاء الحساب',
    submitLogin: 'دخول',
    haveAccount: 'لديك حساب؟',
    noAccount: 'ليس لديك حساب؟',
    goLogin: 'سجّل الدخول',
    goRegister: 'إنشاء حساب',
  },
  en: {
    enterEmailPw: 'Enter email and password',
    pwMismatch: 'Passwords do not match',
    pwShort: 'Password is too short (min 6 characters)',
    needUsername: 'Username is required',
    userFmt: 'Invalid username format',
    userTaken: 'Username is already taken',
    needCompanyName: 'Company name is required',
    needTradeName: 'Trade name is required',
    needOwnerName: 'Owner name is required',
    needLicense: 'License number is required',
    needSector: 'Sector is required',
    needPhone: 'Phone number is required',
    needName: 'Name is required',
    joinNow: 'Join now',
    welcomeBack: 'Welcome back',
    createAccount: 'Create account',
    login: 'Log in',
    companyToggle: 'Company account',
    companyToggleHint: 'Register as a company instead of individual',
    companyName: 'Company name',
    tradeName: 'Trade name',
    ownerName: 'Owner name',
    username: 'Username',
    checkingUser: 'Checking...',
    userAvailable: 'Available ✓',
    userInvalid: 'Invalid',
    license: 'Commercial registration number',
    sector: 'Sector',
    sectorHint: 'Enter sector',
    phone: 'Phone number',
    phoneAlt: 'Alternative phone (optional)',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm password',
    confirmEmail: 'Confirm email',
    name: 'Name',
    submitCreate: 'Create account',
    submitLogin: 'Log in',
    haveAccount: 'Already have an account?',
    noAccount: "Don't have an account?",
    goLogin: 'Log in',
    goRegister: 'Sign up',
  },
};

function getAuthCopy(lang: AuthLang): AuthCopy {
  return AUTH_COPY[lang] || AUTH_COPY.ar;
}

type Tab = 'account' | 'live' | 'companies';
/** حساب الدعم الوحيد — له صلاحيات شات الدعم + تحكم المستخدمين */
const SUPPORT_OWNER_EMAIL = 'stooorna@mail.com';
const SUPPORT_OWNER_USERNAME = 'stooorna';
const OWNER_EMAILS = new Set([SUPPORT_OWNER_EMAIL.toLowerCase()]);
const PRIVILEGED_USERNAMES = new Set(['stooorna']);

function isPrivilegedUser(user: { email?: string | null; username?: string | null; name?: string | null } | null | undefined) {
  const username = (user?.username ?? user?.name ?? '').replace(/^@/, '').trim().toLowerCase();
  const email = (user?.email ?? '').trim().toLowerCase();
  return OWNER_EMAILS.has(email) || PRIVILEGED_USERNAMES.has(username);
}

/**
 * حساب الدعم الرسمي فقط (@Stooorna / Stooorna@mail.com).
 * لا نستخدم حقل name لأنه قد يطابق بالخطأ مع مستخدمين عاديين.
 * اختياري: username من الـ DB (profileUsername) أدق من session أحياناً.
 */
function isSupportOwnerAccount(
  user: { email?: string | null; username?: string | null; name?: string | null } | null | undefined,
  profileUsername?: string | null,
) {
  if (!user && !profileUsername) return false;
  const email = (user?.email ?? '').trim().toLowerCase();
  const sessionUsername = (user?.username ?? '').replace(/^@/, '').trim().toLowerCase();
  const dbUsername = (profileUsername ?? '').replace(/^@/, '').trim().toLowerCase();
  const username = dbUsername || sessionUsername;
  // تطابق صارم — إيميل الدعم أو يوزر stooorna فقط
  if (email === SUPPORT_OWNER_EMAIL) return true;
  if (username === SUPPORT_OWNER_USERNAME) return true;
  return false;
}

/** مستخدم عادي مسجّل → يظهر له أيقونة الدعم فوق */

// ─── Company registration registry (pending / active / inactive) ─────────────
// Shared across AuthScreen + owner admin panel. Backend routes preferred when available.
export type CompanyRegStatus = 'pending' | 'active' | 'inactive';
export type CompanyRegistration = {
  id: string;
  companyName: string;
  tradeName: string;
  ownerName: string;
  licenseNumber: string;
  /** رقم الترخيص التجاري */
  tradeLicenseNumber?: string;
  /** شهادة السجل التجاري — base64 data URL */
  commercialRegCert?: string;
  /** اسم ملف شهادة السجل التجاري */
  commercialRegCertName?: string;
  /** شهادة الترخيص التجاري — base64 data URL */
  tradeLicenseCert?: string;
  /** اسم ملف شهادة الترخيص التجاري */
  tradeLicenseCertName?: string;
  sector?: string;
  sectorCustom?: string;
  phone: string;
  phoneAlt?: string;
  email: string;
  /** username فريد للحساب */
  username?: string;
  /** stored only to allow post-approval first login when account was not created yet */
  password?: string;
  status: CompanyRegStatus;
  createdAt: string;
  updatedAt: string;
  userId?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
};

const COMPANIES_REGISTRY_KEY = 'stooorna_companies_registry';
const COMPANY_NOTICES_KEY = 'stooorna_company_notices';
const COMPANY_ACTIVATIONS_KEY = 'stooorna_company_activations';
const DELETED_USERS_KEY = 'stooorna_deleted_users';

/** نوع جلسة الحساب — يمنع تحوّل الفرد لشركة بالخطأ */
export function setSessionAccountKind(kind: 'personal' | 'company', userId?: string | null) {
  try {
    localStorage.setItem('stooorna_session_account_kind', kind);
    if (userId) localStorage.setItem('stooorna_session_user_id', String(userId));
    window.dispatchEvent(new CustomEvent('stooorna:session-account-kind', { detail: { kind, userId } }));
  } catch { /* */ }
}
export function getSessionAccountKind(): 'personal' | 'company' | null {
  try {
    const k = localStorage.getItem('stooorna_session_account_kind');
    return k === 'company' || k === 'personal' ? k : null;
  } catch { return null; }
}

const FREED_USERNAMES_KEY = 'stooorna_freed_usernames';

const COMPANY_USERNAME_FEATURE_KEY = 'stooorna_company_username_feature';

/** هل فعّل الأونر ميزة يوزرنيم للشركات؟ */
export function isCompanyUsernameFeatureEnabled(): boolean {
  try {
    const raw = localStorage.getItem(COMPANY_USERNAME_FEATURE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw);
    return o === true || o?.enabled === true;
  } catch {
    return false;
  }
}

export function setCompanyUsernameFeatureEnabled(enabled: boolean) {
  try {
    localStorage.setItem(COMPANY_USERNAME_FEATURE_KEY, JSON.stringify({ enabled: !!enabled, at: new Date().toISOString() }));
    window.dispatchEvent(new CustomEvent('stooorna:company-username-feature', { detail: { enabled: !!enabled } }));
  } catch { /* ignore */ }
}

// ── Business registration (regular users upgrade to Business after owner approval) ──
export type BusinessRegStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type BusinessRegistration = {
  id: string;
  userId: string;
  username?: string | null;
  email?: string | null;
  projectName: string;
  licenseNumber: string;
  tradeLicenseNumber: string;
  commercialRegCert?: string;
  commercialRegCertName?: string;
  tradeLicenseCert?: string;
  tradeLicenseCertName?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  /** Owner note shown once in user settings after reject (or optional on approve) */
  ownerNote?: string | null;
  /** True after user dismissed the owner note */
  ownerNoteSeen?: boolean;
};

const BUSINESS_REGISTRY_KEY = 'stooorna_business_registry';

export function loadBusinessRegistry(): BusinessRegistration[] {
  try {
    const raw = localStorage.getItem(BUSINESS_REGISTRY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const BUSINESS_DIRECTORY_KEY = 'stooorna_business_directory';

export type PublicBusinessAccount = {
  userId: string;
  username?: string | null;
  email?: string | null;
  projectName?: string | null;
};

export function syncBusinessPublicDirectory(list?: BusinessRegistration[]) {
  try {
    const src = list || loadBusinessRegistry();
    const approved: PublicBusinessAccount[] = src
      .filter(x => x.status === 'approved')
      .map(x => ({
        userId: String(x.userId),
        username: x.username ? String(x.username).replace(/^@/, '').trim().toLowerCase() : null,
        email: x.email ? String(x.email).trim().toLowerCase() : null,
        projectName: x.projectName || null,
      }));
    localStorage.setItem(BUSINESS_DIRECTORY_KEY, JSON.stringify(approved));
    window.dispatchEvent(new CustomEvent('stooorna:business-directory', { detail: approved }));
  } catch { /* ignore */ }
}

export function loadBusinessPublicDirectory(): PublicBusinessAccount[] {
  try {
    const raw = localStorage.getItem(BUSINESS_DIRECTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** True when this identity is an approved Business account — used app-wide next to @username */
export function isPublicBusinessAccount(u?: {
  id?: string | null;
  userId?: string | null;
  username?: string | null;
  email?: string | null;
} | null): boolean {
  if (!u) return false;
  const id = String(u.id || u.userId || '').trim();
  const un = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  const em = String(u.email || '').trim().toLowerCase();
  if (id && isBusinessApproved(id)) return true;
  const dir = loadBusinessPublicDirectory();
  if (dir.some(x =>
    (id && x.userId === id) ||
    (un && x.username === un) ||
    (em && x.email === em)
  )) return true;
  try {
    const list = loadBusinessRegistry();
    return list.some(x =>
      x.status === 'approved' && (
        (id && String(x.userId) === id) ||
        (un && String(x.username || '').replace(/^@/, '').trim().toLowerCase() === un) ||
        (em && String(x.email || '').trim().toLowerCase() === em)
      )
    );
  } catch {
    return false;
  }
}

/** Small yellow Business head shown beside @username for every viewer */
export function BusinessHeadBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      title="Business"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: compact ? '0.52rem' : '0.58rem',
        fontWeight: 900,
        color: '#0a0a0a',
        background: '#eab308',
        borderRadius: 5,
        padding: compact ? '1px 5px' : '2px 7px',
        letterSpacing: '0.04em',
        lineHeight: 1.2,
        boxShadow: '0 0 8px rgba(234,179,8,0.45)',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >
      Business
    </span>
  );
}

export function saveBusinessRegistry(list: BusinessRegistration[]) {
  try {
    localStorage.setItem(BUSINESS_REGISTRY_KEY, JSON.stringify(list.slice(0, 2000)));
    syncBusinessPublicDirectory(list);
    window.dispatchEvent(new CustomEvent('stooorna:business-registry', { detail: list }));
  } catch { /* ignore */ }
}

export function getBusinessForUser(userId?: string | null): BusinessRegistration | null {
  if (!userId) return null;
  const uid = String(userId);
  const list = loadBusinessRegistry();
  const matches = list.filter(x => String(x.userId) === uid);
  if (!matches.length) return null;
  const approved = matches.find(x => x.status === 'approved');
  if (approved) return approved;
  const pending = matches.find(x => x.status === 'pending');
  if (pending) return pending;
  return matches.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
}

export function isBusinessApproved(userId?: string | null): boolean {
  const row = getBusinessForUser(userId);
  return !!(row && row.status === 'approved');
}

export function upsertBusinessRegistration(row: BusinessRegistration) {
  const list = loadBusinessRegistry().filter(x => !(String(x.userId) === String(row.userId) && x.status === 'pending'));
  const withoutSameId = list.filter(x => x.id !== row.id);
  withoutSameId.unshift(row);
  saveBusinessRegistry(withoutSameId);
  return row;
}

export function reviewBusinessRegistration(
  id: string,
  action: 'approve' | 'reject',
  ownerNote?: string | null,
) {
  const list = loadBusinessRegistry();
  const note = (ownerNote || '').trim() || null;
  const next = list.map(x => {
    if (x.id !== id) return x;
    return {
      ...x,
      status: (action === 'approve' ? 'approved' : 'rejected') as 'approved' | 'rejected',
      updatedAt: new Date().toISOString(),
      approvedAt: action === 'approve' ? new Date().toISOString() : x.approvedAt ?? null,
      ownerNote: note,
      ownerNoteSeen: false,
    };
  });
  saveBusinessRegistry(next);
  return next;
}

export function dismissBusinessOwnerNote(userId?: string | null) {
  if (!userId) return loadBusinessRegistry();
  const uid = String(userId);
  const list = loadBusinessRegistry();
  const next = list.map(x => {
    if (String(x.userId) !== uid) return x;
    if (!x.ownerNote || x.ownerNoteSeen) return x;
    return { ...x, ownerNoteSeen: true };
  });
  saveBusinessRegistry(next);
  return next;
}



export type DeletedUserRecord = {
  id: string;
  email?: string | null;
  username?: string | null;
  deletedAt: string;
};

export function loadDeletedUsers(): DeletedUserRecord[] {
  try {
    const raw = localStorage.getItem(DELETED_USERS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveDeletedUsers(list: DeletedUserRecord[]) {
  try {
    localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('stooorna:users-deleted', { detail: list }));
  } catch { /* ignore */ }
}

/** إعادة تعيين كل الحسابات المحذوفة — تسمح بإعادة استخدام اليوزر/الإيميل */
export function clearAllDeletedUsers() {
  try {
    localStorage.removeItem(DELETED_USERS_KEY);
    window.dispatchEvent(new CustomEvent('stooorna:users-deleted', { detail: [] }));
  } catch { /* ignore */ }
}

/** إعادة تعيين اليوزرات المحذوفة — تسمح بإعادة إنشاء نفس اليوزر (فرد/شركة) */
export function ensureDeletedUsersResetOnce() {
  // Soft-deleted users must stay in recovery list — do not clear on boot.
  try {
    if (localStorage.getItem('stooorna_deleted_users_keep_v4') === '1') return;
    localStorage.setItem('stooorna_deleted_users_keep_v4', '1');
  } catch { /* ignore */ }
}

export function markUserDeleted(u: { id?: string | null; email?: string | null; username?: string | null }) {
  const id = String(u.id || '').trim();
  const email = String(u.email || '').trim().toLowerCase();
  const username = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  if (!id && !email && !username) return loadDeletedUsers();
  const list = loadDeletedUsers();
  const exists = list.some(x =>
    (id && x.id === id) ||
    (email && String(x.email || '').toLowerCase() === email) ||
    (username && String(x.username || '').replace(/^@/, '').toLowerCase() === username),
  );
  if (!exists) {
    list.unshift({
      id: id || `del-${Date.now()}`,
      email: email || null,
      username: username || null,
      deletedAt: new Date().toISOString(),
    });
    saveDeletedUsers(list.slice(0, 2000));
  }
  return list;
}

export function isUserDeleted(u: { id?: string | null; email?: string | null; username?: string | null } | null | undefined): boolean {
  if (!u) return false;
  const username = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  if (username.startsWith('deleted_')) return true;
  const id = String(u.id || '').trim();
  const email = String(u.email || '').trim().toLowerCase();
  const list = loadDeletedUsers();
  return list.some(x =>
    (id && x.id === id) ||
    (email && String(x.email || '').toLowerCase() === email) ||
    (username && String(x.username || '').replace(/^@/, '').toLowerCase() === username),
  );
}

/** Soft-delete only — keeps row in recovery list (not permanent). */
export function softDeleteUser(u: { id?: string | null; email?: string | null; username?: string | null; name?: string | null }) {
  return markUserDeleted(u);
}

/** Restore a soft-deleted user so they reappear in User Control / app. */
export function restoreDeletedUser(u: {
  id?: string | null;
  email?: string | null;
  username?: string | null;
  originalUsername?: string | null;
}) {
  const id = String(u.id || '').trim();
  const email = String(u.email || '').trim().toLowerCase();
  const username = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  const originalUsername = String(u.originalUsername || '').replace(/^@/, '').trim().toLowerCase();
  const next = loadDeletedUsers().filter(x => {
    const xid = String(x.id || '').trim();
    const xem = String(x.email || '').toLowerCase();
    const xun = String(x.username || '').replace(/^@/, '').toLowerCase();
    const xorig = String(x.originalUsername || '').replace(/^@/, '').toLowerCase();
    if (id && xid && id === xid) return false;
    if (email && xem && email === xem) return false;
    if (username && (xun === username || xorig === username)) return false;
    if (originalUsername && (xorig === originalUsername || xun === originalUsername)) return false;
    return true;
  });
  saveDeletedUsers(next);
  try {
    window.dispatchEvent(new CustomEvent('stooorna:users-deleted', { detail: next }));
  } catch { /* */ }
  return next;
}

/** Permanent wipe: remove from recovery list, free username, try server hard-delete. */
export async function permanentlyWipeUser(u: {
  id?: string | null;
  email?: string | null;
  username?: string | null;
  originalUsername?: string | null;
}): Promise<boolean> {
  const id = String(u.id || '').trim();
  const email = String(u.email || '').trim().toLowerCase();
  const username = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
  const originalUsername = String(u.originalUsername || '').replace(/^@/, '').trim().toLowerCase();
  // Free usernames for reuse
  for (const uName of [username, originalUsername, username.replace(/^deleted_/, ''), originalUsername.replace(/^deleted_/, '')]) {
    if (uName) markUsernameFreed(uName);
  }
  // Always remove from local recovery list first (UI updates immediately)
  restoreDeletedUser(u);
  if (email) {
    const still = loadDeletedUsers().filter(x => String(x.email || '').toLowerCase() !== email);
    saveDeletedUsers(still);
  }
  // Drop from company registry if present
  try {
    const reg = loadCompaniesRegistry().filter(c => {
      const cem = String(c.email || '').toLowerCase();
      const cun = String(c.username || '').replace(/^@/, '').toLowerCase();
      const cid = String(c.id || '');
      const cuid = String(c.userId || '');
      if (email && cem === email) return false;
      if (username && cun === username) return false;
      if (originalUsername && cun === originalUsername) return false;
      if (id && (cid === id || cuid === id)) return false;
      return true;
    });
    saveCompaniesRegistry(reg);
  } catch { /* */ }
  // Server hard delete attempts
  const urls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  const body = { hard: true, permanent: true, permanentlyDelete: true, email, username, originalUsername, id };
  if (id) {
    urls.push(
      { url: `/api/owner/users/${encodeURIComponent(id)}/purge`, method: 'POST', body },
      { url: `/api/owner/users/${encodeURIComponent(id)}?hard=1`, method: 'DELETE', body },
      { url: `/api/owner/users/${encodeURIComponent(id)}`, method: 'DELETE', body },
      { url: `/api/support/users/${encodeURIComponent(id)}`, method: 'DELETE', body },
      { url: `/api/users/${encodeURIComponent(id)}`, method: 'DELETE', body },
    );
  }
  if (email) {
    urls.push(
      { url: `/api/owner/users/by-email/${encodeURIComponent(email)}`, method: 'DELETE', body },
      { url: `/api/users/delete`, method: 'POST', body },
    );
  }
  if (originalUsername || username) {
    const un = originalUsername || username.replace(/^deleted_/, '');
    if (un) {
      urls.push(
        { url: `/api/users/release-username`, method: 'POST', body: { ...body, username: un } },
        { url: `/api/owner/username/${encodeURIComponent(un)}`, method: 'DELETE', body },
      );
    }
  }
  let ok = false;
  for (const ep of urls) {
    try {
      const r = await fetch(ep.url, {
        method: ep.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ep.body || body),
      });
      if (r.ok || r.status === 204 || r.status === 404) { ok = true; break; }
    } catch { /* next */ }
  }
  return ok || true; // local wipe always succeeded
}


export function loadFreedUsernames(): string[] {
  try {
    const raw = localStorage.getItem(FREED_USERNAMES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map((x: string) => String(x).replace(/^@/, '').toLowerCase()) : [];
  } catch { return []; }
}

export function markUsernameFreed(username?: string | null) {
  const u = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!u) return;
  const list = loadFreedUsernames();
  if (!list.includes(u)) {
    list.push(u);
    try { localStorage.setItem(FREED_USERNAMES_KEY, JSON.stringify(list)); } catch { /* */ }
  }
}

export function isUsernameFreed(username?: string | null): boolean {
  const u = String(username || '').replace(/^@/, '').trim().toLowerCase();
  if (!u) return false;
  if (loadFreedUsernames().includes(u)) return true;
  return loadDeletedUsers().some(x => String(x.username || '').replace(/^@/, '').toLowerCase() === u);
}

/** طبّق قرارات التفعيل المحلية (Approve) فوق أي نسخة قديمة من السجل */
function applyRememberedActivations(list: CompanyRegistration[]): CompanyRegistration[] {
  let acts: Record<string, { status: CompanyRegStatus; at: string; email: string }> = {};
  try {
    const raw = localStorage.getItem(COMPANY_ACTIVATIONS_KEY);
    const o = raw ? JSON.parse(raw) : {};
    acts = o && typeof o === 'object' ? o : {};
  } catch { acts = {}; }
  return list.map(c => {
    const em = String(c.email || '').trim().toLowerCase();
    const remembered = em ? acts[em]?.status : null;
    if (!remembered) return c;
    // قرار الأونر المحلي (active/inactive) يثبت ولا يرجع pending من السيرفر
    if (remembered === 'active' || remembered === 'inactive') {
      return {
        ...c,
        status: remembered,
        approvedAt: remembered === 'active' ? (c.approvedAt || acts[em]?.at || new Date().toISOString()) : c.approvedAt,
        updatedAt: c.updatedAt || acts[em]?.at || new Date().toISOString(),
      };
    }
    return c;
  });
}

export function loadCompaniesRegistry(): CompanyRegistration[] {
  try {
    const raw = localStorage.getItem(COMPANIES_REGISTRY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? list as CompanyRegistration[] : [];
    // لا تظهر الشركات/المستخدمون المحذوفون في السجل أو الدليل العام
    const alive = arr.filter(c => {
      if (isUserDeleted({ id: c.userId || c.id, email: c.email, username: c.username })) return false;
      const un = String(c.username || '').replace(/^@/, '').toLowerCase();
      if (un.startsWith('deleted_')) return false;
      return true;
    });
    return applyRememberedActivations(alive);
  } catch {
    return [];
  }
}

/** Drop heavy base64 cert payloads for list UIs — keeps settings responsive. */
export function stripCompanyCerts(c: CompanyRegistration): CompanyRegistration {
  return {
    ...c,
    commercialRegCert: undefined,
    tradeLicenseCert: undefined,
    commercialRegCertName: c.commercialRegCertName || (c.commercialRegCert ? 'attached' : undefined),
    tradeLicenseCertName: c.tradeLicenseCertName || (c.tradeLicenseCert ? 'attached' : undefined),
  };
}

/** Registry for list/admin panels without multi-MB base64 fields. */
let _lightRegCache: { at: number; list: CompanyRegistration[] } | null = null;
export function loadCompaniesRegistryLight(): CompanyRegistration[] {
  const now = Date.now();
  if (_lightRegCache && now - _lightRegCache.at < 2000) return _lightRegCache.list;
  const list = loadCompaniesRegistry().map(stripCompanyCerts);
  _lightRegCache = { at: now, list };
  return list;
}
export function invalidateCompaniesRegistryLightCache() {
  _lightRegCache = null;
}

/** Full row (with certificates) for owner detail view only. */
export function loadCompanyRegistrationFull(idOrEmail: string): CompanyRegistration | null {
  const key = String(idOrEmail || '').trim().toLowerCase();
  if (!key) return null;
  const list = loadCompaniesRegistry();
  return (
    list.find(c => {
      const cem = String(c.email || '').toLowerCase();
      const cid = String(c.id || '').toLowerCase();
      const cuid = String(c.userId || '').toLowerCase();
      return (
        cid === key ||
        cem === key ||
        (cuid && cuid === key) ||
        String(c.id) === idOrEmail ||
        String(c.userId || '') === idOrEmail
      );
    }) || null
  );
}

export function saveCompaniesRegistry(list: CompanyRegistration[]) {
  try {
    // ثبّت التفعيل قبل الحفظ حتى لا يُكتب pending فوق active
    const fixed = applyRememberedActivations(list).filter(c => {
      if (isUserDeleted({ id: c.userId || c.id, email: c.email, username: c.username })) return false;
      const un = String(c.username || '').replace(/^@/, '').toLowerCase();
      if (un.startsWith('deleted_')) return false;
      return true;
    });
    localStorage.setItem(COMPANIES_REGISTRY_KEY, JSON.stringify(fixed));
    try { invalidateCompaniesRegistryLightCache(); } catch { /* */ }
    // keep public directory in sync (active only) for add-friend Company tab
    const active = fixed.filter(c => c.status === 'active').map(c => ({
      id: c.userId || c.id,
      companyName: c.companyName,
      name: c.companyName,
      tradeName: c.tradeName,
      ownerName: c.ownerName,
      email: c.email,
      username: c.username || null,
      accountType: 'company',
      isCompany: true,
      status: 'active',
    }));
    localStorage.setItem('stooorna_companies_directory', JSON.stringify(active));
    window.dispatchEvent(new CustomEvent('stooorna:companies-registry', { detail: fixed.map(stripCompanyCerts) }));
  } catch { /* ignore */ }
}

export function upsertCompanyRegistration(entry: CompanyRegistration) {
  // لا نستخدم loadCompaniesRegistry هنا حتى لا نخلط الذاكرة أثناء الدمج
  let list: CompanyRegistration[] = [];
  try {
    const raw = localStorage.getItem(COMPANIES_REGISTRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    list = Array.isArray(parsed) ? parsed : [];
  } catch { list = []; }
  const em = String(entry.email || '').toLowerCase();
  const un = String(entry.username || '').replace(/^@/, '').toLowerCase();
  const idx = list.findIndex(c => {
    if (entry.id && c.id === entry.id) return true;
    if (entry.userId && c.userId && String(c.userId) === String(entry.userId)) return true;
    const cem = String(c.email || '').toLowerCase();
    const cun = String(c.username || '').replace(/^@/, '').toLowerCase();
    if (em && cem === em) return true;
    if (un && cun && un === cun) return true;
    return false;
  });
  if (idx >= 0) {
    const prev = list[idx];
    // لا تخفض حالة active/inactive إلى pending عند دمج بيانات السيرفر
    let status = entry.status ?? prev.status;
    const remembered = em ? getRememberedCompanyStatus(em) : null;
    if (remembered === 'active' || remembered === 'inactive') status = remembered;
    else if ((prev.status === 'active' || prev.status === 'inactive') && status === 'pending') status = prev.status;
    list[idx] = {
      ...prev,
      ...entry,
      status,
      email: em || prev.email,
      username: entry.username || prev.username,
      password: entry.password || prev.password,
      approvedAt: status === 'active' ? (entry.approvedAt || prev.approvedAt || new Date().toISOString()) : (entry.approvedAt ?? prev.approvedAt),
      approvedBy: entry.approvedBy || prev.approvedBy,
      userId: entry.userId || prev.userId,
      id: prev.id || entry.id,
    };
  } else {
    list.unshift(entry);
  }
  saveCompaniesRegistry(list);
  return applyRememberedActivations(list);
}

export function setCompanyRegStatus(idOrEmail: string, status: CompanyRegStatus, meta?: { approvedBy?: string }) {
  let list: CompanyRegistration[] = [];
  try {
    const raw = localStorage.getItem(COMPANIES_REGISTRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    list = Array.isArray(parsed) ? parsed : [];
  } catch { list = []; }
  const key = String(idOrEmail || '').trim().toLowerCase();
  let matchedEmail = '';
  const next = list.map(c => {
    const cem = String(c.email || '').toLowerCase();
    const cid = String(c.id || '').toLowerCase();
    const cuid = String(c.userId || '').toLowerCase();
    const cun = String(c.username || '').replace(/^@/, '').toLowerCase();
    const hit =
      cid === key ||
      cem === key ||
      (cuid && cuid === key) ||
      (cun && cun === key) ||
      String(c.id) === idOrEmail ||
      String(c.userId || '') === idOrEmail;
    if (!hit) return c;
    matchedEmail = cem || matchedEmail;
    return {
      ...c,
      status,
      updatedAt: new Date().toISOString(),
      approvedAt: status === 'active' ? new Date().toISOString() : c.approvedAt,
      approvedBy: status === 'active' ? (meta?.approvedBy || c.approvedBy) : c.approvedBy,
    };
  });
  // إن لم يُعثر على صف، لا نُسقط القرار — نخزّن التفعيل بالإيميل إن وُجد لاحقاً
  if (matchedEmail) {
    rememberCompanyActivation(matchedEmail, status);
  } else if (key.includes('@')) {
    rememberCompanyActivation(key, status);
  }
  // ثبّت كل التفعيلات المعروفة على القائمة
  const fixed = applyRememberedActivations(next);
  saveCompaniesRegistry(fixed);
  // notice for the company email when approved
  if (status === 'active') {
    try {
      const target = fixed.find(c => {
        const cem = String(c.email || '').toLowerCase();
        return cem === matchedEmail || cem === key || String(c.id) === idOrEmail;
      });
      if (target?.email) {
        const notices = JSON.parse(localStorage.getItem(COMPANY_NOTICES_KEY) || '{}') as Record<string, string[]>;
        const arr = notices[target.email.toLowerCase()] || [];
        arr.push('يمكنكم تسجيل الدخول الآن — تمت الموافقة على حساب شركتكم');
        notices[target.email.toLowerCase()] = arr.slice(-10);
        localStorage.setItem(COMPANY_NOTICES_KEY, JSON.stringify(notices));
        window.dispatchEvent(new CustomEvent('stooorna:company-notice', {
          detail: { email: target.email, message: arr[arr.length - 1] },
        }));
      }
    } catch { /* ignore */ }
  }
  return fixed;
}

export function getCompanyNotice(email: string): string | null {
  try {
    const notices = JSON.parse(localStorage.getItem(COMPANY_NOTICES_KEY) || '{}') as Record<string, string[]>;
    const arr = notices[email.toLowerCase()] || [];
    return arr.length ? arr[arr.length - 1] : null;
  } catch {
    return null;
  }
}

export function findCompanyByEmail(email: string): CompanyRegistration | null {
  const em = email.trim().toLowerCase();
  if (!em) return null;
  const hit = loadCompaniesRegistry().find(c => String(c.email || '').toLowerCase() === em);
  if (hit) return hit;
  // Fallback: raw registry (includes soft-deleted) so approved companies can still log in
  try {
    const raw = localStorage.getItem(COMPANIES_REGISTRY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? (list as CompanyRegistration[]) : [];
    const found = arr.find(c => String(c.email || '').toLowerCase() === em) || null;
    if (found) {
      const remembered = getRememberedCompanyStatus(em);
      if (remembered === 'active' || found.status === 'active') {
        try { restoreDeletedUser({ id: found.userId || found.id, email: em, username: found.username }); } catch { /* */ }
        return { ...found, status: remembered === 'active' ? 'active' : found.status };
      }
      return found;
    }
  } catch { /* */ }
  return null;
}

export function loadCompanyActivations(): Record<string, { status: CompanyRegStatus; at: string; email: string }> {
  try {
    const raw = localStorage.getItem(COMPANY_ACTIVATIONS_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

export function rememberCompanyActivation(email: string, status: CompanyRegStatus) {
  const em = email.trim().toLowerCase();
  if (!em) return;
  try {
    const all = loadCompanyActivations();
    all[em] = { status, at: new Date().toISOString(), email: em };
    localStorage.setItem(COMPANY_ACTIVATIONS_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('stooorna:company-activated', { detail: all[em] }));
  } catch { /* */ }
}

export function getRememberedCompanyStatus(email: string): CompanyRegStatus | null {
  const em = email.trim().toLowerCase();
  const rec = loadCompanyActivations()[em];
  return rec?.status || null;
}

/** مزامنة الحالة مع السيرفر بعد Approve حتى يستطيع الحساب الدخول */
export async function pushCompanyStatusToServer(co: CompanyRegistration, status: CompanyRegStatus) {
  const payload = {
    id: co.id,
    email: co.email,
    username: co.username,
    companyName: co.companyName,
    tradeName: co.tradeName,
    ownerName: co.ownerName,
    licenseNumber: co.licenseNumber,
    phone: co.phone,
    password: co.password,
    status,
    accountType: 'company',
    isCompany: true,
    approved: status === 'active',
    active: status === 'active',
  };
  const endpoints: Array<{ url: string; method: string }> = [
    { url: `/api/company/${encodeURIComponent(co.id)}/status`, method: 'PATCH' },
    { url: `/api/companies/${encodeURIComponent(co.id)}/status`, method: 'PATCH' },
    { url: `/api/owner/companies/${encodeURIComponent(co.id)}/status`, method: 'PATCH' },
    { url: `/api/owner/company-requests/${encodeURIComponent(co.id)}`, method: 'PATCH' },
    { url: '/api/owner/companies/activate', method: 'POST' },
    { url: '/api/company/activate', method: 'POST' },
    { url: '/api/companies/activate', method: 'POST' },
    { url: '/api/company/status', method: 'POST' },
    { url: '/api/auth/company-activate', method: 'POST' },
  ];
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep.url, {
        method: ep.method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok || r.status === 201 || r.status === 204) return true;
    } catch { /* next */ }
  }
  return false;
}


/** يقبل الإيميل فقط — لا تحويل من يوزرنيم */
/** After Approve: create the auth user so the company can sign in immediately. */
export async function provisionCompanyAuthAccount(co: CompanyRegistration): Promise<boolean> {
  const email = String(co.email || '').trim().toLowerCase();
  const password = String(co.password || '').trim();
  if (!email || !password) return false;
  const displayName = co.companyName || co.ownerName || email;
  const username = String(co.username || '').replace(/^@/, '').trim() || undefined;
  try {
    // Prefer dedicated server activate endpoints (may create the user)
    await pushCompanyStatusToServer({ ...co, status: 'active' }, 'active');
  } catch { /* continue */ }
  try {
    const up = await signUp.email({
      name: displayName,
      email,
      password,
      ...(username ? ({ username } as any) : {}),
    } as any);
    if (!(up as { error?: unknown })?.error) return true;
  } catch { /* may already exist */ }
  // If already exists, sign-in probe with stored password (session not kept for owner)
  try {
    const r = await signIn.email({ email, password });
    if (!(r as { error?: unknown })?.error) {
      try { await signOut(); } catch { /* */ }
      return true;
    }
  } catch { /* */ }
  return false;
}


export async function resolveLoginEmailFromUsername(raw: string): Promise<{ email: string | null; username: string | null }> {
  const v = String(raw || '').trim().replace(/^@/, '');
  if (!v) return { email: null, username: null };
  if (v.includes('@')) return { email: v.toLowerCase(), username: null };
  return { email: null, username: v };
}

/** دخول بالإيميل فقط — يرفض اليوزرنيم (أفراد وشركات) */
// @ts-ignore TS6133: retained for future reuse.
async function signInWithEmailOrUsername(identifier: string, password: string) {
  const raw = String(identifier || '').trim().replace(/^@/, '');
  if (!raw || !password) return { ok: false as const, email: '', error: 'missing-credentials' };
  if (!raw.includes('@')) return { ok: false as const, email: '', error: 'email-required' };
  const email = raw.toLowerCase();
  try {
    const r = await signIn.email({ email, password });
    if (!(r as { error?: unknown })?.error) return { ok: true as const, email, error: null };
    return { ok: false as const, email, error: 'login-failed' };
  } catch {
    return { ok: false as const, email, error: 'login-failed' };
  }
}

export async function fetchCompanyStatusFromServer(email: string): Promise<CompanyRegStatus | null> {
  const em = encodeURIComponent(email.trim().toLowerCase());
  const urls = [
    `/api/company/status?email=${em}`,
    `/api/companies/status?email=${em}`,
    `/api/owner/companies?email=${em}`,
    `/api/company/by-email?email=${em}`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) continue;
      const d = await r.json();
      const row = Array.isArray(d) ? d[0] : (d.company || d.registration || d);
      const st = String(row?.status || row?.state || '').toLowerCase();
      if (st === 'active' || row?.active === true || row?.approved === true) return 'active';
      if (st === 'inactive' || row?.active === false) return 'inactive';
      if (st === 'pending') return 'pending';
    } catch { /* next */ }
  }
  return null;
}

/** Personal accounts that must stay in User Control — never Companies */
const PERSONAL_USER_BLOCKLIST = new Set([
  'nadoosha',
  'nadoshatota',
  'nadoshatota@gmail.com',
  'libra',
  'ليبرا',
  'ليبر',
  'account.kw@yahoo.com',
]);

export function isPersonalBlockedAccount(u: {
  email?: string | null;
  username?: string | null;
  name?: string | null;
} | null | undefined): boolean {
  if (!u) return false;
  const em = String(u.email || '').trim().toLowerCase();
  const un = String(u.username || '').replace(/^@/, '').replace(/❤️/g, '').trim().toLowerCase();
  const nm = String(u.name || '').replace(/❤️/g, '').trim().toLowerCase();
  if (em && PERSONAL_USER_BLOCKLIST.has(em)) return true;
  if (un && PERSONAL_USER_BLOCKLIST.has(un)) return true;
  if (nm && PERSONAL_USER_BLOCKLIST.has(nm.replace(/\s+/g, ''))) return true;
  if (/nadoosha/i.test(String(u.username || u.name || u.email || ''))) return true;
  // Libra يبقى في تحكم المستخدمين وليس قسم الشركات فقط
  if (/libra|ليبر/i.test(String(u.username || u.name || u.email || ''))) return true;
  return false;
}

/** Canonical Arabic title for known company brands */
export function preferredCompanyDisplayName(row: {
  companyName?: string | null;
  name?: string | null;
  tradeName?: string | null;
  email?: string | null;
  username?: string | null;
}): string {
  const un = String(row.username || '').replace(/^@/, '').trim();
  // كل شركة حساب مستقل — نعرض اسمها/يوزرها الحقيقي بدون دمج العلامات
  for (const val of [row.companyName, row.name, un, row.tradeName, row.email]) {
    if (val && String(val).trim()) return String(val).trim();
  }
  return 'Company';
}

/** Clean registry: drop personal accounts, normalize Libra Arabic name, dedupe */
export function sanitizeCompaniesRegistry(): CompanyRegistration[] {
  // UI-only: never write localStorage here — stringify of cert base64 freezes the main thread.
  const list = loadCompaniesRegistryLight();
  const out: CompanyRegistration[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    const un = String((c as CompanyRegistration).username || '').replace(/^@/, '').toLowerCase();
    if (/nadoosha/i.test(`${c.email} ${un} ${c.companyName || ''}`)) continue;
    const uniqueKey = (
      String(c.id || '') + '|' +
      String(c.email || '').toLowerCase() + '|' +
      un
    );
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    out.push({
      ...c,
      companyName: c.companyName || c.tradeName || un || c.email,
    });
  }
  return out;
}

/** هل هذا الصف حساب شركة؟ (يُستبعد من User Control ويُعرض في قسم الشركات فقط) */
export function isCompanyAccountRow(u: {
  email?: string | null;
  username?: string | null;
  name?: string | null;
  accountType?: string | null;
  type?: string | null;
  role?: string | null;
  userType?: string | null;
  isCompany?: boolean | null;
  companyName?: string | null;
  tradeName?: string | null;
  licenseNumber?: string | null;
  id?: string | null;
} | null | undefined): boolean {
  if (!u) return false;
  if (isPersonalBlockedAccount(u)) return false;
  const t = String(u.accountType || u.type || u.role || u.userType || '').toLowerCase();
  if (t === 'user' || t === 'personal' || t === 'individual') return false;
  if (t === 'company' || t === 'business') return true;
  if (u.isCompany === true) return true;
  if (u.isCompany === false) return false;
  // سجل الشركات فقط بمطابقة إيميل/يوزر — بدون اسم عام
  if (u.email) {
    const reg = findCompanyByEmail(u.email);
    if (reg) return true;
  }
  try {
    const un = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
    const reg = loadCompaniesRegistry();
    if (un && reg.some(c => String((c as any).username || '').replace(/^@/, '').toLowerCase() === un)) return true;
  } catch { /* ignore */ }
  // licenseNumber + companyName معاً أقوى من الاسم وحده
  if (u.licenseNumber && (u.companyName || u.tradeName)) return true;
  return false;
}

/** Ensure a user row is stored in the companies registry (Companies panel only) */
export function ensureCompanyInRegistry(row: any): CompanyRegistration | null {
  if (isPersonalBlockedAccount(row)) return null; // never put NaDooSha etc. in Companies
  const em = String(row?.email || '').trim().toLowerCase();
  if (!em && !row?.id) return null;
  const existing = em ? findCompanyByEmail(em) : null;
  const remembered = em ? getRememberedCompanyStatus(em) : null;
  const serverActive = row?.status === 'active' || row?.isActive === true || row?.approved === true;
  const serverInactive = row?.status === 'inactive' || row?.isBanned === true || row?.active === false;
  // أولوية: قرار التفعيل المحلي (Approve) ثم السيرفر ثم السجل السابق — لا نرجع من active إلى pending
  let status: CompanyRegStatus = 'pending';
  if (remembered === 'active' || remembered === 'inactive') status = remembered;
  else if (serverActive) status = 'active';
  else if (serverInactive) status = 'inactive';
  else if (existing?.status === 'active' || existing?.status === 'inactive') status = existing.status;
  else status = 'pending';
  const entry: CompanyRegistration = {
    id: String(existing?.id || row.id || `co-${em || row.username || Date.now()}`),
    companyName: preferredCompanyDisplayName({ companyName: row.companyName || existing?.companyName, name: row.name, tradeName: row.tradeName, email: em || row.email, username: row.username }),
    tradeName: (() => {
      const preferred = preferredCompanyDisplayName({ companyName: row.companyName, name: row.name, tradeName: row.tradeName, email: em, username: row.username });
      if (/ليبر|libra/i.test(preferred)) return row.tradeName && /[؀-ۿ]/.test(row.tradeName) ? row.tradeName : (existing?.tradeName && /[؀-ۿ]/.test(existing.tradeName) ? existing.tradeName : 'لإدارة وتأجير العقارات المملوكة او المؤجرة');
      return row.tradeName || existing?.tradeName || row.companyName || row.name || '';
    })(),
    ownerName: row.ownerName || existing?.ownerName || row.name || '',
    licenseNumber: row.licenseNumber || existing?.licenseNumber || '',
    phone: row.phone || existing?.phone || '',
    phoneAlt: row.phoneAlt || existing?.phoneAlt,
    email: em || existing?.email || '',
    username: row.username || existing?.username,
    password: existing?.password,
    status,
    createdAt: row.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: row.id || existing?.userId || null,
    approvedAt: status === 'active' ? (existing?.approvedAt || new Date().toISOString()) : existing?.approvedAt || null,
    approvedBy: existing?.approvedBy || null,
  };
  upsertCompanyRegistration(entry);
  return entry;
}


function shouldShowSupportHeaderIcon(
  user: { email?: string | null; username?: string | null; name?: string | null } | null | undefined,
  profileUsername?: string | null,
) {
  // Guests (not logged in) can also open support chat
  if (!user) return true;
  return !isSupportOwnerAccount(user, profileUsername);
}
interface Recording {
  id: number;
  title: string;
  duration: number;
  mode: string;
  fileUrl: string | null;
  createdAt: string;
}

// Theme colors matching the cyan main screen
const SETTINGS_CLR = {
  bg: 'radial-gradient(ellipse 70% 60% at 50% 40%, #0d2a2e 0%, #0a1a1a 50%, #060e0e 100%)',
  primary: '#00BCD4',
  primaryDim: 'rgba(0,188,212,0.7)',
  primaryFaint: 'rgba(0,188,212,0.15)',
  primaryBorder: 'rgba(0,188,212,0.25)',
  primaryGlow: 'rgba(0,188,212,0.3)',
  surface: 'rgba(13,32,32,0.8)',
  surfaceBorder: 'rgba(0,188,212,0.12)',
  text: 'rgba(200,230,230,0.9)',
  textMuted: 'rgba(150,190,190,0.6)',
  inputBg: 'rgba(6,14,14,0.8)',
  inputBorder: 'rgba(0,188,212,0.2)',
  inputFocus: 'rgba(0,188,212,0.5)',
  navBg: 'linear-gradient(180deg, transparent 0%, rgba(6,14,14,0.95) 100%)',
  navBorder: 'rgba(0,188,212,0.08)',
  danger: 'rgba(239,68,68,0.8)',
  dangerBorder: 'rgba(239,68,68,0.3)',
  dangerFaint: 'rgba(239,68,68,0.1)',
  success: '#00BCD4',
  tabActive: 'rgba(0,188,212,0.15)',
  tabBorder: 'rgba(0,188,212,0.4)',
  bronze: 'rgba(205,140,50,0.8)',
  bronzeBorder: 'rgba(205,140,50,0.3)',
  bronzeFaint: 'rgba(205,140,50,0.1)',
  green: 'hsl(var(--accent))',
  greenFaint: 'hsl(var(--accent) / 0.12)',
  greenBorder: 'hsl(var(--accent) / 0.35)',
  bgDeep: 'rgba(6,14,14,0.95)',
  overlay: 'rgba(0,0,0,0.75)',
  modalBg: 'linear-gradient(160deg, #0d2a2e 0%, #0a1a1a 100%)',
  yellowFaint: 'rgba(234,179,8,0.12)',
  yellowBorder: 'rgba(234,179,8,0.5)',
  yellow: '#eab308'
};
/** Alias kept for all existing T.xxx references in this file */
const T = SETTINGS_CLR;
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ─── Recording card ───────────────────────────────────────────────────────────
function RecordingCard({
  rec,
  onDelete
}: {
  rec: Recording;
  onDelete: (id: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);
  function togglePlay() {
    if (!rec.fileUrl) return;
    if (!audioRef.current) {
      const audio = new Audio(rec.fileUrl);
      audioRef.current = audio;
      audio.ontimeupdate = () => {
        if (audio.duration) setProgress(audio.currentTime / audio.duration);
      };
      audio.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  }
  async function handleShare() {
    if (!rec.fileUrl) return;
    setSharing(true);
    try {
      const fullUrl = window.location.origin + rec.fileUrl;
      if (navigator.share) {
        // Share URL only — file sharing via navigator.share is unreliable in iframes/webviews
        await navigator.share({
          title: rec.title,
          text: `Voice recording: ${rec.title}`,
          url: fullUrl
        });
      } else {
        // Fallback: trigger a direct download
        const a = document.createElement('a');
        a.href = rec.fileUrl;
        a.download = `${rec.title}.mp3`;
        a.click();
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        // Last resort: copy link
        try {
          await navigator.clipboard.writeText(window.location.origin + rec.fileUrl);
        } catch {/* silent */}
      }
    } finally {
      setSharing(false);
    }
  }
  const isBronze = rec.mode === 'whisper';
  const modeColor = isBronze ? T.bronze : T.primary;
  const modeBorder = isBronze ? T.bronzeBorder : T.primaryBorder;
  const modeFaint = isBronze ? T.bronzeFaint : T.primaryFaint;
  return <motion.div initial={{
    opacity: 0,
    scale: 0.96
  }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} className="rounded-xl overflow-hidden" style={{
    background: T.surface,
    border: `1px solid ${T.surfaceBorder}`
  }}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Play button */}
        <motion.button whileTap={{
        scale: 0.85
      }} onClick={togglePlay} disabled={!rec.fileUrl} className="flex items-center justify-center rounded-full flex-shrink-0" style={{
        width: 38,
        height: 38,
        background: modeFaint,
        border: `1px solid ${modeBorder}`,
        cursor: rec.fileUrl ? 'pointer' : 'default',
        color: modeColor,
        opacity: rec.fileUrl ? 1 : 0.4
      }}>
          {playing ? <Pause size={14} fill={modeColor} /> : <Play size={14} fill={modeColor} style={{
          marginLeft: 2
        }} />}
        </motion.button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p style={{
          color: T.text,
          fontSize: '0.82rem',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
            {rec.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <Clock size={10} style={{
            color: T.textMuted
          }} />
            <span style={{
            color: T.textMuted,
            fontSize: '0.65rem'
          }}>{formatDuration(rec.duration)}</span>
            <span style={{
            color: modeColor,
            fontSize: '0.58rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            background: modeFaint,
            border: `1px solid ${modeBorder}`,
            padding: '1px 5px',
            borderRadius: 3
          }}>
              {rec.mode}
            </span>
            <span style={{
            color: T.textMuted,
            fontSize: '0.62rem'
          }}>{formatDate(rec.createdAt)}</span>
          </div>
        </div>

        {/* Share */}
        <motion.button whileTap={{
        scale: 0.85
      }} onClick={handleShare} disabled={!rec.fileUrl || sharing} style={{
        background: 'none',
        border: 'none',
        cursor: rec.fileUrl ? 'pointer' : 'default',
        color: T.primaryDim,
        flexShrink: 0,
        opacity: sharing ? 0.5 : 1
      }}>
          {sharing ? <motion.div animate={{
          rotate: 360
        }} transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'linear'
        }} style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: `2px solid ${T.primaryBorder}`,
          borderTopColor: T.primary
        }} /> : <Share2 size={16} />}
        </motion.button>

        {/* Delete / confirm */}
        <AnimatePresence mode="wait">
          {confirmDelete ? <motion.div key="confirm" initial={{
          opacity: 0,
          scale: 0.8
        }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} exit={{
          opacity: 0
        }} className="flex items-center gap-1 flex-shrink-0">
              <motion.button whileTap={{
            scale: 0.85
          }} onClick={() => onDelete(rec.id)} style={{
            background: T.dangerFaint,
            border: `1px solid ${T.dangerBorder}`,
            borderRadius: 6,
            padding: '3px 8px',
            color: T.danger,
            fontSize: '0.65rem',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.05em'
          }}>
                Delete
              </motion.button>
              <motion.button whileTap={{
            scale: 0.85
          }} onClick={() => setConfirmDelete(false)} style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: T.textMuted
          }}>
                <X size={14} />
              </motion.button>
            </motion.div> : <motion.button key="trash" whileTap={{
          scale: 0.85
        }} onClick={() => setConfirmDelete(true)} style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: T.dangerBorder,
          flexShrink: 0
        }}>
              <Trash2 size={16} />
            </motion.button>}
        </AnimatePresence>
      </div>

      {/* Progress bar — only when playing */}
      <AnimatePresence>
        {playing && <motion.div initial={{
        scaleX: 0,
        opacity: 0
      }} animate={{
        scaleX: 1,
        opacity: 1
      }} exit={{
        opacity: 0
      }} style={{
        transformOrigin: 'left',
        height: 2,
        background: `linear-gradient(90deg, ${modeColor} ${progress * 100}%, ${modeBorder} ${progress * 100}%)`
      }} />}
      </AnimatePresence>
    </motion.div>;
}

// ─── Support chat (Settings header → @Stooorna owner/support + AI wait companion) ─
type SupportMsg = {
  id: string;
  from: 'bot' | 'user' | 'support';
  text: string;
  at: number;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'file' | 'audio';
};

type AiPhase = 'pick_lang' | 'ask_role' | 'ask_help' | 'idle' | 'waiting' | 'ask_category' | 'ask_title' | 'playing' | 'human';

/** Max playback for song / music / Quran in the support AI player */
const SUPPORT_AUDIO_MAX_SEC = 5 * 60; // 5 minutes

// SUPPORT_COPY is imported from @/lib/support-copy — do not redeclare here.

const BLOCKED_RE =
  /(sex|porn|xxx|nude|كسم|شرموط|زب|طيز|نيك|سكس|إباحي|اباحي|قتل|انتحار|bomb|terror|hack|دوكس)/i;

/** Resolve @stooorna user id (real chat peer) */
async function resolveSupportUserId(): Promise<string | null> {
  try {
    const r = await fetch('/api/users/by-username/stooorna', { credentials: 'include' });
    if (!r.ok) return null;
    const d = await r.json();
    return (d.id || d.userId || d.user?.id || null) as string | null;
  } catch {
    return null;
  }
}

/**
 * Deliver a message into the real messaging system.
 * /api/support/* does not exist on the server (404) — use /api/messages instead.
 */
async function sendRealChatMessage(opts: {
  toUserId: string;
  text: string;
  mediaUrl?: string;
  mediaType?: string;
  meta?: Record<string, unknown>;
}): Promise<boolean> {
  const bodies: Record<string, unknown>[] = [
    {
      toUserId: opts.toUserId,
      text: opts.text,
      mediaUrl: opts.mediaUrl,
      mediaType: opts.mediaType,
      ...opts.meta,
    },
    {
      recipientId: opts.toUserId,
      content: opts.text,
      mediaUrl: opts.mediaUrl,
      mediaType: opts.mediaType,
      ...opts.meta,
    },
    {
      userId: opts.toUserId,
      message: opts.text,
      text: opts.text,
      mediaUrl: opts.mediaUrl,
      ...opts.meta,
    },
    {
      peerId: opts.toUserId,
      body: opts.text,
      text: opts.text,
      ...opts.meta,
    },
    {
      to: opts.toUserId,
      text: opts.text,
      ...opts.meta,
    },
  ];

  for (const body of bodies) {
    try {
      const r = await fetch('/api/messages', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok || r.status === 201) return true;
      // 400 = bad shape, try next; 401/403 = auth issue, stop
      if (r.status === 401 || r.status === 403) return false;
    } catch { /* try next shape */ }
  }
  return false;
}

/** Persist ticket locally so owner inbox can still show something if API shape differs */
function queueSupportTicket(ticket: {
  fromUserId?: string;
  fromUsername?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  text: string;
  mediaUrl?: string;
  mediaType?: string;
  lang?: string;
  accountRole?: string;
  companyName?: string;
  licenseNumber?: string;
}) {
  try {
    const key = 'stooorna_support_tickets';
    const prev = JSON.parse(localStorage.getItem(key) || '[]') as unknown[];
    const next = [
      ...prev,
      {
        id: `t-${Date.now()}`,
        ...ticket,
        at: new Date().toISOString(),
        unread: 1,
      },
    ].slice(-300);
    localStorage.setItem(key, JSON.stringify(next));
    // notify other tabs / owner UI
    window.dispatchEvent(new CustomEvent('stooorna:support-ticket', { detail: next[next.length - 1] }));
  } catch { /* ignore */ }
}

function readLocalSupportTickets(): Array<{
  id: string;
  fromUserId?: string;
  fromUsername?: string | null;
  fromName?: string | null;
  text: string;
  at: string;
  unread?: number;
  mediaUrl?: string;
}> {
  try {
    return JSON.parse(localStorage.getItem('stooorna_support_tickets') || '[]');
  } catch {
    return [];
  }
}

/** Support chat history lives 10 minutes then is wiped (client + optional API) */
const SUPPORT_CHAT_TTL_MS = 10 * 60 * 1000;

const SUPPORT_TASK_DONE_MSG =
  'شكرا للتواصل معنا واذا بغيتنا نساعدك لا تترد بالتواصل مره اخرى\nملاحظه/ سوف يتم حذف المحادثه بعد عشرة دقائق بشكل نهائي  شكرا لتواصلكم';

function supportChatKey(peerId: string) {
  return `stooorna_support_thread_${peerId}`;
}

type StoredSupportThread = {
  messages: Array<{
    id: string;
    from: string;
    text: string;
    at: number;
    mediaUrl?: string;
    mediaType?: string;
  }>;
  expiresAt: number;
  completedAt?: number;
};

function loadSupportThread(peerId: string): StoredSupportThread | null {
  try {
    const raw = localStorage.getItem(supportChatKey(peerId));
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredSupportThread;
    if (!data || !Array.isArray(data.messages)) return null;
    if (data.expiresAt && Date.now() > data.expiresAt) {
      localStorage.removeItem(supportChatKey(peerId));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveSupportThread(peerId: string, messages: StoredSupportThread['messages'], opts?: { completedAt?: number; resetTtl?: boolean }) {
  try {
    const prev = loadSupportThread(peerId);
    const now = Date.now();
    let expiresAt = prev?.expiresAt && prev.expiresAt > now ? prev.expiresAt : now + SUPPORT_CHAT_TTL_MS;
    if (opts?.resetTtl) expiresAt = now + SUPPORT_CHAT_TTL_MS;
    if (opts?.completedAt) expiresAt = opts.completedAt + SUPPORT_CHAT_TTL_MS;
    const payload: StoredSupportThread = {
      messages,
      expiresAt,
      completedAt: opts?.completedAt ?? prev?.completedAt,
    };
    localStorage.setItem(supportChatKey(peerId), JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('stooorna:support-thread', { detail: { peerId, ...payload } }));
  } catch { /* ignore */ }
}

const DELETED_THREADS_KEY = 'stooorna_deleted_support_threads';
function getDeletedThreadIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DELETED_THREADS_KEY) || '[]')); } catch { return new Set(); }
}
function markThreadDeleted(peerId: string) {
  try {
    const ids = getDeletedThreadIds();
    ids.add(peerId);
    localStorage.setItem(DELETED_THREADS_KEY, JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

function clearSupportThread(peerId: string) {
  try {
    localStorage.removeItem(supportChatKey(peerId));
    // also drop matching local tickets
    const tickets = readLocalSupportTickets().filter(
      t => t.fromUserId !== peerId,
    );
    localStorage.setItem('stooorna_support_tickets', JSON.stringify(tickets));
    // remember this thread was deleted so inbox fetch won't re-show it
    markThreadDeleted(peerId);
    window.dispatchEvent(new CustomEvent('stooorna:support-thread', { detail: { peerId, cleared: true } }));
  } catch { /* ignore */ }
  // Delete from DB (owner-only endpoint — silently ignored for non-owners)
  fetch(`/api/support/thread?userId=${encodeURIComponent(peerId)}`, {
    method: 'DELETE',
    credentials: 'include',
  }).catch(() => { /* optional */ });
}

async function notifySupportThreadComplete(peerId: string) {
  try {
    // Tell server to schedule a WS "support_thread_clear" event to the user after 10 min
    await fetch('/api/support/complete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: peerId, deleteAfterMs: SUPPORT_CHAT_TTL_MS }),
    });
  } catch { /* optional backend */ }
  try {
    await sendRealChatMessage({
      toUserId: peerId,
      text: SUPPORT_TASK_DONE_MSG,
      meta: { isSupportReply: true, taskComplete: true, deleteAfterMs: SUPPORT_CHAT_TTL_MS },
    });
  } catch { /* */ }
}

function classifyListenIntent(text: string): 'quran' | 'ar_song' | 'en_song' | 'music' | 'other' {
  const t = text.toLowerCase().trim();
  if (/(قرآن|قران|quran|qur.?an|سورة|سوره|تلاوة|مصحف)/i.test(t)) return 'quran';
  if (/(عربي|عربية|arabic)/i.test(t) && /(أغنية|اغنية|أغنيه|اغنيه|song|موسيقى|موسيقي)/i.test(t)) return 'ar_song';
  if (/(إنجليزي|انجليزي|english)/i.test(t) && /(أغنية|اغنية|song|موسيقى)/i.test(t)) return 'en_song';
  if (/(أغنية|اغنية|أغنيه|اغنيه|song)/i.test(t)) {
    if (/(عربي|عربية|arabic)/i.test(t)) return 'ar_song';
    if (/(إنجليزي|انجليزي|english)/i.test(t)) return 'en_song';
    return 'ar_song';
  }
  if (/(موسيقى|موسيقي|music|instrumental)/i.test(t)) return 'music';
  return 'other';
}

/** Curated safe audio sources (audio only). Backend may override via /api/support/audio-search */
const AUDIO_CATALOG: Record<string, { title: string; url: string }[]> = {
  quran: [
    { title: 'الفاتحة — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3' },
    { title: 'البقرة (بداية) — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/2.mp3' },
    { title: 'يس — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/36.mp3' },
    { title: 'الرحمن — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/55.mp3' },
    { title: 'الملك — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/67.mp3' },
    { title: 'الإخلاص — مشاري العفاسي', url: 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/112.mp3' },
  ],
  ar_song: [
    { title: 'موسيقى هادئة عربية (عينة)', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  ],
  en_song: [
    { title: 'Calm instrumental (sample)', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  ],
  music: [
    { title: 'Instrumental music (sample)', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  ],
};

async function resolveAudio(category: 'quran' | 'ar_song' | 'en_song' | 'music', query: string): Promise<{ title: string; url: string } | null> {
  // Prefer backend search if available (auto-search for support AI)
  try {
    const r = await fetch('/api/support/audio-search', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, query }),
    });
    if (r.ok) {
      const d = await r.json();
      if (d?.url && typeof d.url === 'string') {
        return { title: d.title || query, url: d.url };
      }
    }
  } catch { /* fallback catalog */ }

  const list = AUDIO_CATALOG[category] || [];
  if (!list.length) return null;
  const q = query.toLowerCase();
  const hit = list.find(x => x.title.toLowerCase().includes(q) || q.includes(x.title.toLowerCase().slice(0, 8)));
  return hit || list[0];
}

function SupportChatOverlay({
  open,
  onClose,
  currentUser,
}: {
  open: boolean;
  onClose: () => void;
  currentUser: { id?: string; name?: string | null; username?: string | null; email?: string | null } | null;
}) {
  const [lang, setLang] = useState<'ar' | 'en' | null>(null);
  const copy = SUPPORT_COPY[lang ?? 'ar'];
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [userMsgCount, setUserMsgCount] = useState(0);
  const [aiPhase, setAiPhase] = useState<AiPhase>('pick_lang');
  const [accountRole, setAccountRole] = useState<'user' | 'company' | null>(null);
  const [listenCategory, setListenCategory] = useState<'quran' | 'ar_song' | 'en_song' | 'music' | null>(null);
  const [nowPlaying, setNowPlaying] = useState<{ title: string; url: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [supportOnline, setSupportOnline] = useState(false);
  const [autoMusicPlaying, setAutoMusicPlaying] = useState(false);
  const autoMusicRef = useRef<HTMLAudioElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const aiPhaseRef = useRef<AiPhase>('pick_lang');
  const waitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSupportIdRef = useRef<string | null>(null);
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langRef = useRef<'ar' | 'en'>('ar');
  const accountRoleRef = useRef<'user' | 'company' | null>(null);

  // Calm background music URLs (lofi / ambient)
  const CALM_MUSIC_URLS = [
    'https://www.bensound.com/bensound-music/bensound-slowmotion.mp3',
    'https://www.bensound.com/bensound-music/bensound-relaxing.mp3',
    'https://www.bensound.com/bensound-music/bensound-dreams.mp3',
  ];

  function startAutoMusic() {
    if (autoMusicRef.current) return; // already started
    const url = CALM_MUSIC_URLS[Math.floor(Math.random() * CALM_MUSIC_URLS.length)];
    const a = new Audio(url);
    a.loop = true;
    a.volume = 0.25;
    autoMusicRef.current = a;
    a.play().then(() => setAutoMusicPlaying(true)).catch(() => {});
  }

  function toggleAutoMusic() {
    const a = autoMusicRef.current;
    if (!a) return;
    if (autoMusicPlaying) {
      a.pause();
      setAutoMusicPlaying(false);
    } else {
      a.play().then(() => setAutoMusicPlaying(true)).catch(() => {});
    }
  }

  function stopAutoMusic() {
    const a = autoMusicRef.current;
    if (a) { a.pause(); a.src = ''; }
    autoMusicRef.current = null;
    setAutoMusicPlaying(false);
  }

  const pushBotInstant = (text: string) => {
    setMessages(prev => [...prev, { id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, from: 'bot', text, at: Date.now() }]);
  };

  /** Slow typewriter for AI lines */
  const pushBotTyped = (fullText: string): Promise<void> => {
    return new Promise(resolve => {
      if (typeTimerRef.current) {
        clearInterval(typeTimerRef.current);
        typeTimerRef.current = null;
      }
      setIsTyping(true);
      const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      let i = 0;
      // reveal ~2–3 chars at a time for a natural slow feel
      const step = Math.max(1, Math.ceil(fullText.length / 40));
      const tickMs = 45;
      // small delay so "Type..." is visible first
      setTimeout(() => {
        setMessages(prev => [...prev, { id, from: 'bot', text: '', at: Date.now() }]);
        typeTimerRef.current = setInterval(() => {
          i = Math.min(fullText.length, i + step);
          const slice = fullText.slice(0, i);
          setMessages(prev => prev.map(m => (m.id === id ? { ...m, text: slice } : m)));
          if (i >= fullText.length) {
            if (typeTimerRef.current) clearInterval(typeTimerRef.current);
            typeTimerRef.current = null;
            setIsTyping(false);
            resolve();
          }
        }, tickMs);
      }, 350);
    });
  };

  const stopAudio = () => {
    try {
      audioRef.current?.pause();
      if (audioRef.current) audioRef.current.src = '';
    } catch { /* ignore */ }
    audioRef.current = null;
    if (maxPlayTimerRef.current) {
      clearTimeout(maxPlayTimerRef.current);
      maxPlayTimerRef.current = null;
    }
    setIsPlaying(false);
    setNowPlaying(null);
  };

  const stopAiCompletely = () => {
    aiPhaseRef.current = 'human';
    setAiPhase('human');
    if (waitTimerRef.current) {
      clearInterval(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    if (typeTimerRef.current) {
      clearInterval(typeTimerRef.current);
      typeTimerRef.current = null;
    }
    setIsTyping(false);
    stopAudio();
  };

  const playAudio = (track: { title: string; url: string }) => {
    stopAudio();
    const a = new Audio(track.url);
    audioRef.current = a;
    a.onended = () => setIsPlaying(false);
    a.onerror = () => {
      setIsPlaying(false);
      pushBotInstant(SUPPORT_COPY[langRef.current].notFound);
    };
    // Cap at 5 minutes even if the file is longer
    a.ontimeupdate = () => {
      if (a.currentTime >= SUPPORT_AUDIO_MAX_SEC) {
        a.pause();
        setIsPlaying(false);
      }
    };
    a.play().then(() => {
      setNowPlaying(track);
      setIsPlaying(true);
      setAiPhase('playing');
      aiPhaseRef.current = 'playing';
      pushBotInstant(`${SUPPORT_COPY[langRef.current].playing} ${track.title}`);
      if (maxPlayTimerRef.current) clearTimeout(maxPlayTimerRef.current);
      maxPlayTimerRef.current = setTimeout(() => {
        try { a.pause(); } catch { /* */ }
        setIsPlaying(false);
      }, SUPPORT_AUDIO_MAX_SEC * 1000);
    }).catch(() => {
      pushBotInstant(SUPPORT_COPY[langRef.current].notFound);
    });
  };

  const togglePlayPause = () => {
    const a = audioRef.current;
    if (!a || !nowPlaying) return;
    if (a.paused) {
      a.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      a.pause();
      setIsPlaying(false);
    }
  };

  // Seed: language picker first — restore thread if still within 10 minutes
  useEffect(() => {
    if (!open) {
      stopAiCompletely();
      // do NOT wipe messages from storage on leave — keep 10 min
      return;
    }
    const uid = currentUser?.id || 'anon';
    const stored = loadSupportThread(uid);
    if (stored?.messages?.length) {
      setMessages(stored.messages.map(m => ({
        id: m.id,
        from: (m.from === 'user' ? 'user' : m.from === 'support' ? 'support' : 'bot') as SupportMsg['from'],
        text: m.text,
        at: m.at,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType as SupportMsg['mediaType'],
      })));
      // if already had language + history, skip picker
      const hadUser = stored.messages.some(m => m.from === 'user');
      if (hadUser) {
        setLang(langRef.current || 'ar');
        setAiPhase(stored.completedAt ? 'human' : 'waiting');
        aiPhaseRef.current = stored.completedAt ? 'human' : 'waiting';
      } else {
        setLang(null);
        setAiPhase('pick_lang');
        aiPhaseRef.current = 'pick_lang';
      }
      if (stored.completedAt) {
        stopAiCompletely();
      }
    } else {
      setMessages([]);
      setLang(null);
      setAiPhase('pick_lang');
      aiPhaseRef.current = 'pick_lang';
    }
    setInput('');
    setUserMsgCount(stored?.messages?.filter(m => m.from === 'user').length || 0);
    setListenCategory(null);
    setAccountRole(null);
    accountRoleRef.current = null;
    lastSupportIdRef.current = null;
    setIsTyping(false);
    stopAudio();
    setSupportOnline(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentUser?.id]);

  // Persist user support chat (10 min TTL, survives leave/re-enter)
  useEffect(() => {
    if (!open || !currentUser?.id || !messages.length) return;
    saveSupportThread(
      currentUser.id,
      messages.map(m => ({
        id: m.id,
        from: m.from,
        text: m.text,
        at: m.at,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
      })),
      { resetTtl: true },
    );
  }, [messages, open, currentUser?.id]);

  // Auto-delete after expiry
  useEffect(() => {
    if (!open || !currentUser?.id) return;
    const id = setInterval(() => {
      const stored = loadSupportThread(currentUser.id!);
      if (!stored) {
        // already cleared
        return;
      }
      if (stored.expiresAt && Date.now() > stored.expiresAt) {
        clearSupportThread(currentUser.id!);
        setMessages([]);
        setLang(null);
        setAiPhase('pick_lang');
        aiPhaseRef.current = 'pick_lang';
        setUserMsgCount(0);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [open, currentUser?.id]);

  async function selectLang(chosen: 'ar' | 'en') {
    setLang(chosen);
    langRef.current = chosen;
    try { localStorage.setItem('lang', chosen); } catch { /* */ }
    setAiPhase('ask_role');
    aiPhaseRef.current = 'ask_role';
    // أزرار فقط — بدون رسالة AI
  }

  /** Resolve display name for individual users */
  function resolveUserDisplayName(): string {
    const u = currentUser as { username?: string | null; name?: string | null } | null;
    const un = (u?.username || '').replace(/^@/, '').trim();
    if (un) return un;
    const nm = (u?.name || '').trim();
    if (nm) return nm;
    return langRef.current === 'ar' ? 'عزيزي' : 'there';
  }

  /** Resolve company registration info from local registry + session */
  function resolveCompanyInfo(): { companyName: string; license?: string; tradeName?: string } {
    const email = (currentUser?.email || '').trim().toLowerCase();
    let reg: CompanyRegistration | null = null;
    try {
      if (email) reg = findCompanyByEmail(email);
      if (!reg && currentUser) {
        const list = loadCompaniesRegistry();
        const un = String((currentUser as any)?.username || '').replace(/^@/, '').trim().toLowerCase();
        reg = list.find(c => {
          const blob = `${c.companyName} ${c.tradeName} ${c.email} ${c.ownerName}`.toLowerCase();
          return (un && blob.includes(un)) || (email && c.email.toLowerCase() === email);
        }) || null;
      }
    } catch { /* ignore */ }
    const companyName =
      preferredCompanyDisplayName({
        companyName: reg?.companyName,
        name: currentUser?.name,
        tradeName: reg?.tradeName,
        email: currentUser?.email,
        username: (currentUser as any)?.username,
      }) ||
      (currentUser?.name || '').trim() ||
      (langRef.current === 'ar' ? 'الشركة' : 'your company');
    return {
      companyName,
      license: reg?.licenseNumber || undefined,
      tradeName: reg?.tradeName || undefined,
    };
  }

  async function selectRole(role: 'user' | 'company') {
    setAccountRole(role);
    accountRoleRef.current = role;
    const L = SUPPORT_COPY[langRef.current];
    if (role === 'user') {
      const name = resolveUserDisplayName();
      await pushBotTyped(L.greetingUser(name));
    } else {
      const info = resolveCompanyInfo();
      await pushBotTyped(L.greetingCompany(info.companyName, info.license));
    }
    await pushBotTyped(L.howHelp);
    setAiPhase('ask_help');
    aiPhaseRef.current = 'ask_help';
  }

  async function selectHelpTopic(topic: 'forgot_pw' | 'talk_support') {
    if (aiPhaseRef.current === 'human' || aiPhaseRef.current === 'waiting') return;
    const L = SUPPORT_COPY[langRef.current];
    const label = topic === 'forgot_pw' ? L.btnForgotPw : L.btnTalkSupport;
    const waitMsg = topic === 'forgot_pw' ? L.waitForgot : L.waitSupport;
    setMessages(prev => [...prev, {
      id: `u-help-${Date.now()}`,
      from: 'user',
      text: label,
      at: Date.now(),
    }]);
    setUserMsgCount(c => c + 1);
    await deliverToSupport({
      text: `[${topic === 'forgot_pw' ? 'forgot_password' : 'talk_to_support'}] ${label}`,
    });
    setAiPhase('waiting');
    aiPhaseRef.current = 'waiting';
    await pushBotTyped(waitMsg);
    startAutoMusic();
  }

  // Auto-scroll
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, isTyping]);

  // Every 2 minutes: please wait (only while AI is handling wait / listen)
  useEffect(() => {
    if (!open || !lang) return;
    if (waitTimerRef.current) clearInterval(waitTimerRef.current);
    waitTimerRef.current = setInterval(() => {
      const phase = aiPhaseRef.current;
      if (phase === 'human' || phase === 'idle' || phase === 'pick_lang' || phase === 'ask_role') return;
      void pushBotTyped(SUPPORT_COPY[langRef.current].waiting);
    }, 120_000);
    return () => {
      if (waitTimerRef.current) clearInterval(waitTimerRef.current);
      waitTimerRef.current = null;
    };
  }, [open, lang]);

  // Poll support presence + real agent replies
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const poll = async () => {
      try {
        // presence of support desk
        try {
          const pr = await fetch('/api/users/by-username/stooorna', { credentials: 'include' });
          if (pr.ok) {
            const pd = await pr.json();
            if (!cancelled && typeof pd.online === 'boolean') setSupportOnline(!!pd.online);
            else if (!cancelled) setSupportOnline(true);
          }
        } catch {
          if (!cancelled) setSupportOnline(true);
        }

        const r = await fetch('/api/support/messages?role=user', { credentials: 'include' });
        if (!r.ok || cancelled) return;
        const d = await r.json();
        const list: Array<{ id: string; from: string; text: string; at?: number }> = Array.isArray(d) ? d : (d.messages || []);
        const supportOnes = list.filter(m => m.from === 'support' || m.from === 'agent' || m.from === 'stooorna');
        if (!supportOnes.length) return;
        const latest = supportOnes[supportOnes.length - 1];
        if (latest.id && latest.id !== lastSupportIdRef.current) {
          lastSupportIdRef.current = latest.id;
          if (aiPhaseRef.current !== 'human') {
            stopAiCompletely();
            setMessages(prev => [
              ...prev,
              { id: `s-join-${Date.now()}`, from: 'bot', text: SUPPORT_COPY[langRef.current].supportJoined, at: Date.now() },
              { id: `s-${latest.id}`, from: 'support', text: latest.text, at: latest.at || Date.now() },
            ]);
          } else {
            setMessages(prev => {
              if (prev.some(p => p.id === `s-${latest.id}`)) return prev;
              return [...prev, { id: `s-${latest.id}`, from: 'support', text: latest.text, at: latest.at || Date.now() }];
            });
          }
        }
      } catch { /* silent */ }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open]);

  // Cleanup audio on unmount
  useEffect(() => () => {
    stopAudio();
    if (typeTimerRef.current) clearInterval(typeTimerRef.current);
  }, []);

  async function deliverToSupport(payload: {
    text?: string;
    mediaUrl?: string;
    mediaType?: string;
  }) {
    const text = payload.text || '';
    const isGuest = !currentUser;
    const fromUsername = (currentUser as { username?: string })?.username ?? null;
    const fromName = isGuest ? 'Guest' : (currentUser?.name ?? null);
    const fromEmail = currentUser?.email ?? null;
    const fromUserId = currentUser?.id;

    const role = accountRoleRef.current;
    const companyInfo = role === 'company' ? resolveCompanyInfo() : null;
    const roleLabel = role === 'company' ? 'company' : role === 'user' ? 'user' : 'unknown';
    const notifyPrefix =
      role === 'company' && companyInfo
        ? `[شركة] ${companyInfo.companyName}${companyInfo.license ? ` | ترخيص: ${companyInfo.license}` : ''}`
        : role === 'user'
          ? `[مستخدم] @${fromUsername || fromName || 'user'}`
          : '';
    const notifyText = notifyPrefix ? `${notifyPrefix}\n${text}` : text;

    // Always queue locally so owner inbox can pick it up
    queueSupportTicket({
      fromUserId,
      fromUsername,
      fromName,
      fromEmail,
      text: notifyText || text,
      mediaUrl: payload.mediaUrl,
      mediaType: payload.mediaType,
      lang: langRef.current,
      accountRole: roleLabel,
      companyName: companyInfo?.companyName,
      licenseNumber: companyInfo?.license,
    });

    // Real delivery into the app messaging system → @stooorna (إشعار للدعم)
    try {
      const supportId = await resolveSupportUserId();
      if (supportId) {
        await sendRealChatMessage({
          toUserId: supportId,
          text: notifyText || (payload.mediaType ? `[${payload.mediaType}]` : ''),
          mediaUrl: payload.mediaUrl,
          mediaType: payload.mediaType,
          meta: {
            isSupportTicket: true,
            support: true,
            fromUsername,
            fromName,
            lang: langRef.current,
            accountRole: roleLabel,
            companyName: companyInfo?.companyName,
            licenseNumber: companyInfo?.license,
          },
        });
      }
      // Also try dedicated support route if backend adds it later
      await fetch('/api/support/messages', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: notifyText || text,
          mediaUrl: payload.mediaUrl,
          mediaType: payload.mediaType,
          toUsername: 'stooorna',
          toUserId: supportId,
          fromUserId,
          fromUsername,
          fromName,
          fromEmail,
          lang: langRef.current,
          accountRole: roleLabel,
          companyName: companyInfo?.companyName,
          licenseNumber: companyInfo?.license,
        }),
      }).catch(() => {});
    } catch { /* non-blocking */ }
  }

  async function handleAiTurn(userText: string) {
    if (aiPhaseRef.current === 'human' || aiPhaseRef.current === 'pick_lang' || aiPhaseRef.current === 'ask_role') return;
    const L = SUPPORT_COPY[langRef.current];
    if (BLOCKED_RE.test(userText)) {
      await pushBotTyped(L.blocked);
      return;
    }

    const phase = aiPhaseRef.current;

    if (phase === 'waiting') {
      const cat = classifyListenIntent(userText);
      if (cat !== 'other') {
        setListenCategory(cat);
        setAiPhase('ask_title');
        aiPhaseRef.current = 'ask_title';
        await pushBotTyped(L.askTitle);
        return;
      }
      return;
    }

    if (phase === 'ask_category') {
      const cat = classifyListenIntent(userText);
      if (cat === 'other') {
        await pushBotTyped(L.unavailable);
        return;
      }
      setListenCategory(cat);
      setAiPhase('ask_title');
      aiPhaseRef.current = 'ask_title';
      await pushBotTyped(L.askTitle);
      return;
    }

    if (phase === 'ask_title' || phase === 'playing') {
      const cat = listenCategory || classifyListenIntent(userText);
      if (cat === 'other' && !listenCategory) {
        await pushBotTyped(L.unavailable);
        return;
      }
      const finalCat = (cat === 'other' ? listenCategory : cat) || 'music';
      const track = await resolveAudio(finalCat, userText);
      if (!track) {
        await pushBotTyped(L.notFound);
        return;
      }
      playAudio(track);
      return;
    }
  }

  async function handleSend(textOverride?: string, media?: { url: string; type: 'image' | 'video' | 'file' }) {
    if (!lang || aiPhaseRef.current === 'pick_lang' || aiPhaseRef.current === 'ask_role') return;
    const text = (textOverride ?? input).trim();
    if (!text && !media) return;
    if (sending || isTyping) return;
    setSending(true);
    const userMsg: SupportMsg = {
      id: `u-${Date.now()}`,
      from: 'user',
      text: text || (media?.type === 'image' ? '📷 Image' : media?.type === 'video' ? '🎬 Video' : '📎 File'),
      at: Date.now(),
      mediaUrl: media?.url,
      mediaType: media?.type,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    const nextCount = userMsgCount + 1;
    setUserMsgCount(nextCount);

    await deliverToSupport({
      text: text || undefined,
      mediaUrl: media?.url,
      mediaType: media?.type,
    });

    if (aiPhaseRef.current === 'human') {
      setSending(false);
      return;
    }

    // First user message: waiting line → auto-start calm music
    if (nextCount === 1) {
      setAiPhase('waiting');
      (aiPhaseRef as React.MutableRefObject<AiPhase>).current = 'waiting';
      setSending(false);
      const L = SUPPORT_COPY[langRef.current];
      await pushBotTyped(L.waiting);
      if ((aiPhaseRef as React.MutableRefObject<AiPhase>).current === 'human') return;
      // Auto-play calm background music
      startAutoMusic();
      return;
    }

    if (!text) {
      setSending(false);
      return;
    }

    await handleAiTurn(text);
    setSending(false);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const mediaType: 'image' | 'video' | 'file' = isImage ? 'image' : isVideo ? 'video' : 'file';
    let mediaUrl = '';
    try {
      const r = await fetch('/api/support/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (r.ok) {
        const d = await r.json();
        mediaUrl = d.url || d.mediaUrl || '';
      }
    } catch { /* local preview fallback */ }
    if (!mediaUrl) mediaUrl = URL.createObjectURL(file);
    await handleSend('', { url: mediaUrl, type: mediaType });
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10350,
          background: 'rgba(0,0,0,0.96)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header — slim: avatar + Stooorna stacked title */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            paddingTop: 'max(8px, env(safe-area-inset-top))',
            background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
            borderBottom: '1px solid rgba(0,188,212,0.25)',
            flexShrink: 0,
            minHeight: 52,
          }}
        >
          <button
            onClick={() => {
              stopAiCompletely();
              stopAutoMusic();
              onClose();
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00BCD4', padding: 2, flexShrink: 0 }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #00BCD4 0%, #0288D1 100%)',
                border: '2px solid #00BCD4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#041018',
                fontWeight: 800,
                fontSize: '0.8rem',
                overflow: 'hidden',
              }}
            >
              <img
                src="/api/users/by-username/stooorna/avatar"
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => {
                  const el = e.currentTarget;
                  el.style.display = 'none';
                  if (el.parentElement) el.parentElement.textContent = 'S';
                }}
              />
            </div>
            <span
              title={supportOnline ? 'Online' : 'Offline'}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: supportOnline ? '#22c55e' : '#64748b',
                border: '2px solid #06141c',
                boxShadow: supportOnline ? '0 0 6px rgba(34,197,94,0.7)' : 'none',
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{
              margin: 0,
              color: '#00BCD4',
              fontWeight: 900,
              fontSize: '0.95rem',
              letterSpacing: '0.02em',
              lineHeight: 1.15,
            }}>
              Stooorna
            </p>
            <p style={{
              margin: '1px 0 0',
              color: 'rgba(150,190,190,0.85)',
              fontWeight: 700,
              fontSize: '0.68rem',
              lineHeight: 1.2,
            }}>
              {settings.supportHeader}
            </p>
          </div>
          {/* Auto calm music toggle button */}
          {autoMusicRef.current && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={toggleAutoMusic}
              title={autoMusicPlaying ? 'إيقاف الموسيقى' : 'تشغيل الموسيقى'}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: autoMusicPlaying ? 'rgba(0,188,212,0.22)' : 'rgba(0,188,212,0.08)',
                border: `1px solid ${autoMusicPlaying ? 'rgba(0,188,212,0.6)' : 'rgba(0,188,212,0.25)'}`,
                color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
              }}
              aria-label={autoMusicPlaying ? 'Pause music' : 'Play music'}
            >
              {autoMusicPlaying ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 2 }} />}
            </motion.button>
          )}
          {nowPlaying && aiPhase !== 'human' && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={togglePlayPause}
              title={nowPlaying.title}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(0,188,212,0.18)',
                border: '1px solid rgba(0,188,212,0.45)',
                color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
              }}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 2 }} />}
            </motion.button>
          )}
        </div>

        {/* Messages */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: 'radial-gradient(ellipse 70% 50% at 50% 0%, #0d2a2e 0%, #060e0e 70%)',
          }}
        >
          {/* Language choice — before any AI message (مربعات أصغر) */}
          {!lang && (
            <div style={{
              marginTop: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}>
              <p style={{ margin: 0, color: 'rgba(200,230,230,0.85)', fontSize: '0.8rem', fontWeight: 600 }}>
                {settings.chooseLang}
              </p>
              <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 240 }}>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={() => selectLang('en')}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 10, cursor: 'pointer',
                    background: 'rgba(0,188,212,0.12)', border: '1px solid rgba(0,188,212,0.4)',
                    color: '#00BCD4', fontWeight: 700, fontSize: '0.78rem',
                  }}
                >
                  {settings.langEn}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={() => selectLang('ar')}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 10, cursor: 'pointer',
                    background: 'rgba(0,188,212,0.12)', border: '1px solid rgba(0,188,212,0.4)',
                    color: '#00BCD4', fontWeight: 700, fontSize: '0.78rem',
                  }}
                >
                  {settings.langAr}
                </motion.button>
              </div>
            </div>
          )}

          {/* اختيار مستخدم أو شركة بعد اللغة — أزرار فقط */}
          {lang && aiPhase === 'ask_role' && !accountRole && (
            <div style={{
              marginTop: 8,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}>
              <p style={{ margin: 0, color: 'rgba(200,230,230,0.85)', fontSize: '0.8rem', fontWeight: 600 }}>
                {SUPPORT_COPY[lang].askRole}
              </p>
              <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 280 }}>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={() => void selectRole('user')}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 12, cursor: 'pointer',
                    background: 'rgba(0,188,212,0.12)', border: '1px solid rgba(0,188,212,0.4)',
                    color: '#00BCD4', fontWeight: 800, fontSize: '0.8rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <Users size={14} strokeWidth={2.2} />
                  {SUPPORT_COPY[lang].roleUser}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  onClick={() => void selectRole('company')}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 12, cursor: 'pointer',
                    background: 'rgba(0,188,212,0.12)', border: '1px solid rgba(0,188,212,0.4)',
                    color: '#00BCD4', fontWeight: 800, fontSize: '0.8rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <Building2 size={14} strokeWidth={2.2} />
                  {SUPPORT_COPY[lang].roleCompany}
                </motion.button>
              </div>
            </div>
          )}

          {/* أزرار المساعدة: نسيت كلمة المرور / التحدث لخدمة العملاء */}
          {lang && aiPhase === 'ask_help' && accountRole && (
            <div style={{
              marginTop: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              width: '100%',
              maxWidth: 320,
              alignSelf: 'center',
            }}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => void selectHelpTopic('forgot_pw')}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                  background: 'rgba(0,188,212,0.14)', border: '1px solid rgba(0,188,212,0.45)',
                  color: '#00BCD4', fontWeight: 800, fontSize: '0.84rem',
                  textAlign: 'center',
                }}
              >
                {SUPPORT_COPY[lang].btnForgotPw}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => void selectHelpTopic('talk_support')}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                  background: 'rgba(0,188,212,0.14)', border: '1px solid rgba(0,188,212,0.45)',
                  color: '#00BCD4', fontWeight: 800, fontSize: '0.84rem',
                  textAlign: 'center',
                }}
              >
                {SUPPORT_COPY[lang].btnTalkSupport}
              </motion.button>
            </div>
          )}

          {messages.map(m => {
            const isUser = m.from === 'user';
            const isSupport = m.from === 'support';
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {isSupport && (
                  <span style={{ fontSize: '0.62rem', color: '#00BCD4', fontWeight: 700, paddingInline: 4 }}>
                    Support
                  </span>
                )}
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: isUser
                      ? 'linear-gradient(135deg, rgba(0,188,212,0.28), rgba(0,120,180,0.22))'
                      : isSupport
                        ? 'rgba(34,197,94,0.12)'
                        : 'rgba(0,188,212,0.1)',
                    border: `1px solid ${isUser ? 'rgba(0,188,212,0.45)' : isSupport ? 'rgba(34,197,94,0.4)' : 'rgba(0,188,212,0.22)'}`,
                    color: 'rgba(200,230,230,0.95)',
                    fontSize: '0.84rem',
                    lineHeight: 1.55,
                    direction: (lang ?? 'ar') === 'ar' ? 'rtl' : 'ltr',
                    textAlign: (lang ?? 'ar') === 'ar' ? 'right' : 'left',
                    minHeight: m.from === 'bot' && !m.text ? 20 : undefined,
                  }}
                >
                  {m.mediaUrl && m.mediaType === 'image' && (
                    <img
                      src={m.mediaUrl}
                      alt=""
                      style={{ width: '100%', borderRadius: 10, marginBottom: m.text ? 8 : 0, display: 'block' }}
                    />
                  )}
                  {m.mediaUrl && m.mediaType === 'video' && (
                    <video
                      src={m.mediaUrl}
                      controls
                      playsInline
                      style={{ width: '100%', borderRadius: 10, marginBottom: m.text ? 8 : 0, display: 'block' }}
                    />
                  )}
                  {m.mediaUrl && m.mediaType === 'file' && (
                    <a
                      href={m.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#00BCD4', fontSize: '0.8rem', display: 'block', marginBottom: m.text ? 6 : 0 }}
                    >
                      📎 Attachment
                    </a>
                  )}
                  {m.text}
                </div>
              </div>
            );
          })}

          {/* Typing indicator above AI stream */}
          {isTyping && (
            <div style={{ alignSelf: 'flex-start', padding: '4px 8px' }}>
              <span style={{
                color: 'rgba(0,188,212,0.85)',
                fontSize: '0.75rem',
                fontWeight: 600,
                fontStyle: 'italic',
                letterSpacing: '0.04em',
              }}>
                Type...
              </span>
            </div>
          )}
        </div>

        {/* Composer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 8,
            padding: '10px 12px',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            background: 'rgba(6,14,14,0.96)',
            borderTop: '1px solid rgba(0,188,212,0.2)',
            flexShrink: 0,
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx,.zip,.txt"
            style={{ display: 'none' }}
            onChange={onPickFile}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="button"
            onClick={() => fileRef.current?.click()}
            title={copy.attach}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              flexShrink: 0,
              background: 'rgba(0,188,212,0.12)',
              border: '1px solid rgba(0,188,212,0.35)',
              color: '#00BCD4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Plus size={20} strokeWidth={2.4} />
          </motion.button>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value.slice(0, 2000))}
            placeholder={!lang ? 'English / العربية' : copy.placeholder}
            rows={1}
            disabled={!lang || isTyping}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            style={{
              flex: 1,
              resize: 'none',
              minHeight: 40,
              maxHeight: 120,
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(0,188,212,0.06)',
              border: '1px solid rgba(0,188,212,0.22)',
              color: 'rgba(200,230,230,0.95)',
              fontSize: '0.88rem',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.4,
              direction: (lang ?? 'ar') === 'ar' ? 'rtl' : 'ltr',
              opacity: !lang ? 0.5 : 1,
            }}
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="button"
            disabled={!lang || sending || isTyping || !input.trim()}
            onClick={() => handleSend()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              flexShrink: 0,
              background: input.trim() ? 'rgba(0,188,212,0.25)' : 'rgba(0,188,212,0.06)',
              border: `1px solid ${input.trim() ? 'rgba(0,188,212,0.55)' : 'rgba(0,188,212,0.15)'}`,
              color: input.trim() ? '#00BCD4' : 'rgba(150,190,190,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: input.trim() ? 'pointer' : 'default',
            }}
          >
            <Send size={18} />
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Owner support thread (Stooorna inbox → chat with a user) ─────────────────
function OwnerSupportThread({
  peer,
  onClose,
  currentUser,
}: {
  peer: {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    online?: boolean;
    lastIp?: string | null;
    country?: string | null;
  };
  onClose: () => void;
  currentUser: { id?: string; name?: string | null; username?: string | null; email?: string | null } | null;
}) {
  type Msg = { id: string; from: 'user' | 'support' | 'me'; text: string; at: number; mediaUrl?: string; mediaType?: string };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [taskDone, setTaskDone] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [ttlLeft, setTtlLeft] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const displayName = peer.name || peer.username || 'User';

  // Persist messages while thread is open (survive leave/re-enter until TTL)
  useEffect(() => {
    if (!messages.length) return;
    saveSupportThread(
      peer.id,
      messages.map(m => ({
        id: m.id,
        from: m.from,
        text: m.text,
        at: m.at,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
      })),
      taskDone && expiresAt ? { completedAt: expiresAt - SUPPORT_CHAT_TTL_MS } : undefined,
    );
  }, [messages, peer.id, taskDone, expiresAt]);

  // Countdown + auto wipe after 10 minutes
  useEffect(() => {
    const tick = () => {
      const stored = loadSupportThread(peer.id);
      if (stored?.expiresAt) {
        setExpiresAt(stored.expiresAt);
        const left = stored.expiresAt - Date.now();
        setTtlLeft(Math.max(0, left));
        if (left <= 0) {
          clearSupportThread(peer.id);
          setMessages([]);
          setTaskDone(false);
          setExpiresAt(null);
          setTtlLeft(null);
        }
      } else if (!taskDone) {
        // keep a rolling 10-min window from last activity when not completed
        setTtlLeft(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);

    // Listen for server-pushed clear event (owner marked task done)
    const onClear = (e: Event) => {
      const detail = (e as CustomEvent).detail as { cleared?: boolean; all?: boolean; targetUserId?: string | null };
      // For the user side: detail.all=true, no targetUserId
      // For the owner side: detail.targetUserId matches the peer we're chatting with
      const isForThisThread = detail?.cleared && (detail.all && !detail.targetUserId || detail.targetUserId === peer.id);
      if (isForThisThread) {
        clearSupportThread(peer.id);
        setMessages([]);
        setTaskDone(false);
        setExpiresAt(null);
        setTtlLeft(null);
      }
    };
    window.addEventListener('stooorna:support-thread', onClear);

    return () => {
      clearInterval(id);
      window.removeEventListener('stooorna:support-thread', onClear);
    };
  }, [peer.id, taskDone, messages.length]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Local persisted thread first (survives leave for up to 10 min)
        const stored = loadSupportThread(peer.id);
        if (stored?.messages?.length) {
          if (!cancelled) {
            setMessages(stored.messages.map(m => ({
              id: m.id,
              from: (m.from === 'me' || m.from === 'support' || m.from === 'agent') ? 'me' : 'user',
              text: m.text,
              at: m.at,
              mediaUrl: m.mediaUrl,
              mediaType: m.mediaType,
            })));
            if (stored.completedAt) setTaskDone(true);
            if (stored.expiresAt) setExpiresAt(stored.expiresAt);
          }
        }

        const endpoints = [
          `/api/messages?with=${encodeURIComponent(peer.id)}`,
          `/api/messages?userId=${encodeURIComponent(peer.id)}`,
          `/api/messages?peerId=${encodeURIComponent(peer.id)}`,
          `/api/support/messages?with=${encodeURIComponent(peer.id)}`,
        ];
        let list: any[] = [];
        for (const url of endpoints) {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) continue;
            const d = await r.json();
            list = Array.isArray(d) ? d : (d.messages || d.items || []);
            if (list.length) break;
          } catch { /* next */ }
        }
        const local = readLocalSupportTickets().filter(
          t => t.fromUserId === peer.id || t.fromUsername === peer.username,
        );
        if (!list.length && local.length) {
          list = local.map(t => ({
            id: t.id,
            from: 'user',
            text: t.text,
            at: t.at,
            mediaUrl: t.mediaUrl,
          }));
        }
        if (cancelled || !list.length) return;
        const mapped: Msg[] = list.map((m: any) => ({
          id: String(m.id ?? m._id ?? Math.random()),
          from: (m.from === 'support' || m.from === 'agent' || m.fromUserId === currentUser?.id || m.senderId === currentUser?.id || m.me)
            ? 'me'
            : 'user',
          text: m.text || m.content || m.body || m.message || '',
          at: m.at ? new Date(m.at).getTime() : (m.createdAt ? new Date(m.createdAt).getTime() : Date.now()),
          mediaUrl: m.mediaUrl,
          mediaType: m.mediaType,
        }));
        setMessages(prev => {
          // merge by id, prefer longer history
          const byId = new Map<string, Msg>();
          [...prev, ...mapped].forEach(m => byId.set(m.id, m));
          return Array.from(byId.values()).sort((a, b) => a.at - b.at);
        });
      } catch { /* silent */ }
    }
    load();
    const id = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [peer.id, peer.username, currentUser?.id]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function markTaskDone() {
    if (taskDone || sending) return;
    if (!window.confirm('تأكيد: تم تنفيذ الطلب؟ سيُرسل شكر للمستخدم وتُحذف المحادثة بعد 10 دقائق.')) return;
    setSending(true);
    const completedAt = Date.now();
    const doneMsg: Msg = {
      id: `done-${completedAt}`,
      from: 'me',
      text: SUPPORT_TASK_DONE_MSG,
      at: completedAt,
    };
    setMessages(prev => {
      const next = [...prev, doneMsg];
      saveSupportThread(
        peer.id,
        next.map(m => ({ id: m.id, from: m.from, text: m.text, at: m.at, mediaUrl: m.mediaUrl, mediaType: m.mediaType })),
        { completedAt },
      );
      return next;
    });
    setTaskDone(true);
    setExpiresAt(completedAt + SUPPORT_CHAT_TTL_MS);
    await notifySupportThreadComplete(peer.id);
    setSending(false);
  }

  async function send(textOverride?: string, media?: { url: string; type: string }) {
    const text = (textOverride ?? input).trim();
    if (!text && !media) return;
    if (sending) return;
    setSending(true);
    const local: Msg = {
      id: `local-${Date.now()}`,
      from: 'me',
      text: text || (media?.type === 'image' ? '📷' : '📎'),
      at: Date.now(),
      mediaUrl: media?.url,
      mediaType: media?.type,
    };
    setMessages(prev => [...prev, local]);
    setInput('');
    // refresh TTL while conversation is active (unless already marked done)
    if (!taskDone) {
      saveSupportThread(
        peer.id,
        [...messages, local].map(m => ({ id: m.id, from: m.from, text: m.text, at: m.at, mediaUrl: m.mediaUrl, mediaType: m.mediaType })),
        { resetTtl: true },
      );
    }
    try {
      await sendRealChatMessage({
        toUserId: peer.id,
        text: text || (media?.type ? `[${media.type}]` : ''),
        mediaUrl: media?.url,
        mediaType: media?.type,
        meta: { fromRole: 'support', isSupportReply: true },
      });
    } catch { /* silent */ }
    setSending(false);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const mediaType = isImage ? 'image' : isVideo ? 'video' : 'file';
    let mediaUrl = '';
    try {
      const r = await fetch('/api/support/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (r.ok) {
        const d = await r.json();
        mediaUrl = d.url || d.mediaUrl || '';
      }
    } catch { /* */ }
    if (!mediaUrl) mediaUrl = URL.createObjectURL(file);
    await send('', { url: mediaUrl, type: mediaType });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10360,
        background: 'rgba(0,0,0,0.96)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Slim header: avatar + name + online + open profile */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
          borderBottom: '1px solid rgba(0,188,212,0.25)',
          flexShrink: 0,
          minHeight: 52,
        }}
      >
        <button onClick={() => { onClose(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--primary))', padding: 2 }} aria-label="Close">
          <X size={20} />
        </button>
        <button
          type="button"
          onClick={() => {
            // البروفايل الجديد (بث / منشورات) وليس صفحة /u/ القديمة
            const q = new URLSearchParams();
            q.set('openProfile', peer.id);
            if (peer.name) q.set('openProfileName', peer.name);
            if (peer.username) q.set('openProfileUsername', peer.username);
            if (peer.avatarUrl) q.set('openProfileAvatar', peer.avatarUrl);
            window.location.href = `/add-friend?${q.toString()}`;
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flex: 1,
            minWidth: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
          }}
        >
          <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
              background: 'rgba(0,188,212,0.2)', border: '2px solid rgba(0,188,212,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00BCD4', fontWeight: 700, fontSize: '0.75rem',
            }}>
              {peer.avatarUrl
                ? <img src={peer.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (displayName[0] || '?').toUpperCase()}
            </div>
            <span style={{
              position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%',
              background: peer.online ? '#22c55e' : '#64748b',
              border: '2px solid #06141c',
            }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, color: '#00BCD4', fontWeight: 800, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </p>
            <p style={{ margin: 0, color: 'rgba(150,190,190,0.7)', fontSize: '0.62rem' }}>
              {peer.online ? 'Online' : 'Offline'}
              {peer.username ? ` · @${peer.username}` : ''}
              {peer.lastIp ? ` · IP ${peer.lastIp}` : ''}
              {peer.country ? ` · ${peer.country}` : ''}
            </p>
          </div>
        </button>
      </div>

      {/* Task complete (red) + 10-min delete timer */}
      <div style={{
        flexShrink: 0,
        padding: '8px 12px',
        borderBottom: '1px solid rgba(239,68,68,0.2)',
        background: 'rgba(20,8,10,0.9)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          disabled={taskDone || sending}
          onClick={markTaskDone}
          style={{
            width: '100%',
            padding: '11px 12px',
            borderRadius: 12,
            border: '1.5px solid rgba(239,68,68,0.65)',
            background: taskDone ? 'rgba(239,68,68,0.15)' : 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            color: '#fff',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: taskDone ? 'default' : 'pointer',
            opacity: taskDone ? 0.75 : 1,
            boxShadow: taskDone ? 'none' : '0 0 14px rgba(239,68,68,0.35)',
          }}
        >
          {taskDone ? settings.taskDone : settings.taskDoneSimple}
        </motion.button>
        {ttlLeft != null && ttlLeft > 0 && (
          <p style={{ margin: 0, textAlign: 'center', color: 'rgba(252,165,165,0.85)', fontSize: '0.68rem' }}>
            {settings.deleteCountdown} {Math.floor(ttlLeft / 60000)}:{String(Math.floor((ttlLeft % 60000) / 1000)).padStart(2, '0')}
          </p>
        )}
      </div>

      <div ref={listRef} style={{
        flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10,
        background: 'radial-gradient(ellipse 70% 50% at 50% 0%, #0d2a2e 0%, #060e0e 70%)',
      }}>
        {messages.map(m => {
          const mine = m.from === 'me' || m.from === 'support';
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
              <div style={{
                padding: '10px 14px',
                borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: mine ? 'linear-gradient(135deg, rgba(0,188,212,0.28), rgba(0,120,180,0.22))' : 'rgba(0,188,212,0.1)',
                border: `1px solid ${mine ? 'rgba(0,188,212,0.45)' : 'rgba(0,188,212,0.22)'}`,
                color: 'rgba(200,230,230,0.95)',
                fontSize: '0.84rem',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
              }}>
                {m.mediaUrl && m.mediaType === 'image' && (
                  <img src={m.mediaUrl} alt="" style={{ width: '100%', borderRadius: 10, marginBottom: m.text ? 8 : 0, display: 'block' }} />
                )}
                {m.text}
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p style={{ color: 'rgba(150,190,190,0.5)', fontSize: '0.8rem', textAlign: 'center', marginTop: 40 }}>
            {settings.noMessages}
          </p>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 12px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        background: 'rgba(6,14,14,0.96)', borderTop: '1px solid rgba(0,188,212,0.2)', flexShrink: 0,
      }}>
        <input ref={fileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.zip,.txt" style={{ display: 'none' }} onChange={onPickFile} />
        <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => fileRef.current?.click()} style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: 'rgba(0,188,212,0.12)', border: '1px solid rgba(0,188,212,0.35)', color: '#00BCD4',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <Plus size={20} strokeWidth={2.4} />
        </motion.button>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value.slice(0, 2000))}
          placeholder={settings.supportReplyPlaceholder}
          rows={1}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          style={{
            flex: 1, resize: 'none', minHeight: 40, maxHeight: 120, padding: '10px 12px', borderRadius: 12,
            background: 'rgba(0,188,212,0.06)', border: '1px solid rgba(0,188,212,0.22)',
            color: 'rgba(200,230,230,0.95)', fontSize: '0.88rem', outline: 'none', fontFamily: 'var(--font-sans)', lineHeight: 1.4,
          }}
        />
        <motion.button whileTap={{ scale: 0.9 }} type="button" disabled={sending || !input.trim()} onClick={() => send()} style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: input.trim() ? 'rgba(0,188,212,0.25)' : 'rgba(0,188,212,0.06)',
          border: `1px solid ${input.trim() ? 'rgba(0,188,212,0.55)' : 'rgba(0,188,212,0.15)'}`,
          color: input.trim() ? '#00BCD4' : 'rgba(150,190,190,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default',
        }}>
          <Send size={18} />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Auth screen (shown when not logged in) ───────────────────────────────────
function AuthScreen({ T }: { T: Record<string, string> }) {
  type AuthMode = 'login' | 'register';
  type AccountKind = 'personal' | 'company';
  // AuthLang imported from @/lib/auth-copy
  const [mode, setMode] = useState<AuthMode>('login');
    // تحرير اليوزرات المحذوفة سابقاً (مرة واحدة) لإعادة التسجيل
  useEffect(() => {
    try {
      ensureDeletedUsersResetOnce();
      clearAllDeletedUsers();
      localStorage.removeItem('stooorna_deleted_users');
    } catch { /* */ }
  }, []);

  const [accountKind, setAccountKind] = useState<AccountKind>('personal');
  /** لغة شاشة الدخول/التسجيل فقط (عربي افتراضي — إنجليزي اختياري) */
  const [authLang, setAuthLang] = useState<AuthLang>(() => {
    try {
      const s = localStorage.getItem('stooorna_auth_lang');
      return s === 'en' ? 'en' : 'ar';
    } catch { return 'ar'; }
  });
  function setAuthLanguage(next: AuthLang) {
    setAuthLang(next);
    try { localStorage.setItem('stooorna_auth_lang', next); } catch { /* */ }
  }
  const L = getAuthCopy(authLang);
  const isEn = authLang === 'en';
  const dir = isEn ? 'ltr' : 'rtl';

  // Personal fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Company registration fields
  const [companyName, setCompanyName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [tradeLicenseNumber, setTradeLicenseNumber] = useState('');
  const [commercialRegFile, setCommercialRegFile] = useState<{ dataUrl: string; name: string } | null>(null);
  const [tradeLicenseFile, setTradeLicenseFile] = useState<{ dataUrl: string; name: string } | null>(null);
  // حالة فحص الشهادتين بالذكاء الاصطناعي: idle (لم يُرفع شيء بعد) | checking (جاري الفحص) | valid (تم التحقق ومطابقة الرقم) | invalid (شهادة غير صحيحة أو لا تطابق الرقم)
  const [commercialRegVerify, setCommercialRegVerify] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [tradeLicenseVerify, setTradeLicenseVerify] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  // السبب الفعلي المُرجَع من السيرفر عند الرفض — يُعرض تحت الحقل مباشرة بدل نص عام ثابت،
  // حتى يبين سبب الرفض الحقيقي (مثلاً: خطأ سيرفر، مفتاح API غير مركّب، أو عدم تطابق فعلي)
  const [commercialRegVerifyMessage, setCommercialRegVerifyMessage] = useState('');
  const [tradeLicenseVerifyMessage, setTradeLicenseVerifyMessage] = useState('');
  // AI-extracted fields shown under each certificate after verification
  const [commercialRegMeta, setCommercialRegMeta] = useState<{
    extractedNumber?: string | null;
    extractedExpiryDate?: string | null;
    isExpired?: boolean;
    numbersMatch?: boolean;
  } | null>(null);
  const [tradeLicenseMeta, setTradeLicenseMeta] = useState<{
    extractedNumber?: string | null;
    extractedExpiryDate?: string | null;
    isExpired?: boolean;
    numbersMatch?: boolean;
  } | null>(null);
  const [companySector, setCompanySector] = useState('');
  const [companySectorCustom, setCompanySectorCustom] = useState('');
  const [sectorOpen, setSectorOpen] = useState(false);
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyPhone2, setCompanyPhone2] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companyPendingMsg, setCompanyPendingMsg] = useState('');

  function resetFormErrors() {
    setError('');
    setCompanyPendingMsg('');
  }

  // إذا غيّر المستخدم رقم السجل التجاري بعد أن فحصنا الشهادة، لازم يعيد الرفع/الفحص من جديد
  useEffect(() => {
    if (commercialRegVerify !== 'idle') {
      setCommercialRegVerify('idle');
      setCommercialRegFile(null);
      setCommercialRegVerifyMessage('');
      setCommercialRegMeta(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licenseNumber]);

  // نفس الشيء لرقم الترخيص التجاري
  useEffect(() => {
    if (tradeLicenseVerify !== 'idle') {
      setTradeLicenseVerify('idle');
      setTradeLicenseFile(null);
      setTradeLicenseVerifyMessage('');
      setTradeLicenseMeta(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeLicenseNumber]);

  /**
   * يرفع الشهادة (سجل تجاري أو ترخيص تجاري) لخدمة الفحص بالذكاء الاصطناعي بالسيرفر،
   * ويتأكد أنها شهادة فعلية وأن الرقم المكتوب فيها يطابق الرقم الذي أدخله المستخدم.
   * الفحص الفعلي (قراءة الشهادة بالـ AI) يتم في السيرفر عبر /api/company/verify-certificate.
   */
  async function verifyCertificateFile(
    file: File,
    _documentType: 'commercial_registry' | 'trade_license',
    _expectedNumber: string,
  ): Promise<{
    valid: boolean;
    dataUrl: string;
    message?: string;
    extractedNumber?: string | null;
    extractedExpiryDate?: string | null;
    isExpired?: boolean;
    numbersMatch?: boolean;
    isCertificate?: boolean;
  }> {
    // Manual review flow: accept upload locally. Owner reviews certificates in settings.
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target?.result as string);
      reader.onerror = () => reject(new Error('file-read-failed'));
      reader.readAsDataURL(file);
    });
    const maxBytes = 12 * 1024 * 1024;
    if (dataUrl.length > maxBytes) {
      return {
        valid: false,
        dataUrl,
        message: authLang === 'en' ? 'File is too large' : 'الملف كبير جداً',
      };
    }
    const okType = file.type.startsWith('image/') || file.type === 'application/pdf' || /\.(png|jpe?g|gif|webp|pdf)$/i.test(file.name);
    if (!okType) {
      return {
        valid: false,
        dataUrl,
        message: authLang === 'en' ? 'Only image or PDF is accepted' : 'يُقبل صورة أو PDF فقط',
      };
    }
    return {
      valid: true,
      dataUrl,
      isCertificate: true,
      numbersMatch: true,
      isExpired: false,
      extractedNumber: null,
      extractedExpiryDate: null,
    };
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    resetFormErrors();
    setConfirmPassword('');
    setConfirmEmail('');
    setUsernameStatus('idle');
    if (next === 'login') setAccountKind('personal');
  }

  function switchKind(next: AccountKind) {
    setAccountKind(next);
    resetFormErrors();
    setConfirmPassword('');
    setConfirmEmail('');
    setUsernameStatus('idle');
  }

  /** تحقق مباشر من توفر اليوزر */
  async function checkUsernameAvailable(raw: string): Promise<'available' | 'taken' | 'invalid'> {
    const u = raw.trim().replace(/^@/, '');
    if (!u || !/^[a-zA-Z0-9_]{2,30}$/.test(u)) return 'invalid';
    if (isUsernameFreed(u) || isUserDeleted({ username: u })) return 'available';
    // تحقق محلي من سجل الشركات — تجاهل المحذوف/المحرر
    try {
      const reg = loadCompaniesRegistry();
      if (reg.some(c => (c.username || '').toLowerCase() === u.toLowerCase() && !isUserDeleted(c) && !isUsernameFreed(c.username))) return 'taken';
    } catch { /* */ }
    try {
      const chk = await fetch(`/api/users/check-username?username=${encodeURIComponent(u)}`, { credentials: 'include' });
      if (chk.ok) {
        const d = await chk.json();
        if (d && d.available === false) return 'taken';
        if (d && d.available === true) return 'available';
      }
    } catch { /* */ }
    // fallback: by-username
    try {
      const r = await fetch(`/api/users/by-username/${encodeURIComponent(u)}`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        if (d && (d.id || d.user?.id || d.username)) {
          if (isUsernameFreed(u) || isUserDeleted({ username: u, id: d.id || d.user?.id, email: d.email || d.user?.email })) return 'available';
          return 'taken';
        }
      }
      if (r.status === 404) return 'available';
    } catch { /* */ }
    return 'available';
  }

  // debounce تحقق اليوزر أثناء الكتابة
  useEffect(() => {
    if (mode !== 'register') {
      setUsernameStatus('idle');
      return;
    }
    const u = username.trim().replace(/^@/, '');
    if (!u) {
      setUsernameStatus('idle');
      return;
    }
    if (!/^[a-zA-Z0-9_]{2,30}$/.test(u)) {
      setUsernameStatus('invalid');
      return;
    }
    setUsernameStatus('checking');
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const st = await checkUsernameAvailable(u);
      if (!cancelled) setUsernameStatus(st);
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [username, mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const rawId = email.trim().replace(/^@/, '');
    if (!rawId || !password) {
      setError(L.enterEmailPw);
      return;
    }
    // الدخول والتسجيل بالإيميل فقط
    if (!rawId.includes('@')) {
      setError(authLang === 'en' ? 'Enter a valid email address' : 'أدخل بريداً إلكترونياً صالحاً');
      return;
    }
    const em = rawId.toLowerCase();
    if (!em || !password) {
      setError(L.enterEmailPw);
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError(L.pwMismatch);
        return;
      }
      if (password.length < 8) {
        setError(L.pwShort);
        return;
      }
      // اليوزرنيم مطلوب للأفراد والشركات عند التسجيل
      {
        const uname = username.trim().replace(/^@/, '');
        if (!uname) {
          setError(L.needUsername);
          return;
        }
        if (!/^[a-zA-Z0-9_]{2,30}$/.test(uname)) {
          setError(L.userFmt);
          return;
        }
        const unStatus = await checkUsernameAvailable(uname);
        if (unStatus === 'taken') {
          setError(L.userTaken);
          setUsernameStatus('taken');
          return;
        }
        if (unStatus === 'invalid') {
          setError(L.userFmt);
          setUsernameStatus('invalid');
          return;
        }
      }

      if (accountKind === 'company') {
        if (!companyName.trim()) {
          setError(L.needCompanyName);
          return;
        }
        if (!tradeName.trim()) {
          setError(L.needTradeName);
          return;
        }
        if (!ownerName.trim()) {
          setError(L.needOwnerName);
          return;
        }
        if (commercialRegVerify === 'checking' || tradeLicenseVerify === 'checking') {
          setError(authLang === 'en' ? 'Please wait until certificates finish uploading' : 'انتظر حتى ينتهي رفع الشهادات');
          return;
        }
        if (!commercialRegFile || commercialRegVerify !== 'valid') {
          setError(authLang === 'en'
            ? 'Please upload the commercial registration certificate'
            : 'يجب رفع شهادة السجل التجاري لإتمام التسجيل');
          return;
        }
        if (!tradeLicenseFile || tradeLicenseVerify !== 'valid') {
          setError(authLang === 'en'
            ? 'Please upload the trade license certificate'
            : 'يجب رفع شهادة الترخيص التجاري لإتمام التسجيل');
          return;
        }
        if (!companySector.trim() && !companySectorCustom.trim()) {
          setError(L.needSector);
          return;
        }
        const phoneNorm = companyPhone.replace(/[\s\-()]/g, '').trim();
        if (!phoneNorm) {
          setError(L.needPhone);
          return;
        }
        if (!/^\+?[0-9]{8,15}$/.test(phoneNorm)) {
          setError('رقم الهاتف غير صالح — أدخل رقماً صحيحاً (8–15 رقماً)');
          return;
        }
        if (companyPhone2.trim()) {
          const altNorm = companyPhone2.replace(/[\s\-()]/g, '').trim();
          if (altNorm && !/^\+?[0-9]{8,15}$/.test(altNorm)) {
            setError('رقم الهاتف البديل غير صالح');
            return;
          }
        }
        if (em !== confirmEmail.trim().toLowerCase()) {
          setError('البريد الإلكتروني وتأكيده غير متطابقين');
          return;
        }
      } else {
        if (!name.trim()) {
          setError(L.needName);
          return;
        }
      }
    }

    setLoading(true);
    try {
      // تم إلغاء حظر اليوزرات المحذوفة — يمكن إعادة إنشاء الحساب بنفس اليوزر/الإيميل
      try { ensureDeletedUsersResetOnce(); } catch { /* */ }
      if (mode === 'login') {
        const reg = findCompanyByEmail(em);
        // دخول موحّد: إيميل شركة → مسار الشركات، وإلا أفراد
        const treatAsCompany = !!reg || accountKind === 'company';

        // ── Company account login ──
        if (treatAsCompany) {
          let companyReg = reg;
          const remembered = getRememberedCompanyStatus(em);
          if (remembered === 'active' || companyReg?.status === 'active') {
            try { restoreDeletedUser({ id: companyReg?.userId || companyReg?.id, email: em, username: companyReg?.username }); } catch { /* */ }
            companyReg = findCompanyByEmail(em) || companyReg;
          }
          const remote = await fetchCompanyStatusFromServer(em);
          // Priority: any "active" wins; then local remembered; then remote; then registry.
          // Never let a stale remote "pending" override a local admin Approve.
          let resolved: CompanyRegStatus | null = null;
          const sources: Array<CompanyRegStatus | null | undefined> = [
            remembered,
            companyReg?.status,
            remote,
          ];
          if (sources.some(s => s === 'active')) resolved = 'active';
          else if (sources.some(s => s === 'inactive')) resolved = 'inactive';
          else if (remembered) resolved = remembered;
          else if (companyReg?.status) resolved = companyReg.status;
          else if (remote) resolved = remote;

          if (companyReg && resolved && companyReg.status !== resolved) {
            setCompanyRegStatus(companyReg.id, resolved);
            companyReg = { ...companyReg, status: resolved };
          }
          if (!companyReg && resolved === 'active') {
            companyReg = {
              id: `co-${em}`,
              companyName: em,
              tradeName: '',
              ownerName: '',
              licenseNumber: '',
              phone: '',
              email: em,
              status: 'active',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            upsertCompanyRegistration(companyReg);
          }
          if (!companyReg) {
            const tryRemote = await signIn.email({ email: em, password });
            if (!(tryRemote as { error?: unknown })?.error) {
              rememberCompanyActivation(em, 'active');
              try { setSessionAccountKind('company'); } catch { /* */ }
              setLoading(false);
              return;
            }
            setError(
              'هذا الحساب ليس حساب شركة. سجّل الدخول من قسم الأفراد.',
            );
            setLoading(false);
            return;
          }
          if (companyReg.status === 'pending') {
            // Owner may have approved on another device — try real auth first
            const tryPending = await signIn.email({ email: em, password });
            if (!(tryPending as { error?: unknown })?.error) {
              setCompanyRegStatus(companyReg.id, 'active');
              rememberCompanyActivation(em, 'active');
              try { setSessionAccountKind('company'); } catch { /* */ }
              setLoading(false);
              return;
            }
            // Also try stored password from registration
            if (companyReg.password && companyReg.password !== password) {
              const tryStored = await signIn.email({ email: em, password: companyReg.password });
              if (!(tryStored as { error?: unknown })?.error) {
                setCompanyRegStatus(companyReg.id, 'active');
                rememberCompanyActivation(em, 'active');
                try { setSessionAccountKind('company'); } catch { /* */ }
                setLoading(false);
                return;
              }
            }
            setError('طلبكم قيد المراجعة — سوف يتم الاتصال بكم قريباً');
            setCompanyPendingMsg('سوف يتم الاتصال بكم قريباً');
            setLoading(false);
            return;
          }
          if (companyReg.status === 'inactive') {
            setError('حساب الشركة غير مفعّل — تواصل مع الإدارة');
            setLoading(false);
            return;
          }
          // active: sign in, or create auth user then sign in
          if (companyReg.status === 'active') {
            const regRow = companyReg;
            // Approved companies must never stay soft-deleted
            try { restoreDeletedUser({ id: regRow.userId || regRow.id, email: em, username: regRow.username }); } catch { /* */ }
            rememberCompanyActivation(em, 'active');
            try { await pushCompanyStatusToServer({ ...regRow, status: 'active' }, 'active'); } catch { /* */ }
            const notice = getCompanyNotice(em);
            if (notice) setCompanyPendingMsg(notice);
            const pwCandidates = Array.from(new Set(
              [password, regRow.password].filter((p): p is string => !!p && String(p).length > 0).map(String)
            ));
            if (pwCandidates.length === 0 && password) pwCandidates.push(password);
            try {
              const finishOk = async () => {
                rememberCompanyActivation(em, 'active');
                try { setSessionAccountKind('company'); } catch { /* */ }
                setError('');
                setCompanyPendingMsg('');
                setLoading(false);
              };
              // 1) Try sign-in with each known password
              for (const pw of pwCandidates) {
                const trySignIn = await signIn.email({ email: em, password: pw });
                if (!(trySignIn as { error?: unknown })?.error) {
                  await finishOk();
                  return;
                }
              }
              // 2) Create auth account then sign in (first login after Approve)
              const displayName = regRow.companyName || regRow.ownerName || em;
              const pwForCreate = pwCandidates[0] || password || `Co${Date.now().toString(36)}A1`;
              // Persist password used so later logins work on this device
              try {
                upsertCompanyRegistration({ ...regRow, password: pwForCreate, status: 'active' });
              } catch { /* */ }
              const up = await signUp.email({
                name: displayName,
                email: em,
                password: pwForCreate,
                ...({ username: (regRow.username || '').replace(/^@/, '') || undefined } as any),
              } as any);
              if (!(up as { error?: unknown })?.error) {
                const after = await signIn.email({ email: em, password: pwForCreate });
                if (!(after as { error?: unknown })?.error) {
                  await finishOk();
                  return;
                }
              }
              // 3) Existing account — retry passwords + force provision helper
              for (const pw of pwCandidates) {
                const res2 = await signIn.email({ email: em, password: pw });
                if (!(res2 as { error?: unknown })?.error) {
                  await finishOk();
                  return;
                }
              }
              try {
                await provisionCompanyAuthAccount({ ...regRow, password: pwForCreate, status: 'active' });
                const res3 = await signIn.email({ email: em, password: pwForCreate });
                if (!(res3 as { error?: unknown })?.error) {
                  await finishOk();
                  return;
                }
              } catch { /* */ }
              // 4) Last resort: sign in with the password the user typed now
              if (password) {
                const res4 = await signIn.email({ email: em, password });
                if (!(res4 as { error?: unknown })?.error) {
                  await finishOk();
                  return;
                }
              }
              setError(
                (up as { error?: { message?: string } })?.error?.message
                || 'Login failed — use the same password from company registration'
              );
              setLoading(false);
              return;
            } catch (err) {
              setError(String(err));
              setLoading(false);
              return;
            }
          }
        }

        // ── دخول أفراد عادي ──
        const res = await signIn.email({ email: em, password });
        if ((res as { error?: { message?: string } })?.error) {
          setError((res as { error?: { message?: string } }).error?.message || 'فشل تسجيل الدخول');
        } else if (accountKind === 'personal') {
          try { setSessionAccountKind('personal'); } catch { /* */ }
          // تحقق إضافي من السيرفر: إن كان الحساب شركة أخرج وأظهر تنبيهاً
          try {
            const me = await fetch('/api/users/me', { credentials: 'include' });
            if (me.ok) {
              const d = await me.json();
              const u = d.user || d;
              const isCo =
                String(u.accountType || u.type || u.role || '').toLowerCase() === 'company' ||
                u.isCompany === true ||
                !!findCompanyByEmail(em);
              if (isCo || findCompanyByEmail(em)) {
                try { await signOut(); } catch { /* ignore */ }
                setError(
                  'هذا الحساب خاص بالشركات وليس للأفراد. يرجى المحاولة وتسجيل الدخول من قسم الشركات.',
                );
                setCompanyPendingMsg(
                  'حساب شركات — استخدم تبويب «شركات» لتسجيل الدخول',
                );
              }
            }
          } catch { /* ignore */ }
        }
      } else if (accountKind === 'personal') {
        if (findCompanyByEmail(em)) {
          setError(
            'هذا البريد مسجّل كحساب شركة. يرجى استخدام قسم الشركات.',
          );
          setCompanyPendingMsg(
            'حساب شركات — استخدم تبويب «شركات»',
          );
          setLoading(false);
          return;
        }
        const uname = username.trim().replace(/^@/, '');
        const res = await signUp.email({
          name: name.trim(),
          email: em,
          password,
          // some better-auth builds accept extra fields
          ...( { username: uname } as any ),
        } as any);
        if (!(res as { error?: { message?: string } })?.error) {
          try { setSessionAccountKind('personal'); } catch { /* */ }
        }
        if ((res as { error?: { message?: string } })?.error) {
          const msg = (res as { error?: { message?: string } }).error?.message || 'فشل إنشاء الحساب';
          if (/username|user name|already|taken|exists|موجود|مستخدم/i.test(msg)) {
            setError(L.userTaken);
            setUsernameStatus('taken');
          } else {
            setError(msg);
          }
        } else {
          // Persist username immediately so Settings profile shows it without re-entry
          try {
            localStorage.setItem('stooorna_pending_username', uname);
            localStorage.setItem(`stooorna_username_${em}`, uname);
          } catch { /* ignore */ }
          try {
            await signIn.email({ email: em, password });
          } catch { /* already signed in */ }
          const patchUsername = async () => {
            try {
              const r = await fetch('/api/users/me', {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: uname }),
              });
              return r.ok;
            } catch {
              return false;
            }
          };
          if (!(await patchUsername())) {
            await new Promise(r => setTimeout(r, 400));
            await patchUsername();
          }
        }
      } else {
        // Company signup: طلب تسجيل فقط — لا دخول مباشر حتى يوافق @Stooorna
        const existing = findCompanyByEmail(em);
        if (existing && existing.status === 'pending') {
          setError('طلبكم قيد المراجعة — سوف يتم الاتصال بكم قريباً');
          setCompanyPendingMsg('سوف يتم الاتصال بكم قريباً');
          return;
        }
        if (existing && existing.status === 'inactive') {
          setError('حساب الشركة معطّل — تواصل مع الدعم');
          return;
        }
        if (existing && existing.status === 'active') {
          setError('الشركة مفعّلة مسبقاً — سجّل الدخول من تبويب الدخول');
          return;
        }

        const companyPayload: CompanyRegistration = {
          id: `co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          companyName: companyName.trim(),
          tradeName: tradeName.trim(),
          ownerName: ownerName.trim(),
          licenseNumber: licenseNumber.trim(),
          tradeLicenseNumber: tradeLicenseNumber.trim(),
          commercialRegCert: commercialRegFile?.dataUrl,
          commercialRegCertName: commercialRegFile?.name,
          tradeLicenseCert: tradeLicenseFile?.dataUrl,
          tradeLicenseCertName: tradeLicenseFile?.name,
          sector: companySector.trim() || 'other',
          sectorCustom: companySectorCustom.trim() || undefined,
          phone: companyPhone.replace(/[\s\-()]/g, '').trim(),
          phoneAlt: companyPhone2.trim() ? companyPhone2.replace(/[\s\-()]/g, '').trim() : undefined,
          email: em,
          username: username.trim().replace(/^@/, ''),
          password, // مؤقت حتى الموافقة وإنشاء الحساب
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          userId: null,
          approvedAt: null,
          approvedBy: null,
        };

        try {
          const freed = loadFreedUsernames().filter(x => x !== String(companyPayload.username || '').toLowerCase());
          localStorage.setItem(FREED_USERNAMES_KEY, JSON.stringify(freed));
        } catch { /* */ }
        upsertCompanyRegistration(companyPayload);
        try { setSessionAccountKind('company'); } catch { /* */ }
        try {
          localStorage.setItem('stooorna_company_profile', JSON.stringify({ ...companyPayload, at: Date.now() }));
          localStorage.setItem('stooorna_company_last_request', JSON.stringify(companyPayload));
        } catch { /* ignore */ }
        try {
          window.dispatchEvent(new CustomEvent('stooorna:company-register-request', { detail: companyPayload }));
          window.dispatchEvent(new CustomEvent('stooorna:companies-registry', { detail: loadCompaniesRegistry() }));
        } catch { /* ignore */ }

        // إشعار السيرفر + صندوق طلبات الأونر إن وُجد — بدون تسجيل دخول المستخدم
        const endpoints = [
          '/api/company/register',
          '/api/companies/register',
          '/api/auth/company-signup',
          '/api/owner/company-requests',
          '/api/owner/companies',
          '/api/support/company-requests',
          '/api/companies/pending',
        ];
        for (const url of endpoints) {
          try {
            const r = await fetch(url, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...companyPayload, accountType: 'company', status: 'pending', username: companyPayload.username }),
            });
            if (r.ok || r.status === 201) break;
          } catch { /* try next */ }
        }

        // لا نستدعي signUp هنا — الحساب يُنشأ بعد موافقة الأدمن أو عند أول دخول بعد التفعيل
        setCompanyPendingMsg('سوف يتم الاتصال بكم قريباً');
        setError('');
        setPassword('');
        setConfirmPassword('');
        setConfirmEmail('');
        return;
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const btnFg = 'hsl(var(--primary-foreground))';
  const isCompany = false; // company signup disabled — regular users only
  const isRegister = mode === 'register';

  // CSS helper — not content, just a style shorthand
  function fieldCss(overrides?: React.CSSProperties): React.CSSProperties {
    return {
      width: '100%',
      background: T.surface,
      border: `1px solid ${T.surfaceBorder}`,
      borderRadius: 12,
      padding: '12px 14px 12px 40px',
      color: T.text,
      fontSize: 14,
      outline: 'none',
      boxSizing: 'border-box',
      ...overrides,
    };
  }

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '24px 16px' }} dir={dir}>
      {/* لغة شاشة الدخول — عربي / English */}
      <div style={{
        position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 14, zIndex: 5,
        display: 'flex', borderRadius: 10, overflow: 'hidden',
        border: `1px solid ${T.primaryBorder}`,
        background: T.surface,
      }}>
        <button type="button" onClick={() => setAuthLanguage('ar')} style={{
          padding: '7px 12px', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12,
          background: !isEn ? T.primaryFaint : 'transparent',
          color: !isEn ? T.primary : T.primaryDim,
        }}>عربي</button>
        <button type="button" onClick={() => setAuthLanguage('en')} style={{
          padding: '7px 12px', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12,
          background: isEn ? T.primaryFaint : 'transparent',
          color: isEn ? T.primary : T.primaryDim,
          borderLeft: `1px solid ${T.primaryBorder}`,
        }}>EN</button>
      </div>

      <div style={{
        width: 80, height: 80, borderRadius: '50%', overflow: 'hidden',
        marginBottom: 20, flexShrink: 0,
        boxShadow: `0 0 28px ${T.primaryFaint}`,
        backgroundImage: 'url(/airo-assets/images/logo/horizontal)',
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
      }} />
      <div style={{ textAlign: 'center', marginBottom: 16, width: '100%', maxWidth: 360 }}>
        <p style={{
          margin: 0,
          color: T.text,
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1.45,
          direction: 'rtl',
        }}>
          {isRegister
            ? L.joinNow
            : L.welcomeBack}
        </p>
        <p style={{
          margin: '4px 0 0',
          color: T.primary,
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: '0.04em',
          lineHeight: 1.2,
        }}>
          Stooorna
        </p>
        <p style={{
          margin: '8px 0 0',
          color: T.primaryDim,
          fontSize: 13,
          fontWeight: 600,
        }}>
          {isRegister ? L.createAccount : L.login}
        </p>
      </div>

      {/* Company account toggle disabled — all signups are regular users */}
      {false && isRegister && (
        <button
          type="button"
          onClick={() => switchKind(isCompany ? 'personal' : 'company')}
          style={{
            width: '100%', maxWidth: 360, marginBottom: 14, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
            background: isCompany ? 'rgba(0,188,212,0.12)' : T.surface,
            border: `1.5px solid ${isCompany ? T.primary : T.surfaceBorder}`,
            color: T.text, textAlign: isEn ? 'left' : 'right', direction: dir,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <Building2 size={18} color={isCompany ? T.primary : T.primaryDim} />
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: isCompany ? T.primary : T.text }}>{L.companyToggle}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: T.primaryDim }}>{L.companyToggleHint}</p>
            </div>
          </div>
          <span aria-hidden style={{
            width: 48, height: 28, borderRadius: 999, flexShrink: 0, position: 'relative',
            background: isCompany ? T.primary : 'rgba(150,190,190,0.25)',
            transition: 'background 0.2s',
          }}>
            <span style={{
              position: 'absolute', top: 3, width: 22, height: 22, borderRadius: '50%',
              background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
              left: isCompany ? 23 : 3, transition: 'left 0.2s',
            }} />
          </span>
        </button>
      )}

      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* ── Company registration fields ── */}
        {isRegister && isCompany && (
          <>
            <div style={{ position: 'relative' }}>
              <Building2 size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="text" placeholder={L.companyName} value={companyName} onChange={e => setCompanyName(e.target.value)} required
                style={fieldCss()} />
            </div>
            <div style={{ position: 'relative' }}>
              <Briefcase size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="text" placeholder={L.tradeName} value={tradeName} onChange={e => setTradeName(e.target.value)} required
                style={fieldCss()} />
            </div>
            <div style={{ position: 'relative' }}>
              <User size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="text" placeholder={L.ownerName} value={ownerName} onChange={e => setOwnerName(e.target.value)} required
                style={fieldCss()} />
            </div>
            <div style={{ position: 'relative' }}>
              <AtSign size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder={L.username}
                value={username}
                onChange={e => setUsername(e.target.value.replace(/\s/g, ''))}
                required
                autoCapitalize="none"
                autoCorrect="off"
                style={{
                  ...fieldCss(),
                  direction: 'ltr',
                  border: `1px solid ${
                    usernameStatus === 'taken' ? 'hsl(var(--destructive))'
                    : usernameStatus === 'available' ? 'rgba(34,197,94,0.55)'
                    : T.surfaceBorder
                  }`,
                }}
                dir="ltr"
              />
            </div>
            {username.trim() && (
              <p style={{
                margin: '-6px 0 0', fontSize: 12, fontWeight: 700, textAlign: 'center',
                color: usernameStatus === 'available' ? '#22c55e'
                  : usernameStatus === 'taken' ? 'hsl(var(--destructive))'
                  : usernameStatus === 'invalid' ? '#eab308'
                  : usernameStatus === 'checking' ? T.primaryDim
                  : 'transparent',
              }}>
                {usernameStatus === 'checking' && L.checkingUser}
                {usernameStatus === 'available' && L.userAvailable}
                {usernameStatus === 'taken' && L.userTaken}
                {usernameStatus === 'invalid' && L.userInvalid}
              </p>
            )}
            {/* Commercial registration certificate — label + upload (no number required) */}
            <div style={{ position: 'relative' }}>
              <div style={{
                ...fieldCss(),
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                paddingRight: 48, cursor: 'default',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(200,230,230,0.95)', fontWeight: 700, fontSize: '0.9rem' }}>
                  <ShieldCheck size={16} color={T.primaryDim} />
                  {authLang === 'en' ? 'Commercial registration certificate' : 'شهادة السجل التجاري'}
                </span>
              </div>
              <input
                id="commercial-reg-file"
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setError('');
                  setCommercialRegFile(null);
                  setCommercialRegVerify('checking');
                  setCommercialRegVerifyMessage('');
                  setCommercialRegMeta(null);
                  try {
                    const result = await verifyCertificateFile(file, 'commercial_registry', '');
                    if (result.valid) {
                      setCommercialRegFile({ dataUrl: result.dataUrl, name: file.name });
                      setCommercialRegVerify('valid');
                      setCommercialRegVerifyMessage('');
                    } else {
                      setCommercialRegVerify('invalid');
                      setCommercialRegFile(null);
                      const msg = result.message || (authLang === 'en' ? 'Upload failed' : 'فشل الرفع');
                      setCommercialRegVerifyMessage(msg);
                      setError(msg);
                    }
                  } catch {
                    setCommercialRegVerify('invalid');
                    setCommercialRegVerifyMessage(authLang === 'en' ? 'Upload failed' : 'فشل الرفع');
                  }
                }}
              />
              <button
                type="button"
                title={authLang === 'en' ? 'Upload commercial registration certificate' : 'رفع شهادة السجل التجاري'}
                disabled={commercialRegVerify === 'checking'}
                onClick={() => document.getElementById('commercial-reg-file')?.click()}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: commercialRegVerify === 'valid' ? 'hsl(var(--success)/0.18)' : commercialRegVerify === 'invalid' ? 'hsl(var(--destructive)/0.18)' : 'hsl(var(--primary)/0.12)',
                  border: `1px solid ${commercialRegVerify === 'valid' ? 'hsl(var(--success)/0.5)' : commercialRegVerify === 'invalid' ? 'hsl(var(--destructive)/0.5)' : 'hsl(var(--primary)/0.35)'}`,
                  borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: commercialRegVerify === 'checking' ? 'wait' : 'pointer', flexShrink: 0,
                  opacity: commercialRegVerify === 'checking' ? 0.6 : 1,
                }}
              >
                {commercialRegVerify === 'checking'
                  ? <Clock size={15} color="hsl(var(--primary))" />
                  : commercialRegVerify === 'valid'
                    ? <Check size={15} color="hsl(var(--success))" />
                    : commercialRegVerify === 'invalid'
                      ? <X size={15} color="hsl(var(--destructive))" />
                      : <Plus size={15} color="hsl(var(--primary))" />
                }
              </button>
            </div>
            {commercialRegFile && commercialRegVerify === 'valid' && (
              <p style={{ margin: '-6px 0 0', fontSize: 11, color: 'hsl(var(--success))', display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
                <Check size={11} /> {commercialRegFile.name}
                <button type="button" onClick={() => { setCommercialRegFile(null); setCommercialRegVerify('idle'); setCommercialRegVerifyMessage(''); setCommercialRegMeta(null); }} style={{ background: 'none', border: 'none', color: 'hsl(var(--destructive)/0.7)', cursor: 'pointer', padding: 0, marginRight: 4, display: 'flex', alignItems: 'center' }}>
                  <X size={11} />
                </button>
              </p>
            )}
            {commercialRegVerify === 'invalid' && (
              <p style={{ margin: '-6px 0 0', fontSize: 11, color: 'hsl(var(--destructive))', display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
                <AlertTriangle size={11} /> {commercialRegVerifyMessage || (authLang === 'en' ? 'Upload failed' : 'فشل الرفع')}
              </p>
            )}

            {/* Trade license certificate — label + upload (no number required) */}
            <div style={{ position: 'relative' }}>
              <div style={{
                ...fieldCss(),
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                paddingRight: 48, cursor: 'default',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(200,230,230,0.95)', fontWeight: 700, fontSize: '0.9rem' }}>
                  <FileText size={16} color={T.primaryDim} />
                  {authLang === 'en' ? 'Trade license certificate' : 'شهادة الترخيص التجاري'}
                </span>
              </div>
              <input
                id="trade-license-file"
                type="file"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setError('');
                  setTradeLicenseFile(null);
                  setTradeLicenseVerify('checking');
                  setTradeLicenseVerifyMessage('');
                  setTradeLicenseMeta(null);
                  try {
                    const result = await verifyCertificateFile(file, 'trade_license', '');
                    if (result.valid) {
                      setTradeLicenseFile({ dataUrl: result.dataUrl, name: file.name });
                      setTradeLicenseVerify('valid');
                      setTradeLicenseVerifyMessage('');
                    } else {
                      setTradeLicenseVerify('invalid');
                      setTradeLicenseFile(null);
                      const msg = result.message || (authLang === 'en' ? 'Upload failed' : 'فشل الرفع');
                      setTradeLicenseVerifyMessage(msg);
                      setError(msg);
                    }
                  } catch {
                    setTradeLicenseVerify('invalid');
                    setTradeLicenseVerifyMessage(authLang === 'en' ? 'Upload failed' : 'فشل الرفع');
                  }
                }}
              />
              <button
                type="button"
                title={authLang === 'en' ? 'Upload trade license certificate' : 'رفع شهادة الترخيص التجاري'}
                disabled={tradeLicenseVerify === 'checking'}
                onClick={() => document.getElementById('trade-license-file')?.click()}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: tradeLicenseVerify === 'valid' ? 'hsl(var(--success)/0.18)' : tradeLicenseVerify === 'invalid' ? 'hsl(var(--destructive)/0.18)' : 'hsl(var(--primary)/0.12)',
                  border: `1px solid ${tradeLicenseVerify === 'valid' ? 'hsl(var(--success)/0.5)' : tradeLicenseVerify === 'invalid' ? 'hsl(var(--destructive)/0.5)' : 'hsl(var(--primary)/0.35)'}`,
                  borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: tradeLicenseVerify === 'checking' ? 'wait' : 'pointer', flexShrink: 0,
                  opacity: tradeLicenseVerify === 'checking' ? 0.6 : 1,
                }}
              >
                {tradeLicenseVerify === 'checking'
                  ? <Clock size={15} color="hsl(var(--primary))" />
                  : tradeLicenseVerify === 'valid'
                    ? <Check size={15} color="hsl(var(--success))" />
                    : tradeLicenseVerify === 'invalid'
                      ? <X size={15} color="hsl(var(--destructive))" />
                      : <Plus size={15} color="hsl(var(--primary))" />
                }
              </button>
            </div>
            {tradeLicenseFile && tradeLicenseVerify === 'valid' && (
              <p style={{ margin: '-6px 0 0', fontSize: 11, color: 'hsl(var(--success))', display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
                <Check size={11} /> {tradeLicenseFile.name}
                <button type="button" onClick={() => { setTradeLicenseFile(null); setTradeLicenseVerify('idle'); setTradeLicenseVerifyMessage(''); setTradeLicenseMeta(null); }} style={{ background: 'none', border: 'none', color: 'hsl(var(--destructive)/0.7)', cursor: 'pointer', padding: 0, marginRight: 4, display: 'flex', alignItems: 'center' }}>
                  <X size={11} />
                </button>
              </p>
            )}
            {tradeLicenseVerify === 'invalid' && (
              <p style={{ margin: '-6px 0 0', fontSize: 11, color: 'hsl(var(--destructive))', display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
                <AlertTriangle size={11} /> {tradeLicenseVerifyMessage || (authLang === 'en' ? 'Upload failed' : 'فشل الرفع')}
              </p>
            )}

            {/* Both certificates required */}
            {(!commercialRegFile || !tradeLicenseFile || commercialRegVerify !== 'valid' || tradeLicenseVerify !== 'valid') && (
              <div style={{
                background: 'hsl(var(--gold)/0.08)', border: '1px solid hsl(var(--gold)/0.3)',
                borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <AlertTriangle size={14} color="hsl(var(--gold))" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'hsl(var(--gold)/0.9)', lineHeight: 1.5 }}>
                  {authLang === 'en'
                    ? 'Upload both the commercial registration certificate and the trade license certificate — the request will not be accepted without them'
                    : 'يجب رفع شهادة السجل التجاري وشهادة الترخيص التجاري — لن يُقبل الطلب بدونهما'}
                </p>
              </div>
            )}
                <div style={{ position: 'relative' }}>
                  <button type="button" onClick={() => setSectorOpen(o => !o)}
                    style={{ ...fieldCss(), borderColor: 'rgba(239,68,68,0.35)', paddingLeft: 14, paddingRight: 36, textAlign: isEn ? 'left' : 'right', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: (companySector || companySectorCustom) ? 'inherit' : 'rgba(150,200,200,0.55)' }}>
                      {companySector || companySectorCustom || L.sector}
                    </span>
                    <ChevronDown size={16} color="rgba(150,200,200,0.8)" style={{ flexShrink: 0 }} />
                  </button>
                  {sectorOpen && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 40, marginTop: 4, background: 'rgba(8,20,22,0.98)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 10px 24px rgba(0,0,0,0.4)' }}>
                      {(isEn ? [
                        'Electronics & Electrical appliances',
                        'Perfume, beauty & personal care',
                        'Furniture, décor & furnishings',
                        'Fashion & clothing',
                        'Watches, jewelry & accessories',
                        'Stationery, hobbies & books',
                      ] : [
                        'قطاع الأجهزة الإلكترونية والكهربائية',
                        'قطاع العطور والتجميل والعناية',
                        'قطاع الأثاث والديكور والمفروشات',
                        'قطاع الأزياء والموضة والملابس',
                        'قطاع الساعات والمجوهرات والإكسسوارات',
                        'قطاع القرطاسية والهوايات والكتب',
                      ]).map(s => (
                        <button key={s} type="button" onClick={() => { setCompanySector(s); setCompanySectorCustom(''); setSectorOpen(false); }}
                          style={{ width: '100%', padding: '10px 12px', border: 'none', background: companySector === s ? 'rgba(0,188,212,0.12)' : 'transparent', color: 'rgba(200,230,230,0.95)', textAlign: isEn ? 'left' : 'right', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
                          {s}
                        </button>
                      ))}
                      <div style={{ padding: 10, borderTop: '1px solid rgba(0,188,212,0.15)' }}>
                        <input type="text" value={companySectorCustom} onChange={e => { setCompanySectorCustom(e.target.value); if (e.target.value.trim()) setCompanySector(''); }} placeholder={L.sectorHint} style={{ ...fieldCss(), margin: 0, fontSize: '0.8rem' }} />
                      </div>
                    </div>
                  )}
                </div>

            <div style={{ position: 'relative' }}>
              <Phone size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="tel" placeholder={L.phone} value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} required
                style={fieldCss()} dir="ltr" />
            </div>
            <div style={{ position: 'relative' }}>
              <Phone size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="tel" placeholder={L.phoneAlt} value={companyPhone2} onChange={e => setCompanyPhone2(e.target.value)}
                style={fieldCss()} dir="ltr" />
            </div>
          </>
        )}

        {/* ── Personal registration: name + username ── */}
        {isRegister && !isCompany && (
          <>
            <div style={{ position: 'relative' }}>
              <User size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input type="text" placeholder={L.name} value={name} onChange={e => setName(e.target.value)} required
                style={fieldCss()} />
            </div>
            <div style={{ position: 'relative' }}>
              <AtSign size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder={L.username}
                value={username}
                onChange={e => setUsername(e.target.value.replace(/\s/g, ''))}
                required
                autoCapitalize="none"
                autoCorrect="off"
                style={{
                  ...fieldCss(),
                  direction: 'ltr',
                  border: `1px solid ${
                    usernameStatus === 'taken' ? 'hsl(var(--destructive))'
                    : usernameStatus === 'available' ? 'rgba(34,197,94,0.55)'
                    : T.surfaceBorder
                  }`,
                }}
                dir="ltr"
              />
            </div>
            {username.trim() && (
              <p style={{
                margin: '-6px 0 0', fontSize: 12, fontWeight: 700, textAlign: 'center',
                color: usernameStatus === 'available' ? '#22c55e'
                  : usernameStatus === 'taken' ? 'hsl(var(--destructive))'
                  : usernameStatus === 'invalid' ? '#eab308'
                  : usernameStatus === 'checking' ? T.primaryDim
                  : 'transparent',
              }}>
                {usernameStatus === 'checking' && L.checkingUser}
                {usernameStatus === 'available' && L.userAvailable}
                {usernameStatus === 'taken' && L.userTaken}
                {usernameStatus === 'invalid' && L.userInvalid}
              </p>
            )}
          </>
        )}

        {/* Email */}
        <div style={{ position: 'relative' }}>
          <Mail size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input type="email" autoComplete="email" placeholder={L.email} value={email} onChange={e => setEmail(e.target.value)} required
            style={fieldCss()} dir="ltr" />
        </div>

        {/* Confirm email — company register only */}
        {isRegister && isCompany && (
          <div style={{ position: 'relative' }}>
            <Mail size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="email"
              placeholder={L.confirmEmail}
              value={confirmEmail}
              onChange={e => setConfirmEmail(e.target.value)}
              required
              style={{
                ...fieldCss(),
                border: `1px solid ${confirmEmail && confirmEmail.trim().toLowerCase() !== email.trim().toLowerCase() ? 'hsl(var(--destructive))' : T.surfaceBorder}`,
              }}
              dir="ltr"
            />
            {confirmEmail && confirmEmail.trim().toLowerCase() === email.trim().toLowerCase() && (
              <Check size={14} color="hsl(var(--primary))" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            )}
          </div>
        )}

        {/* Password */}
        <div style={{ position: 'relative' }}>
          <Lock size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input type={showPw ? 'text' : 'password'} placeholder={L.password} value={password} onChange={e => setPassword(e.target.value)} required
            style={{ ...fieldCss(), paddingRight: 44 }} dir="ltr" />
          <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.primaryDim }}>
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* Confirm password — register only */}
        {isRegister && (
          <div style={{ position: 'relative' }}>
            <ShieldCheck size={16} color={T.primaryDim} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type={showConfirmPw ? 'text' : 'password'}
              placeholder={L.confirmPassword}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              style={{
                ...fieldCss(),
                paddingRight: 44,
                border: `1px solid ${confirmPassword && confirmPassword !== password ? 'hsl(var(--destructive))' : T.surfaceBorder}`,
              }}
              dir="ltr"
            />
            <button type="button" onClick={() => setShowConfirmPw(v => !v)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.primaryDim }}>
              {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            {confirmPassword && confirmPassword === password && (
              <Check size={14} color="hsl(var(--primary))" style={{ position: 'absolute', right: 40, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            )}
          </div>
        )}

        {error && (
          <div style={{ background: 'hsl(var(--destructive)/0.15)', border: '1px solid hsl(var(--destructive)/0.4)', borderRadius: 10, padding: '10px 14px', color: 'hsl(var(--destructive))', fontSize: 13, textAlign: 'center' }}>
            {error}
          </div>
        )}
        {companyPendingMsg && !error && (
          <div style={{
            background: 'rgba(0,188,212,0.12)',
            border: '1px solid rgba(0,188,212,0.4)',
            borderRadius: 12,
            padding: '14px 16px',
            color: '#00BCD4',
            fontSize: 14,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.55,
          }}>
            {companyPendingMsg}
          </div>
        )}

        <button type="submit" disabled={loading || (isRegister && (usernameStatus === 'taken' || usernameStatus === 'invalid' || usernameStatus === 'checking'))}
          style={{ background: (loading || (isRegister && (usernameStatus === 'taken' || usernameStatus === 'invalid'))) ? T.primaryFaint : T.primary, color: btnFg, border: 'none', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 700, cursor: (loading || (isRegister && usernameStatus === 'taken')) ? 'not-allowed' : 'pointer', marginTop: 4, transition: 'opacity 0.2s', opacity: (isRegister && usernameStatus === 'taken') ? 0.6 : 1 }}>
          {loading ? '...' : (isRegister ? L.submitCreate : L.submitLogin)}
        </button>
      </form>

      <div style={{ marginTop: 20, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ color: T.primaryDim, fontSize: 13 }}>
          {isRegister ? L.haveAccount : L.noAccount}
        </span>
        <button
          type="button"
          onClick={() => switchMode(isRegister ? 'login' : 'register')}
          style={{ background: 'none', border: 'none', color: T.primary, fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}
        >
          {isRegister ? L.goLogin : L.goRegister}
        </button>
      </div>
    </div>
  );
}

// ─── Music search modal (iTunes free previews) — opened from profile Music button ──
interface SettingsMusicTrack {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  previewUrl: string;
}
function SettingsMusicSearchModal({
  onClose,
  currentTrack,
  isPlaying,
  onPlayTrack,
  favorites,
  onToggleFavorite,
}: {
  onClose: () => void;
  currentTrack: SettingsMusicTrack | null;
  isPlaying: boolean;
  onPlayTrack: (track: SettingsMusicTrack) => void;
  favorites: SettingsMusicTrack[];
  onToggleFavorite: (track: SettingsMusicTrack) => void;
}) {
  const [tabKey, setTabKey] = useState<'search' | 'favorites'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SettingsMusicTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSearch = useCallback((term: string) => {
    if (!term.trim()) { setResults([]); setError(null); setSearching(false); return; }
    setSearching(true);
    setError(null);
    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=25`)
      .then(res => res.json())
      .then((data: { results?: Array<{ trackId: number; trackName: string; artistName: string; artworkUrl100?: string; previewUrl?: string }> }) => {
        setResults((data.results ?? [])
          .filter(r => !!r.previewUrl)
          .map(r => ({
            id: String(r.trackId),
            title: r.trackName,
            artist: r.artistName,
            artwork: r.artworkUrl100 ?? '',
            previewUrl: r.previewUrl as string,
          })));
      })
      .catch(() => setError('تعذر البحث، تحقق من الاتصال بالإنترنت'))
      .finally(() => setSearching(false));
  }, []);
  function onQueryChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(v), 450);
  }
  const isFav = (id: string) => favorites.some(f => f.id === id);
  const list = tabKey === 'search' ? results : favorites;
  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000,
        background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 18, overflow: 'hidden',
      }}
    >
      <motion.div
        role="presentation"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }}
        style={{
          width: '100%', maxWidth: 380, maxHeight: '78vh',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(12,10,8,0.97)',
          border: '1px solid rgba(0,188,212,0.28)',
          borderRadius: 20,
          boxShadow: '0 12px 50px rgba(0,0,0,0.55), 0 0 30px rgba(0,188,212,0.1)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Music size={16} color="#00BCD4" />
              الموسيقى
            </span>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 999, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={14} color="rgba(255,255,255,0.7)" />
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} color="rgba(255,255,255,0.4)" style={{ position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)' }} />
            <input
              autoFocus
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              placeholder="ابحث عن أغنية أو فنان..."
              style={{
                width: '100%', padding: '9px 36px 9px 12px', borderRadius: 12,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: '0.78rem', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', padding: '8px 14px 0' }}>
          {(['search', 'favorites'] as const).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setTabKey(k)}
              style={{
                flex: 1, padding: '8px 0', textAlign: 'center', background: 'transparent', border: 'none', cursor: 'pointer',
                color: tabKey === k ? '#00BCD4' : 'rgba(255,255,255,0.4)',
                fontSize: '0.72rem', fontWeight: 700,
                borderBottom: tabKey === k ? '2px solid #00BCD4' : '2px solid transparent',
              }}
            >
              {k === 'search' ? 'بحث' : `المفضلة${favorites.length ? ` (${favorites.length})` : ''}`}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 14px' }}>
          {tabKey === 'search' && searching && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>جاري البحث...</p>
          )}
          {tabKey === 'search' && !searching && error && (
            <p style={{ color: 'rgba(239,68,68,0.8)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>{error}</p>
          )}
          {tabKey === 'search' && !searching && !error && query.trim() && list.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>لا توجد نتائج</p>
          )}
          {tabKey === 'search' && !query.trim() && (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>اكتب اسم أغنية أو فنان للبحث</p>
          )}
          {tabKey === 'favorites' && favorites.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', textAlign: 'center', padding: '20px 0' }}>لا توجد أغاني في المفضلة بعد</p>
          )}
          {list.map(track => {
            const active = currentTrack?.id === track.id;
            return (
              <div
                key={track.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 12,
                  background: active ? 'rgba(0,188,212,0.1)' : 'transparent', marginBottom: 4,
                }}
              >
                {track.artwork ? (
                  <img src={track.artwork} alt="" width={40} height={40} style={{ borderRadius: 8, flexShrink: 0, objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: active ? '#00BCD4' : '#fff', fontSize: '0.74rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.64rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artist}</div>
                </div>
                <button type="button" onClick={() => onToggleFavorite(track)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                  <Heart size={16} color={isFav(track.id) ? '#ef4444' : 'rgba(255,255,255,0.35)'} fill={isFav(track.id) ? '#ef4444' : 'none'} />
                </button>
                <button
                  type="button"
                  onClick={() => onPlayTrack(track)}
                  style={{
                    background: active && isPlaying ? 'rgba(0,188,212,0.22)' : 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(0,188,212,0.3)', borderRadius: 999, width: 30, height: 30,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {active && isPlaying ? <Pause size={13} color="#00BCD4" /> : <Play size={13} color="#00BCD4" style={{ marginRight: -1 }} />}
                </button>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

// ─── Main settings page ───────────────────────────────────────────────────────

// ─── App short links (stooorna.com) — for text posts: paste any URL → short app link ──
const SHORT_LINKS_KEY = 'stooorna_short_links';
type ShortLinkEntry = { code: string; url: string; createdAt: number; shortUrl: string };

function loadShortLinks(): ShortLinkEntry[] {
  try {
    return JSON.parse(localStorage.getItem(SHORT_LINKS_KEY) || '[]') as ShortLinkEntry[];
  } catch {
    return [];
  }
}

export function saveShortLink(entry: ShortLinkEntry) {
  try {
    const prev = loadShortLinks().filter(e => e.code !== entry.code);
    localStorage.setItem(SHORT_LINKS_KEY, JSON.stringify([entry, ...prev].slice(0, 100)));
  } catch { /* ignore */ }
}

export function deleteShortLink(code: string) {
  try {
    const next = loadShortLinks().filter(e => e.code !== code);
    localStorage.setItem(SHORT_LINKS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadShortLinks();
  }
}

export function clearAllShortLinks() {
  try {
    localStorage.removeItem(SHORT_LINKS_KEY);
  } catch { /* ignore */ }
}

export function makeShortCode(len = 7): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  const arr = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
  else for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

function normalizeExternalUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}


const SETTINGS_IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?.*)?$/i;
const SETTINGS_VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg|ogv)(\?.*)?$/i;

function settingsParseXStatusId(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (!/(^|\.)((twitter|x)\.com)$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/status(?:es)?\/(\d+)/i);
    return m?.[1] ?? null;
  } catch { return null; }
}

function settingsClassifyMedia(raw: string): 'image' | 'video' | null {
  try {
    const u = new URL(raw.trim());
    if (SETTINGS_IMAGE_EXT.test(u.pathname) || SETTINGS_IMAGE_EXT.test(u.href)) return 'image';
    if (SETTINGS_VIDEO_EXT.test(u.pathname) || SETTINGS_VIDEO_EXT.test(u.href)) return 'video';
    if (/pbs\.twimg\.com/i.test(u.hostname)) return 'image';
    if (/video\.twimg\.com/i.test(u.hostname)) return 'video';
    return null;
  } catch { return null; }
}

async function settingsResolveXMedia(statusUrl: string): Promise<string[]> {
  const id = settingsParseXStatusId(statusUrl);
  if (!id) return [];
  for (const ep of [`https://api.fxtwitter.com/status/${id}`, `https://api.vxtwitter.com/status/${id}`]) {
    try {
      const r = await fetch(ep);
      if (!r.ok) continue;
      const data = await r.json() as any;
      const out: string[] = [];
      const media = data?.tweet?.media ?? data?.media ?? null;
      for (const p of media?.photos ?? []) {
        const url = p.url || p.media_url_https || p.src;
        if (url) out.push(url);
      }
      for (const v of (media?.videos ?? (media?.video ? [media.video] : []))) {
        const variants = v.variants || [];
        const mp4s = variants.filter((x: any) => String(x.content_type || '').includes('mp4') || String(x.url || '').includes('.mp4'));
        mp4s.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        const url = mp4s[0]?.url || v.url || v.video_url;
        if (url) out.push(url);
      }
      if (!out.length && Array.isArray(data?.mediaURLs)) {
        for (const url of data.mediaURLs) if (typeof url === 'string') out.push(url);
      }
      if (!out.length && data?.video?.url) out.push(data.video.url);
      if (!out.length && typeof data?.image === 'string') out.push(data.image);
      const all = media?.all;
      if (!out.length && Array.isArray(all)) {
        for (const item of all) {
          if (item.type === 'video' || item.type === 'gif') {
            const variants = item.variants || [];
            const mp4s = variants.filter((x: any) => String(x.content_type || '').includes('mp4'));
            mp4s.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
            if (mp4s[0]?.url) out.push(mp4s[0].url);
            else if (item.url) out.push(item.url);
          } else if (item.url) out.push(item.url);
        }
      }
      if (out.length) return out;
    } catch { /* next */ }
  }
  return [];
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const {
    user,
    isPending
  } = useSession();
  const [tab, setTab] = useState<Tab>('account');
  const [showSupportChat, setShowSupportChat] = useState(false);

  // ── Music player (profile button) ──
  const [musicModalOpen, setMusicModalOpen] = useState(false);
  const [musicCurrentTrack, setMusicCurrentTrack] = useState<SettingsMusicTrack | null>(null);
  const [musicIsPlaying, setMusicIsPlaying] = useState(false);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [musicFavorites, setMusicFavorites] = useState<SettingsMusicTrack[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('stooorna_music_favorites');
      return raw ? (JSON.parse(raw) as SettingsMusicTrack[]) : [];
    } catch { return []; }
  });
  const handleMusicPlayTrack = useCallback((track: SettingsMusicTrack) => {
    if (!musicAudioRef.current) {
      musicAudioRef.current = new Audio();
      musicAudioRef.current.onended = () => setMusicIsPlaying(false);
      musicAudioRef.current.onpause = () => setMusicIsPlaying(false);
      musicAudioRef.current.onplay = () => setMusicIsPlaying(true);
    }
    const a = musicAudioRef.current;
    if (musicCurrentTrack?.id === track.id) {
      if (a.paused) void a.play(); else a.pause();
      return;
    }
    setMusicCurrentTrack(track);
    a.src = track.previewUrl;
    void a.play();
  }, [musicCurrentTrack?.id]);
  const handleMusicToggleFavorite = useCallback((track: SettingsMusicTrack) => {
    setMusicFavorites(prev => {
      const exists = prev.some(f => f.id === track.id);
      const next = exists ? prev.filter(f => f.id !== track.id) : [track, ...prev];
      try { window.localStorage.setItem('stooorna_music_favorites', JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, []);

  // ── Short link builder (Settings → text posts) ──
  const [shortLinkInput, setShortLinkInput] = useState('');
  const [shortLinkResult, setShortLinkResult] = useState('');
  const [shortLinkBusy, setShortLinkBusy] = useState(false);
  const [shortLinkError, setShortLinkError] = useState('');
  const [shortLinkCopied, setShortLinkCopied] = useState(false);

  async function pasteIntoShortLink() {
    setShortLinkError('');
    setShortLinkCopied(false);
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip?.trim()) {
        setShortLinkError('الحافظة فارغة');
        return;
      }
      setShortLinkInput(clip.trim());
      // Paste ثم تحويل مباشرة بدون حفظ
      const normalized = normalizeExternalUrl(clip.trim());
      if (!normalized) {
        setShortLinkError('أدخل رابطًا صحيحًا');
        return;
      }
      setShortLinkBusy(true);
      try {
        if (settingsClassifyMedia(normalized)) {
          setShortLinkResult(normalized);
          return;
        }
        if (settingsParseXStatusId(normalized)) {
          const media = await settingsResolveXMedia(normalized);
          if (media.length) {
            setShortLinkResult(media.join('\n'));
            return;
          }
          setShortLinkResult(normalized);
          setShortLinkError('لم يتم العثور على صورة/فيديو — تم الإبقاء على الأصل');
          return;
        }
        setShortLinkResult(normalized);
      } finally {
        setShortLinkBusy(false);
      }
    } catch {
      setShortLinkError('تعذر القراءة من الحافظة — الصق يدويًا');
    }
  }

  async function createAppShortLink() {
    setShortLinkError('');
    setShortLinkCopied(false);
    const normalized = normalizeExternalUrl(shortLinkInput);
    if (!normalized) {
      setShortLinkError('أدخل رابطًا صحيحًا (مثال: https://...)');
      return;
    }
    setShortLinkBusy(true);
    try {
      // بدون حفظ — فقط تحويل ثم Copy
      if (settingsClassifyMedia(normalized)) {
        setShortLinkResult(normalized);
        return;
      }
      if (settingsParseXStatusId(normalized)) {
        const media = await settingsResolveXMedia(normalized);
        if (media.length) {
          setShortLinkResult(media.join('\n'));
          return;
        }
        setShortLinkResult(normalized);
        setShortLinkError('لم يتم العثور على صورة/فيديو — تم الإبقاء على الأصل');
        return;
      }
      setShortLinkResult(normalized);
    } finally {
      setShortLinkBusy(false);
    }
  }

  async function copyAppShortLink() {
    const value = shortLinkResult.trim();
    if (!value) {
      setShortLinkError('أنشئ الرابط أولًا');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setShortLinkCopied(true);
      setTimeout(() => setShortLinkCopied(false), 1800);
    } catch {
      setShortLinkError('تعذر النسخ — انسخ يدويًا');
    }
  }

  // Profile username — must be declared before support-owner checks / effects
  const [profileUsername, setProfileUsername] = useState<string>(() => {
    const fromSession = String((user as { username?: string | null })?.username ?? '').replace(/^@/, '').trim();
    if (fromSession) return fromSession;
    try {
      const pending = localStorage.getItem('stooorna_pending_username') || '';
      const em = String((user as { email?: string | null })?.email || '').toLowerCase();
      const byEmail = em ? (localStorage.getItem(`stooorna_username_${em}`) || '') : '';
      return (pending || byEmail).replace(/^@/, '').trim();
    } catch {
      return '';
    }
  });

  // هل الجلسة حساب شركة؟ وهل الأونر فعّل ميزة اليوزرنيم للشركات؟
  const sessionIsCompany = (() => {
    if (!user) return false;
    try {
      if (isCompanyAccountRow(user as any)) return true;
      const em = String((user as any).email || '').toLowerCase();
      if (em && findCompanyByEmail(em)) return true;
    } catch { /* */ }
    return false;
  })();
  const [coUsernameFeatureOn, setCoUsernameFeatureOn] = useState(() => {
    try { return isCompanyUsernameFeatureEnabled(); } catch { return false; }
  });
  useEffect(() => {
    const sync = () => { try { setCoUsernameFeatureOn(isCompanyUsernameFeatureEnabled()); } catch { /* */ } };
    window.addEventListener('stooorna:company-username-feature', sync as EventListener);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('stooorna:company-username-feature', sync as EventListener);
      window.removeEventListener('storage', sync);
    };
  }, []);
  // الشركات: قسم اليوزرنيم يظهر فقط إذا فعّل الأونر المفتاح — الأفراد دائماً
  const showUsernameSection = !sessionIsCompany || coUsernameFeatureOn;

  // Owner (@Stooorna) support inbox — open thread with a user
  type SupportPeer = {
    id: string;
    name: string | null;
    username: string | null;
    avatarUrl: string | null;
    online?: boolean;
    lastIp?: string | null;
    country?: string | null;
    unread?: number;
    lastMessage?: string | null;
    lastAt?: string | null;
  };
  const [ownerChatUser, setOwnerChatUser] = useState<SupportPeer | null>(null);
  const [showOwnerInbox, setShowOwnerInbox] = useState(false);
  const [supportInbox, setSupportInbox] = useState<SupportPeer[]>([]);
  const [supportInboxLoading, setSupportInboxLoading] = useState(false);
  const [supportUnreadTotal, setSupportUnreadTotal] = useState(0);

  // Support desk — full user control panel (list + detail box)
  type SupportCtrlUser = {
    id: string;
    name: string | null;
    username: string | null;
    email: string;
    isBanned: boolean | null;
    lastIp: string | null;
    country?: string | null;
    phone?: string | null;
    nameColor?: string | null;
    isRoomAdmin?: boolean | null;
    createdAt: string | null;
    online?: boolean;
    avatarUrl?: string | null;
  };
  const [showSupportUsers, setShowSupportUsers] = useState(false);
  const [supportCtrlUser, setSupportCtrlUser] = useState<SupportCtrlUser | null>(null);
  // ── Owner-only (@Stooorna): Companies registry admin ──
  const [showOwnerCompanies, setShowOwnerCompanies] = useState(false);
  const [showRecoveredUsers, setShowRecoveredUsers] = useState(false);
  const [showOwnerBusiness, setShowOwnerBusiness] = useState(false);
  const [recoveredUsers, setRecoveredUsers] = useState<DeletedUserRecord[]>([]);
  const [recoveredBusyId, setRecoveredBusyId] = useState<string>('');
  const [ownerCompanies, setOwnerCompanies] = useState<CompanyRegistration[]>([]);
  // New independent company registrations from the companies table
  const [ownerNewCompanies, setOwnerNewCompanies] = useState<{
    id: string; companyName: string; tradeName?: string; ownerName?: string;
    licenseNumber?: string; tradeLicenseNumber?: string; description?: string;
    logoUrl?: string; commercialRegFile?: string; tradeLicenseFile?: string;
    status: 'pending' | 'approved' | 'rejected'; rejectionReason?: string;
    createdAt: string; submitter: { id: string; name: string; username: string; email: string; avatar: string };
  }[]>([]);
  const [ownerNewCompaniesLoading, setOwnerNewCompaniesLoading] = useState(false);
  const [ownerNewCompaniesFilter, setOwnerNewCompaniesFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [ownerNewCompaniesRejectId, setOwnerNewCompaniesRejectId] = useState<string | null>(null);
  const [ownerNewCompaniesRejectReason, setOwnerNewCompaniesRejectReason] = useState('');

  const loadNewCompanies = async () => {
    setOwnerNewCompaniesLoading(true);
    try {
      const res = await fetch('/api/owner/companies', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setOwnerNewCompanies(data.companies ?? []);
      }
    } catch { /* ignore */ }
    finally { setOwnerNewCompaniesLoading(false); }
  };

  const reviewNewCompany = async (id: string, action: 'approve' | 'reject', rejectionReason?: string) => {
    try {
      const res = await fetch(`/api/owner/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, rejectionReason }),
      });
      if (res.ok) {
        await loadNewCompanies();
        setOwnerNewCompaniesRejectId(null);
        setOwnerNewCompaniesRejectReason('');
      }
    } catch { /* ignore */ }
  };
  const [ownerCompanyDetail, setOwnerCompanyDetail] = useState<CompanyRegistration | null>(null);
  const [ownerCompanyBusy, setOwnerCompanyBusy] = useState(false);
  const [ownerCoUsernameFeature, setOwnerCoUsernameFeature] = useState(() => {
    try { return isCompanyUsernameFeatureEnabled(); } catch { return false; }
  });
  useEffect(() => {
    const sync = () => setOwnerCoUsernameFeature(isCompanyUsernameFeatureEnabled());
    window.addEventListener('stooorna:company-username-feature', sync as EventListener);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('stooorna:company-username-feature', sync as EventListener);
      window.removeEventListener('storage', sync);
    };
  }, []);

  function refreshOwnerCompanies() {
    startTransition(() => { setOwnerCompanies(sanitizeCompaniesRegistry()); });
    (async () => {
      // 1) Dedicated company APIs + pending approval queues
      for (const url of [
        '/api/companies',
        '/api/company/list',
        '/api/owner/companies',
        '/api/owner/company-requests',
        '/api/companies/pending',
        '/api/company/pending',
        '/api/support/company-requests',
        '/api/users?accountType=company',
      ]) {
        try {
          const r = await fetch(url, { credentials: 'include' });
          if (!r.ok) continue;
          const d = await r.json();
          const list: any[] = Array.isArray(d) ? d : (d.companies || d.users || d.items || d.rows || []);
          for (const row of list) ensureCompanyInRegistry({ ...row, isCompany: true, accountType: row.accountType || 'company' });
        } catch { /* next */ }
      }
      // 2) Scan all owner users and peel companies out of User Control source
      try {
        const r = await fetch('/api/owner/users', { credentials: 'include' });
        if (r.ok) {
          const data = await r.json();
          const rows: any[] = Array.isArray(data) ? data : (data?.rows ?? []);
          const people: typeof allUsers = [];
          const companies: typeof allCompanyCtrlUsers = [];
          for (const row of rows) {
            if (isCompanyAccountRow(row)) {
              ensureCompanyInRegistry(row);
              companies.push(row);
            } else {
              people.push(row);
            }
          }
          setAllUsers(people);
          setAllCompanyCtrlUsers(companies);
        }
      } catch { /* ignore */ }
      startTransition(() => { setOwnerCompanies(sanitizeCompaniesRegistry()); });
    })();
  }

  // طلبات تسجيل الشركات تصل فوراً لحساب @Stooorna في قسم Companies
  useEffect(() => {
    if (!isSupportOwnerAccount(
      user as { email?: string | null; username?: string | null; name?: string | null },
      profileUsername,
    )) return;

    const ingest = (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      const row = raw as Partial<CompanyRegistration> & Record<string, unknown>;
      if (!row.email && !row.companyName && !row.id) return;
      upsertCompanyRegistration({
        id: String(row.id || `co-${Date.now()}`),
        companyName: String(row.companyName || row.name || 'Company'),
        tradeName: String(row.tradeName || ''),
        ownerName: String(row.ownerName || ''),
        licenseNumber: String(row.licenseNumber || ''),
        sector: row.sector as string | undefined,
        sectorCustom: row.sectorCustom as string | undefined,
        phone: String(row.phone || ''),
        phoneAlt: row.phoneAlt as string | undefined,
        email: String(row.email || ''),
        username: row.username as string | undefined,
        password: row.password as string | undefined,
        status: (row.status as CompanyRegStatus) || 'pending',
        createdAt: String(row.createdAt || new Date().toISOString()),
        updatedAt: new Date().toISOString(),
        userId: (row.userId as string | null) ?? null,
        approvedAt: (row.approvedAt as string | null) ?? null,
        approvedBy: (row.approvedBy as string | null) ?? null,
      });
      startTransition(() => { setOwnerCompanies(sanitizeCompaniesRegistry()); });
    };

    const onRequest = (e: Event) => ingest((e as CustomEvent).detail);
    const onRegistry = () => startTransition(() => { setOwnerCompanies(sanitizeCompaniesRegistry()); });
    const onStorage = (e: StorageEvent) => {
      if (e.key === COMPANIES_REGISTRY_KEY || e.key === 'stooorna_company_last_request') {
        if (e.key === 'stooorna_company_last_request' && e.newValue) {
          try { ingest(JSON.parse(e.newValue)); } catch { /* */ }
        }
        onRegistry();
      }
    };

    try {
      const last = localStorage.getItem('stooorna_company_last_request');
      if (last) ingest(JSON.parse(last));
    } catch { /* */ }

    window.addEventListener('stooorna:company-register-request', onRequest as EventListener);
    window.addEventListener('stooorna:companies-registry', onRegistry);
    window.addEventListener('storage', onStorage);
    refreshOwnerCompanies();
    try {
      if (!localStorage.getItem('stooorna_wiped_libra_v2')) {
        localStorage.setItem('stooorna_wiped_libra_v2', '1');
        markUsernameFreed('libra');
        markUsernameFreed('ليبرا');
        void permanentlyDeleteSupportUser({ id: 'libra', username: 'libra', email: 'account.kw@yahoo.com' });
      }
    } catch { /* */ }
    const poll = window.setInterval(() => refreshOwnerCompanies(), 8000);
    return () => {
      window.removeEventListener('stooorna:company-register-request', onRequest as EventListener);
      window.removeEventListener('stooorna:companies-registry', onRegistry);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(poll);
    };
  }, [user, profileUsername]);

  const ownerPendingCompanyCount = ownerCompanies.filter(
    c => !isPersonalBlockedAccount(c) && c.status === 'pending',
  ).length;

  // محسوبة مرة واحدة فقط عند تغيّر قائمة الشركات — لا تُعاد الحسابات في كل عملية render
  // (كانت سابقاً تُحسب داخل الـ JSX مباشرة، وهذا كان يُبطئ الواجهة ويسبب التجمّد
  // عند فتح تفاصيل الشركة أو حتى عند أي تفاعل آخر في صفحة الإعدادات)
  const ownerCompaniesSorted = useMemo(() => {
    return ownerCompanies
      .filter(co => !/nadoosha/i.test(`${co.email} ${co.username || co.companyName || ''}`))
      .slice()
      .sort((a, b) => {
        const rank = (st: CompanyRegStatus) => st === 'pending' ? 0 : st === 'active' ? 1 : 2;
        return rank(a.status) - rank(b.status);
      });
  }, [ownerCompanies]);

  const [scEditBox, setScEditBox] = useState<'color' | 'username' | 'password' | null>(null);
  const [scUsername, setScUsername] = useState('');
  const [scPassword, setScPassword] = useState('');
  const [scColor, setScColor] = useState('#00BCD4');
  const [scMsg, setScMsg] = useState('');
  const [scSaving, setScSaving] = useState(false);
  const [scDeleteOpen, setScDeleteOpen] = useState(false);
  const [scDeleteText, setScDeleteText] = useState('');
  const [scDeleteError, setScDeleteError] = useState('');
  const [scDeleting, setScDeleting] = useState(false);
  const [ownerDeleteCompany, setOwnerDeleteCompany] = useState<CompanyRegistration | null>(null);
  const [supportUsersSearch, setSupportUsersSearch] = useState('');
  /** داخل كنترول المستخدمين: تبويب أفراد vs شركات (نفس أدوات التحكم) */
  const [supportUsersTab, setSupportUsersTab] = useState<'users' | 'companies'>('users');
  /** حسابات الشركات في تبويب الشركات داخل كنترول المستخدمين */
  const [allCompanyCtrlUsers, setAllCompanyCtrlUsers] = useState<{
    id: string;
    name: string | null;
    username: string | null;
    email: string;
    isBanned: boolean | null;
    lastIp: string | null;
    isRoomAdmin: boolean | null;
    createdAt: string | null;
    nameColor?: string | null;
    country?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    accountType?: string | null;
    type?: string | null;
    role?: string | null;
    isCompany?: boolean | null;
    companyName?: string | null;
    tradeName?: string | null;
    licenseNumber?: string | null;
  }[]>([]);

  // Hide global app bottom tabs while any support chat / inbox overlay is open
  useEffect(() => {
    const hidden = !!(showSupportChat || ownerChatUser || showOwnerInbox || showSupportUsers || supportCtrlUser || showOwnerCompanies || ownerCompanyDetail || showRecoveredUsers || showOwnerBusiness);
    try {
      document.body.classList.toggle('stooorna-support-chat-open', hidden);
      window.dispatchEvent(new CustomEvent('stooorna:bottom-nav', { detail: { hidden } }));
    } catch { /* ignore */ }
    return () => {
      try {
        document.body.classList.remove('stooorna-support-chat-open');
        window.dispatchEvent(new CustomEvent('stooorna:bottom-nav', { detail: { hidden: false } }));
      } catch { /* ignore */ }
    };
  }, [showSupportChat, ownerChatUser, showOwnerInbox, showSupportUsers, supportCtrlUser, showOwnerCompanies, ownerCompanyDetail, showRecoveredUsers, showOwnerBusiness]);

  async function patchSupportUser(userId: string, body: Record<string, unknown>) {
    // Prefer owner admin route; fallback to support-specific if added later
    const urls = [`/api/owner/users/${userId}`, `/api/support/users/${userId}`];
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (r.ok) return await r.json().catch(() => ({ ok: true }));
      } catch { /* next */ }
    }
    return null;
  }

  async function permanentlyDeleteSupportUser(target: { id: string; email?: string | null; username?: string | null }) {
    if (!target?.id && !target?.email && !target?.username) return { ok: false as const, status: 0, body: 'no-id' };
    markUserDeleted(target);
    markUsernameFreed(target.username);
    try {
      const em = String(target.email || '').toLowerCase();
      const un = String(target.username || '').replace(/^@/, '').toLowerCase();
      const nextReg = loadCompaniesRegistry().filter(c => {
        const cem = String(c.email || '').toLowerCase();
        const cun = String(c.username || '').replace(/^@/, '').toLowerCase();
        if (target.id && (c.id === target.id || c.userId === target.id)) return false;
        if (em && cem === em) return false;
        if (un && (cun === un || /libra/i.test(un) && /libra|ليبر/i.test(`${c.username} ${c.companyName} ${c.email}`))) return false;
        return true;
      });
      saveCompaniesRegistry(nextReg);
      startTransition(() => { setOwnerCompanies(nextReg.map(stripCompanyCerts)); });
    } catch { /* */ }
    try {
      {
        const origUn = String(target.username || '').replace(/^@/, '').trim();
        markUserDeleted({
          id: target.id,
          email: target.email,
          username: `deleted_${Date.now()}`,
          originalUsername: origUn && !origUn.startsWith('deleted_') ? origUn : undefined,
          name: (target as { name?: string }).name,
        });
        await patchSupportUser(target.id, {
          isBanned: true,
          banned: true,
          deleted: true,
          isDeleted: true,
          status: 'deleted',
          username: `deleted_${Date.now()}`,
        });
      }
    } catch { /* */ }
    const confirmBody = {
      confirm: true,
      confirmed: true,
      permanent: true,
      deleteAccount: true,
      permanentlyDelete: true,
      action: 'delete',
      targetId: target.id,
      email: target.email || undefined,
      username: target.username || undefined,
      text: 'حذف',
    };
    const uname = String(target.username || '').replace(/^@/, '');
    const endpoints: Array<{ url: string; method: string; body?: object }> = [
      { url: `/api/owner/users/${encodeURIComponent(target.id)}`, method: 'DELETE', body: confirmBody },
      { url: `/api/support/users/${encodeURIComponent(target.id)}`, method: 'DELETE', body: confirmBody },
      { url: `/api/owner/users/${encodeURIComponent(target.id)}/delete`, method: 'POST', body: confirmBody },
      { url: `/api/support/users/${encodeURIComponent(target.id)}/delete`, method: 'POST', body: confirmBody },
      { url: `/api/users/${encodeURIComponent(target.id)}`, method: 'DELETE', body: confirmBody },
      { url: `/api/users/delete`, method: 'POST', body: confirmBody },
      { url: `/api/users/delete-account`, method: 'POST', body: confirmBody },
      { url: `/api/account/delete`, method: 'POST', body: confirmBody },
      { url: `/api/auth/delete-user`, method: 'POST', body: confirmBody },
      { url: `/api/owner/users/${encodeURIComponent(target.id)}`, method: 'PATCH', body: { ...confirmBody, deleted: true, isDeleted: true } },
      { url: `/api/users/by-username/${encodeURIComponent(uname || target.id)}`, method: 'DELETE', body: confirmBody },
      { url: `/api/owner/users/by-username/${encodeURIComponent(uname || target.id)}`, method: 'DELETE', body: confirmBody },
      { url: `/api/owner/username/${encodeURIComponent(uname || target.id)}`, method: 'DELETE', body: confirmBody },
      { url: `/api/users/release-username`, method: 'POST', body: { ...confirmBody, username: uname } },
    ];
    let lastStatus = 0;
    let lastBody = '';
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep.url, {
          method: ep.method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(ep.body || confirmBody),
        });
        lastStatus = r.status;
        try { lastBody = await r.text(); } catch { lastBody = ''; }
        if (r.ok || r.status === 204 || r.status === 200 || r.status === 201) {
          return { ok: true as const, status: lastStatus, body: lastBody };
        }
        if (r.status === 401 && /deleted|removed|حذف/i.test(lastBody)) {
          return { ok: true as const, status: lastStatus, body: lastBody };
        }
      } catch { /* next */ }
    }
    // حتى لو السيرفر لم يدعم الحذف بعد: الحساب موسوم محلياً وممنوع من الدخول
    markUserDeleted(target);
    return { ok: true as const, status: lastStatus || 200, body: lastBody || 'local-deleted' };
  }

  async function loadSupportInbox() {
    if (!isSupportOwnerAccount(user as { email?: string | null; username?: string | null }, profileUsername)) return;
    setSupportInboxLoading(true);
    try {
      let list: SupportPeer[] = [];

      // 1) Dedicated inbox if backend adds it
      try {
        const r = await fetch('/api/support/inbox', { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          list = Array.isArray(d) ? d : (d.conversations || d.inbox || []);
        }
      } catch { /* */ }

      // 2) Real conversations / messages list
      if (!list.length) {
        for (const url of ['/api/messages', '/api/messages?inbox=1', '/api/conversations', '/api/chats']) {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) continue;
            const d = await r.json();
            const raw = Array.isArray(d) ? d : (d.conversations || d.messages || d.items || []);
            if (!raw.length) continue;
            list = raw.map((x: any) => ({
              id: String(x.userId || x.peerId || x.fromUserId || x.id || x._id),
              name: x.name || x.fromName || x.user?.name || null,
              username: x.username || x.fromUsername || x.user?.username || null,
              avatarUrl: x.avatarUrl || x.user?.avatarUrl || null,
              online: !!(x.online ?? x.user?.online),
              lastIp: x.lastIp || null,
              country: x.country || null,
              unread: Number(x.unread || x.unreadCount || 0),
              lastMessage: x.lastMessage || x.text || x.content || null,
              lastAt: x.lastAt || x.updatedAt || x.createdAt || null,
            }));
            break;
          } catch { /* next */ }
        }
      }

      // 3) Local tickets queue (same browser) — always merge so nothing is lost
      const localTickets = readLocalSupportTickets();
      const deletedIds = getDeletedThreadIds();
      if (localTickets.length) {
        const byUser = new Map<string, SupportPeer>();
        for (const p of list) byUser.set(p.id, p);
        for (const t of localTickets) {
          const key = t.fromUserId || t.fromUsername || t.id;
          if (!key) continue;
          if (deletedIds.has(key)) continue; // skip deleted threads
          const existing = byUser.get(key);
          if (existing) {
            existing.lastMessage = t.text || existing.lastMessage;
            existing.unread = (existing.unread || 0) + (t.unread || 1);
            existing.lastAt = t.at || existing.lastAt;
          } else {
            byUser.set(key, {
              id: key,
              name: t.fromName || null,
              username: t.fromUsername || null,
              avatarUrl: null,
              online: false,
              unread: t.unread || 1,
              lastMessage: t.text,
              lastAt: t.at,
            });
          }
        }
        list = Array.from(byUser.values());
      }

      setSupportInbox(list.filter(p => !getDeletedThreadIds().has(p.id)));
      setSupportUnreadTotal(list.reduce((s, x) => s + (x.unread || 0), 0));
    } catch { /* silent */ } finally {
      setSupportInboxLoading(false);
    }
  }

  useEffect(() => {
    if (!user || !isSupportOwnerAccount(user as { email?: string | null; username?: string | null }, profileUsername)) return;
    // Only poll while settings is open; use longer interval to avoid jank
    const boot = window.setTimeout(() => { loadSupportInbox(); }, 50);
    const id = setInterval(loadSupportInbox, 20000);
    const onTicket = () => { loadSupportInbox(); };
    window.addEventListener('stooorna:support-ticket', onTicket);
    window.addEventListener('storage', onTicket);
    return () => {
      clearTimeout(boot);
      clearInterval(id);
      window.removeEventListener('stooorna:support-ticket', onTicket);
      window.removeEventListener('storage', onTicket);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profileUsername]);



  // Load recordings only when Live tab is active (deferred to keep tab switch smooth)
  useEffect(() => {
    if (!user || tab !== 'live') return;
    const id = window.setTimeout(() => {
      loadRecordings();
      loadLiveRecs();
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab]);

  // Username edit state (for logged-in users)
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState('');

  // Avatar upload state
  const [avatarUrl, setAvatarUrl] = useState<string | null>((user as {
    avatarUrl?: string | null;
    image?: string | null;
  })?.avatarUrl ?? (user as {
    image?: string | null;
  })?.image ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Cover photo state
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Bio state
  const [bio, setBio] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState('');
  const [bioLoading, setBioLoading] = useState(false);
  const [bioMsg, setBioMsg] = useState('');

  // Display name (nickname) edit state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameMsg, setNameMsg] = useState('');
  const [displayNameState, setDisplayNameState] = useState<string>(user?.name ?? '');

  // Business registration (regular user -> Business after owner approval)
  const [businessToggleOn, setBusinessToggleOn] = useState(false);
  const [businessModalOpen, setBusinessModalOpen] = useState(false);
  const [businessRow, setBusinessRow] = useState<BusinessRegistration | null>(null);
  const [bizBalance, setBizBalance] = useState(0);
  const [bizTopUpOpen, setBizTopUpOpen] = useState(false);
  const [bizCardNumber, setBizCardNumber] = useState('');
  const [bizCardExp, setBizCardExp] = useState('');
  const [bizCardCvv, setBizCardCvv] = useState('');
  const [bizTopUpAmount, setBizTopUpAmount] = useState('10');
  const [bizProjectName, setBizProjectName] = useState('');
  const [bizLicense, setBizLicense] = useState('');
  const [bizTradeLicense, setBizTradeLicense] = useState('');
  const [bizCommCert, setBizCommCert] = useState<string>('');
  const [bizCommCertName, setBizCommCertName] = useState('');
  const [bizTradeCert, setBizTradeCert] = useState<string>('');
  const [bizTradeCertName, setBizTradeCertName] = useState('');
  const [bizSubmitting, setBizSubmitting] = useState(false);
  const [ownerBusinessList, setOwnerBusinessList] = useState<BusinessRegistration[]>([]);
  const [ownerBizNotes, setOwnerBizNotes] = useState<Record<string, string>>({});
  const [bizOwnerNoteOpen, setBizOwnerNoteOpen] = useState(false);
  const bizCommFileRef = useRef<HTMLInputElement | null>(null);
  const bizTradeFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setBusinessRow(null);
      setBusinessToggleOn(false);
      setBizBalance(0);
      return;
    }
    const row = getBusinessForUser(user.id);
    setBusinessRow(row);
    setBusinessToggleOn(!!(row && (row.status === 'approved' || row.status === 'pending')));
    if (row?.ownerNote && !row.ownerNoteSeen) setBizOwnerNoteOpen(true);
    try {
      const bal = Number(localStorage.getItem(`stooorna_biz_balance_${user.id}`) || '0') || 0;
      setBizBalance(bal);
    } catch { setBizBalance(0); }
    const onBiz = () => {
      const r = getBusinessForUser(user.id);
      setBusinessRow(r);
      setBusinessToggleOn(!!(r && (r.status === 'approved' || r.status === 'pending')));
      if (r?.ownerNote && !r.ownerNoteSeen) setBizOwnerNoteOpen(true);
    };
    window.addEventListener('stooorna:business-registry', onBiz);
    return () => window.removeEventListener('stooorna:business-registry', onBiz);
  }, [user?.id]);

  useEffect(() => {
    const owner = isPrivilegedUser(user as { email?: string | null; username?: string | null; name?: string | null } | null);
    if (!owner) return;
    const refresh = () => setOwnerBusinessList(loadBusinessRegistry());
    refresh();
    window.addEventListener('stooorna:business-registry', refresh);
    return () => window.removeEventListener('stooorna:business-registry', refresh);
  }, [user, tab]);

  // Change email state
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [showEmailPw, setShowEmailPw] = useState(false);

  // Change password state
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmNewPw, setConfirmNewPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // Phone state
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState('');
  const [profilePhone, setProfilePhone] = useState('');

  // Share / QR state
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  // Sync avatarUrl + profileUsername when user object changes — always fetch fresh from DB
  useEffect(() => {
    if (!user) return;
    // Prefer session username immediately (no empty field after signup)
    const sessionUn = String((user as { username?: string | null }).username || '').replace(/^@/, '').trim();
    if (sessionUn) setProfileUsername(sessionUn);
    try {
      const pending = localStorage.getItem('stooorna_pending_username') || '';
      const byEmail = localStorage.getItem(`stooorna_username_${String(user.email || '').toLowerCase()}`) || '';
      const localUn = (pending || byEmail).replace(/^@/, '').trim();
      if (localUn && !sessionUn) setProfileUsername(localUn);
    } catch { /* ignore */ }
    fetch('/api/users/me').then(r => r.ok ? r.json() : null).then(async d => {
      if (d?.avatarUrl) setAvatarUrl(d.avatarUrl);
      if (d?.username) {
        setProfileUsername(d.username);
        try {
          localStorage.setItem('stooorna_pending_username', String(d.username).replace(/^@/, ''));
          if (user.email) localStorage.setItem(`stooorna_username_${String(user.email).toLowerCase()}`, String(d.username).replace(/^@/, ''));
        } catch { /* */ }
      } else {
        // DB missing username — apply local/session value once
        const fallback = sessionUn || (() => {
          try {
            return (localStorage.getItem('stooorna_pending_username')
              || localStorage.getItem(`stooorna_username_${String(user.email || '').toLowerCase()}`)
              || '').replace(/^@/, '').trim();
          } catch { return ''; }
        })();
        if (fallback) {
          setProfileUsername(fallback);
          try {
            await fetch('/api/users/me', {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: fallback }),
            });
          } catch { /* ignore */ }
        }
      }
      if (d?.phoneNumber) setProfilePhone(d.phoneNumber);
      if (d?.coverUrl) setCoverUrl(d.coverUrl);
      if (d?.name) setDisplayNameState(d.name);
    });
  }, [user]);

  // Load bio when user is available
  useEffect(() => {
    if (!user) return;
    fetch('/api/users/me/bio').then(r => r.ok ? r.json() : null).then(d => {
      if (d) setBio(d.bio ?? '');
    });
  }, [user]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recLoading, setRecLoading] = useState(false);

  // Live recordings (past broadcasts saved as MP4)
  interface LiveRec {
    id: number;
    title: string | null;
    startedAt: string;
    endedAt: string | null;
    videoUrl: string | null;
    duration: number | null;
    fileSize: number | null;
  }
  const [liveRecs, setLiveRecs] = useState<LiveRec[]>([]);
  const [liveRecsLoading, setLiveRecsLoading] = useState(false);
  const [liveRecDeleting, setLiveRecDeleting] = useState<number | null>(null); // id being deleted
  const [liveRecDeleteConfirm, setLiveRecDeleteConfirm] = useState<number | null>(null); // confirm dialog
  const [liveRecShareId, setLiveRecShareId] = useState<number | null>(null); // share sheet open
  const [liveRecShareCopied, setLiveRecShareCopied] = useState(false);

  // Owner: all users + highlights
  const isOwner = isPrivilegedUser(user as { email?: string | null; username?: string | null; name?: string | null } | null);

  // Non-owners never stay on the Company tab
  useEffect(() => {
    if (tab !== 'companies') return;
    if (!isSupportOwnerAccount(
      user as { email?: string | null; username?: string | null; name?: string | null },
      profileUsername,
    )) {
      setTab('account');
    }
  }, [tab, user, profileUsername]);


  // Load owner data (users list) when logged in as owner
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Defer heavy owner fetches until Company tab or admin panels open (prevents settings freeze)
  useEffect(() => {
    if (!user || !isOwner) return;
    if (tab !== 'companies' && !showSupportUsers && !showOwnerCompanies) return;
    const id = window.setTimeout(() => {
      void loadOwnerData();
      void loadNewCompanies();
      if (tab === 'companies' || showOwnerCompanies) refreshOwnerCompanies();
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isOwner, tab, showSupportUsers, showOwnerCompanies]);
  const [allUsers, setAllUsers] = useState<{
    id: string;
    name: string | null;
    username: string | null;
    email: string;
    isBanned: boolean | null;
    lastIp: string | null;
    isRoomAdmin: boolean | null;
    createdAt: string | null;
    nameColor?: string | null;
    country?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    accountType?: string | null;
    type?: string | null;
    role?: string | null;
    isCompany?: boolean | null;
    companyName?: string | null;
    tradeName?: string | null;
    licenseNumber?: string | null;
  }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  // Presence for owner users list (أفراد + شركات داخل كنترول المستخدمين)
  const ownerUserIds = useMemo(
    () => [...allUsers.map(u => u.id), ...allCompanyCtrlUsers.map(u => u.id)],
    [allUsers, allCompanyCtrlUsers],
  );
  const ownerPresence = usePresenceQuery(isOwner ? ownerUserIds : []);



  async function loadRecordings() {
    setRecLoading(true);
    try {
      const res = await fetch('/api/recordings', {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setRecordings(data);
      }
    } catch {
      // silent
    } finally {
      setRecLoading(false);
    }
  }
  async function loadLiveRecs() {
    setLiveRecsLoading(true);
    try {
      const res = await fetch('/api/live/recordings', {
        credentials: 'include'
      });
      if (res.ok) setLiveRecs(await res.json());
    } catch {/* silent */} finally {
      setLiveRecsLoading(false);
    }
  }
  async function deleteLiveRec(id: number) {
    setLiveRecDeleting(id);
    try {
      const res = await fetch(`/api/live/recordings/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) setLiveRecs(prev => prev.filter(r => r.id !== id));
    } catch {/* silent */} finally {
      setLiveRecDeleting(null);
      setLiveRecDeleteConfirm(null);
    }
  }
  function shareLiveRec(rec: LiveRec) {
    setLiveRecShareId(rec.id);
    setLiveRecShareCopied(false);
  }
  function copyLiveRecLink(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setLiveRecShareCopied(true);
      setTimeout(() => setLiveRecShareCopied(false), 2000);
    }).catch(() => {});
  }
  async function loadOwnerData() {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const usersRes = await fetch('/api/owner/users', { credentials: 'include' });
      if (usersRes.ok) {
        const data = await usersRes.json();
        const rows: any[] = Array.isArray(data) ? data : (data?.rows ?? []);

        // Split: people → تبويب مستخدمين | companies → تبويب شركات داخل كنترول + سجل الشركات
        const people: typeof allUsers = [];
        const companies: typeof allCompanyCtrlUsers = [];
        for (const row of rows) {
          if (isUserDeleted(row)) {
            void permanentlyDeleteSupportUser({
              id: String(row.id || ''),
              email: row.email,
              username: row.username,
            });
            continue;
          }
          if (isCompanyAccountRow(row)) {
            ensureCompanyInRegistry(row);
            companies.push(row);
          } else {
            people.push(row);
          }
        }
        setAllUsers(people);
        setAllCompanyCtrlUsers(companies);
        startTransition(() => { setOwnerCompanies(sanitizeCompaniesRegistry()); });
      } else {
        const errText = await usersRes.text().catch(() => String(usersRes.status));
        setUsersError(`Error ${usersRes.status}: ${errText}`);
        console.error('[loadOwnerData] status', usersRes.status, errText);
      }
    } catch (e) {
      setUsersError(`Network error: ${String(e)}`);
      console.error('[loadOwnerData] error', e);
    } finally {
      setUsersLoading(false);
    }
  }
  async function saveEmail() {
    setEmailLoading(true);
    setEmailMsg('');
    try {
      const r = await fetch('/api/users/me/email', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          newEmail,
          currentPassword: emailPassword
        })
      });
      const d = await r.json();
      if (r.ok) {
        setEmailMsg('Email updated!');
        setEditingEmail(false);
        setEmailPassword('');
        setNewEmail('');
      } else setEmailMsg(d.error || 'Failed');
    } catch {
      setEmailMsg('Network error');
    } finally {
      setEmailLoading(false);
    }
  }
  async function savePassword() {
    setPwLoading(true);
    setPwMsg('');
    if (newPw !== confirmNewPw) {
      setPwMsg('New passwords do not match');
      setPwLoading(false);
      return;
    }
    if (newPw.length < 8) {
      setPwMsg('Password must be at least 8 characters');
      setPwLoading(false);
      return;
    }
    try {
      const r = await fetch('/api/users/me/password', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentPassword: currentPw,
          newPassword: newPw
        })
      });
      const d = await r.json();
      if (r.ok) {
        setPwMsg('Password changed!');
        setEditingPassword(false);
        setCurrentPw('');
        setNewPw('');
        setConfirmNewPw('');
      } else setPwMsg(d.error || 'Failed');
    } catch {
      setPwMsg('Network error');
    } finally {
      setPwLoading(false);
    }
  }
  async function savePhone() {
    setPhoneLoading(true);
    setPhoneMsg('');
    try {
      const r = await fetch('/api/users/me/phone', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: phoneInput
        })
      });
      const d = await r.json();
      if (r.ok) {
        setPhoneMsg('Saved!');
        setEditingPhone(false);
        setProfilePhone(d.phone ?? '');
      } else setPhoneMsg(d.error || 'Failed');
    } catch {
      setPhoneMsg('Network error');
    } finally {
      setPhoneLoading(false);
    }
  }
  async function saveBio() {
    setBioLoading(true);
    setBioMsg('');
    try {
      const r = await fetch('/api/users/me/bio', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bio: bioInput
        })
      });
      const d = await r.json();
      if (r.ok) {
        setBio(d.bio);
        setEditingBio(false);
      } else setBioMsg(d.error || 'Failed');
    } catch {
      setBioMsg('Error saving');
    } finally {
      setBioLoading(false);
    }
  }
  async function saveName() {
    setNameLoading(true);
    setNameMsg('');
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameMsg('Name cannot be empty');
      setNameLoading(false);
      return;
    }
    if (trimmed.length > 60) {
      setNameMsg('Max 60 characters');
      setNameLoading(false);
      return;
    }
    try {
      const r = await fetch('/api/users/me/name', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: trimmed
        })
      });
      const d = await r.json();
      if (r.ok) {
        setDisplayNameState(d.name);
        setEditingName(false);
        setNameMsg('');
      } else {
        setNameMsg(d.error || 'Failed to update name');
      }
    } catch {
      setNameMsg('Error saving');
    } finally {
      setNameLoading(false);
    }
  }
  function copyLink(profileUrl: string) {
    navigator.clipboard.writeText(profileUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  async function saveUsername() {
    setUsernameLoading(true);
    setUsernameMsg('');
    const un = newUsername.trim().replace(/^@/, '');
    if (!/^[a-zA-Z0-9_]{2,30}$/.test(un)) {
      setUsernameMsg('2–30 حرفاً — حروف/أرقام/_ فقط · 2–30 chars');
      setUsernameLoading(false);
      return;
    }
    // Check availability (skip if unchanged)
    if (un !== String((user as { username?: string }).username || profileUsername || '').replace(/^@/, '')) {
      try {
        const chk = await fetch(`/api/users/check-username?username=${encodeURIComponent(un)}`);
        const d = await chk.json();
        if (d.available === false || d.taken === true) {
          setUsernameMsg('غير متاح — اليوزر مستخدم · Username taken');
          setUsernameLoading(false);
          return;
        }
        // سجل الشركات المحلي
        try {
          const reg = loadCompaniesRegistry();
          if (reg.some(c => String(c.username || '').replace(/^@/, '').toLowerCase() === un.toLowerCase()
            && String(c.email || '').toLowerCase() !== String((user as any)?.email || '').toLowerCase())) {
            setUsernameMsg('غير متاح — اليوزر مستخدم · Username taken');
            setUsernameLoading(false);
            return;
          }
        } catch { /* */ }
      } catch {/* network error — proceed */}
    }
    try {
      const r = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: un
        })
      });
      const d = await r.json();
      if (!r.ok) setUsernameMsg(d.error || 'Failed'); else {
        setUsernameMsg('متاح وتم الحفظ · Saved!');
        setEditingUsername(false);
        setProfileUsername(un);
        setNewUsername(un);
        // حدّث سجل الشركة إن وُجد
        try {
          const em = String((user as any)?.email || '').toLowerCase();
          if (em) {
            const co = findCompanyByEmail(em);
            if (co) {
              upsertCompanyRegistration({ ...co, username: un, updatedAt: new Date().toISOString() });
            }
          }
        } catch { /* */ }
      }
    } catch {
      setUsernameMsg('Error saving');
    } finally {
      setUsernameLoading(false);
    }
  }
  async function uploadAvatar(file: File) {
    setAvatarUploading(true);
    try {
      const r = await fetch('/api/users/me/avatar', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'image/jpeg'
        },
        body: file
      });
      const d = await r.json();
      if (r.ok && d.avatarUrl) {
        const fresh = `${d.avatarUrl}?t=${Date.now()}`;
        setAvatarUrl(fresh);
        window.dispatchEvent(new CustomEvent('stooorna:avatar-updated', {
          detail: {
            avatarUrl: fresh
          }
        }));
      }
    } catch {/* silent */} finally {
      setAvatarUploading(false);
    }
  }
  async function uploadCover(file: File) {
    setCoverUploading(true);
    try {
      const r = await fetch('/api/users/me/cover', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': file.type || 'image/jpeg'
        },
        body: file
      });
      const d = await r.json();
      if (r.ok && d.coverUrl) {
        setCoverUrl(`${d.coverUrl}?t=${Date.now()}`);
      }
    } catch {/* silent */} finally {
      setCoverUploading(false);
    }
  }
  async function handleLogout() {
    await signOut();
  }
  function handleDelete(id: number) {
    fetch(`/api/recordings/${id}`, {
      method: 'DELETE'
    }).catch(() => {});
    setRecordings(prev => prev.filter(r => r.id !== id));
  }
  return <>
      <Helmet>
        <title>Settings | Stooorna</title>
        <meta name="description" content="Manage your Stooorna account — update your profile, change your username, manage recordings, and configure your app." />
        <link rel="canonical" href="https://stooorna.com/settings" />
        <meta property="og:title" content="Settings | Stooorna" />
        <meta property="og:description" content="Manage your Stooorna account — profile, username, recordings, and app settings." />
        <meta property="og:image" content="https://stooorna.com/og-image.svg" />
        <meta property="og:url" content="https://stooorna.com/settings" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://stooorna.com/og-image.svg" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="relative flex flex-col overflow-hidden select-none min-h-0" style={{
      height: '100dvh',
      minHeight: '100dvh',
      background: T.bg,
      fontFamily: 'var(--font-sans)'
    }}>
        <h1 className="sr-only">Settings</h1>

        {/* Background glow */}
        <motion.div className="pointer-events-none absolute" style={{
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: `radial-gradient(circle, rgba(0,188,212,0.1) 0%, transparent 70%)`,
        top: '20%',
        left: '50%',
        transform: 'translate(-50%, -50%)'
      }} animate={{
        opacity: [0.4, 0.7, 0.4]
      }} transition={{
        duration: 4,
        repeat: Infinity,
        ease: 'easeInOut'
      }} />

        {/* Header — map pin (GPS live) left + Settings title + Support icon right */}
        <div className="flex items-center justify-between px-5 pt-10 pb-4 z-10" style={{
        borderBottom: `1px solid ${T.navBorder}`
      }}>
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={() => {
              try {
                window.dispatchEvent(new CustomEvent('stooorna:open-live-map'));
              } catch { /* */ }
              navigate('/add-friend?liveMap=1');
            }}
            title="Map"
            aria-label="Open live map"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(239,68,68,0.12)',
              border: '1.5px solid #ef4444',
              color: '#ef4444',
              cursor: 'pointer',
              boxShadow: '0 0 12px rgba(239,68,68,0.25)',
              padding: 0,
            }}
          >
            <MapPin size={18} strokeWidth={2.4} />
          </motion.button>
          <p style={{
          letterSpacing: '0.3em',
          fontSize: '0.7rem',
          color: T.primaryDim,
          fontWeight: 600,
          textTransform: 'uppercase',
          margin: 0
        }}>
            Settings
          </p>
          {/*
            أيقونة الدعم فوق:
            - مستخدم عادي مسجّل → تظهر
            - حساب الدعم @Stooorna / Stooorna@mail.com فقط → تُخفى (له قسم تحت الأصدقاء)
            - غير مسجّل → تُخفى
          */}
          {shouldShowSupportHeaderIcon(
            user as { email?: string | null; username?: string | null; name?: string | null } | null,
            profileUsername,
          ) ? (
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => setShowSupportChat(true)}
              title="Support"
              aria-label="Support chat"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,188,212,0.12)',
                border: '1px solid rgba(0,188,212,0.4)',
                color: '#00BCD4',
                cursor: 'pointer',
                boxShadow: '0 0 12px rgba(0,188,212,0.25)',
              }}
            >
              <Headphones size={18} strokeWidth={2.2} />
            </motion.button>
          ) : (
            <div style={{ width: 36 }} />
          )}
        </div>

        {/* Tabs — only when logged in */}
        {user && <div className="flex z-10 px-5 pt-4 gap-3">
            {((isSupportOwnerAccount(
              user as { email?: string | null; username?: string | null; name?: string | null },
              profileUsername,
            ) ? (['account', 'live', 'companies'] as Tab[]) : (['account', 'live'] as Tab[]))).map(t => <button key={t} type="button" onClick={() => startTransition(() => setTab(t))} style={{
          flex: 1,
          padding: '8px 0',
          borderRadius: 8,
          border: `1px solid ${tab === t ? T.tabBorder : T.surfaceBorder}`,
          background: tab === t ? T.tabActive : 'transparent',
          color: tab === t ? T.primary : T.textMuted,
          fontSize: '0.72rem',
          fontWeight: 600,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}>
                {t === 'account' ? 'Profile' : t === 'live' ? 'Live' : 'Company'}
              </button>)}
          </div>}

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain z-10 px-5 pt-6 pb-28" style={{
        WebkitOverflowScrolling: 'touch'
      }}>
          <AnimatePresence initial={false}>

            {/* ── LOADING ── */}
            {isPending && <motion.div key="loading" initial={{
            opacity: 0
          }} animate={{
            opacity: 1
          }} exit={{
            opacity: 0
          }} className="flex items-center justify-center pt-20">
                <motion.div animate={{
              rotate: 360
            }} transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'linear'
            }} style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: `2px solid ${T.primaryBorder}`,
              borderTopColor: T.primary
            }} />
              </motion.div>}

            {/* ── NOT LOGGED IN ── */}
            {!isPending && !user && <motion.div key="auth" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
              <AuthScreen T={T} />
            </motion.div>}

            {/* ── LOGGED IN — ACCOUNT (MY PROFILE) TAB ── */}
            {!isPending && user && tab === 'account' && (() => {
            const displayName = displayNameState || user.name || profileUsername || 'User';
            const profileUrl = profileUsername ? `https://stooorna.com/u/${profileUsername}` : '';
            return <motion.div key="account" initial={{ opacity: 0, scale: 0.94, y: 20, borderRadius: 28 }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{ opacity: 0, scale: 0.96, y: 12, borderRadius: 22 }} className="flex flex-col gap-5">
                  {/* ── Hero: Cover + Avatar + Name ── */}
                  <div style={{
                borderRadius: 16,
                overflow: 'hidden',
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                position: 'relative',
              }}>

                    {/* Cover photo strip */}
                    <div style={{
                  position: 'relative',
                  width: '100%',
                  height: 110,
                  background: coverUrl ? 'transparent' : T.primaryFaint,
                  cursor: 'pointer'
                }} onClick={() => coverInputRef.current?.click()}>
                      {coverUrl ? <img src={coverUrl} alt="cover" style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }} /> : <div style={{
                    width: '100%',
                    height: '100%'
                  }} />}
                      {/* dark overlay on hover hint */}
                      <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: coverUploading ? 1 : 0,
                    transition: 'opacity 0.2s',
                    pointerEvents: 'none'
                  }}>
                        {coverUploading && <motion.div animate={{
                      rotate: 360
                    }} transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      ease: 'linear'
                    }} style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: `2px solid ${T.primary}`,
                      borderTopColor: 'transparent'
                    }} />}
                      </div>
                      {/* camera badge top-right */}
                      {!coverUploading && <div style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.55)',
                    border: `1.5px solid rgba(255,255,255,0.15)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none'
                  }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        </div>}
                      <input ref={coverInputRef} type="file" accept="image/*" style={{
                    display: 'none'
                  }} onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) uploadCover(f);
                    e.target.value = '';
                  }} />
                    </div>

                    {/* Avatar overlapping the cover */}
                    <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  paddingBottom: 18,
                  marginTop: -40
                }}>
                      <div className="relative" style={{
                    flexShrink: 0
                  }}>
                        <motion.button whileTap={{
                      scale: 0.92
                    }} onClick={() => avatarInputRef.current?.click()} style={{
                      width: 80,
                      height: 80,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      background: avatarUrl ? 'transparent' : T.primaryFaint,
                      border: isOwner ? '3px solid #2563eb' : `3px solid rgba(6,14,14,0.95)`,
                      boxShadow: isOwner ? '0 0 0 2px rgba(37,99,235,0.35), 0 0 18px rgba(37,99,235,0.45)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      position: 'relative'
                    }}>
                          {avatarUrl ? <img src={avatarUrl} alt="avatar" style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }} onError={() => setAvatarUrl(null)} /> : <User size={30} style={{
                        color: T.primary
                      }} />}
                          <div style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.45)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: avatarUploading ? 1 : 0,
                        transition: 'opacity 0.2s'
                      }}>
                            {avatarUploading && <motion.div animate={{
                          rotate: 360
                        }} transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          ease: 'linear'
                        }} style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          border: `2px solid ${T.primary}`,
                          borderTopColor: 'transparent'
                        }} />}
                          </div>
                        </motion.button>
                        {/* camera badge */}
                        <div style={{
                      position: 'absolute',
                      bottom: 2,
                      right: 2,
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: T.primary,
                      border: '2.5px solid rgba(6,14,14,0.95)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none'
                    }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        </div>
                        {/* online dot */}
                        <span style={{
                      position: 'absolute',
                      top: 4,
                      right: 2,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: '#22c55e',
                      border: '2.5px solid rgba(6,14,14,0.95)',
                      boxShadow: '0 0 8px rgba(34,197,94,0.8)',
                      zIndex: 2
                    }} />
                        <input ref={avatarInputRef} type="file" accept="image/*" style={{
                      display: 'none'
                    }} onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) uploadAvatar(f);
                      e.target.value = '';
                    }} />
                      </div>

                      {/* Name + username + online label */}
                      <div style={{
                    textAlign: 'center',
                    marginTop: 10
                  }}>
                        {/* OWNER badge */}
                        {isOwner && <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 5
                    }}>
                            <span style={{
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        color: '#fff',
                        background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                        borderRadius: 6,
                        padding: '2px 8px',
                        boxShadow: '0 0 10px rgba(37,99,235,0.6)',
                        letterSpacing: '0.08em'
                      }}>OWNER</span>
                          </div>}
                        <p style={{
                      color: isOwner ? '#2563eb' : T.text,
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      lineHeight: 1.2,
                      textShadow: isOwner ? '0 0 12px rgba(37,99,235,0.6)' : 'none'
                    }}>{displayName}</p>
                        {profileUsername && <p style={{
                      color: isOwner ? '#2563eb' : T.primaryDim,
                      fontSize: '0.78rem',
                      marginTop: 3,
                      fontWeight: isOwner ? 700 : 400,
                      textShadow: isOwner ? '0 0 8px rgba(37,99,235,0.5)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap',
                    }}>@{profileUsername}
                      {(businessRow?.status === 'approved' || isPublicBusinessAccount({ id: user?.id, username: profileUsername, email: user?.email })) && (
                        <BusinessHeadBadge />
                      )}
                    </p>}
                        <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      marginTop: 7
                    }}>
                          <span style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: '#22c55e',
                        boxShadow: '0 0 6px rgba(34,197,94,0.8)',
                        display: 'inline-block'
                      }} />
                          <span style={{
                        color: '#22c55e',
                        fontSize: '0.68rem',
                        fontWeight: 600
                      }}>Online</span>
                        </div>
                      </div>

                      {/* Public live voice mic — left side, same row as music */}
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => {
                          if (!user) return;
                          const qs = new URLSearchParams({
                            hostId: String((user as any).id || ''),
                            hostName: String((user as any).name || profileUsername || 'Host'),
                          });
                          if (profileUsername) qs.set('hostUsername', profileUsername);
                          const av = avatarUrl || (user as any).avatarUrl || (user as any).image;
                          if (av) qs.set('hostAvatar', String(av));
                          navigate('/live?' + qs.toString());
                        }}
                        aria-label="Public live voice"
                        title="Public live voice"
                        style={{
                          position: 'absolute',
                          left: 14,
                          bottom: 18,
                          zIndex: 5,
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: 'rgba(239,68,68,0.12)',
                          border: '1px solid rgba(239,68,68,0.45)',
                          color: '#ef4444',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 0 10px rgba(239,68,68,0.25)',
                        }}
                      >
                        <Mic size={15} strokeWidth={2.3} />
                      </motion.button>

                      {/* Music button — right side of profile card */}
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setMusicModalOpen(true)}
                        aria-label="Music"
                        title="Music"
                        style={{
                          position: 'absolute',
                          right: 14,
                          bottom: 18,
                          zIndex: 5,
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: musicIsPlaying ? 'rgba(0,188,212,0.22)' : 'rgba(0,188,212,0.1)',
                          border: `1px solid ${musicIsPlaying ? 'rgba(0,188,212,0.65)' : 'rgba(0,188,212,0.35)'}`,
                          color: '#00BCD4',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: musicIsPlaying
                            ? '0 0 10px rgba(0,188,212,0.4)'
                            : '0 1px 6px rgba(0,0,0,0.2)',
                        }}
                      >
                        <Music size={14} strokeWidth={2.2} />
                      </motion.button>
                    </div>
                  </div>

                  {/* ── شات الدعم + تحكم المستخدمين — فقط المالك والمشرفون ── */}
                  {isPrivilegedUser(
                    user as { email?: string | null; username?: string | null; name?: string | null },
                  ) && (
                    <>
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={() => {
                          loadSupportInbox();
                          setShowOwnerInbox(true);
                        }}
                        className="flex items-center justify-between"
                        style={{
                          width: '100%',
                          background: T.surface,
                          border: `1px solid ${supportUnreadTotal > 0 ? T.primaryBorder : T.surfaceBorder}`,
                          borderRadius: 14,
                          padding: '14px 16px',
                          color: T.text,
                          cursor: 'pointer',
                        }}
                        aria-label="Support Chat"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex items-center justify-center" style={{
                            width: 38, height: 38, borderRadius: 12, background: T.primaryFaint,
                            border: `1px solid ${T.primaryBorder}`, color: T.primary, position: 'relative',
                          }}>
                            <MessageCircle size={19} strokeWidth={2.1} />
                            {supportUnreadTotal > 0 && (
                              <span style={{
                                position: 'absolute', top: -4, right: -4,
                                minWidth: 16, height: 16, borderRadius: 8, padding: '0 4px',
                                background: '#ef4444', color: '#fff', fontSize: '0.55rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {supportUnreadTotal > 9 ? '9+' : supportUnreadTotal}
                              </span>
                            )}
                          </span>
                          <span style={{ textAlign: 'left' }}>
                            <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700 }}>Support Chat</span>
                            <span style={{ display: 'block', marginTop: 2, color: T.textMuted, fontSize: '0.68rem' }}>
                              {supportUnreadTotal > 0
                                ? `${supportUnreadTotal} new message${supportUnreadTotal > 1 ? 's' : ''} from users`
                                : supportInbox.length > 0
                                  ? `${supportInbox.length} conversation${supportInbox.length > 1 ? 's' : ''} — tap to enter`
                                  : 'Click to enter even if there are no messages'}
                            </span>
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {supportUnreadTotal > 0 && (
                            <Bell size={15} style={{ color: '#eab308' }} />
                          )}
                          <span style={{ color: T.primary, fontSize: '1.25rem', lineHeight: 1 }}>‹</span>
                        </div>
                      </motion.button>

                    </>
                  )}

                  {/* ── Business toggle ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px',
                marginBottom: 10,
              }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{
                          color: T.textMuted, fontSize: '0.62rem', letterSpacing: '0.2em',
                          textTransform: 'uppercase', fontWeight: 500, margin: 0,
                        }}>Business</p>
                        <p style={{ margin: '4px 0 0', color: T.primaryDim, fontSize: '0.72rem', fontWeight: 600 }}>
                          {businessRow?.status === 'approved'
                            ? 'Active'
                            : businessRow?.status === 'pending'
                              ? 'Under review'
                              : 'Register your project'}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Toggle Business"
                        onClick={() => {
                          if (businessRow?.status === 'approved') {
                            setBusinessToggleOn(v => !v);
                            return;
                          }
                          if (businessRow?.status === 'pending') {
                            setBusinessToggleOn(true);
                            setBusinessModalOpen(true);
                            return;
                          }
                          const next = !businessToggleOn;
                          setBusinessToggleOn(next);
                          if (next) {
                            setBizProjectName('');
                            setBizLicense('');
                            setBizTradeLicense('');
                            setBizCommCert('');
                            setBizCommCertName('');
                            setBizTradeCert('');
                            setBizTradeCertName('');
                            setBusinessModalOpen(true);
                          }
                        }}
                        style={{
                          width: 48, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer',
                          background: (businessToggleOn || businessRow?.status === 'approved' || businessRow?.status === 'pending')
                            ? '#eab308' : 'rgba(150,190,190,0.25)',
                          position: 'relative', flexShrink: 0, padding: 0,
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 3, width: 22, height: 22, borderRadius: '50%',
                          background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                          left: (businessToggleOn || businessRow?.status === 'approved' || businessRow?.status === 'pending') ? 23 : 3,
                          transition: 'left 0.2s',
                        }} />
                      </button>
                    </div>
                    {(businessRow?.status === 'pending' || businessRow?.status === 'approved') && (
                      <button
                        type="button"
                        onClick={() => setBusinessModalOpen(true)}
                        style={{
                          marginTop: 10, width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none',
                          background: businessRow?.status === 'approved' ? 'rgba(234,179,8,0.18)' : 'rgba(0,188,212,0.12)',
                          color: businessRow?.status === 'approved' ? '#eab308' : '#00BCD4',
                          fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer',
                        }}
                      >
                        {businessRow?.status === 'approved' ? 'Business' : 'Under review'}
                      </button>
                    )}
                    {businessRow?.status === 'rejected' && (
                      <p style={{ margin: '10px 0 0', color: '#ef4444', fontSize: '0.72rem', fontWeight: 700 }}>
                        Request rejected — toggle is off. You may apply again.
                      </p>
                    )}
                    {!!(businessRow?.ownerNote && !businessRow?.ownerNoteSeen) && (
                      <button
                        type="button"
                        onClick={() => setBizOwnerNoteOpen(true)}
                        style={{
                          marginTop: 10, width: '100%', padding: '10px 12px', borderRadius: 10,
                          border: '1px solid rgba(234,179,8,0.45)', background: 'rgba(234,179,8,0.12)',
                          color: '#eab308', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        Message from owner — tap to read
                      </button>
                    )}
                  </div>

                  {/* Business balance — approved only */}
                  {businessRow?.status === 'approved' && (
                    <div style={{
                      background: T.surface,
                      border: `1px solid ${T.surfaceBorder}`,
                      borderRadius: 14,
                      padding: '14px 16px',
                      marginBottom: 10,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <p style={{
                            color: '#eab308', fontSize: '0.62rem', letterSpacing: '0.2em',
                            textTransform: 'uppercase', fontWeight: 700, margin: 0,
                          }}>My balance</p>
                          <p style={{ margin: '6px 0 0', color: '#eab308', fontSize: '1.15rem', fontWeight: 900 }}>
                            {bizBalance.toFixed(0)} KD
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="Add balance"
                          onClick={() => setBizTopUpOpen(true)}
                          style={{
                            width: 36, height: 36, borderRadius: '50%', border: '1.5px solid rgba(234,179,8,0.55)',
                            background: 'rgba(234,179,8,0.15)', color: '#eab308', fontWeight: 900,
                            fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1,
                          }}
                        >
                          +
                        </button>
                      </div>
                      <p style={{ margin: '10px 0 0', color: T.primaryDim, fontSize: '0.7rem', fontWeight: 600, lineHeight: 1.45 }}>
                        Place ads from New Post → + Product Ad (5 KD / month). Ads appear between feed posts.
                      </p>
                    </div>
                  )}

                  {/* ── Display Name ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8
                }}>
                      <p style={{
                    color: T.textMuted,
                    fontSize: '0.62rem',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    fontWeight: 500
                  }}>Display Name</p>
                      {!editingName && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingName(true);
                    setNameInput(displayName === 'User' ? '' : displayName);
                    setNameMsg('');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={13} />
                        </motion.button>}
                    </div>
                    <AnimatePresence mode="wait">
                      {editingName ? <motion.div key="edit-name" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }}>
                          <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value.slice(0, 60))} placeholder="اكتب اسمك المستعار…" autoFocus style={{
                      width: '100%',
                      padding: '9px 11px',
                      background: T.inputBg,
                      border: `1px solid ${T.inputBorder}`,
                      borderRadius: 9,
                      color: T.text,
                      fontSize: '0.83rem',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)'
                    }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} onKeyDown={e => {
                      if (e.key === 'Enter') saveName();
                      if (e.key === 'Escape') {
                        setEditingName(false);
                        setNameMsg('');
                      }
                    }} />
                          <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 7
                    }}>
                            <p style={{
                        color: T.textMuted,
                        fontSize: '0.62rem'
                      }}>{nameInput.length}/60</p>
                            <div style={{
                        display: 'flex',
                        gap: 7
                      }}>
                              <motion.button whileTap={{
                          scale: 0.9
                        }} onClick={() => {
                          setEditingName(false);
                          setNameMsg('');
                        }} style={{
                          padding: '5px 9px',
                          background: 'none',
                          border: `1px solid ${T.surfaceBorder}`,
                          borderRadius: 7,
                          color: T.textMuted,
                          cursor: 'pointer'
                        }}>
                                <X size={12} />
                              </motion.button>
                              <motion.button whileTap={{
                          scale: 0.9
                        }} onClick={saveName} disabled={nameLoading} style={{
                          padding: '5px 13px',
                          background: T.primaryFaint,
                          border: `1px solid ${T.primaryBorder}`,
                          borderRadius: 7,
                          color: T.primary,
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}>
                                {nameLoading ? '…' : <Check size={12} />}
                              </motion.button>
                            </div>
                          </div>
                          {nameMsg && <p style={{
                      color: '#ef4444',
                      fontSize: '0.68rem',
                      marginTop: 3
                    }}>{nameMsg}</p>}
                        </motion.div> : <motion.p key="view-name" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} style={{
                    color: T.text,
                    fontSize: '0.83rem',
                    lineHeight: 1.55
                  }}>
                          {displayName && displayName !== 'User' ? displayName : <span style={{
                      color: T.textMuted,
                      fontStyle: 'italic'
                    }}>لم يتم تعيين اسم — اضغط تعديل</span>}
                        </motion.p>}
                    </AnimatePresence>
                  </div>

                  {/* ── Bio ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8
                }}>
                      <p style={{
                    color: T.textMuted,
                    fontSize: '0.62rem',
                    letterSpacing: (businessRow?.status === 'approved' || isPublicBusinessAccount({ id: user?.id, username: profileUsername, email: user?.email })) ? '0.02em' : '0.2em',
                    textTransform: (businessRow?.status === 'approved' || isPublicBusinessAccount({ id: user?.id, username: profileUsername, email: user?.email })) ? 'none' : 'uppercase',
                    fontWeight: 500
                  }}>{(businessRow?.status === 'approved' || isPublicBusinessAccount({ id: user?.id, username: profileUsername, email: user?.email })) ? 'What is a business activity?' : 'BIO'}</p>
                      {!editingBio && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingBio(true);
                    setBioInput(bio);
                    setBioMsg('');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={13} />
                        </motion.button>}
                    </div>
                    <AnimatePresence mode="wait">
                      {editingBio ? <motion.div key="edit" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }}>
                          <textarea value={bioInput} onChange={e => setBioInput(e.target.value.slice(0, 160))} rows={3} placeholder={(businessRow?.status === 'approved' || isPublicBusinessAccount({ id: user?.id, username: profileUsername, email: user?.email })) ? 'Describe your business activity' : 'Write something about yourself'} style={{
                      width: '100%',
                      resize: 'none',
                      padding: '9px 11px',
                      background: T.inputBg,
                      border: `1px solid ${T.inputBorder}`,
                      borderRadius: 9,
                      color: T.text,
                      fontSize: '0.83rem',
                      outline: 'none',
                      fontFamily: 'var(--font-sans)',
                      lineHeight: 1.5
                    }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                          <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 7
                    }}>
                            <p style={{
                        color: T.textMuted,
                        fontSize: '0.62rem'
                      }}>{bioInput.length}/160</p>
                            <div style={{
                        display: 'flex',
                        gap: 7
                      }}>
                              <motion.button whileTap={{
                          scale: 0.9
                        }} onClick={() => {
                          setEditingBio(false);
                          setBioMsg('');
                        }} style={{
                          padding: '5px 9px',
                          background: 'none',
                          border: `1px solid ${T.surfaceBorder}`,
                          borderRadius: 7,
                          color: T.textMuted,
                          cursor: 'pointer'
                        }}>
                                <X size={12} />
                              </motion.button>
                              <motion.button whileTap={{
                          scale: 0.9
                        }} onClick={saveBio} disabled={bioLoading} style={{
                          padding: '5px 13px',
                          background: T.primaryFaint,
                          border: `1px solid ${T.primaryBorder}`,
                          borderRadius: 7,
                          color: T.primary,
                          fontSize: '0.73rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}>
                                {bioLoading ? '…' : <Check size={12} />}
                              </motion.button>
                            </div>
                          </div>
                          {bioMsg && <p style={{
                      color: '#ef4444',
                      fontSize: '0.68rem',
                      marginTop: 3
                    }}>{bioMsg}</p>}
                        </motion.div> : <motion.p key="view" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} style={{
                    color: bio ? T.text : T.textMuted,
                    fontSize: '0.83rem',
                    lineHeight: 1.55,
                    fontStyle: bio ? 'normal' : 'italic'
                  }}>
                          {bio || 'No bio yet — tap the edit icon to add one'}
                        </motion.p>}
                    </AnimatePresence>
                  </div>

                  {/* ── Username — للشركات فقط إذا فعّل الأونر المفتاح ── */}
                  {showUsernameSection && (
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <p style={{
                  color: T.textMuted,
                  fontSize: '0.62rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  marginBottom: 10
                }}>{sessionIsCompany ? 'يوزرنيم الشركة · Username' : 'Username'}</p>
                    {editingUsername ? <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <div className="relative flex-1 flex items-center">
                            <AtSign size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="your_username" style={{
                        width: '100%',
                        paddingLeft: 30,
                        paddingRight: 10,
                        paddingTop: 8,
                        paddingBottom: 8,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 8,
                        color: T.text,
                        fontSize: '0.82rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} />
                          </div>
                          <motion.button whileTap={{
                      scale: 0.9
                    }} onClick={saveUsername} disabled={usernameLoading} style={{
                      padding: '8px 14px',
                      background: T.primaryFaint,
                      border: `1px solid ${T.primaryBorder}`,
                      borderRadius: 8,
                      color: T.primary,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}>
                            {usernameLoading ? '…' : 'Save'}
                          </motion.button>
                          <motion.button whileTap={{
                      scale: 0.9
                    }} onClick={() => {
                      setEditingUsername(false);
                      setUsernameMsg('');
                    }} style={{
                      padding: '8px 10px',
                      background: 'none',
                      border: `1px solid ${T.surfaceBorder}`,
                      borderRadius: 8,
                      color: T.textMuted,
                      cursor: 'pointer'
                    }}>
                            <X size={13} />
                          </motion.button>
                        </div>
                        {usernameMsg && <p style={{
                    color: usernameMsg === 'Saved!' ? T.primary : '#ef4444',
                    fontSize: '0.7rem'
                  }}>{usernameMsg}</p>}
                      </div> : <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AtSign size={14} style={{
                      color: T.primaryDim
                    }} />
                          <p style={{
                      color: T.textMuted,
                      fontSize: '0.78rem'
                    }}>
                            {profileUsername ? <span style={{
                        color: T.text
                      }}>{profileUsername}</span> : <span style={{
                        fontStyle: 'italic'
                      }}>No username set</span>}
                          </p>
                        </div>
                        <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingUsername(true);
                    setNewUsername(profileUsername ?? '');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={14} />
                        </motion.button>
                      </div>}
                  </div>
                  )}

                  {/* ── Phone Number ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10
                }}>
                      <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7
                  }}>
                        <Phone size={13} style={{
                      color: T.primaryDim
                    }} />
                        <p style={{
                      color: T.textMuted,
                      fontSize: '0.62rem',
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      fontWeight: 500
                    }}>Phone Number</p>
                      </div>
                      {!editingPhone && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingPhone(true);
                    setPhoneInput(profilePhone);
                    setPhoneMsg('');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={13} />
                        </motion.button>}
                    </div>
                    <AnimatePresence mode="wait">
                      {editingPhone ? <motion.div key="edit-phone" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} className="flex flex-col gap-2">
                          <div className="relative flex items-center">
                            <Phone size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="+965 XXXX XXXX" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 10,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                          </div>
                          <div style={{
                      display: 'flex',
                      gap: 7
                    }}>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => {
                        setEditingPhone(false);
                        setPhoneMsg('');
                      }} style={{
                        padding: '6px 10px',
                        background: 'none',
                        border: `1px solid ${T.surfaceBorder}`,
                        borderRadius: 7,
                        color: T.textMuted,
                        cursor: 'pointer'
                      }}>
                              <X size={12} />
                            </motion.button>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={savePhone} disabled={phoneLoading} style={{
                        flex: 1,
                        padding: '6px 0',
                        background: T.primaryFaint,
                        border: `1px solid ${T.primaryBorder}`,
                        borderRadius: 7,
                        color: T.primary,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}>
                              {phoneLoading ? '…' : 'Save'}
                            </motion.button>
                          </div>
                          {phoneMsg && <p style={{
                      color: phoneMsg === 'Saved!' ? T.primary : '#ef4444',
                      fontSize: '0.7rem'
                    }}>{phoneMsg}</p>}
                        </motion.div> : <motion.div key="view-phone" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                          <Phone size={14} style={{
                      color: T.primaryDim
                    }} />
                          <p style={{
                      color: profilePhone ? T.text : T.textMuted,
                      fontSize: '0.82rem',
                      fontStyle: profilePhone ? 'normal' : 'italic'
                    }}>
                            {profilePhone || 'No phone number added'}
                          </p>
                        </motion.div>}
                    </AnimatePresence>
                  </div>

                  {/* ── Change Email ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10
                }}>
                      <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7
                  }}>
                        <Mail size={13} style={{
                      color: T.primaryDim
                    }} />
                        <p style={{
                      color: T.textMuted,
                      fontSize: '0.62rem',
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      fontWeight: 500
                    }}>Email Address</p>
                      </div>
                      {!editingEmail && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingEmail(true);
                    setNewEmail(user?.email ?? '');
                    setEmailMsg('');
                  }} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.primaryDim,
                    padding: 4
                  }}>
                          <Edit2 size={13} />
                        </motion.button>}
                    </div>
                    <AnimatePresence mode="wait">
                      {editingEmail ? <motion.div key="edit-email" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} className="flex flex-col gap-2">
                          <div className="relative flex items-center">
                            <Mail size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@email.com" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 10,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                          </div>
                          <div className="relative flex items-center">
                            <Lock size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type={showEmailPw ? 'text' : 'password'} value={emailPassword} onChange={e => setEmailPassword(e.target.value)} placeholder="Current password to confirm" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 36,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                            <button type="button" onClick={() => setShowEmailPw(v => !v)} className="absolute right-3" style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: T.textMuted
                      }}>
                              {showEmailPw ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                          <div style={{
                      display: 'flex',
                      gap: 7
                    }}>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => {
                        setEditingEmail(false);
                        setEmailMsg('');
                      }} style={{
                        padding: '6px 10px',
                        background: 'none',
                        border: `1px solid ${T.surfaceBorder}`,
                        borderRadius: 7,
                        color: T.textMuted,
                        cursor: 'pointer'
                      }}>
                              <X size={12} />
                            </motion.button>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={saveEmail} disabled={emailLoading || !newEmail || !emailPassword} style={{
                        flex: 1,
                        padding: '6px 0',
                        background: T.primaryFaint,
                        border: `1px solid ${T.primaryBorder}`,
                        borderRadius: 7,
                        color: T.primary,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: !newEmail || !emailPassword ? 0.5 : 1
                      }}>
                              {emailLoading ? '…' : 'Update Email'}
                            </motion.button>
                          </div>
                          {emailMsg && <p style={{
                      color: emailMsg === 'Email updated!' ? T.primary : '#ef4444',
                      fontSize: '0.7rem'
                    }}>{emailMsg}</p>}
                        </motion.div> : <motion.div key="view-email" initial={{
                    opacity: 0
                  }} animate={{
                    opacity: 1
                  }} exit={{
                    opacity: 0
                  }} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                          <Mail size={14} style={{
                      color: T.primaryDim
                    }} />
                          <p style={{
                      color: T.text,
                      fontSize: '0.82rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                            {user?.email}
                          </p>
                        </motion.div>}
                    </AnimatePresence>
                  </div>

                  {/* ── Change Password ── */}
                  <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                    <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: editingPassword ? 12 : 0
                }}>
                      <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7
                  }}>
                        <ShieldCheck size={13} style={{
                      color: T.primaryDim
                    }} />
                        <p style={{
                      color: T.textMuted,
                      fontSize: '0.62rem',
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      fontWeight: 500
                    }}>Password</p>
                      </div>
                      {!editingPassword && <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => {
                    setEditingPassword(true);
                    setPwMsg('');
                    setCurrentPw('');
                    setNewPw('');
                    setConfirmNewPw('');
                  }} style={{
                    padding: '5px 12px',
                    background: T.primaryFaint,
                    border: `1px solid ${T.primaryBorder}`,
                    borderRadius: 7,
                    color: T.primary,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}>
                          Change
                        </motion.button>}
                    </div>
                    <AnimatePresence>
                      {editingPassword && <motion.div key="edit-pw" initial={{
                    opacity: 0,
                    height: 0
                  }} animate={{
                    opacity: 1,
                    height: 'auto'
                  }} exit={{
                    opacity: 0,
                    height: 0
                  }} style={{
                    overflow: 'hidden'
                  }} className="flex flex-col gap-2">
                          {/* Current password */}
                          <div className="relative flex items-center">
                            <Lock size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type={showCurrentPw ? 'text' : 'password'} value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Current password" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 36,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                            <button type="button" onClick={() => setShowCurrentPw(v => !v)} className="absolute right-3" style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: T.textMuted
                      }}>
                              {showCurrentPw ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                          {/* New password */}
                          <div className="relative flex items-center">
                            <Lock size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type={showNewPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password (min 8 chars)" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 36,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = T.inputBorder} />
                            <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute right-3" style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: T.textMuted
                      }}>
                              {showNewPw ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                          {/* Confirm new password */}
                          <div className="relative flex items-center">
                            <Lock size={13} className="absolute left-3" style={{
                        color: T.primaryDim
                      }} />
                            <input type="password" value={confirmNewPw} onChange={e => setConfirmNewPw(e.target.value)} placeholder="Confirm new password" style={{
                        width: '100%',
                        paddingLeft: 32,
                        paddingRight: 10,
                        paddingTop: 9,
                        paddingBottom: 9,
                        background: T.inputBg,
                        border: `1px solid ${confirmNewPw && confirmNewPw !== newPw ? 'rgba(239,68,68,0.5)' : T.inputBorder}`,
                        borderRadius: 9,
                        color: T.text,
                        fontSize: '0.85rem',
                        outline: 'none',
                        fontFamily: 'var(--font-sans)'
                      }} onFocus={e => e.target.style.borderColor = T.inputFocus} onBlur={e => e.target.style.borderColor = confirmNewPw && confirmNewPw !== newPw ? 'rgba(239,68,68,0.5)' : T.inputBorder} />
                          </div>
                          {/* Strength indicator */}
                          {newPw.length > 0 && <div style={{
                      display: 'flex',
                      gap: 4,
                      alignItems: 'center'
                    }}>
                              {[1, 2, 3, 4].map(i => <div key={i} style={{
                        flex: 1,
                        height: 3,
                        borderRadius: 2,
                        background: newPw.length >= i * 3 ? newPw.length >= 12 ? '#22c55e' : newPw.length >= 8 ? T.primary : '#f59e0b' : 'rgba(255,255,255,0.1)',
                        transition: 'background 0.2s'
                      }} />)}
                              <span style={{
                        color: T.textMuted,
                        fontSize: '0.6rem',
                        flexShrink: 0
                      }}>
                                {newPw.length < 8 ? 'Weak' : newPw.length < 12 ? 'Good' : 'Strong'}
                              </span>
                            </div>}
                          <div style={{
                      display: 'flex',
                      gap: 7
                    }}>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => {
                        setEditingPassword(false);
                        setPwMsg('');
                      }} style={{
                        padding: '6px 10px',
                        background: 'none',
                        border: `1px solid ${T.surfaceBorder}`,
                        borderRadius: 7,
                        color: T.textMuted,
                        cursor: 'pointer'
                      }}>
                              <X size={12} />
                            </motion.button>
                            <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={savePassword} disabled={pwLoading || !currentPw || !newPw || !confirmNewPw} style={{
                        flex: 1,
                        padding: '6px 0',
                        background: T.primaryFaint,
                        border: `1px solid ${T.primaryBorder}`,
                        borderRadius: 7,
                        color: T.primary,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: !currentPw || !newPw || !confirmNewPw ? 0.5 : 1
                      }}>
                              {pwLoading ? '…' : 'Change Password'}
                            </motion.button>
                          </div>
                          {pwMsg && <p style={{
                      color: pwMsg === 'Password changed!' ? T.primary : '#ef4444',
                      fontSize: '0.7rem'
                    }}>{pwMsg}</p>}
                        </motion.div>}
                    </AnimatePresence>
                  </div>

                  {/* ── Share Profile ── */}
                  {profileUsername && <div style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`,
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                      <p style={{
                  color: T.textMuted,
                  fontSize: '0.62rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  marginBottom: 12
                }}>Share Profile</p>

                      {/* Profile link row */}
                      <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 11px',
                  background: T.inputBg,
                  border: `1px solid ${T.inputBorder}`,
                  borderRadius: 9,
                  marginBottom: 10
                }}>
                        <p style={{
                    flex: 1,
                    color: T.primary,
                    fontSize: '0.76rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                          stooorna.com/u/{profileUsername}
                        </p>
                        <motion.button whileTap={{
                    scale: 0.9
                  }} onClick={() => copyLink(profileUrl)} style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: copied ? '#22c55e' : T.primaryDim,
                    flexShrink: 0
                  }}>
                          {copied ? <Check size={15} strokeWidth={2} /> : <Copy size={15} strokeWidth={2} />}
                        </motion.button>
                      </div>

                      {/* QR toggle */}
                      <motion.button whileTap={{
                  scale: 0.97
                }} onClick={() => setShowQR(!showQR)} style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '9px',
                  background: T.primaryFaint,
                  border: `1px solid ${T.primaryBorder}`,
                  borderRadius: 9,
                  color: T.primary,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                        <QrCode size={15} strokeWidth={2} />
                        {showQR ? 'Hide QR Code' : 'Show QR Code'}
                      </motion.button>

                      <AnimatePresence>
                        {showQR && <motion.div initial={{
                    opacity: 0,
                    height: 0
                  }} animate={{
                    opacity: 1,
                    height: 'auto'
                  }} exit={{
                    opacity: 0,
                    height: 0
                  }} style={{
                    overflow: 'hidden',
                    display: 'flex',
                    justifyContent: 'center',
                    paddingTop: 14
                  }}>
                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(profileUrl)}&bgcolor=0a1a1a&color=00BCD4&margin=10`} alt="QR code" width={180} height={180} style={{
                      borderRadius: 12,
                      border: `1px solid ${T.primaryBorder}`
                    }} />
                          </motion.div>}
                      </AnimatePresence>

                      {/* Native share */}
                      {typeof navigator !== 'undefined' && navigator.share && <motion.button whileTap={{
                  scale: 0.97
                }} onClick={async () => {
                  try {
                    await navigator.share({
                      title: `${displayName} on Stooorna`,
                      url: profileUrl
                    });
                  } catch {
                    // Fallback: copy to clipboard if share() is blocked (e.g. iframe)
                    try {
                      await navigator.clipboard.writeText(profileUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {/* ignore */}
                  }
                }} style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '9px',
                  marginTop: 8,
                  background: T.primaryFaint,
                  border: `1px solid ${T.primaryBorder}`,
                  borderRadius: 9,
                  color: T.primary,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                          <Share2 size={15} strokeWidth={2} />
                          Share via…
                        </motion.button>}

                      {/* Full share page */}
                      <motion.button whileTap={{
                  scale: 0.97
                }} onClick={() => navigate(`/share?u=${encodeURIComponent(profileUsername ?? '')}`)} style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '9px',
                  marginTop: 8,
                  background: 'rgba(0,188,212,0.06)',
                  border: `1px solid ${T.primaryBorder}`,
                  borderRadius: 9,
                  color: T.primaryDim,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                        <Share2 size={14} strokeWidth={2} />
                        Open Share Page
                      </motion.button>
                    </div>}

                  {/* ── Short link for text posts (stooorna.com) ── */}
                  <div style={{
                    borderRadius: 16,
                    background: T.surface,
                    border: `1px solid ${T.surfaceBorder}`,
                    padding: '14px 14px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10,
                        background: T.primaryFaint, border: `1px solid ${T.primaryBorder}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.primary,
                      }}>
                        <Link2 size={16} strokeWidth={2.2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, color: T.text, fontSize: '0.84rem', fontWeight: 800 }}>رابط قصير للتطبيق</p>
                        <p style={{ margin: '2px 0 0', color: T.textMuted, fontSize: '0.68rem', lineHeight: 1.45 }}>
                          الصق أي رابط (فيديو/صورة/صفحة) لتحصل على رابط stooorna.com تستخدمه في البوست النصي
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                      <input
                        value={shortLinkInput}
                        onChange={e => { setShortLinkInput(e.target.value); setShortLinkError(''); setShortLinkCopied(false); }}
                        placeholder="الصق الرابط هنا… https://"
                        dir="ltr"
                        style={{
                          flex: 1, minWidth: 0,
                          background: T.inputBg,
                          border: `1px solid ${T.inputBorder}`,
                          borderRadius: 12,
                          padding: '11px 12px',
                          color: T.text,
                          fontSize: '0.8rem',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') void createAppShortLink(); }}
                      />
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => void pasteIntoShortLink()}
                        style={{
                          flexShrink: 0, padding: '0 14px', borderRadius: 12, cursor: 'pointer',
                          background: T.primaryFaint, border: `1px solid ${T.primaryBorder}`,
                          color: T.primary, fontWeight: 800, fontSize: '0.75rem',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <ClipboardPaste size={14} strokeWidth={2.2} />
                        Paste
                      </motion.button>
                    </div>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      disabled={shortLinkBusy || !shortLinkInput.trim()}
                      onClick={() => void createAppShortLink()}
                      style={{
                        width: '100%', minHeight: 42, borderRadius: 12, border: 'none', cursor: shortLinkInput.trim() ? 'pointer' : 'default',
                        background: shortLinkInput.trim() ? T.primary : T.primaryFaint,
                        color: shortLinkInput.trim() ? '#041018' : T.textMuted,
                        fontWeight: 800, fontSize: '0.8rem',
                        opacity: shortLinkBusy ? 0.7 : 1,
                      }}
                    >
                      {shortLinkBusy ? 'جاري إنشاء الرابط…' : 'إنشاء رابط stooorna.com'}
                    </motion.button>

                    {shortLinkResult && (
                      <div style={{
                        display: 'flex', gap: 8, alignItems: 'center',
                        padding: '10px 10px', borderRadius: 12,
                        background: 'rgba(0,188,212,0.08)', border: `1px solid ${T.primaryBorder}`,
                      }}>
                        <input
                          readOnly
                          value={shortLinkResult}
                          dir="ltr"
                          style={{
                            flex: 1, minWidth: 0, background: 'transparent', border: 'none',
                            color: T.primary, fontSize: '0.78rem', fontWeight: 700, outline: 'none',
                          }}
                          onFocus={e => e.currentTarget.select()}
                        />
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => void copyAppShortLink()}
                          style={{
                            flexShrink: 0, padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                            background: shortLinkCopied ? 'rgba(34,197,94,0.18)' : T.primaryFaint,
                            border: `1px solid ${shortLinkCopied ? 'rgba(34,197,94,0.45)' : T.primaryBorder}`,
                            color: shortLinkCopied ? '#22c55e' : T.primary,
                            fontWeight: 800, fontSize: '0.72rem',
                            display: 'flex', alignItems: 'center', gap: 5,
                          }}
                        >
                          {shortLinkCopied ? <Check size={14} /> : <Copy size={14} />}
                          {shortLinkCopied ? 'Copied' : 'Copy'}
                        </motion.button>

                      </div>
                    )}

                    {shortLinkError && (
                      <p style={{ margin: 0, color: T.danger, fontSize: '0.72rem', textAlign: 'center' }}>{shortLinkError}</p>
                    )}
                  </div>

                  {/* ── Privacy + Sign Out ── */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => navigate('/privacy')}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3"
                      style={{
                        background: T.primaryFaint,
                        border: `1px solid ${T.primaryBorder}`,
                        color: T.primary,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Eye size={14} />
                      Privacy
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleLogout}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3"
                      style={{
                        background: 'transparent',
                        border: `1px solid ${T.dangerBorder}`,
                        color: T.danger,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <LogOut size={14} />
                      Sign Out
                    </motion.button>
                  </div>
                </motion.div>
          })()}

            {/* ── LOGGED IN — LIVE TAB ── */}
            {!isPending && user && tab === 'live' && <div key="live" className="flex flex-col gap-3">
                {/* ── Voice Recordings ── */}
                <div className="flex items-center justify-between mb-1">
                  <p style={{
                color: T.textMuted,
                fontSize: '0.68rem',
                letterSpacing: '0.2em',
                textTransform: 'uppercase'
              }}>
                    Voice Recordings
                  </p>
                  {recordings.length > 0 && <p style={{
                color: T.textMuted,
                fontSize: '0.62rem'
              }}>{recordings.length} saved</p>}
                </div>

                {recLoading && <div className="flex justify-center pt-8">
                    <motion.div animate={{
                rotate: 360
              }} transition={{
                duration: 1,
                repeat: Infinity,
                ease: 'linear'
              }} style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: `2px solid ${T.primaryBorder}`,
                borderTopColor: T.primary
              }} />
                  </div>}

                {!recLoading && recordings.length === 0 && <div className="flex flex-col items-center gap-3 rounded-xl py-10" style={{
              background: T.surface,
              border: `1px solid ${T.surfaceBorder}`
            }}>
                    <Mic size={32} style={{
                color: T.primaryBorder
              }} />
                    <p style={{
                color: T.textMuted,
                fontSize: '0.78rem',
                letterSpacing: '0.05em'
              }}>No recordings yet</p>
                    <p style={{
                color: T.textMuted,
                fontSize: '0.68rem',
                opacity: 0.7
              }}>Tap the knob to start recording</p>
                  </div>}

                {!recLoading && recordings.map(rec => <RecordingCard key={rec.id} rec={rec} onDelete={handleDelete} />)}

                {/* ── Live Broadcast Recordings ── */}
                <div className="flex items-center justify-between mt-4 mb-1">
                  <div className="flex items-center gap-2">
                    <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#ef4444',
                  boxShadow: '0 0 6px rgba(239,68,68,0.6)'
                }} />
                    <p style={{
                  color: T.textMuted,
                  fontSize: '0.68rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase'
                }}>
                      Live Recordings
                    </p>
                  </div>
                  {liveRecs.length > 0 && <p style={{
                color: T.textMuted,
                fontSize: '0.62rem'
              }}>{liveRecs.length} saved</p>}
                </div>

                {liveRecsLoading && <div className="flex justify-center pt-4">
                    <motion.div animate={{
                rotate: 360
              }} transition={{
                duration: 1,
                repeat: Infinity,
                ease: 'linear'
              }} style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: `2px solid ${T.primaryBorder}`,
                borderTopColor: T.primary
              }} />
                  </div>}

                {!liveRecsLoading && liveRecs.length === 0 && <div className="flex flex-col items-center gap-3 rounded-xl py-8" style={{
              background: T.surface,
              border: `1px solid ${T.surfaceBorder}`
            }}>
                    <Radio size={28} style={{
                color: T.primaryBorder
              }} />
                    <p style={{
                color: T.textMuted,
                fontSize: '0.78rem'
              }}>No live recordings yet</p>
                    <p style={{
                color: T.textMuted,
                fontSize: '0.68rem',
                opacity: 0.7
              }}>Your broadcasts will be saved here as MP4</p>
                  </div>}

                {!liveRecsLoading && liveRecs.map(rec => {
              const date = new Date(rec.startedAt).toLocaleDateString('ar-KW', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              });
              const time = new Date(rec.startedAt).toLocaleTimeString('ar-KW', {
                hour: '2-digit',
                minute: '2-digit'
              });
              const mins = rec.duration ? Math.floor(rec.duration / 60) : null;
              const secs = rec.duration ? rec.duration % 60 : null;
              const durationStr = mins !== null ? `${mins}:${String(secs).padStart(2, '0')}` : null;
              const sizeMB = rec.fileSize ? (rec.fileSize / 1024 / 1024).toFixed(1) : null;
              const isDeleting = liveRecDeleting === rec.id;
              const confirmOpen = liveRecDeleteConfirm === rec.id;
              const shareOpen = liveRecShareId === rec.id;
              return <motion.div key={rec.id} layout initial={{
                opacity: 0,
                scale: 0.9
              }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{
                opacity: 0,
                scale: 0.95
              }} className="rounded-xl p-4 flex flex-col gap-3" style={{
                background: T.surface,
                border: `1px solid ${T.surfaceBorder}`
              }}>
                      {/* ── Header row ── */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      flexShrink: 0,
                      background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                            <Radio size={14} color="#ef4444" strokeWidth={2} />
                          </div>
                          <div className="min-w-0">
                            <p style={{
                        color: T.text,
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                              {rec.title ?? 'بث مباشر'}
                            </p>
                            <p style={{
                        color: T.textMuted,
                        fontSize: '0.65rem',
                        margin: 0
                      }}>
                              {date} · {time}
                            </p>
                          </div>
                        </div>

                        {/* Badges + action icons */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {durationStr && <span style={{
                      background: 'rgba(0,188,212,0.1)',
                      border: `1px solid ${T.primaryBorder}`,
                      borderRadius: 6,
                      padding: '2px 7px',
                      color: T.primary,
                      fontSize: '0.65rem',
                      fontWeight: 700
                    }}>
                              {durationStr}
                            </span>}
                          {sizeMB && <span style={{
                      color: T.textMuted,
                      fontSize: '0.62rem'
                    }}>{sizeMB} MB</span>}

                          {/* Share button */}
                          {rec.videoUrl && <motion.button whileTap={{
                      scale: 0.88
                    }} onClick={() => shareLiveRec(rec)} title="Share" style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      background: 'rgba(0,188,212,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}>
                              <Share2 size={13} color={T.primary} strokeWidth={2} />
                            </motion.button>}

                          {/* Delete button */}
                          <motion.button whileTap={{
                      scale: 0.88
                    }} onClick={() => setLiveRecDeleteConfirm(rec.id)} title="Delete" style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: 'none',
                      background: 'rgba(239,68,68,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}>
                            <Trash2 size={13} color="#ef4444" strokeWidth={2} />
                          </motion.button>
                        </div>
                      </div>

                      {/* ── Video player or pending ── */}
                      {rec.videoUrl ? <video src={rec.videoUrl} controls playsInline style={{
                  width: '100%',
                  borderRadius: 10,
                  background: '#000',
                  maxHeight: 220,
                  border: `1px solid ${T.surfaceBorder}`
                }} /> : <div style={{
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 10,
                  padding: '16px',
                  textAlign: 'center',
                  border: `1px dashed ${T.surfaceBorder}`
                }}>
                          <p style={{
                    color: T.textMuted,
                    fontSize: '0.72rem',
                    margin: 0
                  }}>
                            جاري معالجة الفيديو...
                          </p>
                        </div>}

                      {/* ── Download button ── */}
                      {rec.videoUrl && <a href={rec.videoUrl} download={`live-${rec.id}.mp4`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: 'rgba(0,188,212,0.08)',
                  border: `1px solid ${T.primaryBorder}`,
                  borderRadius: 10,
                  padding: '9px 16px',
                  color: T.primary,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textDecoration: 'none'
                }}>
                          تحميل MP4
                        </a>}

                      {/* ── Delete confirm dialog ── */}
                      <AnimatePresence>
                        {confirmOpen && <motion.div initial={{
                    opacity: 0,
                    scale: 0.94
                  }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{
                    opacity: 0,
                    scale: 0.94
                  }} style={{
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.22)',
                    borderRadius: 12,
                    padding: '14px 16px'
                  }}>
                            <p style={{
                      color: '#ef4444',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      margin: '0 0 10px'
                    }}>
                              حذف هذا التسجيل؟
                            </p>
                            <p style={{
                      color: T.textMuted,
                      fontSize: '0.7rem',
                      margin: '0 0 14px',
                      lineHeight: 1.5
                    }}>
                              سيتم حذف الفيديو نهائياً ولا يمكن التراجع.
                            </p>
                            <div className="flex gap-2">
                              <motion.button whileTap={{
                        scale: 0.94
                      }} onClick={() => deleteLiveRec(rec.id)} disabled={isDeleting} style={{
                        flex: 1,
                        padding: '9px',
                        borderRadius: 9,
                        border: 'none',
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        opacity: isDeleting ? 0.6 : 1,
                        fontFamily: 'var(--font-sans)'
                      }}>
                                {isDeleting ? '...' : 'حذف'}
                              </motion.button>
                              <motion.button whileTap={{
                        scale: 0.94
                      }} onClick={() => setLiveRecDeleteConfirm(null)} style={{
                        flex: 1,
                        padding: '9px',
                        borderRadius: 9,
                        border: `1px solid ${T.surfaceBorder}`,
                        background: 'transparent',
                        color: T.textMuted,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)'
                      }}>
                                إلغاء
                              </motion.button>
                            </div>
                          </motion.div>}
                      </AnimatePresence>

                      {/* ── Share sheet ── */}
                      <AnimatePresence>
                        {shareOpen && rec.videoUrl && <motion.div initial={{
                    opacity: 0,
                    scale: 0.94
                  }} animate={{ opacity: 1, scale: 1, y: 0, borderRadius: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34, mass: 0.85 }} exit={{
                    opacity: 0,
                    scale: 0.94
                  }} style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${T.surfaceBorder}`,
                    borderRadius: 12,
                    padding: '14px 16px'
                  }}>
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                              <p style={{
                        color: T.text,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        margin: 0
                      }}>
                                مشاركة التسجيل
                              </p>
                              <motion.button whileTap={{
                        scale: 0.88
                      }} onClick={() => setLiveRecShareId(null)} style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2
                      }}>
                                <X size={14} color={T.textMuted} />
                              </motion.button>
                            </div>

                            {/* Link copy row */}
                            <div className="flex gap-2 mb-3">
                              <div style={{
                        flex: 1,
                        background: 'rgba(0,0,0,0.25)',
                        borderRadius: 9,
                        border: `1px solid ${T.surfaceBorder}`,
                        padding: '8px 10px',
                        overflow: 'hidden'
                      }}>
                                <p style={{
                          color: T.textMuted,
                          fontSize: '0.65rem',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                                  {window.location.origin}{rec.videoUrl}
                                </p>
                              </div>
                              <motion.button whileTap={{
                        scale: 0.9
                      }} onClick={() => copyLiveRecLink(`${window.location.origin}${rec.videoUrl}`)} style={{
                        padding: '8px 14px',
                        borderRadius: 9,
                        border: 'none',
                        background: liveRecShareCopied ? 'rgba(34,197,94,0.15)' : `rgba(0,188,212,0.12)`,
                        color: liveRecShareCopied ? '#22c55e' : T.primary,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        flexShrink: 0,
                        fontFamily: 'var(--font-sans)',
                        transition: 'background 0.2s, color 0.2s'
                      }}>
                                {liveRecShareCopied ? <><CheckCircle size={12} /> تم</> : <><Copy size={12} /> نسخ</>}
                              </motion.button>
                            </div>

                            {/* Native share (mobile) */}
                            {typeof navigator.share === 'function' && <motion.button whileTap={{
                      scale: 0.96
                    }} onClick={() => {
                      navigator.share({
                        title: rec.title ?? 'بث مباشر',
                        url: `${window.location.origin}${rec.videoUrl}`
                      }).catch(() => {});
                    }} style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: 10,
                      border: 'none',
                      background: `rgba(0,188,212,0.1)`,
                      outline: `1px solid ${T.primaryBorder}`,
                      color: T.primary,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 7,
                      fontFamily: 'var(--font-sans)'
                    } as React.CSSProperties}>
                                <Share2 size={13} />
                                مشاركة عبر التطبيقات
                              </motion.button>}
                          </motion.div>}
                      </AnimatePresence>

                    </motion.div>;
            })}



              </div>}

            {/* ── LOGGED IN — COMPANY TAB (owner only) ── */}
            {!isPending && user && tab === 'companies' && (
              <div key="companies" className="flex flex-col gap-3" style={{ paddingBottom: 8 }}>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    loadOwnerData();
                    startTransition(() => setShowSupportUsers(true));
                  }}
                  className="flex items-center justify-between"
                  style={{
                    width: '100%',
                    background: T.surface,
                    border: `1px solid ${T.surfaceBorder}`,
                    borderRadius: 14,
                    padding: '14px 16px',
                    color: T.text,
                    cursor: 'pointer',
                  }}
                  aria-label="User Control"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center" style={{
                      width: 38, height: 38, borderRadius: 12, background: 'rgba(239,68,68,0.1)',
                      border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444',
                    }}>
                      <Users size={19} strokeWidth={2.1} />
                    </span>
                    <span style={{ textAlign: 'left' }}>
                      <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700 }}>User Control</span>
                      <span style={{ display: 'block', marginTop: 2, color: T.textMuted, fontSize: '0.68rem' }}>
                        Username color · Edit username · Password · Ban
                      </span>
                    </span>
                  </div>
                  <span style={{ color: T.primary, fontSize: '1.25rem', lineHeight: 1 }}>‹</span>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    setRecoveredUsers(loadDeletedUsers());
                    startTransition(() => setShowRecoveredUsers(true));
                  }}
                  className="flex items-center justify-between"
                  style={{
                    width: '100%',
                    background: T.surface,
                    border: `1px solid ${T.surfaceBorder}`,
                    borderRadius: 14,
                    padding: '14px 16px',
                    color: T.text,
                    cursor: 'pointer',
                  }}
                  aria-label="Banned and Deleted"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center" style={{
                      width: 38, height: 38, borderRadius: 12, background: 'rgba(234,179,8,0.12)',
                      border: '1px solid rgba(234,179,8,0.35)', color: '#eab308',
                    }}>
                      <ShieldCheck size={19} strokeWidth={2.1} />
                    </span>
                    <span style={{ textAlign: 'left' }}>
                      <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700 }}>Banned / Deleted</span>
                      <span style={{ display: 'block', marginTop: 2, color: T.textMuted, fontSize: '0.68rem' }}>
                        Restore · Unban · Permanent wipe
                      </span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {loadDeletedUsers().length > 0 && (
                      <span style={{
                        minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                        background: '#eab308', color: '#1a1400', fontSize: '0.62rem', fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {loadDeletedUsers().length > 9 ? '9+' : loadDeletedUsers().length}
                      </span>
                    )}
                    <span style={{ color: T.primary, fontSize: '1.25rem', lineHeight: 1 }}>‹</span>
                  </div>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    setOwnerBusinessList(loadBusinessRegistry());
                    startTransition(() => setShowOwnerBusiness(true));
                  }}
                  className="flex items-center justify-between"
                  style={{
                    width: '100%',
                    background: T.surface,
                    border: `1px solid ${T.surfaceBorder}`,
                    borderRadius: 14,
                    padding: '14px 16px',
                    color: T.text,
                    cursor: 'pointer',
                  }}
                  aria-label="Business applications"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center" style={{
                      width: 38, height: 38, borderRadius: 12, background: 'rgba(234,179,8,0.12)',
                      border: '1px solid rgba(234,179,8,0.35)', color: '#eab308',
                    }}>
                      <Briefcase size={19} strokeWidth={2.1} />
                    </span>
                    <span style={{ textAlign: 'left' }}>
                      <span style={{ display: 'block', fontSize: '0.86rem', fontWeight: 700 }}>Business applications</span>
                      <span style={{ display: 'block', marginTop: 2, color: T.textMuted, fontSize: '0.68rem' }}>
                        Full request data · Approve · Reject · Owner note
                      </span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {ownerBusinessList.filter(x => x.status === 'pending').length > 0 && (
                      <span style={{
                        minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                        background: '#eab308', color: '#1a1400', fontSize: '0.62rem', fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {ownerBusinessList.filter(x => x.status === 'pending').length > 9 ? '9+' : ownerBusinessList.filter(x => x.status === 'pending').length}
                      </span>
                    )}
                    <span style={{ color: T.primary, fontSize: '1.25rem', lineHeight: 1 }}>‹</span>
                  </div>
                </motion.button>
              </div>
            )}


          </AnimatePresence>
        </div>

        {/* Bottom nav bar — hidden while support overlays are open */}
        {!showSupportChat && !ownerChatUser && !showOwnerInbox && !showSupportUsers && !supportCtrlUser && !showOwnerCompanies && !ownerCompanyDetail && !showRecoveredUsers && !showOwnerBusiness && (
          <div className="w-full flex items-center justify-center px-10 py-4 z-10" style={{
            background: T.navBg,
            borderTop: `1px solid ${T.navBorder}`
          }}>
            <p style={{
              color: T.textMuted,
              fontSize: '0.6rem',
              letterSpacing: '0.25em',
              textTransform: 'uppercase'
            }}>
              Stooorna
            </p>
          </div>
        )}
      </div>

      {/* Support chat — regular users only → @stooorna */}
      <SupportChatOverlay
        open={showSupportChat}
        onClose={() => setShowSupportChat(false)}
        currentUser={user as { id?: string; name?: string | null; username?: string | null; email?: string | null } | null}
      />

      {/* Owner: full inbox list — opens even when empty */}
      <AnimatePresence>
        {showOwnerInbox && !ownerChatUser && (
          <motion.div
            key="owner-inbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10340,
              background: 'rgba(0,0,0,0.96)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(0,188,212,0.25)',
              background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
              minHeight: 52, flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => setShowOwnerInbox(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00BCD4', padding: 2 }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #00BCD4 0%, #0288D1 100%)',
                border: '2px solid #00BCD4', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#041018', fontWeight: 800, fontSize: '0.75rem',
              }}>S</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, color: '#00BCD4', fontWeight: 900, fontSize: '0.95rem', lineHeight: 1.15 }}>Stooorna</p>
                <p style={{ margin: '1px 0 0', color: 'rgba(150,190,190,0.85)', fontWeight: 700, fontSize: '0.68rem' }}>الدعم · Support</p>
              </div>
              {supportUnreadTotal > 0 && (
                <span style={{
                  minWidth: 20, height: 20, borderRadius: 10, padding: '0 6px',
                  background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {supportUnreadTotal > 99 ? '99+' : supportUnreadTotal}
                </span>
              )}
            </div>

            <div style={{
              flex: 1, overflowY: 'auto', padding: '12px 14px',
              background: 'radial-gradient(ellipse 70% 50% at 50% 0%, #0d2a2e 0%, #060e0e 70%)',
            }}>
              {supportInboxLoading && supportInbox.length === 0 && (
                <p style={{ color: 'rgba(150,190,190,0.55)', fontSize: '0.8rem', textAlign: 'center', marginTop: 48 }}>
                  جاري التحميل…
                </p>
              )}
              {!supportInboxLoading && supportInbox.length === 0 && (
                <div style={{ textAlign: 'center', marginTop: 56, padding: '0 20px' }}>
                  <MessageCircle size={36} style={{ color: 'rgba(0,188,212,0.35)', marginBottom: 12 }} />
                  <p style={{ color: 'rgba(200,230,230,0.85)', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 6px' }}>
                    شات الدعم جاهز
                  </p>
                  <p style={{ color: 'rgba(150,190,190,0.55)', fontSize: '0.75rem', margin: 0, lineHeight: 1.5 }}>
                    لا رسائل حالياً. عند إرسال أي مستخدم لرسالة دعم ستظهر هنا ويمكنك الدخول والرد مباشرة.
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {supportInbox.map(peer => (
                  <div key={peer.id} style={{ position: 'relative', display: 'flex', alignItems: 'stretch', gap: 0 }}>
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => setOwnerChatUser(peer)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, flex: 1,
                        padding: '12px 14px', borderRadius: '14px 0 0 14px', cursor: 'pointer', textAlign: 'left',
                        background: peer.unread ? 'rgba(0,188,212,0.12)' : 'rgba(0,188,212,0.05)',
                        border: `1px solid ${peer.unread ? 'rgba(0,188,212,0.4)' : 'rgba(0,188,212,0.15)'}`,
                        borderRight: 'none',
                        color: 'rgba(200,230,230,0.95)',
                      }}
                    >
                      <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: '50%', overflow: 'hidden',
                          background: 'rgba(0,188,212,0.15)', border: '1.5px solid rgba(0,188,212,0.35)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#00BCD4', fontWeight: 700, fontSize: '0.85rem',
                        }}>
                          {peer.avatarUrl
                            ? <img src={peer.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : ((peer.name || peer.username || '?')[0] || '?').toUpperCase()}
                        </div>
                        <span style={{
                          position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%',
                          background: peer.online ? '#22c55e' : '#64748b',
                          border: '2px solid #06141c',
                        }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {peer.name || peer.username || 'User'}
                          {peer.username ? <span style={{ color: 'rgba(0,188,212,0.7)', fontWeight: 500, fontSize: '0.72rem' }}> @{peer.username}</span> : null}
                        </p>
                        <p style={{
                          margin: '3px 0 0', color: 'rgba(150,190,190,0.65)', fontSize: '0.72rem',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {peer.lastMessage || 'فتح المحادثة'}
                        </p>
                      </div>
                      {!!peer.unread && peer.unread > 0 && (
                        <span style={{
                          minWidth: 20, height: 20, borderRadius: 10, padding: '0 6px',
                          background: '#00BCD4', color: '#041018', fontSize: '0.65rem', fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {peer.unread}
                        </span>
                      )}
                    </motion.button>
                    {/* Profile button — navigate to user's public profile */}
                    {peer.username && (
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        type="button"
                        title="عرض البروفايل"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowOwnerInbox(false);
                          // البروفايل الجديد في صفحة المنشورات (بث صوتي) — ليس /u/ القديمة
                          const q = new URLSearchParams();
                          q.set('openProfile', peer.id);
                          if (peer.name) q.set('openProfileName', peer.name);
                          if (peer.username) q.set('openProfileUsername', peer.username);
                          if (peer.avatarUrl) q.set('openProfileAvatar', peer.avatarUrl);
                          navigate(`/add-friend?${q.toString()}`);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 40, flexShrink: 0,
                          borderRadius: 0,
                          background: 'hsl(var(--primary) / 0.08)',
                          border: `1px solid ${peer.unread ? 'rgba(0,188,212,0.4)' : 'rgba(0,188,212,0.15)'}`,
                          borderLeft: '1px solid hsl(var(--primary) / 0.25)',
                          borderRight: 'none',
                          cursor: 'pointer',
                          color: 'hsl(var(--primary))',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--primary) / 0.18)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'hsl(var(--primary) / 0.08)')}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                      </motion.button>
                    )}
                    {/* Delete thread button — owner only */}
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      type="button"
                      title="حذف المحادثة"
                      data-peerid={peer.id}
                      data-peername={peer.name || peer.username || ''}
                      onClick={(e) => {
                        e.stopPropagation();
                        const btn = e.currentTarget as HTMLButtonElement;
                        const pid = btn.dataset.peerid || '';
                        const pname = btn.dataset.peername || 'هذا المستخدم';
                        if (!window.confirm(`حذف محادثة ${pname}؟`)) return;
                        clearSupportThread(pid);
                        const tickets = readLocalSupportTickets().filter((t: { fromUserId?: string }) => t.fromUserId !== pid);
                        try { localStorage.setItem('stooorna_support_tickets', JSON.stringify(tickets)); } catch { /* */ }
                        setSupportInbox(prev => prev.filter(x => x.id !== pid));
                        setOwnerChatUser(prev => (prev && (prev as { id?: string }).id === pid ? null : prev));
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 44, flexShrink: 0,
                        borderRadius: '0 14px 14px 0',
                        background: 'hsl(var(--destructive) / 0.08)',
                        border: `1px solid ${peer.unread ? 'rgba(0,188,212,0.4)' : 'rgba(0,188,212,0.15)'}`,
                        borderLeft: '1px solid hsl(var(--destructive) / 0.3)',
                        cursor: 'pointer',
                        color: 'hsl(var(--destructive))',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'hsl(var(--destructive) / 0.18)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'hsl(var(--destructive) / 0.08)')}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </motion.button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Owner support thread with a specific user */}
      {ownerChatUser && (
        <OwnerSupportThread
          peer={ownerChatUser}
          onClose={() => {
            setOwnerChatUser(null);
            // stay in inbox list after closing a thread
            setShowOwnerInbox(true);
            loadSupportInbox();
          }}
          currentUser={user as { id?: string; name?: string | null; username?: string | null; email?: string | null } | null}
        />
      )}

      {/* ══ Support: full users control list ══ */}
      <AnimatePresence>
        {showSupportUsers && !supportCtrlUser && (
          <motion.div
            key="support-users"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10370,
              background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(10px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(239,68,68,0.3)',
              background: 'linear-gradient(180deg, #1a0a0e 0%, #0c0608 100%)',
              minHeight: 52, flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => { startTransition(() => setShowSupportUsers(false)); setSupportUsersSearch(''); setSupportUsersTab('users'); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
              <Users size={18} style={{ color: '#ef4444' }} />
              <p style={{ margin: 0, flex: 1, color: '#fca5a5', fontWeight: 800, fontSize: '0.9rem' }}>
                تحكم المستخدمين
              </p>
              <button
                type="button"
                onClick={() => loadOwnerData()}
                disabled={usersLoading}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--primary))', padding: 4, opacity: usersLoading ? 0.4 : 1, fontSize: '1.1rem', fontWeight: 700 }}
                title="إعادة تحميل"
              >
                {usersLoading ? '…' : '↻'}
              </button>
              <span style={{ color: 'rgba(200,180,180,0.6)', fontSize: '0.7rem' }}>
                {supportUsersTab === 'users' ? allUsers.length : allCompanyCtrlUsers.length}
              </span>
            </div>

            {/* تبويبان: مستخدمين | شركات — نفس أدوات التحكم */}
            <div style={{
              display: 'flex', gap: 8, padding: '10px 14px 0', flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => { setSupportUsersTab('users'); setSupportUsersSearch(''); }}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 12, cursor: 'pointer',
                  fontWeight: 800, fontSize: '0.8rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: supportUsersTab === 'users' ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${supportUsersTab === 'users' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  color: supportUsersTab === 'users' ? '#fca5a5' : 'rgba(200,180,180,0.7)',
                }}
              >
                <Users size={14} strokeWidth={2.2} />
                مستخدمين
                <span style={{
                  fontSize: '0.65rem', fontWeight: 700, opacity: 0.85,
                  background: supportUsersTab === 'users' ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.06)',
                  padding: '2px 7px', borderRadius: 8,
                }}>{allUsers.length}</span>
              </button>
              <button
                type="button"
                onClick={() => { setSupportUsersTab('companies'); setSupportUsersSearch(''); }}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: 12, cursor: 'pointer',
                  fontWeight: 800, fontSize: '0.8rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: supportUsersTab === 'companies' ? 'rgba(0,188,212,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${supportUsersTab === 'companies' ? 'rgba(0,188,212,0.45)' : 'rgba(255,255,255,0.1)'}`,
                  color: supportUsersTab === 'companies' ? '#00BCD4' : 'rgba(200,180,180,0.7)',
                }}
              >
                <Building2 size={14} strokeWidth={2.2} />
                شركات
                <span style={{
                  fontSize: '0.65rem', fontWeight: 700, opacity: 0.85,
                  background: supportUsersTab === 'companies' ? 'rgba(0,188,212,0.2)' : 'rgba(255,255,255,0.06)',
                  padding: '2px 7px', borderRadius: 8,
                }}>{allCompanyCtrlUsers.length}</span>
              </button>
            </div>

            <div style={{ padding: '10px 14px', flexShrink: 0 }}>
              <input
                value={supportUsersSearch}
                onChange={e => setSupportUsersSearch(e.target.value)}
                placeholder={supportUsersTab === 'companies'
                  ? 'بحث باسم الشركة / الإيميل / اليوزر…'
                  : 'بحث باليوزر / الإيميل / الاسم…'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 12px', borderRadius: 12,
                  background: supportUsersTab === 'companies' ? 'rgba(0,188,212,0.06)' : 'rgba(239,68,68,0.06)',
                  border: `1px solid ${supportUsersTab === 'companies' ? 'rgba(0,188,212,0.25)' : 'rgba(239,68,68,0.25)'}`,
                  color: 'rgba(240,220,220,0.95)', fontSize: '0.85rem', outline: 'none',
                }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {usersLoading && (
                <p style={{ textAlign: 'center', color: 'rgba(180,150,150,0.55)', marginTop: 40, fontSize: '0.8rem' }}>جاري التحميل…</p>
              )}
              {!usersLoading && usersError && (
                <div style={{ margin: '20px 0', padding: '14px', borderRadius: 12, background: 'hsl(var(--destructive)/0.1)', border: '1px solid hsl(var(--destructive)/0.35)', color: 'hsl(var(--destructive))', fontSize: '0.78rem', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 700 }}>فشل تحميل المستخدمين</p>
                  <p style={{ margin: '0 0 10px', opacity: 0.8, wordBreak: 'break-all' }}>{usersError}</p>
                  <button type="button" onClick={() => loadOwnerData()} style={{ background: 'hsl(var(--destructive)/0.2)', border: '1px solid hsl(var(--destructive)/0.4)', borderRadius: 8, padding: '6px 14px', color: 'hsl(var(--destructive))', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                    إعادة المحاولة
                  </button>
                </div>
              )}
              {!usersLoading && !usersError && (() => {
                const source = supportUsersTab === 'companies' ? allCompanyCtrlUsers : allUsers;
                const filtered = source.filter(u => {
                  if (isUserDeleted(u)) return false;
                  const q = supportUsersSearch.trim().toLowerCase();
                  if (!q) return true;
                  const companyBlob = `${u.companyName || ''} ${u.tradeName || ''} ${u.name || ''}`.toLowerCase();
                  return (
                    (u.username || '').toLowerCase().includes(q) ||
                    (u.name || '').toLowerCase().includes(q) ||
                    (u.email || '').toLowerCase().includes(q) ||
                    (u.lastIp || '').includes(q) ||
                    companyBlob.includes(q)
                  );
                });
                if (filtered.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', marginTop: 48, padding: '0 16px' }}>
                      {supportUsersTab === 'companies'
                        ? <Building2 size={32} style={{ color: 'rgba(0,188,212,0.35)', marginBottom: 10 }} />
                        : <Users size={32} style={{ color: 'rgba(239,68,68,0.35)', marginBottom: 10 }} />}
                      <p style={{ color: 'rgba(200,230,230,0.85)', fontSize: '0.88rem', fontWeight: 700, margin: '0 0 6px' }}>
                        {supportUsersTab === 'companies' ? 'لا حسابات شركات' : 'لا مستخدمين'}
                      </p>
                      <p style={{ color: 'rgba(150,190,190,0.55)', fontSize: '0.75rem', margin: 0, lineHeight: 1.5 }}>
                        {supportUsersTab === 'companies'
                          ? 'حسابات الشركات المسجّلة تظهر هنا مع نفس أدوات التحكم (لون اليوزر · تعديل اليوزر · كلمة المرور · حظر).'
                          : 'لا نتائج مطابقة للبحث.'}
                      </p>
                    </div>
                  );
                }
                return filtered.map(u => {
                  const online = ownerPresence[u.id]?.online ?? false;
                  const color = (u as SupportCtrlUser).nameColor || (supportUsersTab === 'companies' ? '#00BCD4' : '#00BCD4');
                  const isCo = supportUsersTab === 'companies';
                  const title = isCo
                    ? preferredCompanyDisplayName(u)
                    : `@${u.username || '—'}`;
                  const bizOk = !isCo && isPublicBusinessAccount(u);
                  const subtitle = isCo
                    ? `${u.username ? `@${u.username} · ` : ''}${u.email}${u.lastIp ? ` · ${u.lastIp}` : ''}`
                    : `${u.email}${u.lastIp ? ` · ${u.lastIp}` : ''}`;
                  return (
                    <motion.button
                      key={u.id}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => {
                        setSupportCtrlUser({
                          ...u,
                          country: (u as SupportCtrlUser).country ?? null,
                          phone: (u as SupportCtrlUser).phone ?? null,
                          nameColor: (u as SupportCtrlUser).nameColor ?? null,
                          avatarUrl: (u as SupportCtrlUser).avatarUrl ?? null,
                          online,
                        });
                        setScUsername(u.username || '');
                        setScPassword('');
                        setScColor((u as SupportCtrlUser).nameColor || '#00BCD4');
                        setScMsg('');
                        setScEditBox(null);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '12px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                        background: u.isBanned
                          ? 'rgba(239,68,68,0.1)'
                          : isCo ? 'rgba(0,188,212,0.05)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${u.isBanned
                          ? 'rgba(239,68,68,0.35)'
                          : isCo ? 'rgba(0,188,212,0.2)' : 'rgba(255,255,255,0.08)'}`,
                        color: 'rgba(230,220,220,0.95)',
                      }}
                    >
                      <div style={{ position: 'relative', width: 42, height: 42, flexShrink: 0 }}>
                        <div style={{
                          width: 42, height: 42, borderRadius: '50%',
                          background: isCo ? 'rgba(0,188,212,0.12)' : 'rgba(0,0,0,0.35)',
                          border: `2px solid ${color}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color, fontWeight: 800, fontSize: '0.8rem',
                          overflow: 'hidden',
                        }}>
                          {(u as SupportCtrlUser).avatarUrl
                            ? <img src={(u as SupportCtrlUser).avatarUrl!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : isCo
                              ? <Building2 size={18} strokeWidth={2.2} />
                              : (u.username || u.name || u.email || '?')[0].toUpperCase()}
                        </div>
                        <span style={{
                          position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: '50%',
                          background: online ? '#22c55e' : '#64748b',
                          border: '2px solid #0c0608',
                        }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          margin: 0, fontSize: '0.88rem', fontWeight: 700,
                          color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                          {bizOk && <BusinessHeadBadge compact />}
                        </p>
                        <p style={{
                          margin: '2px 0 0', color: 'rgba(180,160,160,0.65)', fontSize: '0.68rem',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {subtitle}
                        </p>
                      </div>
                      {isCo && (
                        <span style={{
                          fontSize: '0.58rem', fontWeight: 800, color: '#00BCD4',
                          background: 'rgba(0,188,212,0.12)', padding: '3px 7px', borderRadius: 8,
                          border: '1px solid rgba(0,188,212,0.3)', flexShrink: 0,
                        }}>شركة</span>
                      )}
                      {u.isBanned && (
                        <span style={{
                          fontSize: '0.6rem', fontWeight: 800, color: '#ef4444',
                          background: 'rgba(239,68,68,0.15)', padding: '3px 7px', borderRadius: 8,
                        }}>BAN</span>
                      )}
                    </motion.button>
                  );
                });
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ Support: user detail + actions box ══ */}
      <AnimatePresence>
        {supportCtrlUser && (
          <motion.div
            key="support-ctrl-detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10380,
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
            onClick={() => { setSupportCtrlUser(null); setScEditBox(null); }}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 60 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 480, maxHeight: '92dvh',
                overflowY: 'auto',
                background: 'linear-gradient(180deg, #1a1014 0%, #0c080a 100%)',
                borderTopLeftRadius: 22, borderTopRightRadius: 22,
                border: '1px solid rgba(239,68,68,0.3)',
                padding: '16px 16px max(20px, env(safe-area-inset-bottom))',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${supportCtrlUser.nameColor || 'hsl(var(--primary))'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: supportCtrlUser.nameColor || 'hsl(var(--primary))', fontWeight: 800, fontSize: '1rem',
                  background: 'rgba(0,0,0,0.35)',
                  overflow: 'hidden',
                }}>
                  {supportCtrlUser.avatarUrl
                    ? <img src={supportCtrlUser.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (supportCtrlUser.username || supportCtrlUser.name || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontWeight: 800, fontSize: '1rem',
                    color: supportCtrlUser.nameColor || 'hsl(var(--primary))',
                    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  }}>
                    @{supportCtrlUser.username || '—'}
                    {isPublicBusinessAccount(supportCtrlUser) && <BusinessHeadBadge compact />}
                  </p>
                  <p style={{ margin: '2px 0 0', color: 'hsl(var(--muted-foreground))', fontSize: '0.72rem' }}>
                    {supportCtrlUser.name || 'بدون اسم'}
                  </p>
                </div>
                {/* View profile button */}
                {supportCtrlUser.username && (
                  <button
                    type="button"
                    title="عرض البروفايل"
                    onClick={() => {
                      setSupportCtrlUser(null);
                      setScEditBox(null);
                      // البروفايل الجديد (نفس بروفايل البوست/المنتج) — ليس صفحة /u/ القديمة بالشات
                      const q = new URLSearchParams();
                      q.set('openProfile', supportCtrlUser.id);
                      if (supportCtrlUser.name) q.set('openProfileName', supportCtrlUser.name);
                      if (supportCtrlUser.username) q.set('openProfileUsername', supportCtrlUser.username);
                      if (supportCtrlUser.avatarUrl) q.set('openProfileAvatar', supportCtrlUser.avatarUrl);
                      if (supportUsersTab === 'companies' || isCompanyAccountRow(supportCtrlUser)) {
                        q.set('openProfileCompany', '1');
                      }
                      if (isPublicBusinessAccount(supportCtrlUser)) {
                        q.set('openProfileBusiness', '1');
                      }
                      navigate(`/add-friend?${q.toString()}`);
                    }}
                    style={{
                      background: 'hsl(var(--primary) / 0.12)', border: '1px solid hsl(var(--primary) / 0.35)',
                      borderRadius: 10, padding: '6px 10px', cursor: 'pointer',
                      color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    بروفايل
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setSupportCtrlUser(null); setScEditBox(null); }}
                  style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', padding: 4 }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Info card */}
              <div style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14,
                fontSize: '0.78rem', color: 'rgba(220,200,200,0.9)',
              }}>
                {[
                  ['المعرّف', supportCtrlUser.id],
                  ['الإيميل', supportCtrlUser.email],
                  ['IP', supportCtrlUser.lastIp || '—'],
                  ['الدولة', supportCtrlUser.country || '—'],
                  ['الهاتف', supportCtrlUser.phone || '—'],
                  ['محظور', supportCtrlUser.isBanned ? 'نعم' : 'لا'],
                  ['تاريخ التسجيل', supportCtrlUser.createdAt ? new Date(supportCtrlUser.createdAt).toLocaleString('ar-KW') : '—'],
                  ['الحالة', supportCtrlUser.online ? '🟢 أونلاين' : '⚫ أوفلاين'],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: 'rgba(180,150,150,0.65)', flexShrink: 0 }}>{k}</span>
                    <span style={{ textAlign: 'right', wordBreak: 'break-all', fontWeight: 600 }}>{v as string}</span>
                  </div>
                ))}
              </div>

              {scMsg && (
                <p style={{
                  margin: '0 0 12px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 600,
                  color: scMsg.includes('تم') || scMsg.toLowerCase().includes('ok') ? '#22c55e' : '#ef4444',
                }}>
                  {scMsg}
                </p>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <motion.button whileTap={{ scale: 0.98 }} type="button"
                  onClick={() => { setScEditBox(scEditBox === 'color' ? null : 'color'); setScMsg(''); }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(0,188,212,0.1)', border: '1px solid rgba(0,188,212,0.35)',
                    color: '#00BCD4', fontWeight: 700, fontSize: '0.85rem',
                  }}>
                  🎨 تغيير لون اليوزر
                </motion.button>
                {scEditBox === 'color' && (
                  <div style={{
                    padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(0,188,212,0.2)', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    {/* Quick color swatches — each with instant activate button */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {([
                        ['#00BCD4','سماوي'],['#22c55e','أخضر'],['#eab308','ذهبي'],['#ef4444','أحمر'],
                        ['#a855f7','بنفسجي'],['#f97316','برتقالي'],['#ec4899','وردي'],['#3b82f6','أزرق'],
                        ['#ffffff','أبيض'],['#94a3b8','رمادي'],['#14b8a6','زمردي'],['#f43f5e','قرمزي'],
                      ] as [string, string][]).map(([c, label]) => (
                        <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => setScColor(c)}
                            style={{
                              width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', flexShrink: 0,
                              border: scColor === c ? '2px solid #fff' : '2px solid transparent',
                              boxShadow: scColor === c ? '0 0 0 2px rgba(0,188,212,0.6)' : 'none',
                            }}
                          />
                          <span style={{ fontSize: '0.78rem', color: c, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {label} — @{supportCtrlUser.username || 'user'}
                          </span>
                          <motion.button
                            whileTap={{ scale: 0.93 }}
                            type="button"
                            disabled={scSaving}
                            onClick={async () => {
                              setScColor(c);
                              setScSaving(true); setScMsg('');
                              const res = await patchSupportUser(supportCtrlUser.id, { nameColor: c, usernameColor: c, color: c });
                              setScSaving(false);
                              if (res) {
                                setScMsg('تم تفعيل اللون ✓');
                                setSupportCtrlUser(prev => prev ? { ...prev, nameColor: c } : prev);
                                setAllUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, nameColor: c } as typeof x & { nameColor?: string } : x));
                                setAllCompanyCtrlUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, nameColor: c } as typeof x & { nameColor?: string } : x));
                                setScEditBox(null);
                              } else setScMsg('فشل التفعيل');
                            }}
                            style={{
                              padding: '4px 10px', borderRadius: 8, border: `1px solid ${c}`,
                              background: `${c}22`, color: c, fontSize: '0.72rem', fontWeight: 700,
                              cursor: 'pointer', flexShrink: 0,
                            }}
                          >
                            {scSaving ? '…' : 'تفعيل'}
                          </motion.button>
                        </div>
                      ))}
                    </div>

                    {/* Custom color picker */}
                    <div style={{ borderTop: '1px solid hsl(var(--border))', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', fontWeight: 600 }}>لون مخصص</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input type="color" value={scColor} onChange={e => setScColor(e.target.value)}
                          style={{ width: 44, height: 36, border: 'none', background: 'none', cursor: 'pointer' }} />
                        <input
                          value={scColor}
                          onChange={e => setScColor(e.target.value)}
                          placeholder="#00BCD4"
                          style={{
                            flex: 1, padding: '8px 10px', borderRadius: 8, outline: 'none',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                            color: '#fff', fontSize: '0.85rem',
                          }}
                        />
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: scColor, fontWeight: 700 }}>
                        معاينة: @{supportCtrlUser.username || 'user'}
                      </p>
                      <motion.button whileTap={{ scale: 0.97 }} type="button" disabled={scSaving}
                        onClick={async () => {
                          setScSaving(true); setScMsg('');
                          const res = await patchSupportUser(supportCtrlUser.id, { nameColor: scColor, usernameColor: scColor, color: scColor });
                          setScSaving(false);
                          if (res) {
                            setScMsg('تم تفعيل اللون ✓');
                            setSupportCtrlUser(prev => prev ? { ...prev, nameColor: scColor } : prev);
                            setAllUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, nameColor: scColor } as typeof x & { nameColor?: string } : x));
                            setAllCompanyCtrlUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, nameColor: scColor } as typeof x & { nameColor?: string } : x));
                            setScEditBox(null);
                          } else setScMsg('فشل الحفظ — تحقق من صلاحيات السيرفر');
                        }}
                        style={{
                          padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                          background: scColor, color: '#041018', fontWeight: 800, fontSize: '0.85rem',
                        }}>
                        {scSaving ? '…' : 'تفعيل اللون المخصص'}
                      </motion.button>
                    </div>
                  </div>
                )}

                <motion.button whileTap={{ scale: 0.98 }} type="button"
                  onClick={() => { setScEditBox(scEditBox === 'username' ? null : 'username'); setScMsg(''); setScUsername(supportCtrlUser.username || ''); }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.35)',
                    color: '#c084fc', fontWeight: 700, fontSize: '0.85rem',
                  }}>
                  ✏️ تعديل اليوزر
                </motion.button>
                {scEditBox === 'username' && (
                  <div style={{
                    padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(168,85,247,0.2)', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <input
                      value={scUsername}
                      onChange={e => setScUsername(e.target.value)}
                      placeholder="اليوزر الجديد (حرف واحد فأكثر)"
                      style={{
                        padding: '10px 12px', borderRadius: 10, outline: 'none',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#fff', fontSize: '0.9rem',
                      }}
                    />
                    <motion.button whileTap={{ scale: 0.97 }} type="button" disabled={scSaving || !scUsername.trim()}
                      onClick={async () => {
                        const next = scUsername.trim().replace(/^@/, '');
                        if (!next) return;
                        setScSaving(true); setScMsg('');
                        const res = await patchSupportUser(supportCtrlUser.id, { username: next });
                        setScSaving(false);
                        if (res) {
                          setScMsg('تم حفظ اليوزر');
                          setSupportCtrlUser(prev => prev ? { ...prev, username: next } : prev);
                          setAllUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, username: next } : x));
                          setAllCompanyCtrlUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, username: next } : x));
                          setScEditBox(null);
                        } else setScMsg('فشل الحفظ — قد يكون اليوزر مستخدماً');
                      }}
                      style={{
                        padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: '#a855f7', color: '#fff', fontWeight: 800, fontSize: '0.85rem',
                        opacity: !scUsername.trim() ? 0.5 : 1,
                      }}>
                      {scSaving ? '…' : 'حفظ اليوزر'}
                    </motion.button>
                  </div>
                )}

                <motion.button whileTap={{ scale: 0.98 }} type="button"
                  onClick={() => { setScEditBox(scEditBox === 'password' ? null : 'password'); setScMsg(''); setScPassword(''); }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.35)',
                    color: '#eab308', fontWeight: 700, fontSize: '0.85rem',
                  }}>
                  🔑 تغيير كلمة المرور (بدون معرفة القديمة)
                </motion.button>
                {scEditBox === 'password' && (
                  <div style={{
                    padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.35)',
                    border: '1px solid rgba(234,179,8,0.2)', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <input
                      type="text"
                      value={scPassword}
                      onChange={e => setScPassword(e.target.value)}
                      placeholder="كلمة المرور الجديدة"
                      style={{
                        padding: '10px 12px', borderRadius: 10, outline: 'none',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#fff', fontSize: '0.9rem',
                      }}
                    />
                    <motion.button whileTap={{ scale: 0.97 }} type="button" disabled={scSaving || scPassword.length < 1}
                      onClick={async () => {
                        if (!scPassword) return;
                        setScSaving(true); setScMsg('');
                        const res = await patchSupportUser(supportCtrlUser.id, {
                          password: scPassword,
                          newPassword: scPassword,
                          forcePassword: scPassword,
                        });
                        setScSaving(false);
                        if (res) {
                          setScMsg('تم تغيير كلمة المرور');
                          setScPassword('');
                          setScEditBox(null);
                        } else setScMsg('فشل الحفظ — تحقق من صلاحيات السيرفر');
                      }}
                      style={{
                        padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: '#eab308', color: '#1a1400', fontWeight: 800, fontSize: '0.85rem',
                        opacity: scPassword.length < 1 ? 0.5 : 1,
                      }}>
                      {scSaving ? '…' : 'حفظ كلمة المرور'}
                    </motion.button>
                  </div>
                )}

                <motion.button whileTap={{ scale: 0.98 }} type="button" disabled={scSaving}
                  onClick={async () => {
                    const next = !supportCtrlUser.isBanned;
                    if (next && !window.confirm(`حظر @${supportCtrlUser.username || supportCtrlUser.email} وطرده من التطبيق؟`)) return;
                    setScSaving(true); setScMsg('');
                    const res = await patchSupportUser(supportCtrlUser.id, { isBanned: next, banned: next });
                    setScSaving(false);
                    if (res) {
                      setScMsg(next ? 'تم الحظر' : 'تم رفع الحظر');
                      setSupportCtrlUser(prev => prev ? { ...prev, isBanned: next } : prev);
                      setAllUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, isBanned: next } : x));
                      setAllCompanyCtrlUsers(prev => prev.map(x => x.id === supportCtrlUser.id ? { ...x, isBanned: next } : x));
                    } else setScMsg('فشل تنفيذ الحظر');
                  }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: supportCtrlUser.isBanned ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    border: `1px solid ${supportCtrlUser.isBanned ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                    color: supportCtrlUser.isBanned ? '#22c55e' : '#ef4444',
                    fontWeight: 800, fontSize: '0.85rem',
                  }}>
                  {supportCtrlUser.isBanned ? '✅ رفع الحظر' : '🚫 حظر / طرد من التطبيق'}
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  disabled={scSaving || scDeleting || isSupportOwnerAccount(supportCtrlUser, supportCtrlUser.username)}
                  onClick={() => {
                    if (isSupportOwnerAccount(supportCtrlUser, supportCtrlUser.username)) {
                      setScMsg('لا يمكن حذف حساب الدعم');
                      return;
                    }
                    setScDeleteText('');
                    setScDeleteError('');
                    setScDeleteOpen(true);
                  }}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    background: 'rgba(239,68,68,0.18)',
                    border: '1px solid rgba(239,68,68,0.45)',
                    color: '#ef4444',
                    fontWeight: 800, fontSize: '0.85rem',
                    display: 'flex', alignItems: 'center', gap: 8,
                    opacity: isSupportOwnerAccount(supportCtrlUser, supportCtrlUser.username) ? 0.45 : 1,
                  }}>
                  <Trash2 size={15} strokeWidth={2} />
                  حذف الحساب من التطبيق نهائياً
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ تأكيد الحذف النهائي لأي مستخدم — @Stooorna فقط ══ */}
      <AnimatePresence>
        {scDeleteOpen && (supportCtrlUser || ownerDeleteCompany) && (
          <motion.div
            key="support-user-delete-confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!scDeleting) { setScDeleteOpen(false); setOwnerDeleteCompany(null); } }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10480,
              background: 'rgba(0,0,0,0.72)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 340,
                background: 'linear-gradient(160deg, #1a1212 0%, #0e0a0a 100%)',
                border: '1px solid rgba(239,68,68,0.35)',
                borderRadius: 16,
                padding: '22px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Trash2 size={22} color="#ef4444" strokeWidth={2} />
                </div>
                <p style={{ color: 'rgba(200,230,230,0.95)', fontSize: '0.92rem', fontWeight: 800, margin: 0, textAlign: 'center' }}>
                  تأكيد حذف الحساب
                </p>
              </div>
              <p style={{
                color: 'rgba(150,190,190,0.7)', fontSize: '0.78rem', lineHeight: 1.55,
                textAlign: 'center', margin: 0,
              }}>
                سيتم حذف
                {' '}
                <span style={{ color: '#ef4444', fontWeight: 800 }}>
                  @{(supportCtrlUser?.username || ownerDeleteCompany?.username || supportCtrlUser?.email || ownerDeleteCompany?.email)}
                </span>
                {' '}
                وكل بياناته من التطبيق نهائياً. لا يمكن التراجع.
              </p>
              <p style={{ color: 'rgba(150,190,190,0.65)', fontSize: '0.72rem', textAlign: 'center', margin: 0 }}>
                اكتب <span style={{ color: '#ef4444', fontWeight: 700 }}>حذف</span> أو <span style={{ color: '#ef4444', fontWeight: 700 }}>delete</span> للتأكيد
              </p>
              <input
                value={scDeleteText}
                onChange={e => { setScDeleteText(e.target.value); setScDeleteError(''); }}
                disabled={scDeleting}
                placeholder="حذف"
                autoFocus
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '11px 12px',
                  borderRadius: 10, border: '1px solid rgba(239,68,68,0.35)',
                  background: 'rgba(0,0,0,0.35)', color: 'rgba(200,230,230,0.95)',
                  fontSize: '0.88rem', outline: 'none', textAlign: 'center',
                }}
              />
              {scDeleteError ? (
                <p style={{ color: '#ef4444', fontSize: '0.72rem', margin: 0, textAlign: 'center' }}>{scDeleteError}</p>
              ) : null}
              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  disabled={scDeleting}
                  onClick={() => setScDeleteOpen(false)}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 10,
                    border: '1px solid rgba(0,188,212,0.2)',
                    background: 'rgba(0,188,212,0.08)',
                    color: 'rgba(200,230,230,0.9)',
                    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  إلغاء
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  disabled={scDeleting}
                  onClick={async () => {
                    const normalized = scDeleteText.trim().toLowerCase();
                    if (normalized !== 'حذف' && normalized !== 'delete') {
                      setScDeleteError('اكتب «حذف» أو «delete» للتأكيد');
                      return;
                    }
                    const targetUser = supportCtrlUser;
                    const targetCo = ownerDeleteCompany;
                    if (!targetUser && !targetCo) return;
                    setScDeleting(true);
                    setScDeleteError('');
                    const target = targetUser
                      ? { id: targetUser.id, email: targetUser.email, username: targetUser.username }
                      : { id: targetCo!.userId || targetCo!.id, email: targetCo!.email, username: targetCo!.username || targetCo!.companyName };
                    markUserDeleted(target);
                    markUsernameFreed(target.username);
                    setAllUsers(prev => prev.filter(x => x.id !== target.id && String(x.username || '').toLowerCase() !== String(target.username || '').toLowerCase()));
                    setAllCompanyCtrlUsers(prev => prev.filter(x => x.id !== target.id));
                    const res = await permanentlyDeleteSupportUser(target);
                    startTransition(() => { setOwnerCompanies(loadCompaniesRegistryLight()); });
                    setOwnerDeleteCompany(null);
                    if (!res.ok) {
                      // الحذف المحلي تم — نعيد المحاولة على السيرفر دون إرجاع الحساب للقائمة
                      console.warn('[delete-user] server path failed', res.status, res.body);
                    }
                    try {
                      const list = loadCompaniesRegistry().filter(c =>
                        c.userId !== target.id && c.email.toLowerCase() !== String(target.email || '').toLowerCase(),
                      );
                      saveCompaniesRegistry(list);
                      startTransition(() => { setOwnerCompanies(sanitizeCompaniesRegistry()); });
                    } catch { /* */ }
                    setScDeleting(false);
                    setScDeleteOpen(false);
                    setSupportCtrlUser(null);
                    setScEditBox(null);
                    setScMsg('تم حذف الحساب نهائياً');
                  }}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 10,
                    border: '1px solid rgba(239,68,68,0.4)',
                    background: 'rgba(239,68,68,0.22)',
                    color: '#ef4444',
                    fontSize: '0.82rem', fontWeight: 800,
                    cursor: scDeleting ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: scDeleting ? 0.7 : 1,
                  }}
                >
                  {scDeleting ? '…' : 'حذف نهائي'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      
      {/* ══ Owner (@Stooorna only): Companies registry ══ */}
      <AnimatePresence>
        {showOwnerCompanies && !ownerCompanyDetail && isSupportOwnerAccount(
          user as { email?: string | null; username?: string | null; name?: string | null },
          profileUsername,
        ) && (
          <motion.div
            key="owner-companies"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10390,
              background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(10px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(0,188,212,0.25)',
              background: 'linear-gradient(180deg, #0a1f2e 0%, #06141c 100%)',
              minHeight: 52, flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => startTransition(() => setShowOwnerCompanies(false))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00BCD4', padding: 2 }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
              <Building2 size={18} style={{ color: '#00BCD4' }} />
              <p style={{ margin: 0, flex: 1, color: '#00BCD4', fontWeight: 800, fontSize: '0.9rem' }}>
                Companies
              </p>
              <button
                type="button"
                onClick={() => refreshOwnerCompanies()}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00BCD4', fontWeight: 700, fontSize: '1.1rem' }}
                title="تحديث"
              >
                ↻
              </button>
              <span style={{ color: 'rgba(150,190,190,0.6)', fontSize: '0.7rem' }}>{ownerCompanies.filter(c => !/nadoosha/i.test(`${c.email} ${c.username || c.companyName || ''}`)).length}</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ownerCompanies.length === 0 && (
                <div style={{ textAlign: 'center', marginTop: 48, padding: '0 16px' }}>
                  <Building2 size={32} style={{ color: 'rgba(0,188,212,0.35)', marginBottom: 10 }} />
                  <p style={{ color: 'rgba(200,230,230,0.85)', fontSize: '0.88rem', fontWeight: 700, margin: '0 0 6px' }}>
                    No registered companies yet
                  </p>
                  <p style={{ color: 'rgba(150,190,190,0.55)', fontSize: '0.75rem', margin: 0, lineHeight: 1.5 }}>
                    Companies that register from the auth screen (Companies tab) appear here only — separate from User Control.
                  </p>
                </div>
              )}
              {ownerPendingCompanyCount > 0 && (
                <p style={{ margin: '4px 0 2px', color: '#eab308', fontWeight: 800, fontSize: '0.78rem', textAlign: 'right' }}>
                  طلبات بانتظار الموافقة ({ownerPendingCompanyCount})
                </p>
              )}
              {/* مفتاح الأونر: تفعيل يوزرنيم للشركات في إعداداتها */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '12px 14px', borderRadius: 14, marginBottom: 8,
                background: 'rgba(0,188,212,0.08)', border: '1px solid rgba(0,188,212,0.3)',
              }}>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                  <p style={{ margin: 0, color: '#00BCD4', fontWeight: 800, fontSize: '0.82rem' }}>
                    يوزرنيم للشركات
                  </p>
                  <p style={{ margin: '4px 0 0', color: 'rgba(150,190,190,0.75)', fontSize: '0.7rem', lineHeight: 1.4 }}>
                    عند التشغيل تظهر للشركات إضافة يوزرنيم في إعداداتهم. عند الإيقاف تختفي الميزة.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !isCompanyUsernameFeatureEnabled();
                    setCompanyUsernameFeatureEnabled(next);
                    setOwnerCoUsernameFeature(next);
                  }}
                  style={{
                    width: 52, height: 30, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
                    background: ownerCoUsernameFeature ? '#00BCD4' : 'rgba(100,130,140,0.35)',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                  aria-label="Toggle company username feature"
                >
                  <span style={{
                    position: 'absolute', top: 3, width: 24, height: 24, borderRadius: '50%', background: '#fff',
                    left: ownerCoUsernameFeature ? 25 : 3, transition: 'left 0.2s',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  }} />
                </button>
              </div>
              {ownerCompaniesSorted
                .map(co => {
                const isActive = co.status === 'active';
                const isPending = co.status === 'pending';
                const displayName = co.username
                  ? `@${String(co.username).replace(/^@/, '')}`
                  : preferredCompanyDisplayName(co);
                const displayTrade = co.companyName && co.username
                  ? `${co.companyName}${co.tradeName ? ' · ' + co.tradeName : ''}`
                  : (co.tradeName || co.companyName || co.email);
                return (
                  <div
                    key={co.id}
                    style={{
                      display: 'flex', alignItems: 'stretch', gap: 0,
                      borderRadius: 14, overflow: 'hidden',
                      border: `1px solid ${isActive ? 'rgba(34,197,94,0.35)' : isPending ? 'rgba(234,179,8,0.35)' : 'rgba(239,68,68,0.3)'}`,
                      background: isActive ? 'rgba(34,197,94,0.06)' : isPending ? 'rgba(234,179,8,0.06)' : 'rgba(239,68,68,0.06)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        // startTransition: يخلي الضغطة تستجيب فوراً بدون تجمّد
                        // بينما يُعاد رسم التفاصيل الثقيلة (الصور) بشكل غير عاجل
                        startTransition(() => {
                          const full = loadCompanyRegistrationFull(co.id || co.email) || co;
                          setOwnerCompanyDetail({
                            ...full,
                            companyName: displayName,
                            tradeName: displayTrade || full.tradeName || co.tradeName,
                          });
                        });
                      }}
                      style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                        padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right',
                        color: 'rgba(200,230,230,0.95)',
                      }}
                    >
                      <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#00BCD4' }}>{displayName}</span>
                      <span style={{ fontSize: '0.72rem', color: 'rgba(150,190,190,0.75)' }}>{displayTrade}</span>
                      <span style={{ fontSize: '0.65rem', color: 'rgba(150,190,190,0.55)' }}>{co.email}</span>
                    </button>
                    <button
                      type="button"
                      title="عرض كامل بيانات التسجيل"
                      onClick={(e) => {
                        e.stopPropagation();
                        // startTransition: يخلي الضغطة تستجيب فوراً بدون تجمّد
                        // بينما يُعاد رسم التفاصيل الثقيلة (الصور) بشكل غير عاجل
                        startTransition(() => {
                          const full = loadCompanyRegistrationFull(co.id || co.email) || co;
                          setOwnerCompanyDetail({
                            ...full,
                            companyName: displayName,
                            tradeName: displayTrade || full.tradeName || co.tradeName,
                          });
                        });
                      }}
                      style={{
                        width: 44, flexShrink: 0, border: 'none', cursor: 'pointer',
                        background: 'rgba(0,188,212,0.1)',
                        borderLeft: '1px solid rgba(0,188,212,0.2)',
                        color: '#00BCD4',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Menu size={18} strokeWidth={2.4} />
                    </button>
                    <button
                      type="button"
                      title="حذف نهائي"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOwnerDeleteCompany(co);
                        setScDeleteText('');
                        setScDeleteError('');
                        setScDeleteOpen(true);
                      }}
                      style={{
                        width: 44, flexShrink: 0, border: 'none', cursor: 'pointer',
                        background: 'rgba(239,68,68,0.12)',
                        borderLeft: '1px solid rgba(239,68,68,0.25)',
                        color: '#ef4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Trash2 size={16} strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      disabled={ownerCompanyBusy}
                      onClick={() => {
                        const next: CompanyRegStatus = isActive ? 'inactive' : 'active';
                        setOwnerCompanyBusy(true);
                        rememberCompanyActivation(co.email, next);
                        setCompanyRegStatus(co.email || co.id, next, {
                          approvedBy: profileUsername || 'stooorna',
                        });
                        if (co.id && co.email) setCompanyRegStatus(co.id, next, { approvedBy: profileUsername || 'stooorna' });
                        const updated = loadCompaniesRegistry();
                        startTransition(() => { setOwnerCompanies(updated.map(stripCompanyCerts)); });
                        void (async () => {
                          try {
                            await pushCompanyStatusToServer({ ...co, status: next }, next);
                            if (next === 'active') {
                              try { restoreDeletedUser({ id: co.userId || co.id, email: co.email, username: co.username }); } catch { /* */ }
                              await provisionCompanyAuthAccount({ ...co, status: 'active' });
                            }
                          } finally {
                            startTransition(() => { setOwnerCompanies(loadCompaniesRegistryLight()); });
                            setOwnerCompanyBusy(false);
                          }
                        })();
                      }}
                      style={{
                        width: 88, flexShrink: 0, border: 'none', cursor: 'pointer',
                        background: isActive ? 'rgba(34,197,94,0.18)' : isPending ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
                        color: isActive ? '#22c55e' : isPending ? '#eab308' : '#ef4444',
                        fontWeight: 800, fontSize: '0.72rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        writingMode: 'horizontal-tb',
                      }}
                    >
                      {isActive ? 'Active' : isPending ? 'Approve' : 'Inactive'}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ Owner: company full registration details ══ */}
      <AnimatePresence>
        {ownerCompanyDetail && isSupportOwnerAccount(
          user as { email?: string | null; username?: string | null; name?: string | null },
          profileUsername,
        ) && (
          <motion.div
            key="owner-company-detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10400,
              background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
            onClick={() => setOwnerCompanyDetail(null)}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 60 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 480, maxHeight: '92dvh', overflowY: 'auto',
                background: 'linear-gradient(180deg, #0d2a2e 0%, #0a1a1a 100%)',
                borderTopLeftRadius: 22, borderTopRightRadius: 22,
                border: '1px solid rgba(0,188,212,0.3)',
                padding: '16px 16px max(20px, env(safe-area-inset-bottom))',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Building2 size={22} color="#00BCD4" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, color: '#00BCD4', fontWeight: 800, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ownerCompanyDetail.companyName}
                  </p>
                  <p style={{ margin: '2px 0 0', color: 'rgba(150,190,190,0.7)', fontSize: '0.7rem' }}>
                    كامل بيانات تسجيل الشركة — للدعم فقط
                  </p>
                </div>
                <button type="button" onClick={() => setOwnerCompanyDetail(null)} style={{ background: 'none', border: 'none', color: '#00BCD4', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px',
                display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14,
                fontSize: '0.8rem', color: 'rgba(220,230,230,0.95)',
              }}>
                {[
                  ['اسم الشركة', ownerCompanyDetail.companyName],
                  ['الاسم التجاري', ownerCompanyDetail.tradeName],
                  ['صاحب الشركة', ownerCompanyDetail.ownerName],
                  ['رقم السجل التجاري', ownerCompanyDetail.licenseNumber],
                  ['رقم الترخيص التجاري', ownerCompanyDetail.tradeLicenseNumber || '—'],
                  ['القطاع', [ownerCompanyDetail.sector, ownerCompanyDetail.sectorCustom].filter(Boolean).join(' — ')],
                  ['رقم الهاتف', ownerCompanyDetail.phone],
                  ['رقم هاتف آخر (اختياري)', ownerCompanyDetail.phoneAlt || '—'],
                  ['البريد الإلكتروني', ownerCompanyDetail.email],
                  ['كلمة المرور', ownerCompanyDetail.password || '— (غير محفوظة محلياً)'],
                  ['الحالة', ownerCompanyDetail.status === 'active' ? 'مفعّل (Active)' : ownerCompanyDetail.status === 'pending' ? 'قيد المراجعة (Pending)' : 'غير مفعّل (Inactive)'],
                  ['تاريخ الطلب', ownerCompanyDetail.createdAt ? new Date(ownerCompanyDetail.createdAt).toLocaleString('ar-KW') : '—'],
                  ['تاريخ الموافقة', ownerCompanyDetail.approvedAt ? new Date(ownerCompanyDetail.approvedAt).toLocaleString('ar-KW') : '—'],
                  ['المعرّف', ownerCompanyDetail.id],
                  ['معرّف المستخدم', ownerCompanyDetail.userId || '—'],
                  ['وافق بواسطة', ownerCompanyDetail.approvedBy || '—'],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: 'rgba(150,190,190,0.65)', flexShrink: 0, minWidth: 110 }}>{k}</span>
                    <span style={{
                      textAlign: 'right', wordBreak: 'break-all', fontWeight: 600,
                      color: k === 'كلمة المرور' && ownerCompanyDetail.password ? '#eab308' : undefined,
                      fontFamily: k === 'كلمة المرور' ? 'ui-monospace, monospace' : undefined,
                      direction: k === 'كلمة المرور' || k === 'البريد الإلكتروني' || k === 'رقم الهاتف' || k === 'رقم هاتف آخر (اختياري)' || k === 'رقم السجل التجاري' || k === 'المعرّف' || k === 'معرّف المستخدم' ? 'ltr' : undefined,
                    }}>{v as string}</span>
                  </div>
                ))}

                {/* شهادة السجل التجاري */}
                {ownerCompanyDetail.commercialRegCert && (
                  <div style={{ borderTop: '1px solid hsl(var(--primary)/0.15)', paddingTop: 10, marginTop: 4 }}>
                    <p style={{ margin: '0 0 6px', color: 'hsl(var(--primary)/0.7)', fontSize: '0.75rem', fontWeight: 700 }}>
                      شهادة السجل التجاري
                    </p>
                    {ownerCompanyDetail.commercialRegCert.startsWith('data:image') ? (
                      <img
                        src={ownerCompanyDetail.commercialRegCert}
                        alt="شهادة السجل التجاري"
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', borderRadius: 10, border: '1px solid hsl(var(--primary)/0.2)', objectFit: 'contain', maxHeight: 260 }}
                      />
                    ) : (
                      <a
                        href={ownerCompanyDetail.commercialRegCert}
                        download={ownerCompanyDetail.commercialRegCertName || 'commercial-reg.pdf'}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'hsl(var(--primary)/0.1)', border: '1px solid hsl(var(--primary)/0.25)', borderRadius: 10, color: 'hsl(var(--primary))', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700 }}
                      >
                        <FileText size={16} />
                        {ownerCompanyDetail.commercialRegCertName || 'تحميل الشهادة'}
                      </a>
                    )}
                  </div>
                )}

                {/* شهادة الترخيص التجاري */}
                {ownerCompanyDetail.tradeLicenseCert && (
                  <div style={{ borderTop: '1px solid hsl(var(--gold)/0.15)', paddingTop: 10, marginTop: 4 }}>
                    <p style={{ margin: '0 0 6px', color: 'hsl(var(--gold)/0.8)', fontSize: '0.75rem', fontWeight: 700 }}>
                      شهادة الترخيص التجاري
                    </p>
                    {ownerCompanyDetail.tradeLicenseCert.startsWith('data:image') ? (
                      <img
                        src={ownerCompanyDetail.tradeLicenseCert}
                        alt="شهادة الترخيص التجاري"
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', borderRadius: 10, border: '1px solid hsl(var(--gold)/0.2)', objectFit: 'contain', maxHeight: 260 }}
                      />
                    ) : (
                      <a
                        href={ownerCompanyDetail.tradeLicenseCert}
                        download={ownerCompanyDetail.tradeLicenseCertName || 'trade-license.pdf'}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'hsl(var(--gold)/0.1)', border: '1px solid hsl(var(--gold)/0.25)', borderRadius: 10, color: 'hsl(var(--gold))', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700 }}
                      >
                        <FileText size={16} />
                        {ownerCompanyDetail.tradeLicenseCertName || 'تحميل الشهادة'}
                      </a>
                    )}
                  </div>
                )}

                {/* تنبيه إذا لم ترفق الشهادات */}
                {(!ownerCompanyDetail.commercialRegCert || !ownerCompanyDetail.tradeLicenseCert) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'hsl(var(--destructive)/0.08)', border: '1px solid hsl(var(--destructive)/0.25)', borderRadius: 10, marginTop: 4 }}>
                    <AlertTriangle size={14} color="hsl(var(--destructive))" style={{ flexShrink: 0 }} />
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'hsl(var(--destructive)/0.85)' }}>
                      {!ownerCompanyDetail.commercialRegCert && !ownerCompanyDetail.tradeLicenseCert
                        ? 'لم يتم رفع شهادة السجل التجاري ولا شهادة الترخيص التجاري'
                        : !ownerCompanyDetail.commercialRegCert
                          ? 'لم يتم رفع شهادة السجل التجاري'
                          : 'لم يتم رفع شهادة الترخيص التجاري'
                      }
                    </p>
                  </div>
                )}
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => {
                  setOwnerDeleteCompany(ownerCompanyDetail);
                  setScDeleteText('');
                  setScDeleteError('');
                  setScDeleteOpen(true);
                }}
                style={{
                  width: '100%', padding: '12px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.14)', color: '#ef4444', fontWeight: 800, fontSize: '0.85rem',
                  cursor: 'pointer', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Trash2 size={15} />
                حذف الحساب نهائياً وتحرير اليوزر
              </motion.button>
              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  disabled={ownerCompanyBusy || ownerCompanyDetail.status === 'active'}
                  onClick={() => {
                    setOwnerCompanyBusy(true);
                    rememberCompanyActivation(ownerCompanyDetail.email, 'active');
                    setCompanyRegStatus(ownerCompanyDetail.email || ownerCompanyDetail.id, 'active', {
                      approvedBy: profileUsername || 'stooorna',
                    });
                    if (ownerCompanyDetail.id) setCompanyRegStatus(ownerCompanyDetail.id, 'active', { approvedBy: profileUsername || 'stooorna' });
                    const updated = loadCompaniesRegistry();
                    startTransition(() => { setOwnerCompanies(updated.map(stripCompanyCerts)); });
                    setOwnerCompanyDetail(prev => prev ? { ...prev, status: 'active', approvedAt: new Date().toISOString() } : prev);
                    void (async () => {
                      try {
                        await pushCompanyStatusToServer({ ...ownerCompanyDetail, status: 'active' }, 'active');
                        try { restoreDeletedUser({ id: ownerCompanyDetail.userId || ownerCompanyDetail.id, email: ownerCompanyDetail.email, username: ownerCompanyDetail.username }); } catch { /* */ }
                        await provisionCompanyAuthAccount({ ...ownerCompanyDetail, status: 'active' });
                      } finally {
                        startTransition(() => { setOwnerCompanies(loadCompaniesRegistryLight()); });
                        setOwnerCompanyBusy(false);
                      }
                    })();
                  }}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: ownerCompanyDetail.status === 'active' ? 'rgba(34,197,94,0.2)' : '#22c55e',
                    color: ownerCompanyDetail.status === 'active' ? '#86efac' : '#041018',
                    fontWeight: 800, fontSize: '0.85rem',
                    opacity: ownerCompanyDetail.status === 'active' ? 0.7 : 1,
                  }}
                >
                  Activate
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  disabled={ownerCompanyBusy || ownerCompanyDetail.status === 'inactive'}
                  onClick={() => {
                    setOwnerCompanyBusy(true);
                    rememberCompanyActivation(ownerCompanyDetail.email, 'inactive');
                    setCompanyRegStatus(ownerCompanyDetail.email || ownerCompanyDetail.id, 'inactive');
                    if (ownerCompanyDetail.id) setCompanyRegStatus(ownerCompanyDetail.id, 'inactive');
                    const updated = loadCompaniesRegistry();
                    startTransition(() => { setOwnerCompanies(updated.map(stripCompanyCerts)); });
                    setOwnerCompanyDetail(prev => prev ? { ...prev, status: 'inactive' } : prev);
                    void pushCompanyStatusToServer({ ...ownerCompanyDetail, status: 'inactive' }, 'inactive').finally(() => {
                      startTransition(() => { setOwnerCompanies(loadCompaniesRegistryLight()); });
                      setOwnerCompanyBusy(false);
                    });
                  }}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: ownerCompanyDetail.status === 'inactive' ? 'rgba(239,68,68,0.2)' : '#ef4444',
                    color: ownerCompanyDetail.status === 'inactive' ? '#fca5a5' : '#fff',
                    fontWeight: 800, fontSize: '0.85rem',
                    opacity: ownerCompanyDetail.status === 'inactive' ? 0.7 : 1,
                  }}
                >
                  Deactivate
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Owner: New Company Registration Requests — removed */}
      {false && isOwner && tab === 'companies' && ownerNewCompanies.length > 0 && (
        <div style={{
          margin: '0 20px 20px',
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 16,
          padding: 16,
          direction: 'rtl',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontWeight: 800, fontSize: 14, color: 'hsl(var(--foreground))' }}>
              طلبات تسجيل الشركات
              {ownerNewCompanies.filter(c => c.status === 'pending').length > 0 && (
                <span style={{
                  marginRight: 8, padding: '2px 8px', borderRadius: 20,
                  background: 'hsl(var(--primary)/0.2)', color: 'hsl(var(--primary))',
                  fontSize: 11, fontWeight: 700,
                }}>
                  {ownerNewCompanies.filter(c => c.status === 'pending').length} جديد
                </span>
              )}
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setOwnerNewCompaniesFilter(f)}
                  style={{
                    padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600,
                    background: ownerNewCompaniesFilter === f ? 'hsl(var(--primary))' : 'hsl(var(--muted)/0.5)',
                    color: ownerNewCompaniesFilter === f ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {f === 'pending' ? 'انتظار' : f === 'approved' ? 'معتمد' : f === 'rejected' ? 'مرفوض' : 'الكل'}
                </button>
              ))}
            </div>
          </div>

          {ownerNewCompaniesLoading ? (
            <p style={{ textAlign: 'center', color: 'hsl(var(--muted-foreground))', fontSize: 13, padding: 12 }}>جاري التحميل…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ownerNewCompanies
                .filter(c => ownerNewCompaniesFilter === 'all' || c.status === ownerNewCompaniesFilter)
                .map(c => (
                  <div key={c.id} style={{
                    background: 'hsl(var(--muted)/0.3)',
                    border: `1px solid ${c.status === 'pending' ? 'hsl(var(--primary)/0.3)' : c.status === 'approved' ? 'hsl(var(--success)/0.3)' : 'hsl(var(--destructive)/0.3)'}`,
                    borderRadius: 12, padding: 12,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: 'hsl(var(--foreground))' }}>{c.companyName}</p>
                        {c.tradeName && <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{c.tradeName}</p>}
                        <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>
                          مقدّم من: {c.submitter.name || c.submitter.username || c.submitter.email}
                        </p>
                        {c.licenseNumber && <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>سجل: {c.licenseNumber}</p>}
                        {c.tradeLicenseNumber && <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>رخصة: {c.tradeLicenseNumber}</p>}
                        {c.description && <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 4 }}>{c.description}</p>}
                        {/* Documents */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          {c.commercialRegFile ? (
                            <a href={c.commercialRegFile} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 11, color: 'hsl(var(--primary))', textDecoration: 'underline' }}>
                              📄 السجل التجاري
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: 'hsl(var(--destructive))' }}>⚠ لا يوجد سجل تجاري</span>
                          )}
                          {c.tradeLicenseFile ? (
                            <a href={c.tradeLicenseFile} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 11, color: 'hsl(var(--primary))', textDecoration: 'underline' }}>
                              📄 الترخيص التجاري
                            </a>
                          ) : (
                            <span style={{ fontSize: 11, color: 'hsl(var(--destructive))' }}>⚠ لا يوجد ترخيص</span>
                          )}
                        </div>
                      </div>
                      <span style={{
                        padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                        background: c.status === 'pending' ? 'hsl(var(--primary)/0.15)' : c.status === 'approved' ? 'hsl(var(--success)/0.15)' : 'hsl(var(--destructive)/0.15)',
                        color: c.status === 'pending' ? 'hsl(var(--primary))' : c.status === 'approved' ? 'hsl(var(--success))' : 'hsl(var(--destructive))',
                      }}>
                        {c.status === 'pending' ? 'انتظار' : c.status === 'approved' ? 'معتمد ✓' : 'مرفوض'}
                      </span>
                    </div>

                    {/* Reject reason input */}
                    {ownerNewCompaniesRejectId === c.id && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                        <input
                          value={ownerNewCompaniesRejectReason}
                          onChange={e => setOwnerNewCompaniesRejectReason(e.target.value)}
                          placeholder="سبب الرفض (اختياري)"
                          style={{
                            flex: 1, padding: '8px 10px', borderRadius: 8,
                            border: '1px solid hsl(var(--border))',
                            background: 'hsl(var(--muted)/0.4)',
                            color: 'hsl(var(--foreground))', fontSize: 12, direction: 'rtl',
                          }}
                        />
                        <button
                          onClick={() => reviewNewCompany(c.id, 'reject', ownerNewCompaniesRejectReason)}
                          style={{
                            padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))',
                            fontSize: 12, fontWeight: 700,
                          }}
                        >
                          تأكيد الرفض
                        </button>
                        <button
                          onClick={() => setOwnerNewCompaniesRejectId(null)}
                          style={{
                            padding: '8px 12px', borderRadius: 8, border: '1px solid hsl(var(--border))',
                            background: 'transparent', color: 'hsl(var(--muted-foreground))',
                            fontSize: 12, cursor: 'pointer',
                          }}
                        >
                          إلغاء
                        </button>
                      </div>
                    )}

                    {/* Action buttons */}
                    {c.status === 'pending' && ownerNewCompaniesRejectId !== c.id && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          onClick={() => reviewNewCompany(c.id, 'approve')}
                          style={{
                            flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: 'hsl(var(--success))', color: 'hsl(var(--success-foreground))',
                            fontSize: 12, fontWeight: 700,
                          }}
                        >
                          ✓ قبول
                        </button>
                        <button
                          onClick={() => { setOwnerNewCompaniesRejectId(c.id); setOwnerNewCompaniesRejectReason(''); }}
                          style={{
                            flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))',
                            fontSize: 12, fontWeight: 700,
                          }}
                        >
                          ✕ رفض
                        </button>
                      </div>
                    )}
                    {c.status === 'approved' && (
                      <button
                        onClick={() => reviewNewCompany(c.id, 'reject', 'تم إلغاء الاعتماد')}
                        style={{
                          marginTop: 8, padding: '6px 14px', borderRadius: 8,
                          border: '1px solid hsl(var(--destructive)/0.5)',
                          background: 'transparent', color: 'hsl(var(--destructive))',
                          fontSize: 11, cursor: 'pointer',
                        }}
                      >
                        إلغاء الاعتماد
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}


      {/* ── Owner: Banned / soft-deleted recovery ── */}
      <AnimatePresence>
        {showRecoveredUsers && isSupportOwnerAccount(
          user as { email?: string | null; username?: string | null; name?: string | null },
          profileUsername,
        ) && (
          <motion.div
            key="recovered-users"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10350,
              background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(10px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(234,179,8,0.25)',
              background: 'linear-gradient(180deg, #1a1608 0%, #0a0e0e 100%)',
              minHeight: 52, flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => setShowRecoveredUsers(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#eab308', padding: 2 }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900, fontSize: '0.95rem' }}>Banned / Deleted</p>
                <p style={{ margin: '1px 0 0', color: 'rgba(200,190,150,0.75)', fontSize: '0.68rem', fontWeight: 600 }}>
                  Restore accounts or permanent wipe
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRecoveredUsers(loadDeletedUsers())}
                style={{
                  border: '1px solid rgba(234,179,8,0.35)', background: 'rgba(234,179,8,0.1)',
                  color: '#eab308', borderRadius: 8, padding: '6px 10px', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer',
                }}
              >
                Refresh
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
              {recoveredUsers.length === 0 && (
                <div style={{
                  padding: 24, textAlign: 'center', color: 'rgba(180,180,160,0.7)',
                  border: '1px dashed rgba(234,179,8,0.25)', borderRadius: 14,
                }}>
                  No banned or soft-deleted accounts in recovery list
                </div>
              )}
              {recoveredUsers.map((row) => {
                const key = String(row.id || row.email || row.username || row.deletedAt || 'row');
                const busy = recoveredBusyId === key;
                return (
                  <div
                    key={key}
                    style={{
                      marginBottom: 10, padding: '12px 14px', borderRadius: 14,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(234,179,8,0.2)',
                    }}
                  >
                    <p style={{ margin: 0, color: '#f5e6a8', fontWeight: 800, fontSize: '0.88rem' }}>
                      {row.username ? `@${String(row.username).replace(/^@/, '')}` : (row.email || row.id)}
                    </p>
                    {row.email && (
                      <p style={{ margin: '4px 0 0', color: 'rgba(180,180,160,0.75)', fontSize: '0.72rem' }}>{row.email}</p>
                    )}
                    <p style={{ margin: '4px 0 0', color: 'rgba(150,150,130,0.6)', fontSize: '0.65rem' }}>
                      Soft-deleted {row.deletedAt ? new Date(row.deletedAt).toLocaleString() : ''}
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setRecoveredBusyId(key);
                          try {
                            const orig = String(row.originalUsername || '').replace(/^@/, '').trim()
                              || (String(row.username || '').startsWith('deleted_') ? '' : String(row.username || '').replace(/^@/, '').trim());
                            // Remove from local recovery list immediately
                            const next = restoreDeletedUser(row);
                            setRecoveredUsers([...next]);
                            // Unban + restore username on server
                            const payload: Record<string, unknown> = {
                              isBanned: false,
                              banned: false,
                              active: true,
                              status: 'active',
                              deleted: false,
                              isDeleted: false,
                            };
                            if (orig) payload.username = orig;
                            const ids = [row.id].filter(Boolean) as string[];
                            for (const uid of ids) {
                              for (const url of [`/api/owner/users/${uid}`, `/api/support/users/${uid}`, `/api/users/${uid}`]) {
                                try {
                                  const r = await fetch(url, {
                                    method: 'PATCH',
                                    credentials: 'include',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(payload),
                                  });
                                  if (r.ok) break;
                                } catch { /* next */ }
                              }
                            }
                            // Also try by email
                            if (row.email) {
                              try {
                                await fetch('/api/owner/users/unban', {
                                  method: 'POST',
                                  credentials: 'include',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ email: row.email, username: orig, ...payload }),
                                });
                              } catch { /* */ }
                            }
                            setRecoveredUsers(loadDeletedUsers());
                            try { await loadOwnerData(); } catch { /* */ }
                          } catch (err) {
                            console.error('[restore]', err);
                            alert('Restore failed: ' + String(err));
                          } finally {
                            setRecoveredBusyId('');
                          }
                        }}
                        style={{
                          flex: 1, minWidth: 100, padding: '10px 12px', borderRadius: 10, border: 'none',
                          background: '#22c55e', color: '#041018', fontWeight: 800, fontSize: '0.78rem',
                          cursor: 'pointer', opacity: busy ? 0.6 : 1,
                        }}
                      >
                        Restore / Unban
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const ok = window.confirm('PERMANENT delete: wipe all data and free the username. This cannot be undone.');
                          if (!ok) return;
                          setRecoveredBusyId(key);
                          try {
                            // Optimistic UI remove
                            setRecoveredUsers(prev => prev.filter(x => {
                              if (row.id && x.id === row.id) return false;
                              if (row.email && String(x.email || '').toLowerCase() === String(row.email || '').toLowerCase()) return false;
                              return true;
                            }));
                            await permanentlyWipeUser(row);
                            setRecoveredUsers(loadDeletedUsers());
                            try { await loadOwnerData(); } catch { /* */ }
                          } catch (err) {
                            console.error('[wipe]', err);
                            alert('Permanent wipe failed: ' + String(err));
                            setRecoveredUsers(loadDeletedUsers());
                          } finally {
                            setRecoveredBusyId('');
                          }
                        }}
                        style={{
                          flex: 1, minWidth: 100, padding: '10px 12px', borderRadius: 10, border: 'none',
                          background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: '0.78rem',
                          cursor: 'pointer', opacity: busy ? 0.6 : 1,
                        }}
                      >
                        Permanent wipe
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>



      {/* ── Owner note for Business applicant (one-time) ── */}
      <AnimatePresence>
        {bizOwnerNoteOpen && businessRow?.ownerNote && !businessRow?.ownerNoteSeen && (
          <motion.div
            key="biz-owner-note"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10500,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '16px 18px calc(72px + env(safe-area-inset-bottom))',
              boxSizing: 'border-box',
            }}
            onClick={() => {
              if (user?.id) dismissBusinessOwnerNote(user.id);
              setBizOwnerNoteOpen(false);
              const r = getBusinessForUser(user?.id);
              setBusinessRow(r);
            }}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              style={{
                width: 'min(92vw, 360px)',
                background: 'linear-gradient(180deg, #0a1f22 0%, #061014 100%)',
                border: '1px solid rgba(234,179,8,0.4)',
                borderRadius: 16,
                padding: '16px 14px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900, fontSize: '0.9rem' }}>Message from owner</p>
                <button
                  type="button"
                  onClick={() => {
                    if (user?.id) dismissBusinessOwnerNote(user.id);
                    setBizOwnerNoteOpen(false);
                    const r = getBusinessForUser(user?.id);
                    setBusinessRow(r);
                  }}
                  style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>
              <p style={{ margin: 0, color: 'rgba(200,230,230,0.9)', fontSize: '0.88rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {businessRow.ownerNote}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (user?.id) dismissBusinessOwnerNote(user.id);
                  setBizOwnerNoteOpen(false);
                  const r = getBusinessForUser(user?.id);
                  setBusinessRow(r);
                }}
                style={{
                  marginTop: 14, width: '100%', padding: '12px', borderRadius: 12, border: 'none',
                  background: '#eab308', color: '#0a0a0a', fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer',
                }}
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Business registration modal ── */}
      <AnimatePresence>
        {businessModalOpen && (
          <motion.div
            key="biz-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10400,
              background: 'rgba(0,0,0,0.72)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '12px 14px calc(72px + env(safe-area-inset-bottom))',
              boxSizing: 'border-box',
            }}
            onClick={() => setBusinessModalOpen(false)}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              style={{
                width: 'min(94vw, 400px)',
                maxHeight: 'min(78vh, calc(100dvh - 120px - env(safe-area-inset-bottom)))',
                overflowY: 'auto',
                background: 'linear-gradient(180deg, #0a1f22 0%, #061014 100%)',
                border: '1px solid rgba(234,179,8,0.35)',
                borderRadius: 18,
                padding: '16px 14px 18px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
                direction: 'rtl',
                marginBottom: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900, fontSize: '0.95rem' }}>Business</p>
                <button type="button" onClick={() => setBusinessModalOpen(false)} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              {businessRow?.status === 'approved' ? (
                <div style={{ textAlign: 'center', padding: '18px 8px' }}>
                  <span style={{
                    display: 'inline-block', fontSize: '0.75rem', fontWeight: 900, color: '#0a0a0a',
                    background: '#eab308', borderRadius: 8, padding: '6px 14px',
                  }}>Business</span>
                  <p style={{ margin: '12px 0 0', color: 'rgba(200,230,230,0.85)', fontSize: '0.82rem', fontWeight: 700 }}>
                    {businessRow.projectName}
                  </p>
                </div>
              ) : businessRow?.status === 'pending' ? (
                <button type="button" disabled style={{
                  width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                  background: 'rgba(0,188,212,0.18)', color: '#00BCD4', fontWeight: 900, fontSize: '0.88rem',
                }}>
                  Under review
                </button>
              ) : (
                <>
                  <label style={{ display: 'block', color: 'rgba(180,210,210,0.75)', fontSize: '0.68rem', fontWeight: 700, marginBottom: 6 }}>
                    Project name
                  </label>
                  <input
                    value={bizProjectName}
                    onChange={e => setBizProjectName(e.target.value.slice(0, 80))}
                    placeholder="Project name"
                    style={{
                      width: '100%', boxSizing: 'border-box', marginBottom: 12, padding: '11px 12px', borderRadius: 11,
                      border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)',
                      color: '#d7eeee', fontSize: '0.88rem', outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ display: 'block', color: 'rgba(180,210,210,0.75)', fontSize: '0.65rem', fontWeight: 700, marginBottom: 6 }}>
                        Commercial registration
                      </label>
                      <input
                        value={bizLicense}
                        onChange={e => setBizLicense(e.target.value.slice(0, 40))}
                        placeholder="No."
                        style={{
                          width: '100%', boxSizing: 'border-box', padding: '10px 10px', borderRadius: 11,
                          border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)',
                          color: '#d7eeee', fontSize: '0.82rem', outline: 'none',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label style={{ display: 'block', color: 'rgba(180,210,210,0.75)', fontSize: '0.65rem', fontWeight: 700, marginBottom: 6 }}>
                        Trade license
                      </label>
                      <input
                        value={bizTradeLicense}
                        onChange={e => setBizTradeLicense(e.target.value.slice(0, 40))}
                        placeholder="No."
                        style={{
                          width: '100%', boxSizing: 'border-box', padding: '10px 10px', borderRadius: 11,
                          border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)',
                          color: '#d7eeee', fontSize: '0.82rem', outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  <input ref={bizCommFileRef} type="file" accept="image/*,.pdf" hidden onChange={e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setBizCommCert(String(reader.result || ''));
                      setBizCommCertName(f.name);
                    };
                    reader.readAsDataURL(f);
                  }} />
                  <input ref={bizTradeFileRef} type="file" accept="image/*,.pdf" hidden onChange={e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setBizTradeCert(String(reader.result || ''));
                      setBizTradeCertName(f.name);
                    };
                    reader.readAsDataURL(f);
                  }} />

                  <p style={{ margin: '0 0 6px', color: 'rgba(180,210,210,0.75)', fontSize: '0.68rem', fontWeight: 700 }}>
                    Commercial registration certificate
                  </p>
                  <button type="button" onClick={() => bizCommFileRef.current?.click()} style={{
                    width: '100%', marginBottom: 10, padding: '12px', borderRadius: 12,
                    border: '1px dashed rgba(234,179,8,0.4)', background: 'rgba(234,179,8,0.06)',
                    color: '#eab308', fontWeight: 800, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <Plus size={16} />
                    {bizCommCertName || 'Add file'}
                  </button>

                  <p style={{ margin: '0 0 6px', color: 'rgba(180,210,210,0.75)', fontSize: '0.68rem', fontWeight: 700 }}>
                    Trade license certificate
                  </p>
                  <button type="button" onClick={() => bizTradeFileRef.current?.click()} style={{
                    width: '100%', marginBottom: 14, padding: '12px', borderRadius: 12,
                    border: '1px dashed rgba(234,179,8,0.4)', background: 'rgba(234,179,8,0.06)',
                    color: '#eab308', fontWeight: 800, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <Plus size={16} />
                    {bizTradeCertName || 'Add file'}
                  </button>

                  <button
                    type="button"
                    disabled={bizSubmitting || !bizProjectName.trim() || !bizLicense.trim() || !bizTradeLicense.trim() || !bizCommCert || !bizTradeCert}
                    onClick={() => {
                      if (!user?.id) return;
                      setBizSubmitting(true);
                      const row: BusinessRegistration = {
                        id: `biz-${user.id}-${Date.now()}`,
                        userId: String(user.id),
                        username: profileUsername || (user as any).username || null,
                        email: user.email || null,
                        projectName: bizProjectName.trim(),
                        licenseNumber: bizLicense.trim(),
                        tradeLicenseNumber: bizTradeLicense.trim(),
                        commercialRegCert: bizCommCert,
                        commercialRegCertName: bizCommCertName,
                        tradeLicenseCert: bizTradeCert,
                        tradeLicenseCertName: bizTradeCertName,
                        status: 'pending',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                      };
                      upsertBusinessRegistration(row);
                      setBusinessRow(row);
                      setBusinessToggleOn(true);
                      setBizSubmitting(false);
                    }}
                    style={{
                      width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                      background: (bizProjectName.trim() && bizLicense.trim() && bizTradeLicense.trim() && bizCommCert && bizTradeCert)
                        ? '#eab308' : 'rgba(234,179,8,0.2)',
                      color: (bizProjectName.trim() && bizLicense.trim() && bizTradeLicense.trim() && bizCommCert && bizTradeCert)
                        ? '#0a0a0a' : 'rgba(150,150,130,0.7)',
                      fontWeight: 900, fontSize: '0.9rem',
                      cursor: (bizProjectName.trim() && bizLicense.trim() && bizTradeLicense.trim() && bizCommCert && bizTradeCert) ? 'pointer' : 'default',
                    }}
                  >
                    {bizSubmitting ? '...' : (businessRow?.status === 'pending' ? 'Under review' : 'Submit registration')}
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Owner: Business applications overlay (not mixed into company registry) ── */}
      <AnimatePresence>
        {showOwnerBusiness && isSupportOwnerAccount(
          user as { email?: string | null; username?: string | null; name?: string | null },
          profileUsername,
        ) && (
          <motion.div
            key="owner-business-apps"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10370,
              background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(10px)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))',
              borderBottom: '1px solid rgba(234,179,8,0.25)',
              background: 'linear-gradient(180deg, #1a1608 0%, #0a0e0e 100%)',
              minHeight: 52, flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={() => setShowOwnerBusiness(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#eab308', padding: 2 }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
              <Briefcase size={18} style={{ color: '#eab308' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900, fontSize: '0.95rem' }}>Business applications</p>
                <p style={{ margin: '1px 0 0', color: 'rgba(200,190,150,0.75)', fontSize: '0.68rem', fontWeight: 600 }}>
                  Full request data · Approve / Reject · Note to user
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOwnerBusinessList(loadBusinessRegistry())}
                style={{
                  border: '1px solid rgba(234,179,8,0.35)', background: 'rgba(234,179,8,0.1)',
                  color: '#eab308', borderRadius: 8, padding: '6px 10px', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer',
                }}
              >
                Refresh
              </button>
              <span style={{ color: 'rgba(200,190,150,0.7)', fontSize: '0.7rem' }}>{ownerBusinessList.length}</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ownerBusinessList.length === 0 && (
                <div style={{
                  padding: 24, textAlign: 'center', color: 'rgba(180,180,160,0.7)',
                  border: '1px dashed rgba(234,179,8,0.25)', borderRadius: 14,
                }}>
                  No business applications
                </div>
              )}
              {ownerBusinessList.map(row => (
                <div key={row.id} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${row.status === 'pending' ? 'rgba(234,179,8,0.35)' : row.status === 'approved' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.3)'}`,
                  borderRadius: 14, padding: 14,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: '#f5e6a8' }}>{row.projectName}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(180,180,160,0.8)' }}>
                        @{String(row.username || '').replace(/^@/, '') || 'user'} · {row.email || ''}
                      </p>
                      <p style={{ margin: '6px 0 0', fontSize: 11, color: 'rgba(180,180,160,0.7)' }}>
                        Commercial registration: {row.licenseNumber}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(180,180,160,0.7)' }}>
                        Trade license: {row.tradeLicenseNumber}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 10, color: 'rgba(150,150,130,0.6)' }}>
                        Submitted: {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 10, color: 'rgba(150,150,130,0.6)' }}>
                        User ID: {row.userId}
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {row.commercialRegCert && (
                          <a href={row.commercialRegCert} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#00BCD4' }}>
                            Commercial cert{row.commercialRegCertName ? ` (${row.commercialRegCertName})` : ''}
                          </a>
                        )}
                        {row.tradeLicenseCert && (
                          <a href={row.tradeLicenseCert} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#00BCD4' }}>
                            Trade cert{row.tradeLicenseCertName ? ` (${row.tradeLicenseCertName})` : ''}
                          </a>
                        )}
                      </div>
                    </div>
                    <span style={{
                      padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                      background: row.status === 'pending' ? 'rgba(234,179,8,0.15)' : row.status === 'approved' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: row.status === 'pending' ? '#eab308' : row.status === 'approved' ? '#22c55e' : '#ef4444',
                    }}>
                      {row.status}
                    </span>
                  </div>
                  {row.status === 'pending' && (
                    <div style={{ marginTop: 12 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(180,180,160,0.75)', marginBottom: 6 }}>
                        Note for user (shown once in their settings, then disappears after they close it)
                      </label>
                      <textarea
                        value={ownerBizNotes[row.id] || ''}
                        onChange={e => setOwnerBizNotes(prev => ({ ...prev, [row.id]: e.target.value.slice(0, 500) }))}
                        placeholder="Write instructions or rejection reason for the user..."
                        rows={3}
                        style={{
                          width: '100%', boxSizing: 'border-box', borderRadius: 10, padding: '10px 12px',
                          border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.55)',
                          color: 'rgba(220,230,230,0.95)', fontSize: 12, outline: 'none', resize: 'vertical',
                          fontFamily: 'inherit', marginBottom: 8,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            reviewBusinessRegistration(row.id, 'approve', ownerBizNotes[row.id] || null);
                            setOwnerBusinessList(loadBusinessRegistry());
                            setOwnerBizNotes(prev => {
                              const n = { ...prev };
                              delete n[row.id];
                              return n;
                            });
                          }}
                          style={{
                            flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: '#22c55e', color: '#041018', fontSize: 12, fontWeight: 800,
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            reviewBusinessRegistration(row.id, 'reject', ownerBizNotes[row.id] || null);
                            setOwnerBusinessList(loadBusinessRegistry());
                            setOwnerBizNotes(prev => {
                              const n = { ...prev };
                              delete n[row.id];
                              return n;
                            });
                          }}
                          style={{
                            flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                            background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 800,
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                  {row.ownerNote && row.status !== 'pending' && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(180,180,160,0.7)' }}>
                      Note sent: {row.ownerNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visa top-up for Business balance */}
      <AnimatePresence>
        {bizTopUpOpen && (
          <motion.div
            key="biz-topup"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 10500, background: 'rgba(0,0,0,0.75)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
            onClick={() => setBizTopUpOpen(false)}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              style={{
                width: 'min(94vw, 380px)', background: 'linear-gradient(180deg, #0a1f22 0%, #061014 100%)',
                border: '1px solid rgba(234,179,8,0.35)', borderRadius: 16, padding: 18,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ margin: 0, color: '#eab308', fontWeight: 900 }}>Add balance (Visa)</p>
                <button type="button" onClick={() => setBizTopUpOpen(false)} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <label style={{ display: 'block', color: 'rgba(180,210,210,0.7)', fontSize: '0.68rem', marginBottom: 6 }}>Card number</label>
              <input value={bizCardNumber} onChange={e => setBizCardNumber(e.target.value.replace(/[^0-9 ]/g, '').slice(0, 19))}
                placeholder="XXXX XXXX XXXX XXXX"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)', color: '#d7eeee', outline: 'none' }} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: 'rgba(180,210,210,0.7)', fontSize: '0.68rem', marginBottom: 6 }}>Expiry</label>
                  <input value={bizCardExp} onChange={e => setBizCardExp(e.target.value.slice(0, 5))} placeholder="MM/YY"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)', color: '#d7eeee', outline: 'none' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: 'rgba(180,210,210,0.7)', fontSize: '0.68rem', marginBottom: 6 }}>CVV</label>
                  <input value={bizCardCvv} onChange={e => setBizCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="***"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)', color: '#d7eeee', outline: 'none' }} />
                </div>
              </div>
              <label style={{ display: 'block', color: 'rgba(180,210,210,0.7)', fontSize: '0.68rem', marginBottom: 6 }}>Amount (KD)</label>
              <input value={bizTopUpAmount} onChange={e => setBizTopUpAmount(e.target.value.replace(/[^0-9.]/g, '').slice(0, 8))}
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 14, padding: '11px 12px', borderRadius: 10, border: '1px solid rgba(0,188,212,0.25)', background: 'rgba(0,30,35,0.8)', color: '#eab308', fontWeight: 800, outline: 'none' }} />
              <button
                type="button"
                onClick={() => {
                  if (!user?.id) return;
                  const amt = Math.max(1, Math.floor(Number(bizTopUpAmount) || 0));
                  if (bizCardNumber.replace(/\s/g, '').length < 12) return;
                  const next = bizBalance + amt;
                  try {
                    localStorage.setItem(`stooorna_biz_balance_${user.id}`, String(next));
                    window.dispatchEvent(new CustomEvent('stooorna:biz-balance', { detail: { userId: user.id, balance: next } }));
                  } catch { /* */ }
                  setBizBalance(next);
                  setBizCardNumber('');
                  setBizCardExp('');
                  setBizCardCvv('');
                  setBizTopUpOpen(false);
                }}
                style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: '#eab308', color: '#0a0a0a', fontWeight: 900, cursor: 'pointer' }}
              >
                Pay & add balance
              </button>
              <p style={{ margin: '10px 0 0', color: 'rgba(180,210,210,0.55)', fontSize: '0.65rem', textAlign: 'center' }}>
                Demo top-up (local). Connect a payment gateway for production.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Music modal — from profile Music button ── */}
      <AnimatePresence>
        {musicModalOpen && (
          <SettingsMusicSearchModal
            onClose={() => setMusicModalOpen(false)}
            currentTrack={musicCurrentTrack}
            isPlaying={musicIsPlaying}
            onPlayTrack={handleMusicPlayTrack}
            favorites={musicFavorites}
            onToggleFavorite={handleMusicToggleFavorite}
          />
        )}
      </AnimatePresence>
    </>;
}