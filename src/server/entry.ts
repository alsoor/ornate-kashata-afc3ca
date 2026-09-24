import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { readFileSync } from "node:fs";
// Static import so the SSR bundler doesn't see a mixed static/dynamic
// import of this module (it's imported statically elsewhere, e.g. in
// api/room/join/POST.ts). closeConnection is optional at runtime, so the
// call site below still guards with a typeof check instead of relying on
// import() rejecting when the export is missing.
import * as dbClientModule from "./db/client.js";

// <api-imports>
import auth_action_get_0 from "./api/auth/[action]/GET";
import auth_action_post_1 from "./api/auth/[action]/POST";
import auth_action_detail_get_2 from "./api/auth/[action]/[detail]/GET";
import auth_action_detail_post_3 from "./api/auth/[action]/[detail]/POST";
import call_token_get_4 from "./api/call/token/GET";
import friends_get_5 from "./api/friends/GET";
import friends_post_6 from "./api/friends/POST";
import friends_requests_count_get_7 from "./api/friends/requests/count/GET";
import friends_id_delete_8 from "./api/friends/[id]/DELETE";
import friends_id_patch_9 from "./api/friends/[id]/PATCH";
import groups_get_10 from "./api/groups/GET";
import groups_post_11 from "./api/groups/POST";
import groups_unread_get_12 from "./api/groups/unread/GET";
import groups_unread_post_13 from "./api/groups/unread/POST";
import groups_id_get_14 from "./api/groups/[id]/GET";
import groups_id_patch_15 from "./api/groups/[id]/PATCH";
import groups_id_avatar_post_16 from "./api/groups/[id]/avatar/POST";
import groups_id_leave_delete_17 from "./api/groups/[id]/leave/DELETE";
import groups_id_members_get_18 from "./api/groups/[id]/members/GET";
import groups_id_members_post_19 from "./api/groups/[id]/members/POST";
import groups_id_members_userId_delete_20 from "./api/groups/[id]/members/[userId]/DELETE";
import groups_id_messages_get_21 from "./api/groups/[id]/messages/GET";
import groups_id_messages_post_22 from "./api/groups/[id]/messages/POST";
import groups_id_messages_clear_delete_23 from "./api/groups/[id]/messages/clear/DELETE";
import groups_id_messages_image_post_24 from "./api/groups/[id]/messages/image/POST";
import groups_id_messages_voice_post_25 from "./api/groups/[id]/messages/voice/POST";
import groups_id_messages_msgId_delete_26 from "./api/groups/[id]/messages/[msgId]/DELETE";
import health_get_27 from "./api/health/GET";
import highlights_get_28 from "./api/highlights/GET";
import live_delete_29 from "./api/live/DELETE";
import live_get_30 from "./api/live/GET";
import live_post_31 from "./api/live/POST";
import live_recordings_get_32 from "./api/live/recordings/GET";
import live_recordings_upload_post_33 from "./api/live/recordings/upload/POST";
import live_recordings_id_delete_34 from "./api/live/recordings/[id]/DELETE";
import live_status_get_35 from "./api/live/status/GET";
import me_ban_status_get_36 from "./api/me/ban-status/GET";
import me_update_ip_post_37 from "./api/me/update-ip/POST";
import messages_get_38 from "./api/messages/GET";
import messages_post_39 from "./api/messages/POST";
import messages_clear_delete_40 from "./api/messages/clear/DELETE";
import messages_file_post_41 from "./api/messages/file/POST";
import messages_image_post_42 from "./api/messages/image/POST";
import messages_mark_all_read_post_43 from "./api/messages/mark-all-read/POST";
import messages_unread_get_44 from "./api/messages/unread/GET";
import messages_voice_post_45 from "./api/messages/voice/POST";
import messages_id_delete_46 from "./api/messages/[id]/DELETE";
import messages_id_open_streak_post_47 from "./api/messages/[id]/open-streak/POST";
import notifications_delete_48 from "./api/notifications/DELETE";
import notifications_get_49 from "./api/notifications/GET";
import notifications_read_post_50 from "./api/notifications/read/POST";
import notify_new_post_post_51 from "./api/notify/new-post/POST";
import notify_whisper_get_52 from "./api/notify/whisper/GET";
import notify_whisper_post_53 from "./api/notify/whisper/POST";
import og_image_get_54 from "./api/og-image/GET";
import owner_highlights_get_55 from "./api/owner/highlights/GET";
import owner_highlights_post_56 from "./api/owner/highlights/POST";
import owner_live_pin_delete_57 from "./api/owner/live-pin/DELETE";
import owner_live_pin_get_58 from "./api/owner/live-pin/GET";
import owner_live_pin_post_59 from "./api/owner/live-pin/POST";
import owner_live_pin_verify_post_60 from "./api/owner/live-pin/verify/POST";
import owner_secret_room_joins_get_61 from "./api/owner/secret-room-joins/GET";
import owner_secret_room_joins_post_62 from "./api/owner/secret-room-joins/POST";
import owner_secret_room_joins_count_get_63 from "./api/owner/secret-room-joins/count/GET";
import owner_stats_get_64 from "./api/owner/stats/GET";
import owner_users_get_65 from "./api/owner/users/GET";
import owner_users_id_patch_66 from "./api/owner/users/[id]/PATCH";
import posts_get_67 from "./api/posts/GET";
import posts_post_68 from "./api/posts/POST";
import posts_comment_unread_get_69 from "./api/posts/comment-unread/GET";
import posts_comment_unread_post_70 from "./api/posts/comment-unread/POST";
import posts_comments_received_get_71 from "./api/posts/comments/received/GET";
import posts_hashtags_get_72 from "./api/posts/hashtags/GET";
import posts_interactions_received_get_73 from "./api/posts/interactions/received/GET";
import posts_media_post_74 from "./api/posts/media/POST";
import posts_shared_received_get_75 from "./api/posts/shared/received/GET";
import posts_id_delete_76 from "./api/posts/[id]/DELETE";
import posts_id_get_77 from "./api/posts/[id]/GET";
import posts_id_caption_patch_78 from "./api/posts/[id]/caption/PATCH";
import posts_id_comments_get_79 from "./api/posts/[id]/comments/GET";
import posts_id_comments_post_80 from "./api/posts/[id]/comments/POST";
import posts_id_like_post_81 from "./api/posts/[id]/like/POST";
import posts_id_repost_post_82 from "./api/posts/[id]/repost/POST";
import posts_id_share_post_83 from "./api/posts/[id]/share/POST";
import presence_get_84 from "./api/presence/GET";
import presence_heartbeat_post_85 from "./api/presence/heartbeat/POST";
import presence_visitors_post_86 from "./api/presence/visitors/POST";
import push_subscribe_delete_87 from "./api/push/subscribe/DELETE";
import push_subscribe_post_88 from "./api/push/subscribe/POST";
import push_vapid_public_key_get_89 from "./api/push/vapid-public-key/GET";
import recordings_get_90 from "./api/recordings/GET";
import recordings_upload_post_91 from "./api/recordings/upload/POST";
import recordings_id_delete_92 from "./api/recordings/[id]/DELETE";
import room_get_93 from "./api/room/GET";
import room_active_call_get_94 from "./api/room/active-call/GET";
import room_admin_post_95 from "./api/room/admin/POST";
import room_counts_get_96 from "./api/room/counts/GET";
import room_floor_post_97 from "./api/room/floor/POST";
import room_heartbeat_post_98 from "./api/room/heartbeat/POST";
import room_join_post_99 from "./api/room/join/POST";
import room_leave_post_100 from "./api/room/leave/POST";
import room_live_status_get_101 from "./api/room/live-status/GET";
import room_names_get_102 from "./api/room/names/GET";
import room_names_patch_103 from "./api/room/names/PATCH";
import room_pin_get_104 from "./api/room/pin/GET";
import room_pin_post_105 from "./api/room/pin/POST";
import room_pin_verify_post_106 from "./api/room/pin/verify/POST";
import secret_chat_get_107 from "./api/secret-chat/GET";
import secret_chat_post_108 from "./api/secret-chat/POST";
import secret_chat_add_member_post_109 from "./api/secret-chat/add-member/POST";
import secret_chat_delete_post_110 from "./api/secret-chat/delete/POST";
import secret_chat_dm_post_111 from "./api/secret-chat/dm/POST";
import secret_chat_file_post_112 from "./api/secret-chat/file/POST";
import secret_chat_image_post_113 from "./api/secret-chat/image/POST";
import secret_chat_join_post_114 from "./api/secret-chat/join/POST";
import secret_chat_leave_post_115 from "./api/secret-chat/leave/POST";
import secret_chat_mark_read_post_116 from "./api/secret-chat/mark-read/POST";
import secret_chat_message_delete_117 from "./api/secret-chat/message/DELETE";
import secret_chat_messages_get_118 from "./api/secret-chat/messages/GET";
import secret_chat_messages_post_119 from "./api/secret-chat/messages/POST";
import secret_chat_streak_post_120 from "./api/secret-chat/streak/POST";
import secret_chat_streak_open_post_121 from "./api/secret-chat/streak-open/POST";
import secret_chat_streak_pending_get_122 from "./api/secret-chat/streak-pending/GET";
import secret_chat_unread_get_123 from "./api/secret-chat/unread/GET";
import secret_chat_verify_pin_post_124 from "./api/secret-chat/verify-pin/POST";
import secret_chat_voice_post_125 from "./api/secret-chat/voice/POST";
import secret_room_live_status_get_126 from "./api/secret-room/live-status/GET";
import secret_room_members_get_127 from "./api/secret-room/members/GET";
import secret_room_mic_lock_get_128 from "./api/secret-room/mic-lock/GET";
import secret_room_mic_lock_post_129 from "./api/secret-room/mic-lock/POST";
import status_delete_130 from "./api/status/DELETE";
import status_get_131 from "./api/status/GET";
import status_post_132 from "./api/status/POST";
import status_comments_received_get_133 from "./api/status/comments/received/GET";
import status_view_post_134 from "./api/status/view/POST";
import status_id_comments_delete_135 from "./api/status/[id]/comments/DELETE";
import status_id_comments_get_136 from "./api/status/[id]/comments/GET";
import status_id_comments_post_137 from "./api/status/[id]/comments/POST";
import status_id_comments_read_post_138 from "./api/status/[id]/comments/read/POST";
import support_complete_post_139 from "./api/support/complete/POST";
import support_thread_delete_140 from "./api/support/thread/DELETE";
import typing_get_141 from "./api/typing/GET";
import typing_post_142 from "./api/typing/POST";
import users_block_post_143 from "./api/users/block/POST";
import users_blocks_get_144 from "./api/users/blocks/GET";
import users_by_username_get_145 from "./api/users/by-username/GET";
import users_by_username_username_get_146 from "./api/users/by-username/[username]/GET";
import users_check_username_get_147 from "./api/users/check-username/GET";
import users_me_get_148 from "./api/users/me/GET";
import users_me_patch_149 from "./api/users/me/PATCH";
import users_me_avatar_post_150 from "./api/users/me/avatar/POST";
import users_me_bio_get_151 from "./api/users/me/bio/GET";
import users_me_bio_patch_152 from "./api/users/me/bio/PATCH";
import users_me_cover_post_153 from "./api/users/me/cover/POST";
import users_me_email_patch_154 from "./api/users/me/email/PATCH";
import users_me_name_patch_155 from "./api/users/me/name/PATCH";
import users_me_password_patch_156 from "./api/users/me/password/PATCH";
import users_me_phone_patch_157 from "./api/users/me/phone/PATCH";
import users_me_privacy_get_158 from "./api/users/me/privacy/GET";
import users_me_privacy_patch_159 from "./api/users/me/privacy/PATCH";
import users_search_get_160 from "./api/users/search/GET";
import users_id_get_161 from "./api/users/[id]/GET";
import users_id_follow_post_162 from "./api/users/[id]/follow/POST";
import users_id_follow_status_get_163 from "./api/users/[id]/follow-status/GET";
import users_id_posts_get_164 from "./api/users/[id]/posts/GET";
// </api-imports>
import { attachRoomLiveWS } from "./room-live-ws";
import { attachLiveChatWS } from "./live-chat-ws";
import { attachCallSignalingWS } from "./call-signaling-ws";
import { migrateRoomPins } from "./db/migrate-room-pins";
import { addSecretChats } from "./db/migrations/add_secret_chats";
import { migrateSignalTables } from "./db/migrate-signal-tables";
import { migrateCover } from "./db/migrate-cover";
import { addStatuses } from "./db/migrations/add_statuses";
import { addLiveSessions } from "./db/migrations/add_live_sessions";
import { addLiveRecordingCols } from "./db/migrations/add_live_recording_cols";
import { runAddPhoneNumberMigration } from "./db/migrations/add_phone_number";
import { addOwnerLivePin } from "./db/migrations/add_owner_live_pin";
import { addSecretRoomJoins } from "./db/migrations/add_secret_room_joins";
import { addSecretMicLock } from "./db/migrations/add_secret_mic_lock";
import { addSecretChatDm } from "./db/migrations/add_secret_chat_dm";
import { addBanIpRoomAdmin } from "./db/migrations/add_ban_ip_roomadmin";
import { addFileVideoType } from "./db/migrations/add_file_video_type";
import { addPostShareType } from "./db/migrations/add_post_share_type";
import { addUserPrivacyIsPrivate } from "./db/migrations/add_user_privacy_is_private";
import { migratePush } from "./db/migrate-push";
import { addPostsLikesFollows } from "./db/migrations/add_posts_likes_follows";
import { addStreakCols } from "./db/migrations/add_streak_cols";
import { addStreakFields } from "./db/migrations/add_streak_fields";
import { addTextPostSocial } from "./db/migrations/add_text_post_social";
import { startCleanupJob } from "./cleanup-job";
import { seoRoutes } from "../lib/seo-routes";
import {
	loadAdSenseRuntimeConfig,
	resolveAdSenseTextFile,
	type AdSenseRuntimeConfig,
} from "./adsense-manifest";
import { loadIndexNowKey } from "./indexnow-key";
import { isSystemHost } from "./seo-host";
import { llmsTxtHandler } from "./llms-txt";

