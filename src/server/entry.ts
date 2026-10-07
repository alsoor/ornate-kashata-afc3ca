import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
// Static import so the SSR bundler doesn't see a mixed static/dynamic
// import of this module (it's imported statically elsewhere, e.g. in
// api/room/join/POST.ts). closeConnection is optional at runtime, so the
// call site below still guards with a typeof check instead of relying on
// import() rejecting when the export is missing.
import * as dbClientModule from "./db/client.js";
import { COIN_PACKS, createCheckout, handlePolarEvent, polarConfigured, verifyPolarSignature } from "./polar.js";
import { googlePlayConfigured, verifyAndCreditGooglePlay } from "./google-play.js";
import { createSession, makeLimiter, markSeen, normId, pickKey, recordPaid, seenRecently, takePaid } from "./gift-guard.js";
import { mapEarningsAdapter, privateAssetsGuard, registerWithdrawalRoutes } from "./withdrawals.js";
import { registerLiveBurstRoutes } from "./live-burst.js"; // EMOJI-BURST-PATCH
import { registerAppReleaseRoutes } from "./app-releases-routes.js"; // APP-RELEASES-PATCH

// <api-imports>
import auth_action_get_0 from "./api/auth/[action]/GET";
import auth_action_post_1 from "./api/auth/[action]/POST";
import auth_action_detail_get_2 from "./api/auth/[action]/[detail]/GET";
import auth_action_detail_post_3 from "./api/auth/[action]/[detail]/POST";
import call_token_get_4 from "./api/call/token/GET";
import call_invite_get from "./api/call/invite/GET";
import call_invite_post from "./api/call/invite/POST";
import call_invite_clear_post from "./api/call/invite/clear/POST";
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
import { toggleStatusCommentLike, getStatusCommentLikes } from "./api/status/commentLikes";
import deleteStatusById, { statusDeleteEntry } from "./api/status/deleteById";
import status_post_132, { multerMiddleware as statusMulterMiddleware } from "./api/status/POST";
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
import users_id_followers_get from "./api/users/[id]/followers/GET";
import users_id_following_get from "./api/users/[id]/following/GET";
import vip_get_165 from "./api/vip/GET";
import vip_post_166 from "./api/vip/POST";
import vip_directory_get_167 from "./api/vip/directory/GET";
import business_directory_get_168 from "./api/business/directory/GET";
import business_directory_post_169 from "./api/business/directory/POST";
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
import { registerVideoSwap } from "./video-swap";

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

// ── Polar webhook (شراء Coins) — لازم يكون قبل express.json() لأن التوقيع يُحسب على الـ body الخام ──
app.post("/api/webhooks/polar", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  const secret = process.env.POLAR_WEBHOOK_SECRET || "";
  if (!secret) {
    console.error("[polar] POLAR_WEBHOOK_SECRET is not set");
    return res.status(500).json({ error: "webhook not configured" });
  }
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}));
  if (!verifyPolarSignature(raw, req.headers as Record<string, string | string[] | undefined>, secret)) {
    return res.status(403).json({ error: "invalid signature" });
  }
  let event: { type?: string; data?: unknown };
  try { event = JSON.parse(raw.toString("utf-8")); } catch { return res.status(400).json({ error: "invalid json" }); }
  try {
    const mem = giftProfitMem();
    const out = await handlePolarEvent(event, {
      has: (k) => mem.done.has(k),
      mark: (k) => { mem.done.add(k); },
      add: (userId, delta) => {
        const next = Math.max(0, (mem.balances.get(userId) || 0) + delta);
        mem.balances.set(userId, next);
        return next;
      },
      save: () => giftProfitTouch(),
    });
    return res.json({ ok: true, ...out });
  } catch (e) {
    console.error("[polar] webhook handler failed", e);
    return res.status(500).json({ error: "handler failed" }); // Polar يعيد المحاولة تلقائياً
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve uploaded story/post media ─────────────────────────────────────────
// Uploads are written under ASSETS_DIR and returned as /airo-assets/... URLs,
// but nothing was serving that prefix — so stories saved fine yet rendered as a
// broken image (black screen). express.static also handles video Range requests.
// On Railway, mount a Volume at this path (or set ASSETS_DIR) so files survive redeploys.
const ASSETS_DIR = process.env.ASSETS_DIR || '/shared-storage/public/assets';
// Ensure the assets directory exists so uploads don't fail on first boot
// (Railway: mount a persistent Volume at ASSETS_DIR so files survive redeploys).
try {
  if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });
} catch (e) {
  console.error('[startup] Could not create ASSETS_DIR', ASSETS_DIR, e);
}
const staticOpts = { maxAge: '30d', fallthrough: true as const, etag: true, lastModified: true };
// يحجب الوصول العام لملفات حساسة داخل ASSETS_DIR (سجل الأرباح + مجلد _private) — يجب أن يسبق express.static
for (const p of ['/airo-assets', '/assets', '/uploads', '/media']) app.use(p, privateAssetsGuard());
app.use('/airo-assets', express.static(ASSETS_DIR, staticOpts));
// Common alternate prefixes used by older clients / partial uploads
app.use('/assets', express.static(ASSETS_DIR, staticOpts));
app.use('/uploads', express.static(ASSETS_DIR, staticOpts));
app.use('/media', express.static(ASSETS_DIR, staticOpts));
// Health probe so ops can verify volume is writable
app.get('/api/assets/health', (_req, res) => {
  try {
    const ok = existsSync(ASSETS_DIR);
    res.json({ ok, dir: ASSETS_DIR, writable: ok });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ── AI video merge (live-chat film icon): POST/GET /api/video-swap — needs FAL_KEY ──
registerVideoSwap(app, ASSETS_DIR);

// ── Story delete: real server-side delete (friends stop seeing it) ───────────
// Must be registered BEFORE the generic status routes below.
app.delete('/api/status/:id', deleteStatusById);
app.delete('/api/status', statusDeleteEntry);

// ── Story comment likes (route was missing → likes were rolled back) ─────────
app.post('/api/status/comments/:id/like', toggleStatusCommentLike);
app.get('/api/status/comment-likes', getStatusCommentLikes);

// ── IP tracking: lightweight — stored via /api/me/update-ip ─────────────────

// <api-registrations>
app.get("/api/auth/:action", auth_action_get_0);
app.post("/api/auth/:action", auth_action_post_1);
app.get("/api/auth/:action/:detail", auth_action_detail_get_2);
app.post("/api/auth/:action/:detail", auth_action_detail_post_3);
app.get("/api/call/token", call_token_get_4);
app.get("/api/call/invite", call_invite_get);
app.post("/api/call/invite", call_invite_post);
app.post("/api/call/invite/clear", call_invite_clear_post);
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

const liveChatMem = () => {
  const g = globalThis as typeof globalThis & { __stooornaLiveChat?: Map<string, Array<{ at: number; payload: any }>> };
  if (!g.__stooornaLiveChat) g.__stooornaLiveChat = new Map();
  return g.__stooornaLiveChat;
};
const liveChatVoiceMem = () => {
  const g = globalThis as typeof globalThis & { __stooornaLiveChatVoice?: Map<string, { mime: string; buf: Buffer; duration: number }> };
  if (!g.__stooornaLiveChatVoice) g.__stooornaLiveChatVoice = new Map();
  return g.__stooornaLiveChatVoice;
};
// MEM-PATCH: voice notes are kept in RAM — keep only the newest ones (max 120 notes / 40MB) so the server memory stops growing.
const LIVE_VOICE_MAX_ITEMS = 120;
const LIVE_VOICE_MAX_BYTES = 40 * 1024 * 1024;
const trimLiveVoiceMem = () => {
  const m = liveChatVoiceMem();
  let bytes = 0;
  for (const v of m.values()) bytes += v.buf.length;
  for (const k of m.keys()) {
    if (m.size <= LIVE_VOICE_MAX_ITEMS && bytes <= LIVE_VOICE_MAX_BYTES) break;
    const v = m.get(k);
    bytes -= v ? v.buf.length : 0;
    m.delete(k);
  }
};
const liveChatRow = (m: { at: number; payload: any }) => {
  const p = (m.payload || m) as any;
  const id = String(p.id || `lc_${m.at}`);
  const voice = liveChatVoiceMem().get(id);
  const deleted = !!p.deleted || String(p.text || "") === "○​RVD" || String(p.text || "").includes("○​RVD");
  return {
    id,
    userId: String(p.userId || p.senderId || ""),
    name: p.name ?? null,
    username: p.username ?? null,
    avatarUrl: p.avatarUrl ?? null,
    text: String(p.text || p.body || ""),
    imageUrl: deleted ? null : (p.imageUrl ?? null),
    voiceUrl: deleted ? null : (p.voiceUrl || (voice ? `/api/live-chat/voice?id=${encodeURIComponent(id)}` : null)),
    voiceDuration: deleted ? null : (p.voiceDuration ?? voice?.duration ?? null),
    likes: Array.isArray(p.likes) ? p.likes.map(String) : [],
    createdAt: Number(p.createdAt || m.at || Date.now()),
    editCount: Number(p.editCount || 0) || 0,
    deleted: deleted || undefined,
  };
};
app.get("/api/live-chat", (req, res) => {
  const channel = String(req.query.channel || req.query.room || "stooorna-live-chat");
  const since = Number(req.query.since || 0);
  const raw = (liveChatMem().get(channel) || []).filter((m) => m.at > since).slice(-400);
  // Dedupe by id: later entries (edit/delete) overwrite earlier ones
  const byId = new Map<string, ReturnType<typeof liveChatRow>>();
  for (const m of raw) {
    const row = liveChatRow(m);
    const prev = byId.get(row.id);
    if (!prev) { byId.set(row.id, row); continue; }
    const prevDel = !!(prev as any).deleted;
    const rowDel = !!(row as any).deleted;
    if (rowDel || (prev as any).editCount < (row as any).editCount) byId.set(row.id, { ...prev, ...row, imageUrl: rowDel ? null : (row.imageUrl ?? prev.imageUrl), voiceUrl: rowDel ? null : (row.voiceUrl ?? prev.voiceUrl) });
    else byId.set(row.id, { ...row, ...prev, imageUrl: prevDel ? null : (prev.imageUrl ?? row.imageUrl), voiceUrl: prevDel ? null : (prev.voiceUrl ?? row.voiceUrl) });
  }
  const comments = [...byId.values()].filter((x) => x.text || x.voiceUrl || x.imageUrl);
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, comments, messages: comments, list: comments });
});

// Clear live-chat room messages only (does NOT delete feed posts / photos / videos)
app.delete("/api/live-chat", (req, res) => {
  const channel = String(req.query.channel || req.query.room || "stooorna-live-chat");
  try {
    const g = globalThis as typeof globalThis & { __stooornaLiveChat?: Map<string, unknown[]> };
    if (g.__stooornaLiveChat) g.__stooornaLiveChat.set(channel, []);
  } catch { /* */ }
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, cleared: "live-chat-only" });
});

