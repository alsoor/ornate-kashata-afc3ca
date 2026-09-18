import { mysqlTable, varchar, boolean, text, timestamp, int, mysqlEnum, primaryKey, customType, float } from 'drizzle-orm/mysql-core';

// Custom MEDIUMBLOB type for audio data (up to 16MB per chunk)
const mediumblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return 'MEDIUMBLOB'; },
});

// BetterAuth tables
export const user = mysqlTable('user', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  username: varchar('username', { length: 50 }).unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('email_verified').default(false),
  image: text('image'),
  avatarUrl: text('avatar_url'),
  coverUrl: text('cover_url'),
  phoneNumber: varchar('phone_number', { length: 30 }),
  isAdmin: boolean('is_admin').default(false),
  isBanned: boolean('is_banned').default(false),
  lastIp: varchar('last_ip', { length: 45 }),
  isRoomAdmin: boolean('is_room_admin').default(false),
  nameColor: varchar('name_color', { length: 20 }),
  lastSeenAt: timestamp('last_seen_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const session = mysqlTable('session', {
  id: varchar('id', { length: 36 }).primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const account = mysqlTable('account', {
  id: varchar('id', { length: 36 }).primaryKey(),
  accountId: varchar('account_id', { length: 255 }).notNull(),
  providerId: varchar('provider_id', { length: 255 }).notNull(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: varchar('password', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const verification = mysqlTable('verification', {
  id: varchar('id', { length: 36 }).primaryKey(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// Friends table
export const friends = mysqlTable('friends', {
  id: int('id').primaryKey().autoincrement(),
  requesterId: varchar('requester_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  addresseeId: varchar('addressee_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  status: mysqlEnum('status', ['pending', 'accepted', 'rejected']).notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// App tables
export const recordings = mysqlTable('recordings', {
  id: int('id').primaryKey().autoincrement(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  duration: int('duration').notNull().default(0),
  mode: varchar('mode', { length: 20 }).notNull().default('public'),
  fileUrl: text('file_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// Direct messages between users
export const messages = mysqlTable('messages', {
  id: int('id').primaryKey().autoincrement(),
  senderId: varchar('sender_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  receiverId: varchar('receiver_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  type: mysqlEnum('type', ['text', 'voice', 'image', 'video', 'file']).notNull().default('text'),
  body: text('body'),
  duration: int('duration'),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Group chats
export const groups = mysqlTable('groups', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 100 }).notNull(),
  avatarUrl: text('avatar_url'),
  createdBy: varchar('created_by', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const groupMembers = mysqlTable('group_members', {
  id: int('id').primaryKey().autoincrement(),
  groupId: int('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at').defaultNow(),
});

export const groupMessages = mysqlTable('group_messages', {
  id: int('id').primaryKey().autoincrement(),
  groupId: int('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  senderId: varchar('sender_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  type: mysqlEnum('type', ['text', 'voice', 'image', 'video', 'file']).notNull().default('text'),
  body: text('body'),
  duration: int('duration'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Owner-only: highlight specific users in red (visible only to the owner)
export const ownerHighlights = mysqlTable('owner_highlights', {
  targetUserId: varchar('target_user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.targetUserId] }),
}));

// User privacy settings
export const userPrivacy = mysqlTable('user_privacy', {
  userId: varchar('user_id', { length: 36 }).primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  showLastSeen: boolean('show_last_seen').default(true),
  whoCanContact: mysqlEnum('who_can_contact', ['everyone', 'friends', 'nobody']).default('everyone'),
  whoCanCall: mysqlEnum('who_can_call', ['everyone', 'friends', 'nobody']).default('everyone'),
  isPrivate: boolean('is_private').default(false),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// User blocks
export const userBlocks = mysqlTable('user_blocks', {
  blockerId: varchar('blocker_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  blockedId: varchar('blocked_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.blockerId, t.blockedId] }),
}));

// Owner-only: custom names for voice rooms (ch1–ch8)
export const roomNames = mysqlTable('room_names', {
  roomId: varchar('room_id', { length: 10 }).primaryKey(), // 'ch1' … 'ch8'
  name:   varchar('name',   { length: 40 }).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// Owner-only: PIN lock for voice rooms (ch1–ch8)
export const roomPins = mysqlTable('room_pins', {
  roomId:    varchar('room_id',    { length: 10 }).primaryKey(), // 'ch1' … 'ch8'
  pinHash:   varchar('pin_hash',   { length: 255 }).notNull(),   // bcryptjs hash of 8-digit PIN
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// Tracks last-read message per user per group (for unread group badge)
export const groupMessageReads = mysqlTable('group_message_reads', {
  userId:        varchar('user_id',         { length: 36 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  groupId:       int('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  lastReadMsgId: int('last_read_msg_id').notNull().default(0),
  updatedAt:     timestamp('updated_at').defaultNow().onUpdateNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.groupId] }),
}));

// User bio (extended profile)
export const userBio = mysqlTable('user_bio', {
  userId: varchar('user_id', { length: 36 }).primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  bio: varchar('bio', { length: 160 }),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ── Persistent signal/audio stores ──────────────────────────────────────────

// Audio chunks for HTTP-based streaming (voice rooms + PTT calls)
// TTL: 2 minutes — cleaned up by periodic job
export const audioChunks = mysqlTable('audio_chunks', {
  id:        int('id').autoincrement().primaryKey(),
  channelId: varchar('channel_id', { length: 80 }).notNull(),  // e.g. 'call-abc' or 'room-ch1'
  senderId:  varchar('sender_id',  { length: 36 }).notNull(),
  seq:       int('seq').notNull(),
  data:      mediumblob('data').notNull(),                      // raw WebM/Opus bytes
  mimeType:  varchar('mime_type',  { length: 60 }).notNull().default('audio/webm;codecs=opus'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Call signals: incoming / accepted / rejected / ended
// TTL: 60 seconds — cleaned up by periodic job
export const callSignals = mysqlTable('call_signals', {
  id:         int('id').autoincrement().primaryKey(),
  toUserId:   varchar('to_user_id',  { length: 36 }).notNull(),
  fromUserId: varchar('from_user_id',{ length: 36 }).notNull(),
  callId:     varchar('call_id',     { length: 80 }).notNull(),
  action:     varchar('action',      { length: 20 }).notNull(), // incoming|accepted|rejected|ended
  mode:       varchar('mode',        { length: 20 }),
  callerName: varchar('caller_name', { length: 80 }),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
});

// WebRTC signaling messages (offer/answer/ice)
// TTL: 2 minutes — cleaned up by periodic job
export const rtcSignals = mysqlTable('rtc_signals', {
  id:        int('id').autoincrement().primaryKey(),
  callId:    varchar('call_id',   { length: 80 }).notNull(),
  toUserId:  varchar('to_user_id',{ length: 36 }).notNull(),
  fromUserId:varchar('from_user_id',{length: 36}).notNull(),
  type:      varchar('type',      { length: 30 }).notNull(),  // offer|answer|ice-candidate
  payload:   text('payload').notNull(),                        // JSON-serialised data
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Whisper notifications (pending alerts for target user)
// TTL: 60 seconds — consumed on first read
export const whisperNotifications = mysqlTable('whisper_notifications', {
  id:         int('id').autoincrement().primaryKey(),
  toUserId:   varchar('to_user_id',  { length: 36 }).notNull(),
  fromUserId: varchar('from_user_id',{ length: 36 }).notNull(),
  fromName:   varchar('from_name',   { length: 80 }).notNull(),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
});

// Status stories (photo/video — like WhatsApp/Snapchat)
// duration  = viewer playback time (image=30s, video=60s) — display only, NOT the TTL
// expiresAt = 24 hours after upload — when the status disappears for everyone & is deleted by cleanup job
export const statuses = mysqlTable('statuses', {
  id:          int('id').autoincrement().primaryKey(),
  userId:      varchar('user_id',   { length: 36 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  mediaUrl:    text('media_url').notNull(),
  mediaType:   mysqlEnum('media_type', ['image', 'video']).notNull(),
  duration:    int('duration').notNull(),   // viewer playback seconds (30 or 60)
  expiresAt:   timestamp('expires_at').notNull(),  // 24h from upload — hard delete threshold
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  audioUrl:    text('audio_url'),           // optional background music URL
  overlayText: text('overlay_text'),        // optional text drawn over the story
  overlayColor: varchar('overlay_color', { length: 20 }), // text colour hex
  overlayX:    float('overlay_x'),           // text position X (0–1 fraction)
  overlayY:    float('overlay_y'),           // text position Y (0–1 fraction)
  musicBadgeX:     float('music_badge_x'),       // music badge position X (0–1)
  musicBadgeY:     float('music_badge_y'),        // music badge position Y (0–1)
  musicBadgeScale: float('music_badge_scale'),    // music badge scale factor
});

// Status views — who has seen a status
export const statusViews = mysqlTable('status_views', {
  id:       int('id').autoincrement().primaryKey(),
  statusId: int('status_id').notNull().references(() => statuses.id, { onDelete: 'cascade' }),
  viewerId: varchar('viewer_id', { length: 36 }).notNull(),
  viewedAt: timestamp('viewed_at').defaultNow().notNull(),
});



// Comments left on photo/video stories. Read state is tracked per story owner.
export const statusComments = mysqlTable('status_comments', {
  id: int('id').autoincrement().primaryKey(),
  statusId: int('status_id').notNull().references(() => statuses.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  parentCommentId: int('parent_comment_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const statusCommentReads = mysqlTable('status_comment_reads', {
  statusId: int('status_id').notNull().references(() => statuses.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  readAt: timestamp('read_at').defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.statusId, t.userId] }),
}));
// Push subscriptions — Web Push API
export const pushSubscriptions = mysqlTable('push_subscriptions', {
  id:        int('id').autoincrement().primaryKey(),
  userId:    varchar('user_id', { length: 255 }).notNull(),
  endpoint:  text('endpoint').notNull(),
  p256dh:    text('p256dh').notNull(),
  auth:      text('auth').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// FCM Tokens for native Android/iOS
export const fcmTokens = mysqlTable('fcm_tokens', {
  id:         int('id').autoincrement().primaryKey(),
  userId:     varchar('user_id', { length: 255 }).notNull(),
  token:      varchar('token', { length: 512 }).notNull().unique(),
  deviceType: mysqlEnum('device_type', ['android', 'ios']).notNull(),
  createdAt:  timestamp('created_at').defaultNow(),
  updatedAt:  timestamp('updated_at').defaultNow().onUpdateNow(),
});

// In-app notifications
export const inAppNotifications = mysqlTable('in_app_notifications', {
  id:        int('id').autoincrement().primaryKey(),
  userId:    varchar('user_id', { length: 255 }).notNull(),
  type:      varchar('type', { length: 50 }).notNull(),
  title:     varchar('title', { length: 255 }).notNull(),
  body:      text('body').notNull(),
  icon:      varchar('icon', { length: 512 }),
  url:       varchar('url', { length: 512 }),
  isRead:    boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});


// Live sessions — friend-only live video/audio streams
export const liveSessions = mysqlTable('live_sessions', {
  id:        int('id').autoincrement().primaryKey(),
  hostId:    varchar('host_id', { length: 36 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  secretChatId: int('secret_chat_id').references(() => secretChats.id, { onDelete: 'cascade' }),
  title:     varchar('title', { length: 200 }),
  channel:   varchar('channel', { length: 64 }).notNull().default(''),   // Agora channel name — lets a viewer actually join
  type:      varchar('type', { length: 16 }).notNull().default('camera'), // 'camera' | 'audio'
  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt:   timestamp('ended_at'),
  videoUrl:  text('video_url'),          // path to saved MP4 recording
  duration:  int('duration'),            // seconds
  fileSize:  int('file_size'),           // bytes
});

// Secret Chats
export const secretChats = mysqlTable('secret_chats', {
  id:        int('id').autoincrement().primaryKey(),
  name:      varchar('name', { length: 80 }).notNull(),
  pinHash:   varchar('pin_hash', { length: 255 }).notNull(),
  createdBy: varchar('created_by', { length: 36 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const secretChatMembers = mysqlTable('secret_chat_members', {
  id:       int('id').autoincrement().primaryKey(),
  chatId:   int('chat_id').notNull().references(() => secretChats.id, { onDelete: 'cascade' }),
  userId:   varchar('user_id', { length: 36 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at').defaultNow(),
});

export const secretChatMessages = mysqlTable('secret_chat_messages', {
  id:        int('id').autoincrement().primaryKey(),
  chatId:    int('chat_id').notNull().references(() => secretChats.id, { onDelete: 'cascade' }),
  senderId:  varchar('sender_id', { length: 36 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  body:      text('body'),
  isSystem:  boolean('is_system').notNull().default(false),
  type:      varchar('type', { length: 20 }).notNull().default('text'),
  duration:  int('duration'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Profile-visit presence ───────────────────────────────────────────────────
// Tracks who currently has a user's story-profile page open (heartbeat every ~4s
// from the viewer while the profile/modal stays open). One row per (owner, viewer)
// pair — refreshed on every heartbeat, deleted on leave.
// TTL: ~12 seconds of staleness — filtered out at read time by the /visitors
// endpoint, and should also be cleaned up by the same periodic job as the other
// TTL tables above (audioChunks, callSignals, rtcSignals) so old rows don't pile up.
export const profileVisits = mysqlTable('profile_visits', {
  ownerId:         varchar('owner_id', { length: 36 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  viewerId:        varchar('viewer_id', { length: 36 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  viewerName:      varchar('viewer_name', { length: 255 }),
  viewerUsername:  varchar('viewer_username', { length: 50 }),
  viewerAvatarUrl: text('viewer_avatar_url'),
  lastSeenAt:      timestamp('last_seen_at').defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.ownerId, t.viewerId] }),
}));