export interface SsrRenderResult {
	html: string;
	head: string;
	status: number;
	redirect?: string;
}

export function registerAdSenseTextRoutes(app: Express, config: AdSenseRuntimeConfig): void {
	app.get("/ads.txt", (_req, res) => {
		const content = resolveAdSenseTextFile(config, "adsTxt");
		if (content === null) {
			res
				.status(404)
				.type("text/plain")
				.set("Cache-Control", "no-cache")
				.send("Not found\n");
			return;
		}
		res.type("text/plain").set("Cache-Control", "no-cache").send(content);
	});

	app.get("/app-ads.txt", (_req, res) => {
		const content = resolveAdSenseTextFile(config, "appAdsTxt");
		if (content === null) {
			res
				.status(404)
				.type("text/plain")
				.set("Cache-Control", "no-cache")
				.send("Not found\n");
			return;
		}
		res.type("text/plain").set("Cache-Control", "no-cache").send(content);
	});
}

export function renderSsrDocument(
	template: string,
	result: Pick<SsrRenderResult, "head" | "html">,
	adSenseConfig: Pick<AdSenseRuntimeConfig, "scriptHtml">,
): string {
	const head = [result.head, adSenseConfig.scriptHtml].filter(Boolean).join("\n");
	return template
		.replace("<!--app-head-->", () => head)
		.replace("<!--app-html-->", () => result.html);
}