app.post("/api/live-chat/voice", (req, res) => {
  const body = (req.body || {}) as any;
  const id = String(body.id || `vc_${Date.now()}`);
  const audio = String(body.audio || body.voiceUrl || "");
  if (!audio.startsWith("data:")) return res.status(400).json({ error: "audio" });
  const comma = audio.indexOf(",");
  const meta = audio.slice(5, comma);
  const mime = (meta.split(";")[0] || "audio/webm");
  const buf = Buffer.from(audio.slice(comma + 1), "base64");
  liveChatVoiceMem().set(id, { mime, buf, duration: Number(body.duration || body.voiceDuration) || 1 });
  trimLiveVoiceMem(); // MEM-PATCH
  res.json({ ok: true, id, url: `/api/live-chat/voice?id=${encodeURIComponent(id)}`, voiceUrl: `/api/live-chat/voice?id=${encodeURIComponent(id)}` });
});
app.get("/api/live-chat/voice", (req, res) => {
  const id = String(req.query.id || "");
  const row = liveChatVoiceMem().get(id);
  if (!row) return res.status(404).end();
  res.setHeader("Content-Type", row.mime || "audio/webm");
  res.setHeader("Cache-Control", "no-store");
  res.send(row.buf);
});
const liveChatTypingMem = () => {
  const g = globalThis as typeof globalThis & { __stooornaLiveChatTyping?: Map<string, Map<string, { name: string; at: number }>> };
  if (!g.__stooornaLiveChatTyping) g.__stooornaLiveChatTyping = new Map();
  return g.__stooornaLiveChatTyping;
};
app.post("/api/live-chat/typing", (req, res) => {
  const body = (req.body || {}) as any;
  const channel = String(body.channel || body.room || "stooorna-live-chat");
  const userId = String(body.userId || "");
  if (!userId) return res.status(400).json({ error: "user" });
  const store = liveChatTypingMem();
  const map = store.get(channel) || new Map();
  if (body.typing === false) map.delete(userId);
  else map.set(userId, { name: String(body.username || body.name || "User").replace(/^@/, ""), at: Date.now() });
  store.set(channel, map);
  res.json({ ok: true });
});
app.get("/api/live-chat/typing", (req, res) => {
  const channel = String(req.query.channel || req.query.room || "stooorna-live-chat");
  const map = liveChatTypingMem().get(channel) || new Map();
  const now = Date.now();
  const typers = [...map.entries()]
    .filter(([, v]) => now - v.at < 4000)
    .map(([userId, v]) => ({ userId, name: v.name }));
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, typers });
});
app.post("/api/live-chat", (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const channel = String(body.channel || body.room || body.roomId || "stooorna-live-chat");
  const action = String(body.action || "");
  // ── DELETE / EDIT (must run BEFORE like — commentId is also used on delete payloads) ──
  if (action === "delete" || action === "edit" || body.deleted === true) {
    const targetId = String(body.id || body.commentId || "");
    const mem = liveChatMem();
    const list = mem.get(channel) || [];
    let found = false;
    for (const m of list) {
      const p = (m.payload || m) as any;
      if (String(p.id || "") !== targetId) continue;
      found = true;
      if (action === "delete" || body.deleted === true) {
        p.text = String(body.text || body.body || "○​RVD");
        p.body = p.text;
        p.imageUrl = null;
        p.mediaUrl = null;
        p.videoUrl = null;
        p.voiceUrl = null;
        p.voiceDuration = null;
        p.deleted = true;
        p.editCount = Math.max(Number(p.editCount || 0), Number(body.editCount || 99), 99);
      } else {
        if (body.text != null || body.body != null) {
          p.text = String(body.text || body.body || p.text || "");
          p.body = p.text;
        }
        if ("imageUrl" in body) p.imageUrl = body.imageUrl ?? null;
        if ("mediaUrl" in body) p.mediaUrl = body.mediaUrl ?? null;
        if ("videoUrl" in body) p.videoUrl = body.videoUrl ?? null;
        if ("voiceUrl" in body) p.voiceUrl = body.voiceUrl ?? null;
        p.editCount = Math.max(Number(p.editCount || 0), Number(body.editCount || 0));
        p.edited = true;
      }
      m.payload = p;
      m.at = Date.now();
    }
    // If original row missing (other instance), append tombstone so pollers still hide it
    if (!found && targetId && (action === "delete" || body.deleted === true)) {
      const at = Date.now();
      list.push({
        at,
        payload: {
          id: targetId,
          userId: String(body.userId || ""),
          name: body.name ?? null,
          username: body.username ?? null,
          avatarUrl: body.avatarUrl ?? null,
          text: String(body.text || body.body || "○​RVD"),
          body: String(body.text || body.body || "○​RVD"),
          imageUrl: null,
          voiceUrl: null,
          deleted: true,
          editCount: 99,
          createdAt: Number(body.createdAt) || at,
        },
      });
    }
    mem.set(channel, list.slice(-400));
    const comments = list.map((m) => liveChatRow(m)).filter((x) => x.text || x.voiceUrl || x.imageUrl);
    return res.json({ ok: true, comments, messages: comments, list: comments });
  }
  const likeId = String(body.likeId || "");
  // Only treat as like when explicitly requested (do NOT use commentId alone — delete/edit also send it)
  if (action === "like" || (likeId && action !== "delete" && action !== "edit")) {
    const targetId = String(body.likeId || body.id || body.commentId || "");
    const liker = String(body.userId || body.likerId || "");
    const mem = liveChatMem();
    const list = mem.get(channel) || [];
    for (const m of list) {
      const p = (m.payload || m) as any;
      if (String(p.id || "") !== targetId) continue;
      const likes = Array.isArray(p.likes) ? p.likes.map(String) : [];
      const has = liker && likes.includes(liker);
      p.likes = has ? likes.filter((x: string) => x !== liker) : (liker ? [...likes, liker] : likes);
      m.payload = p;
    }
    mem.set(channel, list);
    const comments = list.map((m) => {
      const p = (m.payload || m) as any;
      return {
        id: String(p.id || `lc_${m.at}`),
        userId: String(p.userId || ""),
        name: p.name ?? null,
        username: p.username ?? null,
        avatarUrl: p.avatarUrl ?? null,
        text: String(p.text || p.body || ""),
        imageUrl: p.imageUrl ?? null,
        likes: Array.isArray(p.likes) ? p.likes.map(String) : [],
        createdAt: Number(p.createdAt || m.at || Date.now()),
      };
    }).filter((x) => x.text);
    return res.json({ ok: true, comments, messages: comments });
  }
  const voiceUrlIn = String(body.voiceUrl || body.audio || "");
  const imageUrlIn = body.imageUrl ?? body.mediaUrl ?? body.videoUrl ?? null;
  const text = String(body.text || body.body || "").trim().slice(0, 500) || (voiceUrlIn ? "🎤" : (imageUrlIn ? "📷" : ""));
  if (!text && !voiceUrlIn && !imageUrlIn) return res.status(400).json({ error: "empty" });
  const at = Date.now();
  const payload = {
    id: String(body.id || `lc_${at}_${Math.random().toString(36).slice(2, 8)}`),
    userId: String(body.userId || body.senderId || ""),
    name: body.name ?? null,
    username: body.username ?? null,
    avatarUrl: body.avatarUrl ?? null,
    text,
    body: text,
    imageUrl: imageUrlIn ?? body.imageUrl ?? null,
    voiceUrl: voiceUrlIn && voiceUrlIn.startsWith("/api/") ? voiceUrlIn : (voiceUrlIn ? voiceUrlIn : null),
    voiceDuration: body.voiceDuration ?? body.duration ?? null,
    likes: Array.isArray(body.likes) ? body.likes : [],
    createdAt: Number(body.createdAt) || at,
    at,
  };
  if (typeof voiceUrlIn === "string" && voiceUrlIn.startsWith("data:audio")) {
    const comma = voiceUrlIn.indexOf(",");
    const meta = voiceUrlIn.slice(5, comma);
    const mime = (meta.split(";")[0] || "audio/webm");
    const buf = Buffer.from(voiceUrlIn.slice(comma + 1), "base64");
    liveChatVoiceMem().set(String(payload.id), { mime, buf, duration: Number(payload.voiceDuration) || 1 });
    payload.voiceUrl = `/api/live-chat/voice?id=${encodeURIComponent(String(payload.id))}`;
  }
  const mem = liveChatMem();
  const list = mem.get(channel) || [];
  list.push({ at, payload });
  mem.set(channel, list.slice(-400));
  const comments = (mem.get(channel) || []).map((m) => {
    const p = (m.payload || m) as any;
    return {
      id: String(p.id || `lc_${m.at}`),
      userId: String(p.userId || ""),
      name: p.name ?? null,
      username: p.username ?? null,
      avatarUrl: p.avatarUrl ?? null,
      text: String(p.text || p.body || ""),
      imageUrl: p.imageUrl ?? null,
      likes: Array.isArray(p.likes) ? p.likes.map(String) : [],
      createdAt: Number(p.createdAt || m.at || Date.now()),
    };
  }).filter((x) => x.text);
  res.json({ ok: true, at, comments, messages: comments });
});

const liveSignalMem = () => {
  const g = globalThis as typeof globalThis & { __stooornaLiveSig?: Map<string, Array<{ at: number; payload: any }>> };
  if (!g.__stooornaLiveSig) g.__stooornaLiveSig = new Map();
  return g.__stooornaLiveSig;
};
app.get("/api/room/signal", (req, res) => {
  const roomId = String(req.query.roomId || req.query.channel || "");
  const since = Number(req.query.since || 0);
  if (!roomId) return res.json({ messages: [], signals: [] });
  const list = (liveSignalMem().get(roomId) || []).filter((m) => m.at > since).slice(-80);
  res.json({ messages: list, signals: list });
});
app.post("/api/room/signal", async (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const roomId = String(body.roomId || body.channel || "");
  if (!roomId) return res.status(400).json({ error: "roomId required" });
  const payload = (body.payload || body.data || body) as Record<string, unknown>;
  const at = Date.now();
  const mem = liveSignalMem();
  const list = mem.get(roomId) || [];
  list.push({ at, payload: { ...payload, at } });
  mem.set(roomId, list.slice(-160));
  const fromId = String(body.fromId || "").slice(0, 80);
  // الرصيد يُرجَع فقط لصاحبه المسجّل (كان يُكشف لأي أحد بمعرفة الـ id)
  const su = fromId ? await session.user(req).catch(() => null) : null;
  const pmemOut = giftProfitMem();
  const ownBal = su && session.owns(su, fromId) ? [...pmemOut.balances].filter(([k]) => session.keysOf(su).includes(normId(k))).reduce((m, [, n]) => Math.max(m, n), 0) : undefined;
  res.json({ ok: true, at, balance: ownBal });
});


