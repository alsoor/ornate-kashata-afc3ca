/**
 * Stooorna i18n — Arabic / English
 * Usage:
 *   import { useT, useLang } from '@/lib/i18n';
 *   const t = useT();
 *   const { lang, setLang } = useLang();
 */
import React, { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'ar' | 'en';

const STORAGE_KEY = 'stooorna_lang';

// ─── Translations ────────────────────────────────────────────────────────────
export const translations = {
  ar: {
    // ── Nav / Tabs
    home: 'الرئيسية',
    feed: 'الخلاصة',
    friends: 'الأصدقاء',
    chat: 'المحادثات',
    live: 'البث المباشر',
    settings: 'الإعدادات',
    profile: 'الملف الشخصي',
    notifications: 'الإشعارات',
    search: 'بحث',
    back: 'رجوع',
    close: 'إغلاق',
    cancel: 'إلغاء',
    save: 'حفظ',
    send: 'إرسال',
    done: 'تم',
    loading: 'جارٍ التحميل…',
    error: 'حدث خطأ',
    retry: 'إعادة المحاولة',
    confirm: 'تأكيد',
    delete: 'حذف',
    edit: 'تعديل',
    share: 'مشاركة',
    repost: 'إعادة نشر',
    like: 'إعجاب',
    comment: 'تعليق',
    follow: 'متابعة',
    unfollow: 'إلغاء المتابعة',
    addFriend: 'إضافة صديق',
    removeFriend: 'إزالة صديق',
    block: 'حظر',
    unblock: 'إلغاء الحظر',
    accept: 'قبول',
    reject: 'رفض',
    // ── Auth
    login: 'تسجيل الدخول',
    logout: 'تسجيل الخروج',
    register: 'إنشاء حساب',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    confirmPassword: 'تأكيد كلمة المرور',
    username: 'اسم المستخدم',
    name: 'الاسم',
    forgotPassword: 'نسيت كلمة المرور؟',
    alreadyHaveAccount: 'لديك حساب بالفعل؟',
    dontHaveAccount: 'ليس لديك حساب؟',
    // ── Posts
    newPost: 'منشور جديد',
    writePost: 'اكتب شيئاً…',
    post: 'نشر',
    posting: 'جارٍ النشر…',
    deletePost: 'حذف المنشور',
    deletePostConfirm: 'هل أنت متأكد من حذف هذا المنشور؟',
    noPostsYet: 'لا توجد منشورات بعد',
    viewPost: 'عرض المنشور',
    addCaption: 'أضف تعليقاً…',
    // ── Comments
    comments: 'التعليقات',
    addComment: 'أضف تعليقاً…',
    noComments: 'لا توجد تعليقات بعد',
    reply: 'رد',
    replies: 'الردود',
    // ── Stories
    stories: 'القصص',
    addStory: 'إضافة قصة',
    viewStory: 'عرض القصة',
    storyExpired: 'انتهت صلاحية هذه القصة',
    // ── Chat
    messages: 'الرسائل',
    newMessage: 'رسالة جديدة',
    typeMessage: 'اكتب رسالة…',
    noMessages: 'لا توجد رسائل بعد',
    online: 'متصل',
    offline: 'غير متصل',
    typing: 'يكتب…',
    voiceMessage: 'رسالة صوتية',
    groupChat: 'مجموعة',
    // ── Calls
    call: 'مكالمة',
    videoCall: 'مكالمة فيديو',
    voiceCall: 'مكالمة صوتية',
    incomingCall: 'مكالمة واردة',
    missedCall: 'مكالمة فائتة',
    callEnded: 'انتهت المكالمة',
    accept_call: 'قبول',
    decline: 'رفض',
    // ── Live
    liveRooms: 'الغرف المباشرة',
    createRoom: 'إنشاء غرفة',
    joinRoom: 'الانضمام',
    leaveRoom: 'مغادرة',
    host: 'المضيف',
    speaker: 'متحدث',
    listener: 'مستمع',
    raiseHand: 'رفع اليد',
    mute: 'كتم',
    unmute: 'إلغاء الكتم',
    kick: 'طرد',
    endRoom: 'إنهاء الغرفة',
    noLiveRooms: 'لا توجد غرف مباشرة الآن',
    // ── Settings
    account: 'الحساب',
    liveSettings: 'إعدادات البث',
    language: 'اللغة',
    arabic: 'العربية',
    english: 'الإنجليزية',
    theme: 'المظهر',
    dark: 'داكن',
    light: 'فاتح',
    privacy: 'الخصوصية',
    privateAccount: 'حساب خاص',
    publicAccount: 'حساب عام',
    changePassword: 'تغيير كلمة المرور',
    deleteAccount: 'حذف الحساب',
    notifications_settings: 'إعدادات الإشعارات',
    support: 'الدعم',
    userControls: 'تحكم المستخدمين',
    // ── Profile
    posts: 'المنشورات',
    media: 'الوسائط',
    likes: 'الإعجابات',
    reposts: 'إعادة النشر',
    followers: 'المتابعون',
    following: 'يتابع',
    bio: 'النبذة',
    editProfile: 'تعديل الملف الشخصي',
    // ── Friends
    friendRequests: 'طلبات الصداقة',
    pendingRequests: 'الطلبات المعلقة',
    noFriends: 'لا يوجد أصدقاء بعد',
    // ── Errors / Empty states
    noResults: 'لا توجد نتائج',
    somethingWentWrong: 'حدث خطأ ما',
    tryAgain: 'حاول مجدداً',
    networkError: 'خطأ في الاتصال',
    // ── Share sheet
    shareWithFriends: 'إرسال المنشور إلى الأصدقاء',
    chooseFriends: 'اختر الأصدقاء لإرسال المنشور إليهم في محادثة خاصة.',
    noFriendsToShare: 'أضف أصدقاء أولاً لمشاركة المنشورات معهم',
    sending: 'جارٍ الإرسال…',
    // ── Repost banner
    repostedBy: 'أعاد النشر',
    // ── Misc
    viewProfile: 'عرض الملف الشخصي',
    copyLink: 'نسخ الرابط',
    report: 'إبلاغ',
    moreOptions: 'المزيد',
    favorites: 'المفضلة',
    download: 'تنزيل',
    record: 'تسجيل',
    stopRecording: 'إيقاف التسجيل',
    publish: 'نشر',
    draft: 'مسودة',
    hashtags: 'الهاشتاقات',
  },

  en: {
    // ── Nav / Tabs
    home: 'Home',
    feed: 'Feed',
    friends: 'Friends',
    chat: 'Chats',
    live: 'Live',
    settings: 'Settings',
    profile: 'Profile',
    notifications: 'Notifications',
    search: 'Search',
    back: 'Back',
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    send: 'Send',
    done: 'Done',
    loading: 'Loading…',
    error: 'An error occurred',
    retry: 'Retry',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    share: 'Share',
    repost: 'Repost',
    like: 'Like',
    comment: 'Comment',
    follow: 'Follow',
    unfollow: 'Unfollow',
    addFriend: 'Add Friend',
    removeFriend: 'Remove Friend',
    block: 'Block',
    unblock: 'Unblock',
    accept: 'Accept',
    reject: 'Reject',
    // ── Auth
    login: 'Sign In',
    logout: 'Sign Out',
    register: 'Create Account',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    username: 'Username',
    name: 'Name',
    forgotPassword: 'Forgot password?',
    alreadyHaveAccount: 'Already have an account?',
    dontHaveAccount: "Don't have an account?",
    // ── Posts
    newPost: 'New Post',
    writePost: 'Write something…',
    post: 'Post',
    posting: 'Posting…',
    deletePost: 'Delete Post',
    deletePostConfirm: 'Are you sure you want to delete this post?',
    noPostsYet: 'No posts yet',
    viewPost: 'View Post',
    addCaption: 'Add a caption…',
    // ── Comments
    comments: 'Comments',
    addComment: 'Add a comment…',
    noComments: 'No comments yet',
    reply: 'Reply',
    replies: 'Replies',
    // ── Stories
    stories: 'Stories',
    addStory: 'Add Story',
    viewStory: 'View Story',
    storyExpired: 'This story has expired',
    // ── Chat
    messages: 'Messages',
    newMessage: 'New Message',
    typeMessage: 'Type a message…',
    noMessages: 'No messages yet',
    online: 'Online',
    offline: 'Offline',
    typing: 'Typing…',
    voiceMessage: 'Voice Message',
    groupChat: 'Group',
    // ── Calls
    call: 'Call',
    videoCall: 'Video Call',
    voiceCall: 'Voice Call',
    incomingCall: 'Incoming Call',
    missedCall: 'Missed Call',
    callEnded: 'Call Ended',
    accept_call: 'Accept',
    decline: 'Decline',
    // ── Live
    liveRooms: 'Live Rooms',
    createRoom: 'Create Room',
    joinRoom: 'Join',
    leaveRoom: 'Leave',
    host: 'Host',
    speaker: 'Speaker',
    listener: 'Listener',
    raiseHand: 'Raise Hand',
    mute: 'Mute',
    unmute: 'Unmute',
    kick: 'Kick',
    endRoom: 'End Room',
    noLiveRooms: 'No live rooms right now',
    // ── Settings
    account: 'Account',
    liveSettings: 'Live Settings',
    language: 'Language',
    arabic: 'Arabic',
    english: 'English',
    theme: 'Theme',
    dark: 'Dark',
    light: 'Light',
    privacy: 'Privacy',
    privateAccount: 'Private Account',
    publicAccount: 'Public Account',
    changePassword: 'Change Password',
    deleteAccount: 'Delete Account',
    notifications_settings: 'Notification Settings',
    support: 'Support',
    userControls: 'User Controls',
    // ── Profile
    posts: 'Posts',
    media: 'Media',
    likes: 'Likes',
    reposts: 'Reposts',
    followers: 'Followers',
    following: 'Following',
    bio: 'Bio',
    editProfile: 'Edit Profile',
    // ── Friends
    friendRequests: 'Friend Requests',
    pendingRequests: 'Pending Requests',
    noFriends: 'No friends yet',
    // ── Errors / Empty states
    noResults: 'No results',
    somethingWentWrong: 'Something went wrong',
    tryAgain: 'Try again',
    networkError: 'Network error',
    // ── Share sheet
    shareWithFriends: 'Send Post to Friends',
    chooseFriends: 'Choose friends to send this post to in a private chat.',
    noFriendsToShare: 'Add friends first to share posts with them',
    sending: 'Sending…',
    // ── Repost banner
    repostedBy: 'Reposted by',
    // ── Misc
    viewProfile: 'View Profile',
    copyLink: 'Copy Link',
    report: 'Report',
    moreOptions: 'More',
    favorites: 'Favorites',
    download: 'Download',
    record: 'Record',
    stopRecording: 'Stop Recording',
    publish: 'Publish',
    draft: 'Draft',
    hashtags: 'Hashtags',
  },
} as const;

export type TKey = keyof typeof translations.ar;

// ─── Context ─────────────────────────────────────────────────────────────────
interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey) => string;
  isRTL: boolean;
}

const I18nContext = createContext<I18nCtx>({
  lang: 'ar',
  setLang: () => {},
  t: (k) => translations.ar[k],
  isRTL: true,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'ar' || stored === 'en') return stored;
    } catch {}
    return 'ar';
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  };

  const isRTL = lang === 'ar';

  // Apply dir + lang to document
  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, isRTL]);

  const t = (key: TKey): string => translations[lang][key] ?? translations.ar[key] ?? key;

  return (
    <I18nContext.Provider value={{ lang, setLang, t, isRTL }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useLang() {
  return useContext(I18nContext);
}

export function useT() {
  return useContext(I18nContext).t;
}