function normalizeCommerceApiBaseUrlEnv() {
	if (process.env.GODADDY_API_BASE_URL) return;
	const hostOnly = process.env.VITE_GODADDY_API_HOST;
	if (!hostOnly) return;
	const normalizedHost = hostOnly.replace(/^https?:\/\//, "").trim();
	if (!normalizedHost) return;
	process.env.GODADDY_API_BASE_URL = `https://${normalizedHost}`;
}

normalizeCommerceApiBaseUrlEnv();

const app = express();

const cors = require('cors');

const allowedOrigins = [
    'https://stooorna.com',
    'https://www.stooorna.com',
    'https://stoooorna.onrender.com',
    'https://4zol715d.up.railway.app',
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

// Honour x-forwarded-* from the load balancer so req.protocol/req.hostname
// reflect the public-facing values. Express-maintained parsing respects the
// existing trust-proxy config; direct header reads would let a client spoof
// the sitemap origin in robots.txt.
app.set("trust proxy", true);

// Raw binary parser for binary upload routes — MUST come before express.json().
// Uses a custom middleware that matches paths with regex so :id params work correctly.
// Location endpoints are intentionally excluded — they send JSON, not binary.
const rawBinary = express.raw({ type: () => true, limit: '50mb' });

const BINARY_ROUTES = [
  /^\/api\/messages\/voice/,
  /^\/api\/messages\/image/,
  /^\/api\/messages\/file/,
  /^\/api\/groups\/[^/]+\/messages\/image/,
  /^\/api\/groups\/[^/]+\/messages\/voice/,
  /^\/api\/secret-chat\/image/,
  /^\/api\/secret-chat\/voice/,
  /^\/api\/secret-chat\/file/,
  /^\/api\/secret-chat\/streak$/,
  /^\/api\/recordings\/upload/,
  /^\/api\/live\/recordings\/upload/,
  /^\/api\/users\/me\/avatar/,
  /^\/api\/users\/me\/cover/,
  /^\/api\/posts\/media$/,
];

app.use((req, res, next) => {
  const path = req.path;
  // /api/status with multipart/form-data must go straight to multer — skip rawBinary.
  // /api/status with a raw image/video Content-Type uses the legacy binary path.
  if (path === '/api/status') {
    const ct = (req.headers['content-type'] ?? '').toLowerCase();
    if (ct.startsWith('multipart/')) return next();
    return rawBinary(req, res, next);
  }
  if (BINARY_ROUTES.some((re) => re.test(path))) {
    return rawBinary(req, res, next);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  '/airo-assets',
  express.static('/shared-storage/public/assets', {
    maxAge: '30d',
    fallthrough: true,
  }),
);

// Serve uploaded media (avatars, posts, covers) — Railway alternative to nginx alias
// Files are written under /shared-storage/public/assets/uploads by API handlers
// and exposed publicly as /airo-assets/uploads/...
app.use(
  '/airo-assets',
  express.static('/shared-storage/public/assets', {
    maxAge: '30d',
    fallthrough: true,
    setHeaders(res) {
      res.set('Cache-Control', 'public, max-age=2592000');
    },
  }),
);

// ── IP tracking: lightweight — stored via /api/me/update-ip ─────────────────

// <api-registrations>
app.get("/api/auth/:action", auth_action_get_0);
app.post("/api/auth/:action", auth_action_post_1);
app.get("/api/auth/:action/:detail", auth_action_detail_get_2);
app.post("/api/auth/:action/:detail", auth_action_detail_post_3);
app.get("/api/call/token", call_token_get_4);
app.get("/api/friends", friends_get_5);
app.post("/api/friends", friends_post_6);
app.get("/api/friends/requests/count", friends_requests_count_get_7);
app.delete("/api/friends/:id", friends_id_delete_8);
app.patch("/api/friends/:id", friends_id_patch_9);
app.get("/api/groups", groups_get_10);
app.post("/api/groups", groups_post_11);
app.get("/api/groups/unread", groups_unread_get_12);
app.post("/api/groups/unread", groups_unread_post_13);
app.get("/api/groups/:id", groups_id_get_14);
app.patch("/api/groups/:id", groups_id_patch_15);
app.post("/api/groups/:id/avatar", groups_id_avatar_post_16);
app.delete("/api/groups/:id/leave", groups_id_leave_delete_17);
app.get("/api/groups/:id/members", groups_id_members_get_18);
app.post("/api/groups/:id/members", groups_id_members_post_19);
app.delete("/api/groups/:id/members/:userId", groups_id_members_userId_delete_20);
app.get("/api/groups/:id/messages", groups_id_messages_get_21);
app.post("/api/groups/:id/messages", groups_id_messages_post_22);
app.delete("/api/groups/:id/messages/clear", groups_id_messages_clear_delete_23);
app.post("/api/groups/:id/messages/image", groups_id_messages_image_post_24);
app.post("/api/groups/:id/messages/voice", groups_id_messages_voice_post_25);
app.delete("/api/groups/:id/messages/:msgId", groups_id_messages_msgId_delete_26);
app.get("/api/health", health_get_27);
app.get("/api/highlights", highlights_get_28);
app.delete("/api/live", live_delete_29);
app.get("/api/live", live_get_30);
app.post("/api/live", live_post_31);
app.get("/api/live/recordings", live_recordings_get_32);
app.post("/api/live/recordings/upload", live_recordings_upload_post_33);
app.delete("/api/live/recordings/:id", live_recordings_id_delete_34);
app.get("/api/live/status", live_status_get_35);
app.get("/api/me/ban-status", me_ban_status_get_36);
app.post("/api/me/update-ip", me_update_ip_post_37);
app.get("/api/messages", messages_get_38);
app.post("/api/messages", messages_post_39);
app.delete("/api/messages/clear", messages_clear_delete_40);
app.post("/api/messages/file", messages_file_post_41);
app.post("/api/messages/image", messages_image_post_42);
app.post("/api/messages/mark-all-read", messages_mark_all_read_post_43);
app.get("/api/messages/unread", messages_unread_get_44);
app.post("/api/messages/voice", messages_voice_post_45);
app.delete("/api/messages/:id", messages_id_delete_46);
app.post("/api/messages/:id/open-streak", messages_id_open_streak_post_47);
app.delete("/api/notifications", notifications_delete_48);
app.get("/api/notifications", notifications_get_49);
app.post("/api/notifications/read", notifications_read_post_50);
app.post("/api/notify/new-post", notify_new_post_post_51);
app.get("/api/notify/whisper", notify_whisper_get_52);
app.post("/api/notify/whisper", notify_whisper_post_53);
app.get("/api/og-image", og_image_get_54);
app.get("/api/owner/highlights", owner_highlights_get_55);
app.post("/api/owner/highlights", owner_highlights_post_56);
app.delete("/api/owner/live-pin", owner_live_pin_delete_57);
app.get("/api/owner/live-pin", owner_live_pin_get_58);
app.post("/api/owner/live-pin", owner_live_pin_post_59);
app.post("/api/owner/live-pin/verify", owner_live_pin_verify_post_60);
app.get("/api/owner/secret-room-joins", owner_secret_room_joins_get_61);
app.post("/api/owner/secret-room-joins", owner_secret_room_joins_post_62);
app.get("/api/owner/secret-room-joins/count", owner_secret_room_joins_count_get_63);
app.get("/api/owner/stats", owner_stats_get_64);
app.get("/api/owner/users", owner_users_get_65);
app.patch("/api/owner/users/:id", owner_users_id_patch_66);
app.get("/api/posts", posts_get_67);
app.post("/api/posts", posts_post_68);
app.get("/api/posts/comment-unread", posts_comment_unread_get_69);
app.post("/api/posts/comment-unread", posts_comment_unread_post_70);
app.get("/api/posts/comments/received", posts_comments_received_get_71);
app.get("/api/posts/hashtags", posts_hashtags_get_72);
app.get("/api/posts/interactions/received", posts_interactions_received_get_73);
app.post("/api/posts/media", posts_media_post_74);
app.get("/api/posts/shared/received", posts_shared_received_get_75);
app.delete("/api/posts/:id", posts_id_delete_76);
app.get("/api/posts/:id", posts_id_get_77);
app.patch("/api/posts/:id/caption", posts_id_caption_patch_78);
app.get("/api/posts/:id/comments", posts_id_comments_get_79);
app.post("/api/posts/:id/comments", posts_id_comments_post_80);
app.post("/api/posts/:id/like", posts_id_like_post_81);
app.post("/api/posts/:id/repost", posts_id_repost_post_82);
app.post("/api/posts/:id/share", posts_id_share_post_83);

// ── Live GPS pin store (inlined — same process / single VPS) ─────────────────
const LIVE_GPS_TTL_MS = 30 * 60 * 1000;
function liveGpsStore(): Map<string, any> {
  const g = globalThis as typeof globalThis & { __stooornaLiveGpsPins?: Map<string, any> };
  if (!g.__stooornaLiveGpsPins) g.__stooornaLiveGpsPins = new Map();
  return g.__stooornaLiveGpsPins;
}
function liveGpsPrune() {
  const now = Date.now();
  const m = liveGpsStore();
  for (const [id, p] of m) {
    if (!p || now - Number(p.at || 0) > LIVE_GPS_TTL_MS) m.delete(id);
  }
}
function upsertLiveGpsPin(pin: { id: string; name?: string; username?: string; avatarUrl?: unknown; lat: number; lng: number }) {
  if (!pin || !pin.id) return;
  const id = String(pin.id);
  liveGpsStore().set(id, {
    id,
    name: String(pin.name || "User"),
    username: String(pin.username || "").replace(/^@/, ""),
    avatarUrl: pin.avatarUrl ?? null,
    lat: Number(pin.lat),
    lng: Number(pin.lng),
    at: Date.now(),
  });
}
function removeLiveGpsPin(userId: string) {
  if (!userId) return;
  liveGpsStore().delete(String(userId));
}
function listLiveGpsPins() {
  liveGpsPrune();
  return Array.from(liveGpsStore().values()).filter(
    (p) => p && typeof p.lat === "number" && typeof p.lng === "number",
  );
}

// Presence: shared in-memory store so all clients see each other online (same Node process / single VPS)
const PRESENCE_TTL_MS = 45_000;
function presenceStore(): Map<string, { at: number; name?: string | null; username?: string | null; typing?: boolean; typingTo?: string | null; typingAt?: number }> {
  const g = globalThis as typeof globalThis & { __stooornaPresence?: Map<string, { at: number; name?: string | null; username?: string | null; typing?: boolean; typingTo?: string | null; typingAt?: number }> };
  if (!g.__stooornaPresence) g.__stooornaPresence = new Map();
  return g.__stooornaPresence;
}
function presencePrune() {
  const now = Date.now();
  const m = presenceStore();
  for (const [id, row] of m) {
    if (!row || now - Number(row.at || 0) > PRESENCE_TTL_MS) m.delete(id);
  }
}
app.get("/api/presence", (req, res) => {
  try {
    presencePrune();
    const raw = String(req.query.ids || req.query.userIds || "");
    const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const m = presenceStore();
    const out: Record<string, { online: boolean; lastSeen?: number }> = {};
    if (ids.length) {
      for (const id of ids) {
        const row = m.get(String(id));
        const online = !!(row && Date.now() - Number(row.at || 0) <= PRESENCE_TTL_MS);
        const typingFresh = !!(row?.typing && row.typingAt && Date.now() - Number(row.typingAt) < 5000);
        out[String(id)] = {
          online,
          lastSeen: row?.at,
          typing: typingFresh,
          typingTo: row?.typingTo ?? null,
        };
      }
    } else {
      for (const [id, row] of m) {
        out[String(id)] = { online: true, lastSeen: row.at };
      }
    }
    // Multiple shapes for client compatibility (hook may read any of these)
    res.json({ ...out, users: out, presence: out });
  } catch (e) {
    res.status(500).json({ error: "presence_get_failed" });
  }
});
app.post("/api/presence/heartbeat", (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const id = String(body.userId || body.id || body.viewerId || "").trim();
    if (!id) {
      res.status(400).json({ error: "userId_required" });
      return;
    }
    presencePrune();
    const typing = body.typing === true || body.typing === 'true';
    presenceStore().set(id, {
      at: Date.now(),
      name: body.name != null ? String(body.name) : null,
      username: body.username != null ? String(body.username) : null,
      typing,
      typingTo: body.typingTo != null ? String(body.typingTo) : null,
      typingAt: typing ? Date.now() : undefined,
    });
    res.json({ ok: true, ttlMs: PRESENCE_TTL_MS });
  } catch (e) {
    res.status(500).json({ error: "presence_heartbeat_failed" });
  }
});
app.post("/api/presence/visitors", presence_visitors_post_86);

// Live GPS pins — shared across requests (same Node process / single VPS)
app.get("/api/live-gps", (_req, res) => {
  try {
    const pins = listLiveGpsPins();
    res.json({ pins });
  } catch (e) {
    res.status(500).json({ pins: [], error: "live_gps_get_failed" });
  }
});
app.post("/api/live-gps", (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    if (body.clear === true || body.clear === "true") {
      const clearId = String(body.id || body.userId || "").trim();
      if (clearId) removeLiveGpsPin(clearId);
      res.json({ ok: true, cleared: true });
      return;
    }
    const id = String(body.id || body.userId || "").trim();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: "id_lat_lng_required" });
      return;
    }
    upsertLiveGpsPin({
      id,
      name: body.name != null ? String(body.name) : "User",
      username: body.username != null ? String(body.username) : "",
      avatarUrl: body.avatarUrl ?? null,
      lat,
      lng,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "live_gps_post_failed" });
  }
});
app.get("/api/live-location", (_req, res) => {
  try {
    const pins = listLiveGpsPins();
    res.json({ pings: pins, pins });
  } catch (e) {
    res.status(500).json({ pings: [], pins: [] });
  }
});
app.post("/api/live-location", (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const ping = ((body.ping || body) as Record<string, unknown>);
    const id = String(ping.id || ping.userId || "").trim();
    const lat = Number(ping.lat);
    const lng = Number(ping.lng);
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: "id_lat_lng_required" });
      return;
    }
    upsertLiveGpsPin({
      id,
      name: ping.name != null ? String(ping.name) : "User",
      username: ping.username != null ? String(ping.username) : "",
      avatarUrl: ping.avatarUrl ?? null,
      lat,
      lng,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "live_location_post_failed" });
  }
});