// ── Live presence (public story ring + feed): host heartbeats while live ──
// Survives viewers leaving/reopening the app; cleared only when host stops or TTL expires.
type LivePresenceRow = {
  hostId: string;
  kind: 'voice' | 'camera';
  channel?: string;
  hostName?: string;
  hostUsername?: string;
  hostAvatar?: string | null;
  /** SPLIT-CARD-PATCH: the other live host this host is split-screen with right now (null/undefined = none) */
  split?: { userId: string; name: string; username: string | null; avatarUrl: string | null; owner: boolean } | null;
  at: number;
};
const LIVE_PRESENCE_TTL_MS = 180_000;
const livePresenceMem = () => {
  const g = globalThis as typeof globalThis & { __stooornaLivePresence?: Map<string, LivePresenceRow> };
  if (!g.__stooornaLivePresence) g.__stooornaLivePresence = new Map();
  return g.__stooornaLivePresence;
};
const livePresencePurge = () => {
  const mem = livePresenceMem();
  const now = Date.now();
  for (const [k, v] of mem.entries()) {
    if (now - v.at > LIVE_PRESENCE_TTL_MS) mem.delete(k);
  }
};
app.get("/api/live-presence", (req, res) => {
  livePresencePurge();
  const mem = livePresenceMem();
  res.setHeader("Cache-Control", "no-store");
  const hostId = String(req.query.hostId || req.query.userId || "").trim();
  if (hostId) {
    const row = mem.get(hostId) || mem.get(hostId.toLowerCase());
    if (!row) return res.json({ ok: true, active: false, hostId });
    return res.json({ ok: true, active: true, ...row });
  }
  const list = [...mem.values()].map((r) => ({ ...r, active: true }));
  res.json({ ok: true, lives: list });
});
app.post("/api/live-presence", (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const hostId = String(body.hostId || body.userId || "").trim();
  if (!hostId) return res.status(400).json({ error: "hostId required" });
  const active = body.active !== false && body.active !== 0 && body.active !== "false";
  const mem = livePresenceMem();
  if (!active) {
    mem.delete(hostId);
    mem.delete(hostId.toLowerCase());
    return res.json({ ok: true, active: false, hostId });
  }
  const kind = String(body.kind || "voice") === "camera" ? "camera" : "voice";
  const row: LivePresenceRow = {
    hostId,
    kind,
    channel: body.channel != null ? String(body.channel).slice(0, 80) : undefined,
    hostName: body.hostName != null ? String(body.hostName).slice(0, 80) : undefined,
    hostUsername: body.hostUsername != null ? String(body.hostUsername).slice(0, 80) : undefined,
    hostAvatar: body.hostAvatar != null ? String(body.hostAvatar).slice(0, 400) : null,
    split: (() => {
      const sp = body.split as Record<string, unknown> | null | undefined;
      if (!sp || typeof sp !== "object") return null;
      const uid = String(sp.userId || "").trim().slice(0, 80);
      if (!uid || uid.toLowerCase() === hostId.toLowerCase()) return null;
      return {
        userId: uid,
        name: String(sp.name || "").slice(0, 80),
        username: sp.username != null && String(sp.username) ? String(sp.username).replace(/^@/, "").slice(0, 80) : null,
        avatarUrl: sp.avatarUrl != null && String(sp.avatarUrl) ? String(sp.avatarUrl).slice(0, 400) : null,
        owner: sp.owner === true, // true = this host owns the room that shows the split (the merged card opens THAT room)
      };
    })(),
    at: Date.now(),
  };
  mem.set(hostId, row);
  // also index lowercase for lookups
  if (hostId.toLowerCase() !== hostId) mem.set(hostId.toLowerCase(), row);
  res.json({ ok: true, active: true, hostId, kind });
});

// -- GPS Live: last known position of every user (kept after they go offline, survives restarts) --
type LiveGpsPin = { id: string; name: string; username: string; avatarUrl: string | null; lat: number; lng: number; at: number };
const LIVE_GPS_FILE = () => join(ASSETS_DIR, "stooorna-live-gps.json");
const liveGpsMem = (): Map<string, LiveGpsPin> => {
  const g = globalThis as typeof globalThis & { __stooornaLiveGps?: Map<string, LiveGpsPin> };
  if (!g.__stooornaLiveGps) {
    const m = new Map<string, LiveGpsPin>();
    try {
      const p = LIVE_GPS_FILE();
      if (existsSync(p)) {
        const raw = JSON.parse(readFileSync(p, "utf-8"));
        for (const r of Array.isArray(raw) ? raw : []) {
          if (r && r.id && Number.isFinite(r.lat) && Number.isFinite(r.lng)) m.set(String(r.id), r as LiveGpsPin);
        }
      }
    } catch (e) {
      console.error("[live-gps] load failed", e);
    }
    g.__stooornaLiveGps = m;
  }
  return g.__stooornaLiveGps;
};
let liveGpsSaveTimer: ReturnType<typeof setTimeout> | null = null;
const liveGpsSaveSoon = () => {
  if (liveGpsSaveTimer) return;
  liveGpsSaveTimer = setTimeout(() => {
    liveGpsSaveTimer = null;
    try {
      if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });
      writeFileSync(LIVE_GPS_FILE(), JSON.stringify([...liveGpsMem().values()].slice(0, 2000)), "utf-8");
    } catch (e) {
      console.error("[live-gps] save failed", e);
    }
  }, 3000);
};
const liveGpsGet: RequestHandler = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const u = await session.user(req).catch(() => null);
  if (!u) return res.status(401).json({ error: "unauthorized", pins: [] });
  const wanted = String(req.query.id || "").trim();
  const all = [...liveGpsMem().values()];
  const pins = wanted ? all.filter((p) => p.id === wanted) : all;
  res.json({ ok: true, pins });
};
const liveGpsPost: RequestHandler = async (req, res) => {
  const u = await session.user(req).catch(() => null);
  if (!u) return res.status(401).json({ error: "unauthorized" });
  const body = (req.body || {}) as Record<string, unknown>;
  const id = String(body.id || body.userId || "").trim().slice(0, 80);
  if (!id) return res.status(400).json({ error: "id required" });
  if (!session.owns(u, id)) return res.status(403).json({ error: "forbidden" });
  const mem = liveGpsMem();
  if (body.clear === true || body.on === false) {
    mem.delete(id);
    liveGpsSaveSoon();
    return res.json({ ok: true, cleared: true });
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: "bad coordinates" });
  }
  const prev = mem.get(id);
  const pin: LiveGpsPin = {
    id,
    name: String(body.name || prev?.name || "User").slice(0, 80),
    username: String(body.username || prev?.username || "").replace(/^@/, "").slice(0, 80),
    avatarUrl: body.avatarUrl != null ? String(body.avatarUrl).slice(0, 400) : (prev?.avatarUrl ?? null),
    lat,
    lng,
    at: Date.now(),
  };
  mem.set(id, pin);
  liveGpsSaveSoon();
  res.json({ ok: true, pin });
};
app.get("/api/live-gps", liveGpsGet);
app.post("/api/live-gps", liveGpsPost);
app.get("/api/live-location", liveGpsGet);
app.post("/api/live-location", liveGpsPost);

