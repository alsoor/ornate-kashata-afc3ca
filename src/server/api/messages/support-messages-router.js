/**
 * Stooorna — Support messages API (Express)
 *
 * يضيف للسيرفر المسارات التي يحتاجها شات الدعم:
 *   POST   /api/support/messages        مستخدم → تذكرة للدعم | حساب الدعم + toUserId → رد للمستخدم
 *   GET    /api/support/messages?role=user      المستخدم يقرأ ردود الدعم الموجّهة له
 *   GET    /api/support/messages?with=<userId>  الدعم يقرأ محادثة مستخدم
 *   GET    /api/support/inbox            الدعم: قائمة المستخدمين (آخر رسالة + غير مقروء)
 *   DELETE /api/support/thread?userId=   الدعم: حذف محادثة
 *   POST   /api/support/complete         (احتياطي)
 *
 * التركيب في السيرفر (قبل أي مسارات /api/support أخرى):
 *   app.use(express.json({ limit: '2mb' }));
 *   app.use('/api/support', require('./support-messages-router'));
 *
 * ⚠️ عدّل getCurrentUser() ليرجع المستخدم المسجّل دخوله حسب نظام الجلسات عندك.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const OWNER_EMAIL = 'stooorna@mail.com';
const OWNER_USERNAME = 'stooorna';
const TOMB = '[[support-thread-deleted]]';
const FILE = path.join(__dirname, 'data', 'support-messages.json');

// ───────── عدّل هذه الدالة فقط ─────────
function getCurrentUser(req) {
  const u = req.user || (req.session && req.session.user) || null;
  if (u) return u;
  if (req.session && req.session.userId) return { id: String(req.session.userId) };
  return null; // غير مسجّل
}
// ───────────────────────────────────────

function isOwner(u) {
  if (!u) return false;
  return String(u.email || '').toLowerCase() === OWNER_EMAIL ||
         String(u.username || '').replace(/^@/, '').toLowerCase() === OWNER_USERNAME;
}

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { messages: [] }; }
}
function save(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db));
}
const uid = () => `sm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const router = express.Router();

function requireUser(req, res, next) {
  const me = getCurrentUser(req);
  if (!me || !me.id) return res.status(401).json({ error: 'unauthorized' });
  req.me = me;
  next();
}
function requireOwner(req, res, next) {
  if (!isOwner(req.me)) return res.status(403).json({ error: 'forbidden' });
  next();
}

// إرسال: تذكرة من مستخدم، أو رد من الدعم
router.post('/messages', requireUser, (req, res) => {
  const b = req.body || {};
  const text = String(b.text || b.content || '').slice(0, 4000);
  const mediaUrl = b.mediaUrl || undefined;
  const mediaType = b.mediaType || undefined;
  if (!text && !mediaUrl) return res.status(400).json({ error: 'empty' });

  const db = load();
  const me = req.me;

  if (isOwner(me)) {
    const target = String(b.toUserId || b.recipientId || '');
    if (!target) return res.status(400).json({ error: 'toUserId required' });
    // حذف المحادثة (tombstone من الواجهة)
    if (b.deleted || text.includes(TOMB)) {
      db.messages = db.messages.filter(m => m.threadUserId !== target);
      save(db);
      return res.json({ ok: true, deleted: true });
    }
    const msg = { id: uid(), threadUserId: target, from: 'support', text, mediaUrl, mediaType, at: Date.now() };
    db.messages.push(msg);
    save(db);
    return res.status(201).json({ ok: true, message: { ...msg, toUserId: target } });
  }

  // مستخدم عادي → تذكرة (دائماً ضمن محادثته هو، مهما أرسل في الجسم)
  const msg = {
    id: uid(),
    threadUserId: String(me.id),
    from: 'user',
    text, mediaUrl, mediaType,
    at: Date.now(),
    fromUsername: String(b.fromUsername || me.username || '').replace(/^@/, '') || null,
    fromName: b.fromName || me.name || null,
    fromEmail: b.fromEmail || me.email || null,
    avatarUrl: me.avatarUrl || null,
    readBySupport: false,
  };
  db.messages.push(msg);
  save(db);
  res.status(201).json({ ok: true, message: msg });
});

// قراءة
router.get('/messages', requireUser, (req, res) => {
  const db = load();
  const me = req.me;
  const withId = req.query.with ? String(req.query.with) : '';

  if (isOwner(me) && withId) {
    const list = db.messages.filter(m => m.threadUserId === withId).sort((a, b) => a.at - b.at);
    let changed = false;
    for (const m of list) if (m.from === 'user' && !m.readBySupport) { m.readBySupport = true; changed = true; }
    if (changed) save(db);
    return res.json(list.map(m => ({
      id: m.id, text: m.text, mediaUrl: m.mediaUrl, mediaType: m.mediaType, at: m.at,
      from: m.from, fromUserId: m.from === 'user' ? m.threadUserId : undefined,
      toUserId: m.from === 'support' ? m.threadUserId : undefined,
    })));
  }

  // المستخدم: ردود الدعم الموجّهة له فقط
  const replies = db.messages
    .filter(m => m.threadUserId === String(me.id) && m.from === 'support')
    .sort((a, b) => a.at - b.at)
    .map(m => ({ id: m.id, text: m.text, mediaUrl: m.mediaUrl, mediaType: m.mediaType, at: m.at, from: 'support', toUserId: m.threadUserId }));
  res.json(replies);
});

// صندوق الدعم
router.get('/inbox', requireUser, requireOwner, (req, res) => {
  const db = load();
  const byUser = new Map();
  for (const m of db.messages) {
    let c = byUser.get(m.threadUserId);
    if (!c) { c = { id: m.threadUserId, name: null, username: null, email: null, avatarUrl: null, unread: 0, lastMessage: '', lastAt: 0 }; byUser.set(m.threadUserId, c); }
    if (m.from === 'user') {
      c.name = m.fromName || c.name; c.username = m.fromUsername || c.username;
      c.email = m.fromEmail || c.email; c.avatarUrl = m.avatarUrl || c.avatarUrl;
      if (!m.readBySupport) c.unread += 1;
    }
    if (m.at >= c.lastAt) { c.lastAt = m.at; c.lastMessage = m.text; }
  }
  const conversations = Array.from(byUser.values()).sort((a, b) => b.lastAt - a.lastAt);
  res.json({ conversations });
});

router.delete('/thread', requireUser, requireOwner, (req, res) => {
  const userId = String(req.query.userId || (req.body && req.body.userId) || '');
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const db = load();
  db.messages = db.messages.filter(m => m.threadUserId !== userId);
  save(db);
  res.json({ ok: true });
});

router.post('/complete', requireUser, (_req, res) => res.json({ ok: true }));

module.exports = router;