// ── Call invite store (cross-device ring / notify) ───────────────────────────
const CALL_INVITE_TTL_MS = 45_000;
function callInviteStore(): Map<string, { payload: any; expiresAt: number }> {
  const g = globalThis as typeof globalThis & { __stooornaCallInvites?: Map<string, { payload: any; expiresAt: number }> };
  if (!g.__stooornaCallInvites) g.__stooornaCallInvites = new Map();
  return g.__stooornaCallInvites;
}
function callInvitePrune() {
  const now = Date.now();
  const m = callInviteStore();
  for (const [k, v] of m) {
    if (!v || Number(v.expiresAt || 0) <= now) m.delete(k);
  }
}
function setCallInvite(toUserId: string, payload: Record<string, unknown>) {
  if (!toUserId) return;
  callInvitePrune();
  callInviteStore().set(String(toUserId), {
    payload: { ...payload, at: Number(payload.at) || Date.now() },
    expiresAt: Date.now() + CALL_INVITE_TTL_MS,
  });
}
function getCallInvite(toUserId: string) {
  if (!toUserId) return null;
  callInvitePrune();
  const row = callInviteStore().get(String(toUserId));
  if (!row) return null;
  if (Number(row.expiresAt || 0) <= Date.now()) {
    callInviteStore().delete(String(toUserId));
    return null;
  }
  return row.payload;
}
function clearCallInvite(toUserId: string, channel?: string) {
  if (!toUserId) return;
  const row = callInviteStore().get(String(toUserId));
  if (!row) return;
  if (channel && row.payload?.channel && String(row.payload.channel) !== String(channel)) return;
  callInviteStore().delete(String(toUserId));
}