// ── GPS Live "Go": طلب موافقة قبل الذهاب (ذاكرة السيرفر) — GET/POST /api/live-gps-go ──
type GoGpsStatus = "pending" | "accepted" | "declined" | "cancelled" | "ended" | "expired";
type GoGpsReq = {
  id: string;
  fromId: string; fromName: string; fromUsername: string; fromAvatar: string | null;
  toId: string; toName: string; toUsername: string; toAvatar: string | null;
  status: GoGpsStatus; at: number; updatedAt: number;
  fromLat?: number; fromLng?: number; fromAt?: number; toLat?: number; toLng?: number;
};
const GOGPS_PENDING_TTL = 90_000;
const GOGPS_ACCEPTED_TTL = 6 * 60 * 60 * 1000;
const GOGPS_STALE_DRIVER_MS = 5 * 60 * 1000;
const GOGPS_DONE_KEEP = 3 * 60 * 1000;
const goGpsStore = (): Map<string, GoGpsReq> => {
  const g = globalThis as typeof globalThis & { __stooornaGoReqStore?: Map<string, GoGpsReq> };
  if (!g.__stooornaGoReqStore) g.__stooornaGoReqStore = new Map<string, GoGpsReq>();
  return g.__stooornaGoReqStore;
};
const goStr = (v: unknown, max = 200) => String(v ?? "").slice(0, max);
const goNum = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const goValidLL = (lat?: number, lng?: number) =>
  lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const goGpsSweep = () => {
  const store = goGpsStore();
  const now = Date.now();
  for (const [id, r] of store) {
    if (r.status === "pending" && now - r.at > GOGPS_PENDING_TTL) { r.status = "expired"; r.updatedAt = now; }
    if (r.status === "accepted") {
      const last = Math.max(r.updatedAt, r.fromAt || 0);
      if (now - r.at > GOGPS_ACCEPTED_TTL || now - last > GOGPS_STALE_DRIVER_MS) { r.status = "ended"; r.updatedAt = now; }
    }
    if (r.status !== "pending" && r.status !== "accepted" && now - r.updatedAt > GOGPS_DONE_KEEP) store.delete(id);
  }
};
const liveGpsGoGet: RequestHandler = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const u = await session.user(req).catch(() => null);
  if (!u) return res.status(401).json({ error: "unauthorized", incoming: [], outgoing: [] });
  const userId = String(req.query.userId || "").trim();
  if (!userId) return res.status(400).json({ error: "userId required" });
  if (!session.owns(u, userId)) return res.status(403).json({ error: "forbidden" });
  goGpsSweep();
  const incoming: GoGpsReq[] = [];
  const outgoing: GoGpsReq[] = [];
  for (const r of goGpsStore().values()) {
    if (r.toId === userId && (r.status === "pending" || r.status === "accepted")) incoming.push(r);
    if (r.fromId === userId) outgoing.push(r);
  }
  res.json({ incoming, outgoing });
};
const liveGpsGoPost: RequestHandler = async (req, res) => {
  const u = await session.user(req).catch(() => null);
  if (!u) return res.status(401).json({ error: "unauthorized" });
  const body = (req.body || {}) as any;
  goGpsSweep();
  const store = goGpsStore();
  const action = goStr(body.action, 20);
  const now = Date.now();

  if (action === "request") {
    const f = body.from || {};
    const t = body.to || {};
    const fromId = goStr(f.id, 80);
    const toId = goStr(t.id, 80);
    if (!fromId || !toId || fromId === toId) return res.status(400).json({ error: "bad request" });
    if (!session.owns(u, fromId)) return res.status(403).json({ error: "forbidden" });
    // طلب واحد حيّ لكل سائق: أي طلب أقدم منه ينتهي الآن
    for (const r of store.values()) {
      if (r.fromId === fromId && (r.status === "pending" || r.status === "accepted")) {
        r.status = r.status === "pending" ? "cancelled" : "ended";
        r.updatedAt = now;
      }
    }
    const fromLat = goNum(body.fromLat); const fromLng = goNum(body.fromLng);
    const toLat = goNum(t.lat); const toLng = goNum(t.lng);
    const rq: GoGpsReq = {
      id: `go_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      fromId, fromName: goStr(f.name || f.username || "User", 80), fromUsername: goStr(f.username, 80), fromAvatar: f.avatarUrl ? goStr(f.avatarUrl, 2000) : null,
      toId, toName: goStr(t.name || t.username || "User", 80), toUsername: goStr(t.username, 80), toAvatar: t.avatarUrl ? goStr(t.avatarUrl, 2000) : null,
      status: "pending", at: now, updatedAt: now,
    };
    if (goValidLL(fromLat, fromLng)) { rq.fromLat = fromLat; rq.fromLng = fromLng; rq.fromAt = now; }
    if (goValidLL(toLat, toLng)) { rq.toLat = toLat; rq.toLng = toLng; }
    store.set(rq.id, rq);
    return res.json({ request: rq });
  }

  const r = store.get(goStr(body.id, 80));
  if (!r) return res.status(404).json({ error: "not found" });
  const userId = goStr(body.userId, 80);
  if (!userId || !session.owns(u, userId)) return res.status(403).json({ error: "forbidden" });

  if (action === "respond") {
    if (userId !== r.toId) return res.status(403).json({ error: "not allowed" });
    if (r.status !== "pending") return res.json({ request: r });
    r.status = body.accept ? "accepted" : "declined";
    r.updatedAt = now;
    return res.json({ request: r });
  }
  if (action === "cancel" || action === "end") {
    if (userId !== r.fromId && userId !== r.toId) return res.status(403).json({ error: "not allowed" });
    if (r.status === "pending") r.status = "cancelled";
    else if (r.status === "accepted") r.status = "ended";
    r.updatedAt = now;
    return res.json({ request: r });
  }
  if (action === "position") {
    if (userId !== r.fromId) return res.status(403).json({ error: "not allowed" });
    const lat = goNum(body.lat); const lng = goNum(body.lng);
    if (!goValidLL(lat, lng)) return res.status(400).json({ error: "bad position" });
    r.fromLat = lat; r.fromLng = lng; r.fromAt = now;
    return res.json({ request: r });
  }
  return res.status(400).json({ error: "unknown action" });
};
app.get("/api/live-gps-go", liveGpsGoGet);
app.post("/api/live-gps-go", liveGpsGoPost);

// ── Live gifts: بث الهدايا لكل من في البث (ذاكرة السيرفر، نفس أسلوب live-chat / room-signal) ──
const liveGiftMem = () => {
  const g = globalThis as typeof globalThis & { __stooornaLiveGifts?: Map<string, Array<{ at: number; id: string; giftId: string; fromId: string; toUserId: string; toName: string; toAvatar: string; fromKey: string; count: number; price?: number; fromName?: string; fromAvatar?: string }>> };
  if (!g.__stooornaLiveGifts) g.__stooornaLiveGifts = new Map();
  return g.__stooornaLiveGifts;
};
// ── ترتيب الداعمين لكل بث (ذاكرة السيرفر): مجموع الـ Coins لكل مستخدم، يصفّر بعد 12 ساعة بدون دعم ──
const liveSupportMem = () => {
  const g = globalThis as typeof globalThis & { __stooornaLiveSupport?: Map<string, { at: number; map: Map<string, { name: string; coins: number; firstAt: number }> }> };
  if (!g.__stooornaLiveSupport) g.__stooornaLiveSupport = new Map();
  return g.__stooornaLiveSupport;
};
const supportLeaders = (room: string) => {
  const rec = liveSupportMem().get(room);
  if (!rec) return [];
  if (Date.now() - rec.at > 12 * 3600 * 1000) { liveSupportMem().delete(room); return []; }
  return [...rec.map.entries()]
    .map(([userId, v]) => ({ userId, name: v.name, coins: v.coins, firstAt: v.firstAt }))
    .sort((a, b) => b.coins - a.coins || a.firstAt - b.firstAt)
    .slice(0, 50)
    .map(({ firstAt: _f, ...r }) => r);
};
app.get("/api/live-gifts", (req, res) => {
  const room = String(req.query.room || req.query.channel || "").slice(0, 80);
  const now = Date.now();
  res.setHeader("Cache-Control", "no-store");
  // أول طلب بدون since: يرجّع الوقت الحالي فقط (ما نعيد هدايا قديمة لمن يدخل البث)
  if (req.query.since === undefined || req.query.since === "") return res.json({ ok: true, events: [], now, leaders: supportLeaders(room) });
  const since = Number(req.query.since) || 0;
  const events = (liveGiftMem().get(room) || []).filter((e) => e.at > since && now - e.at < 60000).slice(-30);
  const last = events.length ? events[events.length - 1].at : since;
  res.json({ ok: true, events, now: Math.max(last, since), leaders: supportLeaders(room) });
});
// ── Gift profit ledger (50/50) — file-backed so same account syncs across devices ──
type GiftProfitState = {
  appCoins: number;
  earnings: Map<string, number>;
  balances: Map<string, number>; // gift spend Coins (after deposit / convert)
  done: Set<string>;
  grants: Array<{ id: string; userId: string; coins: number; at: number; text: string }>;
};
const GIFT_PROFIT_FILE = () => join(ASSETS_DIR, "stooorna-gift-profits.json");
const loadGiftProfitDisk = (): { appCoins: number; earnings: Record<string, number>; balances: Record<string, number>; done: string[]; grants: Array<{ id: string; userId: string; coins: number; at: number; text: string }> } => {
  try {
    const p = GIFT_PROFIT_FILE();
    if (!existsSync(p)) return { appCoins: 0, earnings: {}, balances: {}, done: [], grants: [] };
    const raw = JSON.parse(readFileSync(p, "utf-8"));
    return {
      appCoins: Math.max(0, Math.floor(Number(raw?.appCoins) || 0)),
      earnings: raw?.earnings && typeof raw.earnings === "object" ? raw.earnings : {},
      balances: raw?.balances && typeof raw.balances === "object" ? raw.balances : {},
      done: Array.isArray(raw?.done) ? raw.done.map(String).slice(-3000) : [],
      grants: Array.isArray(raw?.grants) ? raw.grants.slice(-500) : [],
    };
  } catch {
    return { appCoins: 0, earnings: {}, balances: {}, done: [], grants: [] };
  }
};
const saveGiftProfitDisk = (mem: GiftProfitState) => {
  try {
    if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });
    const payload = {
      appCoins: mem.appCoins,
      earnings: Object.fromEntries(mem.earnings.entries()),
      balances: Object.fromEntries(mem.balances.entries()),
      done: [...mem.done].slice(-3000),
      grants: (mem.grants || []).slice(-500),
      updatedAt: Date.now(),
    };
    writeFileSync(GIFT_PROFIT_FILE(), JSON.stringify(payload), "utf-8");
  } catch (e) {
    console.error("[gift-profits] save failed", e);
  }
};
const giftProfitMem = (): GiftProfitState => {
  const g = globalThis as typeof globalThis & { __stooornaGiftProfits?: GiftProfitState };
  if (!g.__stooornaGiftProfits) {
    const disk = loadGiftProfitDisk();
    g.__stooornaGiftProfits = {
      appCoins: disk.appCoins,
      earnings: new Map(Object.entries(disk.earnings).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v) || 0))])),
      balances: new Map(Object.entries(disk.balances).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v) || 0))])),
      done: new Set(disk.done),
      grants: Array.isArray(disk.grants) ? disk.grants : [],
    };
  }
  return g.__stooornaGiftProfits;
};
const giftProfitTouch = () => saveGiftProfitDisk(giftProfitMem());

/** Normalize recipient id so owner earnings land on one key across devices. */
const OWNER_IDS = new Set(["stooorna", "stooorna@mail.com"]);
const creditRecipientEarnings = (toUserId: string, amount: number) => {
  if (!(amount > 0) || !toUserId) return;
  const mem = giftProfitMem();
  const id = String(toUserId).trim();
  mem.earnings.set(id, (mem.earnings.get(id) || 0) + amount);
  const low = id.toLowerCase();
  // Mirror owner aliases so login with username OR email still sees support
  if (OWNER_IDS.has(low) || low.includes("stooorna")) {
    for (const alias of ["stooorna", "Stooorna"]) {
      if (alias !== id) mem.earnings.set(alias, (mem.earnings.get(alias) || 0) + amount);
    }
  }
};


// ═══════════════════════════ اقتصاد الهدايا — نسخة محميّة ═══════════════════════════
// القاعدة: الهوية من الجلسة فقط، والأرباح لا تُنشأ إلا مقابل خصم فعلي من رصيد السيرفر.
const session = createSession(users_me_get_148 as unknown as RequestHandler, OWNER_IDS);
registerLiveBurstRoutes(app, { getUserId: async (req) => (await session.user(req))?.id ?? null }); // EMOJI-BURST-PATCH
registerAppReleaseRoutes(app, { getUser: (req) => session.user(req), ownerIds: OWNER_IDS }); // APP-RELEASES-PATCH
const allow = makeLimiter();
const deny = (res: Response, code: number, error: string) => res.status(code).json({ ok: false, error });
const needUser = async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const u = await session.user(req);
  if (!u) { deny(res, 401, "unauthorized"); return null; }
  return u;
};
const needAdmin = async (req: Request, res: Response) => {
  const u = await needUser(req, res);
  if (!u) return null;
  if (!session.isAdmin(u)) { deny(res, 403, "forbidden"); return null; }
  return u;
};
const guarded = (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error("[gifts] handler error:", e instanceof Error ? e.message : "unknown");
    if (!res.headersSent) deny(res, 500, "server_error");
  });
};
const maxOf = (m: Map<string, number>, keys: string[]) => {
  let v = 0;
  for (const [k, n] of m) if (keys.includes(normId(k))) v = Math.max(v, n);
  return v;
};

// ── LIVE-ICONS-PATCH: owner switch that shows / hides the Coins ($) + Gifts icons in video & voice LIVE for everyone ──
// GET  /api/app-settings/live-icons -> { ok, visible }  (public, never cached)
// POST /api/app-settings/live-icons { visible: boolean } (owner/admin only) — saved to disk so it survives restarts/redeploys
const APP_SETTINGS_FILE = () => join(ASSETS_DIR, "stooorna-app-settings.json");
const loadAppSettings = (): { liveIconsVisible: boolean } => {
  const g = globalThis as typeof globalThis & { __stooornaAppSettings?: { liveIconsVisible: boolean } };
  if (!g.__stooornaAppSettings) {
    let visible = true;
    try {
      const p = APP_SETTINGS_FILE();
      if (existsSync(p)) {
        const raw = JSON.parse(readFileSync(p, "utf-8"));
        if (raw && raw.liveIconsVisible === false) visible = false;
      }
    } catch (e) {
      console.error("[app-settings] load failed", e);
    }
    g.__stooornaAppSettings = { liveIconsVisible: visible };
  }
  return g.__stooornaAppSettings;
};
const saveAppSettings = () => {
  try {
    if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true });
    writeFileSync(APP_SETTINGS_FILE(), JSON.stringify({ ...loadAppSettings(), updatedAt: Date.now() }), "utf-8");
  } catch (e) {
    console.error("[app-settings] save failed", e);
  }
};
app.get("/api/app-settings/live-icons", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.json({ ok: true, visible: loadAppSettings().liveIconsVisible });
});
app.post("/api/app-settings/live-icons", guarded(async (req, res) => {
  if (!(await needAdmin(req, res))) return;
  const v = (req.body as { visible?: unknown } | undefined)?.visible;
  if (typeof v !== "boolean") return deny(res, 400, "visible_must_be_boolean");
  loadAppSettings().liveIconsVisible = v;
  saveAppSettings();
  res.json({ ok: true, visible: v });
}));

app.get("/api/gifts/profits", guarded(async (req, res) => {
  if (!(await needAdmin(req, res))) return;
  const mem = giftProfitMem();
  res.json({ ok: true, coins: mem.appCoins, usd: mem.appCoins / 100 });
}));

function readOwn(u: NonNullable<Awaited<ReturnType<typeof session.user>>>) {
  const mem = giftProfitMem();
  const keys = session.keysOf(u);
  return { coins: maxOf(mem.earnings, keys), balance: maxOf(mem.balances, keys) };
}
app.get("/api/gifts/earnings", guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  const asked = String(req.query.userId || "");
  if (asked && !session.owns(u, asked)) return deny(res, 403, "forbidden");
  const o = readOwn(u);
  res.json({ ok: true, userId: u.id, coins: o.coins, balance: o.balance, usd: o.coins / 100 });
}));
app.get("/api/gifts/balance", guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  const asked = String(req.query.userId || "");
  if (asked && !session.owns(u, asked)) return deny(res, 403, "forbidden");
  const o = readOwn(u);
  res.json({ ok: true, userId: u.id, balance: o.balance, earnings: o.coins });
}));
// أسماء بديلة يستدعيها الـ Wallet في وضع الدفع الحقيقي
app.get("/api/coins/balance", guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  res.json({ ok: true, balance: readOwn(u).balance });
}));
app.get("/api/coins/earnings", guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  res.json({ ok: true, earnings: readOwn(u).coins });
}));

/** كان يسمح لأي زائر بإنشاء أرباح لأي حساب. السيرفر يقسم 50/50 بنفسه عند الخصم، فلا حاجة له من العميل. */
app.post("/api/gifts/profit-split", guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  if (!session.isAdmin(u)) return res.json({ ok: true, applied: false, deprecated: true });
  const body = (req.body || {}) as Record<string, unknown>;
  const toUserId = String(body.toUserId || "").slice(0, 80);
  const total = Math.max(0, Math.floor(Number(body.total) || 0));
  const key = String(body.dedupeKey || "").slice(0, 180);
  if (!toUserId || total <= 0 || !key) return deny(res, 400, "toUserId, total, dedupeKey required");
  const mem = giftProfitMem();
  const dk = `admin_split_${key}`;
  if (mem.done.has(dk)) return res.json({ ok: true, applied: false });
  mem.done.add(dk);
  const toApp = Math.floor(total / 2);
  mem.appCoins += toApp;
  creditRecipientEarnings(toUserId, total - toApp);
  giftProfitTouch();
  res.json({ ok: true, applied: true, toApp, toRecipient: total - toApp });
}));

/** تحويل أرباح الدعم → رصيد Coins للمستخدم نفسه فقط. */
const convertOwnEarnings = guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  if (!allow(`conv:${u.id}`, 10, 60_000)) return deny(res, 429, "rate_limited");
  const body = (req.body || {}) as Record<string, unknown>;
  const mem = giftProfitMem();
  const keys = session.keysOf(u);
  const ek = pickKey(mem.earnings, u, keys);
  const earn = mem.earnings.get(ek) || 0;
  let amount = Math.max(0, Math.floor(Number(body.amount) || 0));
  if (amount <= 0) amount = earn;
  if (amount <= 0) return deny(res, 400, "no earnings");
  if (amount > earn) amount = earn;
  const bk = pickKey(mem.balances, u, keys);
  mem.earnings.set(ek, earn - amount);
  mem.balances.set(bk, (mem.balances.get(bk) || 0) + amount);
  giftProfitTouch();
  res.json({ ok: true, converted: amount, earnings: mem.earnings.get(ek) || 0, balance: mem.balances.get(bk) || 0 });
});
app.post("/api/gifts/convert-earnings", convertOwnEarnings);
app.post("/api/support/convert", convertOwnEarnings);

/** كان العميل يضبط رصيده بنفسه. الآن: الرصيد يتغير فقط من الخصم/الويب هوك/الأدمن — طلب العميل يُتجاهل. */
app.post("/api/gifts/balance", guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  const mem = giftProfitMem();
  const body = (req.body || {}) as Record<string, unknown>;
  if (session.isAdmin(u) && body.userId && (body.delta != null || body.add != null || body.balance != null)) {
    const target = String(body.userId).slice(0, 80);
    if (body.balance != null) mem.balances.set(target, Math.max(0, Math.floor(Number(body.balance) || 0)));
    else mem.balances.set(target, Math.max(0, (mem.balances.get(target) || 0) + Math.floor(Number(body.delta ?? body.add) || 0)));
    giftProfitTouch();
  }
  const o = readOwn(u);
  res.json({ ok: true, balance: o.balance, earnings: o.coins });
}));

// ── شراء Coins عبر Polar: الرابط يُربط بالمستخدم المسجّل (وليس userId من العميل)، والرصيد يُضاف من الويب هوك فقط ──
app.get("/api/polar/packs", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, packs: COIN_PACKS });
});
app.post("/api/polar/checkout", guarded(async (req, res) => {
  if (!polarConfigured()) return deny(res, 503, "payments not configured");
  const u = await needUser(req, res);
  if (!u) return;
  if (!allow(`co:${u.id}`, 10, 10 * 60_000)) return deny(res, 429, "rate_limited");
  const coins = Math.floor(Number((req.body || {}).coins) || 0);
  if (!COIN_PACKS.includes(coins)) return deny(res, 400, "invalid pack");
  const origin = process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`;
  try {
    const reqOrigin = String(req.get("origin") || "");
    const embedOrigin = /^https?:\/\/[^/]+$/i.test(reqOrigin) ? reqOrigin : undefined;
    const c = await createCheckout({ coins, userId: u.id, successUrl: `${origin}/?coins_paid=1`, embedOrigin });
    res.json({ ok: true, url: c.url });
  } catch (e) {
    console.error("[polar] checkout failed", e);
    deny(res, 502, "checkout failed");
  }
}));

// ── شراء Coins عبر Google Play: الهوية من الجلسة فقط (وليس userId من العميل)، والتحقق من رمز الشراء عند Google، ونفس رصيد/دفتر Polar ──
app.post("/api/google-play/verify", guarded(async (req, res) => {
  if (!googlePlayConfigured()) return deny(res, 503, "google play not configured");
  const u = await needUser(req, res);
  if (!u) return;
  if (!allow(`gp:${u.id}`, 20, 10 * 60_000)) return deny(res, 429, "rate_limited");
  const body = (req.body || {}) as Record<string, unknown>;
  const mem = giftProfitMem();
  const out = await verifyAndCreditGooglePlay(
    { userId: u.id, sku: String(body.sku || "").slice(0, 40), purchaseToken: String(body.purchaseToken || "") },
    {
      alreadyProcessed: (k) => mem.done.has(k),
      creditCoins: ({ userId, coins, key }) => {
        mem.done.add(key);
        const next = Math.max(0, (mem.balances.get(userId) || 0) + coins);
        mem.balances.set(userId, next);
        giftProfitTouch();
        return next;
      },
      getBalance: (userId) => mem.balances.get(userId) || 0,
    },
  );
  if (!out.ok) return deny(res, out.status, out.error);
  res.json({ ok: true, balance: readOwn(u).balance, coins: out.coins });
}));

// ── منح Coins: للأدمن فقط (كانت مفتوحة لأي زائر) ──
function pushOwnerGrant(userId: string, coins: number, grantId?: string) {
  const uid = String(userId || "").slice(0, 80);
  const n = Math.floor(Number(coins) || 0);
  if (!uid || n < 1 || n > 1_000_000) return { ok: false as const, error: "coins must be 1..1000000" };
  const mem = giftProfitMem();
  const id = String(grantId || `own_${Date.now().toString(36)}`).slice(0, 80);
  if ((mem.grants || []).some((g) => g.id === id)) {
    return { ok: true as const, id, balance: mem.balances.get(uid) || 0, duplicate: true };
  }
  mem.balances.set(uid, (mem.balances.get(uid) || 0) + n);
  mem.grants = mem.grants || [];
  mem.grants.push({ id, userId: uid, coins: n, at: Date.now(), text: "تم اعطاؤك دعم من التطبيق" });
  mem.grants = mem.grants.slice(-500);
  giftProfitTouch();
  return { ok: true as const, id, balance: mem.balances.get(uid) || 0, coins: n, text: "تم اعطاؤك دعم من التطبيق" };
}
const grantHandler = guarded(async (req, res) => {
  const a = await needAdmin(req, res);
  if (!a) return;
  const body = (req.body || {}) as Record<string, unknown>;
  const out = pushOwnerGrant(String(body.userId || ""), Number(body.coins), body.grantId ? String(body.grantId) : undefined);
  console.log("[grant]", a.id, "→", String(body.userId || ""), Number(body.coins));
  if (!out.ok) return res.status(400).json(out);
  res.json(out);
});
const listGrants = guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  const mem = giftProfitMem();
  const asked = String(req.query.userId || "");
  const admin = session.isAdmin(u);
  const keys = session.keysOf(u);
  let rows = mem.grants || [];
  if (admin && asked) rows = rows.filter((g) => normId(g.userId) === normId(asked));
  else if (!admin) rows = rows.filter((g) => keys.includes(normId(g.userId)));
  res.json({ ok: true, grants: rows.slice(-50) });
});
app.post("/api/owner/grant-coins", grantHandler);
app.post("/api/coins/grant", grantHandler);
app.post("/api/gifts/grant", grantHandler);
app.get("/api/owner/grant-coins", listGrants);
app.get("/api/coins/grants", listGrants);

/** ربح الأونر يُحسب على السيرفر عند الخصم؛ ما عاد العميل يضيف شيئاً. */
app.post("/api/owner/support-profit", guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  res.json({ ok: true, credited: 0, deprecated: true });
}));
app.get("/api/owner/support-profit", guarded(async (req, res) => {
  if (!(await needAdmin(req, res))) return;
  const mem = giftProfitMem();
  res.json({ ok: true, coins: mem.appCoins, usd: mem.appCoins / 100 });
}));