app.get("/api/call/invite", (req, res) => {
  try {
    const userId = String(req.query.userId || req.query.toUserId || "").trim();
    if (!userId) {
      res.status(400).json({ invite: null, error: "userId_required" });
      return;
    }
    const payload = getCallInvite(userId);
    res.json({ invite: payload, ttlMs: CALL_INVITE_TTL_MS });
  } catch (e) {
    res.status(500).json({ invite: null, error: "call_invite_get_failed" });
  }
});

app.post("/api/call/invite", (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const toUserId = String(body.toUserId || body.to || "").trim();
    if (body.clear === true || body.clear === "true") {
      const clearId = String(body.toUserId || body.userId || body.id || "").trim();
      clearCallInvite(clearId, body.channel != null ? String(body.channel) : undefined);
      res.json({ ok: true, cleared: true });
      return;
    }
    if (!toUserId) {
      res.status(400).json({ error: "toUserId_required" });
      return;
    }
    const channel = String(body.channel || "").trim();
    if (!channel) {
      res.status(400).json({ error: "channel_required" });
      return;
    }
    const payload = {
      channel,
      video: !!(body.video || body.kind === "video"),
      kind: String(body.kind || (body.video ? "video" : "voice")),
      hostId: body.hostId != null ? String(body.hostId) : (body.fromId != null ? String(body.fromId) : null),
      hostName: body.hostName != null ? String(body.hostName) : (body.fromName != null ? String(body.fromName) : null),
      hostAvatar: body.hostAvatar ?? null,
      members: Array.isArray(body.members) ? body.members : [],
      at: Date.now(),
    };
    setCallInvite(toUserId, payload);
    res.json({ ok: true, ttlMs: CALL_INVITE_TTL_MS });
  } catch (e) {
    res.status(500).json({ error: "call_invite_post_failed" });
  }
});