// ── الخصم الفعلي للهدية: مصدر الحقيقة الوحيد للأرباح ──
type ChargeIn = { giftId: string; toUserId: string; price: number; count: number; dedupeKey: string };
type SessionU = NonNullable<Awaited<ReturnType<typeof session.user>>>;
function chargeGift(u: SessionU, a: ChargeIn): { ok: true; balance: number; duplicate?: boolean } | { ok: false; status: number; error: string } {
  if (!a.giftId || a.giftId.length > 40) return { ok: false, status: 400, error: "invalid gift" };
  if (!Number.isSafeInteger(a.price) || a.price < 1 || a.price > 100000) return { ok: false, status: 400, error: "invalid price" };
  if (!Number.isSafeInteger(a.count) || a.count < 1 || a.count > 50) return { ok: false, status: 400, error: "invalid count" };
  if (!a.toUserId || a.toUserId.length > 80) return { ok: false, status: 400, error: "invalid recipient" };
  if (session.owns(u, a.toUserId)) return { ok: false, status: 400, error: "cannot gift yourself" };
  const mem = giftProfitMem();
  const keys = session.keysOf(u);
  const bk = pickKey(mem.balances, u, keys);
  const dupKey = `${u.id}|${a.giftId}|${normId(a.toUserId)}|${a.price}|${a.count}|${a.dedupeKey}`;
  if (seenRecently(dupKey)) return { ok: true, duplicate: true, balance: mem.balances.get(bk) || 0 };
  const cost = a.price * a.count;
  // ===== قسم متزامن: فحص + خصم + تقسيم بدون أي await =====
  let bal = mem.balances.get(bk) || 0;
  if (bal < cost) {
    const ek = pickKey(mem.earnings, u, keys);
    const earn = mem.earnings.get(ek) || 0;
    const take = Math.min(earn, cost - bal); // نفس منطق العميل: العجز فقط من أرباح الدعم
    if (bal + take < cost) return { ok: false, status: 402, error: "insufficient balance" };
    mem.earnings.set(ek, earn - take);
    bal += take;
  }
  mem.balances.set(bk, bal - cost);
  const toApp = Math.floor(cost / 2);
  mem.appCoins += toApp;
  creditRecipientEarnings(a.toUserId, cost - toApp);
  giftProfitTouch();
  markSeen(dupKey);
  recordPaid({ userId: u.id, to: a.toUserId, giftId: a.giftId, count: a.count, price: a.price });
  return { ok: true, balance: bal - cost };
}
const parseCharge = (body: Record<string, unknown>): ChargeIn => ({
  giftId: String(body.giftId || "").slice(0, 40),
  toUserId: String(body.toUserId || "").slice(0, 80),
  price: Number(body.price),
  count: Number(body.count ?? 1),
  dedupeKey: String(body.dedupeKey || "").slice(0, 140),
});

app.post("/api/support/spend", guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  if (!allow(`spend:${u.id}`, 40, 10_000)) return deny(res, 429, "rate_limited");
  // balanceAfter / ownerHalf / userId القادمة من العميل تُتجاهل بالكامل
  const r = chargeGift(u, parseCharge((req.body || {}) as Record<string, unknown>));
  if (!r.ok) return deny(res, r.status, r.error);
  res.json({ ok: true, balance: r.balance, deducted: r.duplicate ? 0 : undefined });
}));

app.post("/api/live-gifts", guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  if (!allow(`lg:${u.id}`, 40, 10_000)) return deny(res, 429, "rate_limited");
  const body = (req.body || {}) as Record<string, unknown>;
  const room = String(body.room || body.channel || "").slice(0, 80);
  const c = parseCharge(body);
  if (!room || !c.giftId) return deny(res, 400, "room and giftId required");
  const claimed = [true, "true"].includes(body.alreadyDeducted as never) || [true, "true"].includes(body.supportPatch as never);
  if (claimed) {
    // العميل يقول إنه دُفع مسبقاً عبر /api/support/spend — نتحقق من وجود خصم مطابق ونستهلكه مرة واحدة
    if (!Number.isSafeInteger(c.price) || !Number.isSafeInteger(c.count) || !takePaid({ userId: u.id, to: c.toUserId, giftId: c.giftId, count: c.count, price: c.price })) {
      return deny(res, 402, "gift not paid");
    }
  } else {
    const r = chargeGift(u, c);
    if (!r.ok) return deny(res, r.status, r.error);
    if (r.duplicate) return res.json({ ok: true, duplicate: true }); // إعادة إرسال فورية: لا بث مكرر
  }
  const count = Math.max(1, Math.min(10, c.count));
  const fromId = body.fromId && session.owns(u, body.fromId) ? String(body.fromId).slice(0, 80) : u.id;
  const toName = String(body.toName || "").slice(0, 60);
  const toAvatar = String(body.toAvatar || "").slice(0, 300);
  const now = Date.now();
  const mem = liveGiftMem();
  const prev = mem.get(room) || [];
  const lastAt = prev.length ? prev[prev.length - 1].at : 0;
  const at = Math.max(now, lastAt + 1);
  const list = prev.filter((e) => now - e.at < 60000);
  const eventId = String(body.id || `lg_${at}`).slice(0, 60);
  // SUPPORT-LIVE-PATCH: who sent the gift (name + picture) travels with every gift event
  const fromNameEv = String(body.fromName || "").slice(0, 60);
  const fromAvatarRaw = String((fromId === u.id ? ((u as any).avatarUrl || (u as any).image || "") : "") || body.fromAvatar || "");
  const fromAvatarEv = fromAvatarRaw.length <= 300 ? fromAvatarRaw : "";
  list.push({ at, id: eventId, giftId: c.giftId, fromId, fromName: fromNameEv, fromAvatar: fromAvatarEv, toUserId: c.toUserId, toName, toAvatar, fromKey: String(body.fromKey || "").slice(0, 60), count, price: Number.isFinite(c.price) ? c.price : undefined });
  mem.set(room, list.slice(-120));
  // ترتيب الداعمين — الآن مبني على خصم مؤكد فقط
  const sup = liveSupportMem();
  const rec = sup.get(room) || { at: now, map: new Map() };
  const cur = rec.map.get(fromId) || { name: "", coins: 0, firstAt: now };
  const nm = String(body.fromName || "").slice(0, 60);
  cur.coins += c.price * c.count;
  if (nm) cur.name = nm;
  rec.map.set(fromId, cur);
  rec.at = now;
  sup.set(room, rec);
  try { liveBattleCount(room, c.toUserId, (Number.isFinite(c.price) ? c.price : 0) * count, fromId, fromNameEv, fromAvatarEv); } catch { /* ignore */ } // LIVE-BATTLE: round score kept by the server
  res.json({ ok: true, at });
}));

// ═══════════════ LIVE BATTLE — game round between two split hosts: the SERVER keeps the score ═══════════════
// A (owner of the split) registers the round; every gift posted to /api/live-gifts is added to the right side here,
// and every phone (hosts, supporters, viewers of both rooms) reads the same line from GET /api/live-battle.
type BattleSup = { name: string; avatarUrl: string; coins: number; firstAt: number };
type LiveBattleRow = { id: string; a: string; b: string; startedAt: number; endsAt: number; left: number; right: number; supL?: Map<string, BattleSup>; supR?: Map<string, BattleSup>; tapL?: number; tapR?: number };
const LIVE_BATTLE_MS = 4 * 60 * 1000;
// COUNTDOWN-SERVER-PATCH: the 5..1 countdown before a round is kept by the SERVER too (a signal between the two phones can be lost;
// two plain HTTP calls to the same server cannot disagree). Whoever taps Ok posts `ready`; BOTH phones read `countdown.remainMs`.
const LIVE_BATTLE_COUNTDOWN_MS = 5000;
type LiveBattleCountdown = { id: string; a: string; b: string; startAt: number };
const liveBattleCountdownMem = (): Map<string, LiveBattleCountdown> => {
  const g = globalThis as typeof globalThis & { __stooornaLiveBattleCd?: Map<string, LiveBattleCountdown> };
  if (!g.__stooornaLiveBattleCd) g.__stooornaLiveBattleCd = new Map();
  return g.__stooornaLiveBattleCd;
};
// STOP-GAME-SERVER-PATCH: "Stop Game" is kept by the SERVER. Every phone polls GET /api/live-battle every 0.5s and gets `stopped: [ids]`,
// so the round stops on the other host, on supporters and on viewers of both rooms even if a signal between phones was lost.
type LiveBattleStop = { id: string; a: string; b: string; at: number };
const liveBattleStopMem = (): Map<string, LiveBattleStop> => {
  const g = globalThis as typeof globalThis & { __stooornaLiveBattleStop?: Map<string, LiveBattleStop> };
  if (!g.__stooornaLiveBattleStop) g.__stooornaLiveBattleStop = new Map();
  return g.__stooornaLiveBattleStop;
};
const LIVE_BATTLE_STOP_KEEP_MS = 3 * 60 * 1000;
const LIVE_BATTLE_KEEP_MS = 12_000;
const liveBattleMem = (): Map<string, LiveBattleRow> => {
  const g = globalThis as typeof globalThis & { __stooornaLiveBattle?: Map<string, LiveBattleRow> };
  if (!g.__stooornaLiveBattle) g.__stooornaLiveBattle = new Map();
  return g.__stooornaLiveBattle;
};
const bNorm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const bSameHost = (a: unknown, b: unknown) => !!bNorm(a) && bNorm(a) === bNorm(b);
/** gift room keys look like `gifts-<hostId>` */
const bRoomOf = (room: string, hostId: string) => { const r = bNorm(room); const h = bNorm(hostId); return !!r && !!h && (r === h || r.endsWith(h)); };
const liveBattlePurge = () => {
  const now = Date.now();
  for (const [k, v] of liveBattleMem()) if (now - v.endsAt > 10 * 60 * 1000) liveBattleMem().delete(k);
};
// SUPPORT-LIVE-PATCH: first three supporters of each side for the running round
function bAddSup(row: LiveBattleRow, side: "left" | "right", fromId: string, name: string, avatar: string, coins: number) {
  if (!fromId || !(coins > 0)) return;
  const key = side === "left" ? "supL" : "supR";
  const m = (row[key] = row[key] || new Map<string, BattleSup>());
  const cur = m.get(fromId) || { name: "", avatarUrl: "", coins: 0, firstAt: Date.now() };
  cur.coins += coins;
  if (name) cur.name = name;
  if (avatar) cur.avatarUrl = avatar;
  m.set(fromId, cur);
}
function bTop(row: LiveBattleRow) {
  const pick = (m?: Map<string, BattleSup>) => [...(m || new Map<string, BattleSup>()).entries()]
    .sort((x, y) => y[1].coins - x[1].coins || x[1].firstAt - y[1].firstAt)
    .slice(0, 3)
    .map(([userId, v]) => ({ userId, name: v.name, avatarUrl: v.avatarUrl || null, coins: v.coins }));
  return { left: pick(row.supL), right: pick(row.supR) };
}
function liveBattleCount(room: string, toUserId: string, coins: number, fromId = "", fromName = "", fromAvatar = "") {
  if (!room || !(coins > 0)) return;
  const now = Date.now();
  for (const row of liveBattleMem().values()) {
    if (now >= row.endsAt) continue;
    if (bRoomOf(room, row.a)) {
      // gift in A's room: addressed to the guest B -> B, everything else -> A
      if (bSameHost(toUserId, row.b)) { row.right += coins; bAddSup(row, "right", fromId, fromName, fromAvatar, coins); } else { row.left += coins; bAddSup(row, "left", fromId, fromName, fromAvatar, coins); }
    } else if (bRoomOf(room, row.b)) {
      row.right += coins; bAddSup(row, "right", fromId, fromName, fromAvatar, coins); // gift in B's room -> B
    }
  }
}
// HEARTS-PATCH: every 10 taps on the screen = +1 point on that side's line (a helper for the win). Never counted as gift coins / profit.
const bHeartBonus = (taps?: number) => Math.floor(Math.max(0, Number(taps) || 0) / 10);
function liveBattleHearts(room: string, n: number) {
  if (!room || !(n > 0)) return;
  const now = Date.now();
  for (const row of liveBattleMem().values()) {
    if (now >= row.endsAt) continue;
    if (bRoomOf(room, row.a)) row.tapL = (row.tapL || 0) + n; // taps in A's room -> A
    else if (bRoomOf(room, row.b)) row.tapR = (row.tapR || 0) + n; // taps in B's room -> B
  }
}
const liveBattleView = (row: LiveBattleRow) => {
  const now = Date.now();
  const running = now < row.endsAt;
  if (!running && now - row.endsAt > LIVE_BATTLE_KEEP_MS) return null;
  const L = row.left + bHeartBonus(row.tapL); // HEARTS-PATCH: gifts + hearts bonus
  const R = row.right + bHeartBonus(row.tapR);
  const winner = running ? null : L === R ? "draw" : L > R ? "left" : "right";
  return { id: row.id, a: row.a, b: row.b, phase: running ? "running" : "ended", left: L, right: R, remainMs: Math.max(0, row.endsAt - now), winner, top: bTop(row) };
};
app.get("/api/live-battle", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const hostId = String(req.query.hostId || "").slice(0, 80);
  if (!hostId) return res.json({ ok: true, battle: null });
  liveBattlePurge();
  let best: LiveBattleRow | null = null;
  for (const row of liveBattleMem().values()) {
    if ((bSameHost(row.a, hostId) || bSameHost(row.b, hostId)) && (!best || row.startedAt > best.startedAt)) best = row;
  }
  // COUNTDOWN-SERVER-PATCH: a countdown that has not reached zero yet for a round of this host
  let cd: LiveBattleCountdown | null = null;
  const nowCd = Date.now();
  for (const c of liveBattleCountdownMem().values()) {
    if ((bSameHost(c.a, hostId) || bSameHost(c.b, hostId)) && nowCd < c.startAt && (!cd || c.startAt > cd.startAt)) cd = c;
  }
  // STOP-GAME-SERVER-PATCH: rounds of this host that were stopped lately
  const stopped: string[] = [];
  for (const [k, st] of liveBattleStopMem()) {
    if (nowCd - st.at > LIVE_BATTLE_STOP_KEEP_MS) { liveBattleStopMem().delete(k); continue; }
    if (bSameHost(st.a, hostId) || bSameHost(st.b, hostId)) stopped.push(st.id);
  }
  if (best && stopped.includes(best.id)) best = null;
  if (cd && stopped.includes(cd.id)) cd = null;
  res.json({ ok: true, battle: best ? liveBattleView(best) : null, countdown: cd ? { id: cd.id, remainMs: Math.max(0, cd.startAt - nowCd) } : null, stopped });
});
app.post("/api/live-battle", guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  if (!allow(`lb:${u.id}`, 30, 10_000)) return deny(res, 429, "rate_limited");
  const body = (req.body || {}) as Record<string, unknown>;
  const action = String(body.action || "start");
  if (action !== "start" && action !== "end" && action !== "ready" && action !== "stop") return deny(res, 400, "bad action");
  const id = String(body.id || "").slice(0, 60);
  if (action === "stop") {
    // STOP-GAME-SERVER-PATCH: either host cancels the round (or its countdown) -> gone for everybody at once, nobody leaves the split
    if (!id) return deny(res, 400, "id required");
    const row = liveBattleMem().get(id);
    const cdRow0 = liveBattleCountdownMem().get(id);
    const a0 = row?.a || cdRow0?.a || String(body.a || "").slice(0, 80);
    const b0 = row?.b || cdRow0?.b || String(body.b || "").slice(0, 80);
    if (!a0 || !b0) return deny(res, 400, "a and b required");
    if (!session.owns(u, a0) && !session.owns(u, b0)) return deny(res, 403, "forbidden");
    const smem = liveBattleStopMem();
    const tnow0 = Date.now();
    for (const [k, st] of smem) if (tnow0 - st.at > LIVE_BATTLE_STOP_KEEP_MS) smem.delete(k);
    smem.set(id, { id, a: a0, b: b0, at: tnow0 });
    liveBattleMem().delete(id);
    liveBattleCountdownMem().delete(id);
    return res.json({ ok: true });
  }
  // STOP-GAME-SERVER-PATCH: a stopped round id can never be started / counted down again (late retries)
  if ((action === "start" || action === "ready") && liveBattleStopMem().has(id)) return res.json({ ok: true, stopped: true });
  if (action === "end") {
    // the split closed: forget the round so a later split never shows it again
    const row = liveBattleMem().get(id);
    if (row && (session.owns(u, row.a) || session.owns(u, row.b))) liveBattleMem().delete(id);
    // STOP-GAME-PATCH: "Stop Game" can also hit while the 5..1 countdown is still running -> forget that countdown too
    const cdRow = liveBattleCountdownMem().get(id);
    if (cdRow && (session.owns(u, cdRow.a) || session.owns(u, cdRow.b))) liveBattleCountdownMem().delete(id);
    return res.json({ ok: true });
  }
  const a = String(body.a || "").slice(0, 80);
  const b = String(body.b || "").slice(0, 80);
  if (!id || !a || !b || bSameHost(a, b)) return deny(res, 400, "id, a and b required");
  if (!session.owns(u, a) && !session.owns(u, b)) return deny(res, 403, "forbidden");
  if (action === "ready") {
    // COUNTDOWN-SERVER-PATCH: the other host tapped Ok -> one shared 5s countdown for this pair (first call wins, repeats are ignored)
    const cmem = liveBattleCountdownMem();
    const tnow = Date.now();
    for (const [k, c] of cmem) if (tnow - c.startAt > 60_000) cmem.delete(k);
    if (!cmem.has(id)) {
      for (const [k, c] of cmem) {
        if (bSameHost(c.a, a) || bSameHost(c.b, a) || bSameHost(c.a, b) || bSameHost(c.b, b)) cmem.delete(k);
      }
      cmem.set(id, { id, a, b, startAt: tnow + LIVE_BATTLE_COUNTDOWN_MS });
    }
    return res.json({ ok: true, remainMs: Math.max(0, cmem.get(id)!.startAt - tnow) });
  }
  const mem = liveBattleMem();
  if (mem.has(id)) return res.json({ ok: true, duplicate: true });
  for (const [k, row] of mem) {
    if (bSameHost(row.a, a) || bSameHost(row.b, a) || bSameHost(row.a, b) || bSameHost(row.b, b)) mem.delete(k);
  }
  const now = Date.now();
  mem.set(id, { id, a, b, startedAt: now, endsAt: now + LIVE_BATTLE_MS, left: 0, right: 0 });
  res.json({ ok: true });
}));

// ═══════════════ LIVE HEARTS — taps on the screen of a live: shared counter + round helper ═══════════════
// Everybody in a live room taps the screen -> hearts. The room total is kept here (everyone sees the same number),
// and while a round runs every 10 taps move that room's line by +1 (see liveBattleHearts / bHeartBonus above).
const liveHeartsMem = (): Map<string, { total: number; at: number }> => {
  const g = globalThis as typeof globalThis & { __stooornaLiveHearts?: Map<string, { total: number; at: number }> };
  if (!g.__stooornaLiveHearts) g.__stooornaLiveHearts = new Map();
  return g.__stooornaLiveHearts;
};
app.get("/api/live-hearts", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const room = bNorm(String(req.query.room || "").slice(0, 80));
  const row = room ? liveHeartsMem().get(room) : null;
  res.json({ ok: true, total: row ? row.total : 0 });
});
app.post("/api/live-hearts", guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  if (!allow(`hr:${u.id}`, 40, 10_000)) return deny(res, 429, "rate_limited");
  const body = (req.body || {}) as Record<string, unknown>;
  const roomRaw = String(body.room || "").slice(0, 80);
  const room = bNorm(roomRaw);
  if (!room) return deny(res, 400, "room required");
  const mem = liveHeartsMem();
  const now = Date.now();
  if (mem.size > 500) for (const [k, v] of mem) if (now - v.at > 6 * 60 * 60 * 1000) mem.delete(k);
  if (String(body.action || "") === "reset") {
    // only the owner of the live starts it from zero
    if (!session.owns(u, roomRaw)) return deny(res, 403, "forbidden");
    mem.set(room, { total: 0, at: now });
    return res.json({ ok: true, total: 0 });
  }
  const n = Math.max(1, Math.min(60, Math.floor(Number(body.n) || 0)));
  if (!(n > 0)) return deny(res, 400, "n required");
  const cur = mem.get(room) || { total: 0, at: now };
  cur.total += n;
  cur.at = now;
  mem.set(room, cur);
  try { liveBattleHearts(roomRaw, n); } catch { /* ignore */ }
  res.json({ ok: true, total: cur.total });
}));

// ── سحب أرباح الدعم (بنك/PayPal): ملف مستقل server/withdrawals.ts ──
registerWithdrawalRoutes(app, {
  dataDir: process.env.WITHDRAW_DATA_DIR || join(ASSETS_DIR, "_private", "withdrawals"),
  earnings: mapEarningsAdapter(() => giftProfitMem().earnings, () => giftProfitTouch()),
  getUser: async (req) => {
    const u = await session.user(req);
    return u ? { id: u.id, username: u.username, email: u.email } : null;
  },
  isAdmin: (u) => session.isAdmin({ id: u.id, username: String(u.username || "").toLowerCase(), email: String(u.email || "").toLowerCase() }),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
});


// ═══════════════════════════ VOICE INVITE — دعوة البث الصوتي ═══════════════════════════
// صاحب البث الصوتي يستدعي أي شخص أونلاين (مو شرط يكون في بث). الدعوة تُحفظ في صندوق وارد المدعو
// في ذاكرة السيرفر 45 ثانية، والمدعو يسحبها من أي صفحة في التطبيق (VoiceInviteGlobalWatcher).
// الهوية دائماً من الجلسة: المضيف = المستخدم المسجّل، ولا يمكن انتحال hostId من العميل.
type VoiceInviteRow = { id: string; fromId: string; fromName: string; toId: string; hostId: string; hostName: string; hostUsername: string; hostAvatar: string | null; kind?: "voice" | "camera"; at: number };
type VoiceInviteReply = { id: string; inviteId: string; fromId: string; fromName: string; status: "accepted" | "declined" | "busy"; at: number };
const VOICE_INVITE_TTL_MS = 45_000;
const voiceInviteStore = () => {
  const g = globalThis as typeof globalThis & { __stooornaVoiceInvites?: { inbox: Map<string, VoiceInviteRow[]>; replies: Map<string, VoiceInviteReply[]> } };
  if (!g.__stooornaVoiceInvites) g.__stooornaVoiceInvites = { inbox: new Map(), replies: new Map() };
  return g.__stooornaVoiceInvites;
};
/** كل المفاتيح التي قد يُخزَّن تحتها هذا المستخدم (id + الأسماء البديلة) */
const voiceKeysOf = (u: SessionU): string[] => Array.from(new Set([normId(u.id), ...session.keysOf(u)]));
const voiceInvitesFor = (u: SessionU): VoiceInviteRow[] => {
  const st = voiceInviteStore();
  const now = Date.now();
  const out: VoiceInviteRow[] = [];
  for (const k of voiceKeysOf(u)) {
    const live = (st.inbox.get(k) || []).filter((i) => now - i.at < VOICE_INVITE_TTL_MS);
    if (live.length) { st.inbox.set(k, live); out.push(...live); } else st.inbox.delete(k);
  }
  return out;
};
const voicePushReply = (hostId: string, r: VoiceInviteReply) => {
  const st = voiceInviteStore();
  const k = normId(hostId);
  const now = Date.now();
  const list = (st.replies.get(k) || []).filter((x) => now - x.at < 60_000);
  list.push(r);
  st.replies.set(k, list.slice(-30));
};