app.delete("/api/push/subscribe", push_subscribe_delete_87);
app.post("/api/push/subscribe", push_subscribe_post_88);
app.get("/api/push/vapid-public-key", push_vapid_public_key_get_89);
app.get("/api/recordings", recordings_get_90);
app.post("/api/recordings/upload", recordings_upload_post_91);
app.delete("/api/recordings/:id", recordings_id_delete_92);
app.get("/api/room", room_get_93);
app.get("/api/room/active-call", room_active_call_get_94);
app.post("/api/room/admin", room_admin_post_95);
app.get("/api/room/counts", room_counts_get_96);
app.post("/api/room/floor", room_floor_post_97);
app.post("/api/room/heartbeat", room_heartbeat_post_98);
app.post("/api/room/join", room_join_post_99);
app.post("/api/room/leave", room_leave_post_100);
app.get("/api/room/live-status", room_live_status_get_101);
app.get("/api/room/names", room_names_get_102);
app.patch("/api/room/names", room_names_patch_103);
app.get("/api/room/pin", room_pin_get_104);
app.post("/api/room/pin", room_pin_post_105);
app.post("/api/room/pin/verify", room_pin_verify_post_106);
app.get("/api/secret-chat", secret_chat_get_107);
app.post("/api/secret-chat", secret_chat_post_108);
app.post("/api/secret-chat/add-member", secret_chat_add_member_post_109);
app.post("/api/secret-chat/delete", secret_chat_delete_post_110);
app.post("/api/secret-chat/dm", secret_chat_dm_post_111);
app.post("/api/secret-chat/file", secret_chat_file_post_112);
app.post("/api/secret-chat/image", secret_chat_image_post_113);
app.post("/api/secret-chat/join", secret_chat_join_post_114);
app.post("/api/secret-chat/leave", secret_chat_leave_post_115);
app.post("/api/secret-chat/mark-read", secret_chat_mark_read_post_116);
app.delete("/api/secret-chat/message", secret_chat_message_delete_117);
app.get("/api/secret-chat/messages", secret_chat_messages_get_118);
app.post("/api/secret-chat/messages", secret_chat_messages_post_119);
app.post("/api/secret-chat/streak", secret_chat_streak_post_120);
app.post("/api/secret-chat/streak-open", secret_chat_streak_open_post_121);
app.get("/api/secret-chat/streak-pending", secret_chat_streak_pending_get_122);
app.get("/api/secret-chat/unread", secret_chat_unread_get_123);
app.post("/api/secret-chat/verify-pin", secret_chat_verify_pin_post_124);
app.post("/api/secret-chat/voice", secret_chat_voice_post_125);
app.get("/api/secret-room/live-status", secret_room_live_status_get_126);
app.get("/api/secret-room/members", secret_room_members_get_127);
app.get("/api/secret-room/mic-lock", secret_room_mic_lock_get_128);
app.post("/api/secret-room/mic-lock", secret_room_mic_lock_post_129);
app.delete("/api/status", status_delete_130);
app.get("/api/status", status_get_131);
app.post("/api/status", status_post_132);
app.get("/api/status/comments/received", status_comments_received_get_133);
app.post("/api/status/view", status_view_post_134);
app.delete("/api/status/:id/comments", status_id_comments_delete_135);
app.get("/api/status/:id/comments", status_id_comments_get_136);
app.post("/api/status/:id/comments", status_id_comments_post_137);
app.post("/api/status/:id/comments/read", status_id_comments_read_post_138);
app.post("/api/support/complete", support_complete_post_139);
app.delete("/api/support/thread", support_thread_delete_140);
app.get("/api/typing", typing_get_141);
app.post("/api/typing", typing_post_142);
app.post("/api/users/block", users_block_post_143);
app.get("/api/users/blocks", users_blocks_get_144);
app.get("/api/users/by-username", users_by_username_get_145);
app.get("/api/users/by-username/:username", users_by_username_username_get_146);
app.get("/api/users/check-username", users_check_username_get_147);
app.get("/api/users/me", users_me_get_148);
app.patch("/api/users/me", users_me_patch_149);
app.post("/api/users/me/avatar", users_me_avatar_post_150);
app.get("/api/users/me/bio", users_me_bio_get_151);
app.patch("/api/users/me/bio", users_me_bio_patch_152);
app.post("/api/users/me/cover", users_me_cover_post_153);
app.patch("/api/users/me/email", users_me_email_patch_154);
app.patch("/api/users/me/name", users_me_name_patch_155);
app.patch("/api/users/me/password", users_me_password_patch_156);
app.patch("/api/users/me/phone", users_me_phone_patch_157);
app.get("/api/users/me/privacy", users_me_privacy_get_158);
app.patch("/api/users/me/privacy", users_me_privacy_patch_159);
app.get("/api/users/search", users_search_get_160);
app.get("/api/users/:id", users_id_get_161);
app.post("/api/users/:id/follow", users_id_follow_post_162);
app.get("/api/users/:id/follow-status", users_id_follow_status_get_163);
app.get("/api/users/:id/posts", users_id_posts_get_164);
// </api-registrations>

// VAPID key generation endpoint (owner only — run once)
app.get("/api/push/generate-vapid", (_req, res) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webpush = require('web-push') as typeof import('web-push');
    const keys = webpush.generateVAPIDKeys();
    res.json({ publicKey: keys.publicKey, privateKey: keys.privateKey });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Run DB migrations eagerly — works in both dev (Vite SSR) and production.
// Each migration is idempotent (checks IF NOT EXISTS before creating).
(async () => {
	try {
		await migrateRoomPins();
		await migrateSignalTables();
		await migrateCover();
		await addStatuses();
		await addLiveSessions();
		await addLiveRecordingCols();
		await runAddPhoneNumberMigration();
		await addOwnerLivePin();
		await addSecretRoomJoins();
		await addSecretMicLock();
		await addSecretChatDm();
		await addBanIpRoomAdmin();
		await addUserPrivacyIsPrivate();
		await migratePush();
		await addSecretChats();
		await addFileVideoType();
		await addPostShareType();
		startCleanupJob();
		console.log('[startup] All migrations complete.');
	} catch (e) {
		console.error('[startup] Migration error:', e);
	}
})();

// Posts/likes/follows migration — runs independently so earlier migration errors don't block it
(async () => {
	try {
		await addPostsLikesFollows();
		await addTextPostSocial();
		await addStreakCols();
		console.log('[startup] Posts migration complete.');
	} catch (e) {
		console.error('[startup] Posts migration error:', e);
	}
})();

// Streak fields migration
(async () => {
	try {
		await addStreakFields();
	} catch (e) {
		console.error('[startup] Streak migration error:', e);
	}
})();

// Status audio/overlay migration — now runs inside startServer() before app.listen
// Error middleware must be registered AFTER the routes it protects; Express
// only passes errors to middleware defined later in the stack.
app.use("/api", (err: unknown, req: Request, res: Response, _next: NextFunction) => {
	// Always respond JSON on /api so clients parsing response.json() don't
	// receive Express's default HTML error page for non-Error throws.
	console.error("ssr.api.error", {
		url: req.url,
		error: err instanceof Error ? err.stack : String(err),
	});
	res.status(500).json({ error: "Internal server error" });
});

function baseUrl(req: Request): string {
	return `${req.protocol}://${req.hostname}`;
}

function escapeXml(s: string): string {
	return s.replace(/[&<>"']/g, (c) =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
	);
}

app.get("/robots.txt", (req, res) => {
	if (isSystemHost(req)) {
		res
			.type("text/plain")
			.set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host")
			.send("User-agent: *\nDisallow: /\n");
		return;
	}
	const base = baseUrl(req);
	const body = [
		"User-agent: *",
		"Allow: /",
		"",
		`Sitemap: ${base}/sitemap.xml`,
		"",
	].join("\n");
	res.type("text/plain").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(body);
});

app.get("/sitemap.xml", (req, res) => {
	if (isSystemHost(req)) {
		const empty = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>\n`;
		res.type("application/xml").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(empty);
		return;
	}
	const base = baseUrl(req);
	const urls = seoRoutes
		.filter((r) => typeof r.path === "string" && r.path.startsWith("/"))
		.map((r) => {
			const loc = `${base}${r.path}`;
			const parts = [`    <loc>${escapeXml(loc)}</loc>`];
			if (r.lastmod) parts.push(`    <lastmod>${escapeXml(r.lastmod)}</lastmod>`);
			if (r.changefreq) parts.push(`    <changefreq>${r.changefreq}</changefreq>`);
			if (r.priority !== undefined)
				parts.push(`    <priority>${r.priority.toFixed(1)}</priority>`);
			return `  <url>\n${parts.join("\n")}\n  </url>`;
		})
		.join("\n");
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
	res.type("application/xml").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(body);
});

app.get("/llms.txt", llmsTxtHandler);

if (import.meta.env.PROD) {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const clientDir = join(__dirname, "client");
	const adSenseRuntimeConfig = loadAdSenseRuntimeConfig(__dirname);
	const indexNowKey = loadIndexNowKey(__dirname);

	registerAdSenseTextRoutes(app, adSenseRuntimeConfig);

	if (indexNowKey !== null) {
		app.get(`/${indexNowKey}.txt`, (_req, res) => {
			res.type("text/plain").set("Cache-Control", "public, max-age=86400").send(indexNowKey);
		});
	}

	app.use(
		express.static(clientDir, {
			index: false,
			setHeaders(res, filePath) {
				res.set(
					"Cache-Control",
					filePath.includes("/assets/")
						? "public, max-age=31536000, immutable"
						: "no-cache",
				);
			},
		}),
	);

	app.use((_req, res, next) => {
		res.set("Cache-Control", "no-cache");
		next();
	});

	let template: string;
	try {
		template = readFileSync(join(clientDir, "index.html"), "utf-8");
	} catch (err) {
		console.error("ssr.template.load-failed", {
			path: join(clientDir, "index.html"),
			error: err instanceof Error ? err.message : String(err),
		});
		process.exit(1);
	}
	if (!template.includes("<!--app-head-->") || !template.includes("<!--app-html-->")) {
		// Fail fast at boot, same as a template load failure above: without
		// markers, every .replace() call on the render path is a no-op and we
		// would serve a shell with no <head> content and no rendered body on
		// every request. Preferring process.exit over a degraded mode ensures
		// an operator notices and fixes the build rather than serving broken
		// SEO-invisible pages indefinitely.
		console.error("ssr.template.markers-missing", {
			hasHead: template.includes("<!--app-head-->"),
			hasHtml: template.includes("<!--app-html-->"),
		});
		process.exit(1);
	}
	const fallbackShell = template
		.replace("<!--app-head-->", "")
		.replace("<!--app-html-->", "");

	// Resolve the SSR module once into a stable render function. A failed
	// load is unrecoverable at runtime - exiting lets the container
	// scheduler restart with a clean slate rather than leaving the server
	// to serve silent 503s indefinitely against a single startup log.
	let renderFn: ((url: string, siteOrigin?: string) => Promise<SsrRenderResult>) | null = null;
	const SSR_MODULE_LOAD_TIMEOUT_MS = 30_000;
	const loadTimeout = setTimeout(() => {
		if (renderFn !== null) return;
		console.error("ssr.module.load-timeout", {
			timeoutMs: SSR_MODULE_LOAD_TIMEOUT_MS,
		});
		process.exit(1);
	}, SSR_MODULE_LOAD_TIMEOUT_MS);
	loadTimeout.unref();
	import("../entry-server").then(
		(mod) => {
			clearTimeout(loadTimeout);
			renderFn = mod.render;
		},
		(err) => {
			clearTimeout(loadTimeout);
			console.error("ssr.module.load-failed", {
				error: err instanceof Error ? err.stack : String(err),
			});
			process.exit(1);
		},
	);

	app.get(/.*/, async (req, res, next) => {
		if (req.method !== "GET") return next();
		if (req.path.startsWith("/api")) return next();
		if (extname(req.path)) return next();
		const sendFallback = () =>
			res
				.status(503)
				.set("Content-Type", "text/html; charset=utf-8")
				.set("Cache-Control", "no-store")
				.send(fallbackShell);
		if (renderFn === null) {
			// Module not yet resolved; fall back without logging to avoid startup
			// noise before the first render is even possible. A terminal load
			// failure (import reject or 30s timeout) process.exit(1)s from the
			// loader above, so this branch is only the brief warmup window.
			return sendFallback();
		}
		try {
			const result = await renderFn(
				req.url,
				`${req.protocol}://${req.hostname}`,
			);
			if (result.redirect) {
				// Redirect thrown from a loader/action surfaces as a Response.
				// Forward it so the browser actually navigates to the new URL
				// instead of seeing an empty shell with a stale status.
				res.redirect(result.status, result.redirect);
				return;
			}
			if (!result.html) {
				// A non-redirect Response was thrown from a loader (e.g.
				// `throw new Response(null, { status: 404 })`). renderToString
				// produced no markup, so we have a real status but no body.
				// Log so the case is observable in ops dashboards, and mark
				// no-store so CDNs don't cache an empty page as a valid hit.
				// User-visible 404 / error pages should come from a route
				// errorElement, not from this fallback path.
				console.error("ssr.render.error-response", {
					url: req.url,
					status: result.status,
				});
				res
					.status(result.status)
					.set("Content-Type", "text/html; charset=utf-8")
					.set("Cache-Control", "no-store")
					.send(fallbackShell);
				return;
			}
			// Per-host SEO injection. System URLs get a noindex meta so
			// crawlers drop them from the index over time; customer-attached
			// hosts get a self-canonical link so search engines treat them
			// as authoritative for the rendered content.
			const seoHead = isSystemHost(req)
				? `<meta name="robots" content="noindex,nofollow">`
				: `<link rel="canonical" href="${escapeXml(`${req.protocol}://${req.hostname}${req.path}`)}">`;
			// Function replacements disable String.replace's $-special sequences
			// ($&, $', $`, $$) so user-authored titles / JSON-LD like
			// "Save $& today" insert literally instead of being interpolated.
			const out = renderSsrDocument(
				template,
				{ ...result, head: seoHead + result.head },
				adSenseRuntimeConfig,
			);
			res
				.status(result.status)
				.set("Content-Type", "text/html; charset=utf-8")
				.set("Cache-Control", "no-cache")
				.send(out);
		} catch (err) {
			// 503 surfaces the failure in CDN/monitoring without caching a broken
			// page as success. console.error (not warn) puts it at the right log
			// level for the observability pipeline to alert on.
			console.error("ssr.render.failed", {
				url: req.url,
				// Log the full stack — React's renderToString annotates it with
				// the failing component's call tree, which the message alone
				// discards.
				error: err instanceof Error ? err.stack : String(err),
			});
			sendFallback();
		}
	});

	const shutdown = async (signal: string) => {
		console.log(`Got ${signal}, shutting down gracefully...`);
		// db/client.js is imported statically at the top of this file now
		// (see the import * as dbClientModule line) instead of via a
		// runtime import(), so closeConnection() may simply be absent from
		// the module rather than the import itself failing — guard with a
		// typeof check the same way the old code guarded after import().
		if (typeof dbClientModule.closeConnection === "function") {
			try {
				await dbClientModule.closeConnection();
				console.log("Database connections closed");
			} catch (error: unknown) {
				console.error("ssr.shutdown.db-close-failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		process.exit(0);
	};

	(["SIGTERM", "SIGINT"] as const).forEach((signal) => {
		process.once(signal, () => {
			void shutdown(signal);
		});
	});

	const rawPort = process.env.PORT || "3000";
	const port = parseInt(rawPort, 10);
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		console.error("ssr.server.invalid-port", { rawPort });
		process.exit(1);
	}
	const host = process.env.HOST || "0.0.0.0";

	const server = app.listen(port, host, () => {
		console.log(`Server listening on http://${host}:${port}`);
		attachRoomLiveWS(server);
		attachLiveChatWS(server);
		attachCallSignalingWS(server);
	});
	server.on("error", (err: NodeJS.ErrnoException) => {
		console.error("ssr.server.listen-failed", {
			port,
			host,
			code: err.code,
			error: err.message,
		});
		process.exit(1);
	});
}

export default app;