app.get("/api/voice-invite", guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  const scope = String(req.query.scope || "all");
  const st = voiceInviteStore();
  const now = Date.now();
  const out: Record<string, unknown> = { ok: true, now };
  if (scope !== "replies") {
    out.invites = voiceInvitesFor(u).map((i) => ({ ...i, ttlLeftMs: Math.max(0, VOICE_INVITE_TTL_MS - (now - i.at)) }));
  }
  if (scope !== "invites") {
    const replies: VoiceInviteReply[] = [];
    for (const k of voiceKeysOf(u)) {
      replies.push(...(st.replies.get(k) || []).filter((x) => now - x.at < 60_000));
      st.replies.delete(k);
    }
    out.replies = replies;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(out);
}));

app.post("/api/voice-invite", guarded(async (req, res) => {
  const u = await needUser(req, res);
  if (!u) return;
  if (!allow(`vi:${u.id}`, 40, 30_000)) return deny(res, 429, "rate_limited");
  const body = (req.body || {}) as Record<string, unknown>;
  const action = String(body.action || "send");
  const st = voiceInviteStore();
  const me = String(u.id);
  const now = Date.now();

  // ── المضيف يرسل دعوة ──
  if (action === "send") {
    const toId = String(body.toUserId || "").trim().slice(0, 80);
    if (!toId) return deny(res, 400, "toUserId required");
    if (session.owns(u, toId)) return deny(res, 400, "cannot invite yourself");
    const key = normId(toId);
    // الغرفة: المضيف نفسه، أو أي عضو يدعو أصدقاءه لبث المضيف (يُقبل فقط إذا المضيف فعلاً في بث صوتي الآن)
    const inviteKind: "voice" | "camera" = String(body.kind || "voice") === "camera" ? "camera" : "voice";
    const reqHost = String(body.hostId || "").trim().slice(0, 80);
    const hostId = !reqHost || session.owns(u, reqHost) ? me : reqHost;
    if (hostId !== me) {
      livePresencePurge();
      const pm = livePresenceMem();
      const pr = pm.get(hostId) || pm.get(hostId.toLowerCase());
      if (!pr || pr.kind !== inviteKind) return deny(res, 409, "host not live");
      if (normId(toId) === normId(hostId)) return deny(res, 400, "cannot invite the host");
    }
    const id = `vi_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const row: VoiceInviteRow = {
      id,
      fromId: me,
      fromName: String(body.fromName || body.hostName || "User").slice(0, 60),
      toId,
      hostId,
      hostName: String(body.hostName || "User").slice(0, 60),
      hostUsername: String(body.hostUsername || "").replace(/^@/, "").slice(0, 60),
      hostAvatar: body.hostAvatar != null && String(body.hostAvatar) ? String(body.hostAvatar).slice(0, 400) : null,
      kind: inviteKind,
      at: now,
    };
    // دعوة واحدة فقط لنفس البث لنفس الشخص (الجديدة تحل محل القديمة)
    const list = (st.inbox.get(key) || []).filter((i) => now - i.at < VOICE_INVITE_TTL_MS && i.hostId !== hostId);
    list.push(row);
    st.inbox.set(key, list.slice(-10));
    return res.json({ ok: true, id, at: now });
  }

  // ── المضيف يلغي دعوة / كل الدعوات (خرج من البث) ──
  if (action === "cancel" || action === "cancel-all") {
    const toId = action === "cancel" ? normId(String(body.toUserId || "")) : "";
    for (const [k, list] of st.inbox) {
      if (toId && k !== toId) continue;
      const rest = list.filter((i) => i.fromId !== me);
      if (rest.length) st.inbox.set(k, rest); else st.inbox.delete(k);
    }
    return res.json({ ok: true });
  }

  // ── المدعو يرد: قبول / رفض / مشغول ──
  if (action === "accept" || action === "decline" || action === "busy") {
    const inviteId = String(body.inviteId || "");
    const hostId = String(body.hostId || "");
    let found: VoiceInviteRow | null = null;
    for (const k of voiceKeysOf(u)) {
      const list = st.inbox.get(k) || [];
      const keep: VoiceInviteRow[] = [];
      for (const i of list) {
        if (!found && (i.id === inviteId || (!inviteId && hostId && i.hostId === hostId))) found = i;
        else keep.push(i);
      }
      if (keep.length) st.inbox.set(k, keep); else st.inbox.delete(k);
    }
    if (found) {
      voicePushReply(found.fromId, {
        id: `vr_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        inviteId: found.id,
        fromId: me,
        fromName: String(body.name || "User").slice(0, 60),
        status: action === "accept" ? "accepted" : action === "busy" ? "busy" : "declined",
        at: now,
      });
    }
    return res.json({ ok: true, found: !!found });
  }

  return deny(res, 400, "unknown action");
}));


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
app.get("/api/presence", presence_get_84);
app.post("/api/presence/heartbeat", presence_heartbeat_post_85);
app.post("/api/presence/visitors", presence_visitors_post_86);
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
app.post("/api/status", statusMulterMiddleware, status_post_132);
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
app.get("/api/users/:id/followers", users_id_followers_get);
app.get("/api/users/:id/following", users_id_following_get);
app.get("/api/vip", vip_get_165);
app.post("/api/vip", vip_post_166);
app.get("/api/vip/directory", vip_directory_get_167);
app.get("/api/business", business_directory_get_168);
app.get("/api/business/directory", business_directory_get_168);
app.post("/api/business", business_directory_post_169);
app.post("/api/business/directory", business_directory_post_169);
// </api-registrations>


// ── OTP (email / phone) ─────────────────────────────────────────────────────
// Demo-safe store: codes live in memory + optional console log.
// Production: set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM (SMS)
// and SMTP_* or RESEND_API_KEY for email. Without them, OTP is returned in
// JSON as `devCode` so the UI can still complete signup/login in staging.
type OtpRec = { code: string; at: number; attempts: number; channel: 'email' | 'phone' };
const otpStore: Map<string, OtpRec> = (() => {
  const g = globalThis as typeof globalThis & { __stooornaOtp?: Map<string, OtpRec> };
  if (!g.__stooornaOtp) g.__stooornaOtp = new Map();
  return g.__stooornaOtp;
})();
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
function normalizeOtpTarget(raw: string, channel: 'email' | 'phone'): string {
  const s = String(raw || '').trim();
  if (channel === 'email') return s.toLowerCase();
  // keep digits and leading +
  const digits = s.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+${digits.replace(/^\+/, '')}`;
}
function genOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
app.post('/api/auth/otp/send', express.json(), async (req, res) => {
  try {
    const channel = (String(req.body?.channel || '').toLowerCase() === 'phone' ? 'phone' : 'email') as 'email' | 'phone';
    const target = normalizeOtpTarget(String(req.body?.target || req.body?.email || req.body?.phone || ''), channel);
    if (!target || target.length < 5) {
      res.status(400).json({ error: 'invalid_target' });
      return;
    }
    if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      res.status(400).json({ error: 'invalid_email' });
      return;
    }
    if (channel === 'phone' && !/^\+[1-9]\d{7,14}$/.test(target)) {
      res.status(400).json({ error: 'invalid_phone' });
      return;
    }
    const code = genOtpCode();
    otpStore.set(`${channel}:${target}`, { code, at: Date.now(), attempts: 0, channel });
    console.log(`[otp] send ${channel} → ${target} code=${code}`);

    // Optional Twilio SMS
    let delivered = false;
    if (channel === 'phone' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) {
      try {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        const from = process.env.TWILIO_FROM;
        const auth = Buffer.from(`${sid}:${token}`).toString('base64');
        const body = new URLSearchParams({ To: target, From: from, Body: `Stooorna code: ${code}` });
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        delivered = r.ok;
        if (!r.ok) console.error('[otp] twilio', await r.text());
      } catch (e) {
        console.error('[otp] twilio failed', e);
      }
    }
    // Optional Resend email
    if (channel === 'email' && process.env.RESEND_API_KEY) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || 'Stooorna <noreply@stooorna.com>',
            to: [target],
            subject: 'Stooorna verification code',
            text: `Your Stooorna code is ${code}. Valid for 10 minutes.`,
          }),
        });
        delivered = r.ok;
        if (!r.ok) console.error('[otp] resend', await r.text());
      } catch (e) {
        console.error('[otp] resend failed', e);
      }
    }

    const payload: Record<string, unknown> = {
      ok: true,
      channel,
      target,
      delivered,
      expiresInSec: Math.floor(OTP_TTL_MS / 1000),
    };
    // Expose code only when no real provider is configured (dev / staging)
    if (!delivered) payload.devCode = code;
    res.json(payload);
  } catch (e) {
    console.error('[otp] send error', e);
    res.status(500).json({ error: 'otp_send_failed' });
  }
});
app.post('/api/auth/otp/verify', express.json(), (req, res) => {
  try {
    const channel = (String(req.body?.channel || '').toLowerCase() === 'phone' ? 'phone' : 'email') as 'email' | 'phone';
    const target = normalizeOtpTarget(String(req.body?.target || req.body?.email || req.body?.phone || ''), channel);
    const code = String(req.body?.code || '').trim();
    if (!target || !code) {
      res.status(400).json({ error: 'missing_fields' });
      return;
    }
    const key = `${channel}:${target}`;
    const rec = otpStore.get(key);
    if (!rec) {
      res.status(400).json({ error: 'no_code' });
      return;
    }
    if (Date.now() - rec.at > OTP_TTL_MS) {
      otpStore.delete(key);
      res.status(400).json({ error: 'expired' });
      return;
    }
    if (rec.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(key);
      res.status(429).json({ error: 'too_many_attempts' });
      return;
    }
    rec.attempts += 1;
    if (rec.code !== code) {
      res.status(400).json({ error: 'invalid_code', attemptsLeft: OTP_MAX_ATTEMPTS - rec.attempts });
      return;
    }
    otpStore.delete(key);
    res.json({ ok: true, channel, target, verified: true });
  } catch (e) {
    console.error('[otp] verify error', e);
    res.status(500).json({ error: 'otp_verify_failed' });
  }
});

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
	// permissions sheet (location / camera / mic / notifications) for the installed app
	if (!template.includes("/permissions.js")) template = template.replace("</body>", '<script src="/permissions.js" defer></script></body>');
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
	// Large APK/IPA uploads can take longer than Node's default 5-minute requestTimeout.
	server.requestTimeout = 0;
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
