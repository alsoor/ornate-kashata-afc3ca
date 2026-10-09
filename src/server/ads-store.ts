/**
 * ADS-STORE — الإعلانات (Ads) محفوظة في MySQL ومرئية لكل المستخدمين، والحذف حذف رسمي من السيرفر.
 *
 *  GET    /api/ads                  → قائمة الإعلانات الجاهزة (بدون الميديا، فقط رابط الميديا)
 *  POST   /api/ads                  → { ad, hasMedia? } يحفظ بيانات الإعلان (مرة واحدة، لا يكتب فوق الموجود)
 *  PUT    /api/ads/:id/media?userId → رفع الفيديو/الصورة/PDF كملف خام (بدون حد 12MB الخاص بالـ JSON)
 *  GET    /api/ads/:id/media        → عرض الميديا (يدعم Range للفيديو)
 *  DELETE /api/ads/:id?userId=      → حذف رسمي + شاهد حذف (tombstone) حتى لا يرجع من نسخ قديمة
 *
 * التسجيل: يجب أن يكون قبل registerAdsRoutes في entry.ts (أول مسار يطابق هو الذي يرد).
 */
import express, { type Express, type Request, type Response } from "express";
import { pool } from "./db/client.js";

const CHUNK = 1024 * 1024; // 1MB لكل صف حتى لا نتجاوز max_allowed_packet
const DAY = 24 * 3600 * 1000;

let readyP: Promise<void> | null = null;
function ensure(): Promise<void> {
  if (!readyP) {
    readyP = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS stooorna_ads (
        id VARCHAR(96) NOT NULL PRIMARY KEY,
        user_id VARCHAR(96) NOT NULL,
        meta LONGTEXT NOT NULL,
        media_mime VARCHAR(128) NULL,
        has_media TINYINT NOT NULL DEFAULT 0,
        ready TINYINT NOT NULL DEFAULT 1,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        KEY idx_user (user_id)
      ) CHARACTER SET utf8mb4`);
      await pool.query(`CREATE TABLE IF NOT EXISTS stooorna_ad_media (
        ad_id VARCHAR(96) NOT NULL,
        idx INT NOT NULL,
        data MEDIUMBLOB NOT NULL,
        PRIMARY KEY (ad_id, idx)
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS stooorna_ads_deleted (
        id VARCHAR(96) NOT NULL PRIMARY KEY,
        deleted_at BIGINT NOT NULL
      )`);
    })().catch((e) => { readyP = null; throw e; });
  }
  return readyP;
}

const cleanId = (v: unknown) => String(v ?? "").trim().slice(0, 96).replace(/[^\w.\-:]/g, "");

/** نفس منطق processAdAutoRepublish في التطبيق: 24 ساعة ظاهر → 4 ساعات انتظار → نشر تلقائي حتى نهاية الحملة */
function republish(a: any, now: number): { ad: any; changed: boolean } {
  const campaign = new Date(a.campaignEndsAt || 0).getTime();
  if (campaign && campaign <= now) return { ad: a, changed: false };
  const ends = new Date(a.endsAt || a.expiresAt || 0).getTime();
  let nextEl = new Date(a.nextEligibleAt || 0).getTime();
  if (!ends) return { ad: a, changed: false };
  if (ends <= now && (!nextEl || nextEl <= ends)) {
    nextEl = ends + 4 * 3600 * 1000;
    return { ad: { ...a, nextEligibleAt: new Date(nextEl).toISOString() }, changed: true };
  }
  if (ends <= now && nextEl && nextEl <= now && (!campaign || campaign > now)) {
    const newEnds = now + DAY;
    const newNext = newEnds + 4 * 3600 * 1000;
    return {
      ad: {
        ...a,
        endsAt: new Date(newEnds).toISOString(),
        expiresAt: new Date(newEnds).toISOString(),
        nextEligibleAt: new Date(newNext).toISOString(),
        lastAutoPublishAt: new Date(now).toISOString(),
      },
      changed: true,
    };
  }
  return { ad: a, changed: false };
}

async function storeMedia(id: string, buf: Buffer, mime: string) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM stooorna_ad_media WHERE ad_id = ?", [id]);
    let idx = 0;
    for (let off = 0; off < buf.length; off += CHUNK) {
      await conn.query("INSERT INTO stooorna_ad_media (ad_id, idx, data) VALUES (?, ?, ?)", [id, idx++, buf.subarray(off, off + CHUNK)]);
    }
    await conn.query("UPDATE stooorna_ads SET has_media = 1, ready = 1, media_mime = ?, updated_at = ? WHERE id = ?", [mime.slice(0, 120), Date.now(), id]);
    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch { /* */ }
    throw e;
  } finally {
    conn.release();
  }
}

async function removeAd(id: string) {
  await pool.query("DELETE FROM stooorna_ad_media WHERE ad_id = ?", [id]);
  await pool.query("DELETE FROM stooorna_ads WHERE id = ?", [id]);
  await pool.query("INSERT IGNORE INTO stooorna_ads_deleted (id, deleted_at) VALUES (?, ?)", [id, Date.now()]);
}

export function registerAdsStoreRoutes(app: Express) {
  // ── رقم نسخة خفيف: يتغير مع أي نشر/حذف، والتطبيق يسحب القائمة فقط لما يتغير ──
  app.get("/api/ads/version", async (_req: Request, res: Response) => {
    try {
      await ensure();
      const [rows] = (await pool.query("SELECT COUNT(*) AS c, COALESCE(MAX(updated_at), 0) AS m FROM stooorna_ads WHERE ready = 1")) as any;
      res.set("Cache-Control", "no-store");
      res.json({ ok: true, ver: `${rows[0].c}:${rows[0].m}` });
    } catch {
      res.status(500).json({ ok: false });
    }
  });

  // ── قائمة الإعلانات (لكل المستخدمين) ──
  app.get("/api/ads", async (_req: Request, res: Response) => {
    try {
      await ensure();
      const [rows] = (await pool.query(
        "SELECT id, user_id, meta, has_media, updated_at FROM stooorna_ads WHERE ready = 1 ORDER BY created_at DESC LIMIT 200",
      )) as any;
      const now = Date.now();
      const out: any[] = [];
      for (const row of rows as any[]) {
        let meta: any;
        try { meta = JSON.parse(row.meta); } catch { continue; }
        const campaign = new Date(meta.campaignEndsAt || 0).getTime();
        if (campaign && campaign + 2 * DAY < now) { await removeAd(String(row.id)); continue; } // الحملة انتهت من يومين
        const r = republish(meta, now);
        if (r.changed) {
          meta = r.ad;
          await pool.query("UPDATE stooorna_ads SET meta = ?, updated_at = ? WHERE id = ?", [JSON.stringify(meta), now, row.id]);
        }
        meta.id = String(row.id);
        meta.userId = String(row.user_id);
        if (row.has_media) {
          const url = `/api/ads/${encodeURIComponent(String(row.id))}/media?v=${row.updated_at}`;
          meta.mediaUrl = url;
          meta.pdfUrl = meta.mediaType === "pdf" ? url : null;
        } else {
          meta.mediaUrl = null;
          meta.pdfUrl = null;
        }
        out.push(meta);
      }
      res.set("Cache-Control", "no-store");
      res.json({ ok: true, ads: out });
    } catch (e) {
      console.error("[ads] list failed", e);
      res.status(500).json({ ok: false, error: "ads_list_failed" });
    }
  });

  // ── نشر إعلان (بيانات فقط) ──
  app.post("/api/ads", async (req: Request, res: Response) => {
    try {
      await ensure();
      const body = (req.body || {}) as any;
      const ad = body.ad && typeof body.ad === "object" ? { ...body.ad } : null;
      const id = cleanId(ad?.id);
      const userId = String(ad?.userId ?? "").slice(0, 96);
      if (!ad || !id || !userId) return res.status(400).json({ ok: false, error: "bad_ad" });

      const [gone] = (await pool.query("SELECT id FROM stooorna_ads_deleted WHERE id = ?", [id])) as any;
      if ((gone as any[]).length) return res.json({ ok: true, deleted: true }); // انحذف قبل؛ لا يرجع

      const [ex] = (await pool.query("SELECT user_id, ready FROM stooorna_ads WHERE id = ?", [id])) as any;
      if ((ex as any[]).length) {
        if (String(ex[0].user_id) !== userId) return res.status(403).json({ ok: false, error: "not_owner" });
        return res.json({ ok: true, exists: true, ready: !!ex[0].ready }); // لا نكتب فوق (نسخ قديمة قد ترسل بيانات قديمة)
      }

      // ميديا قديمة داخل الـ JSON (data URL) → نخزنها كملف
      let inlineData: string | null = null;
      for (const k of ["mediaUrl", "pdfUrl"]) {
        if (typeof ad[k] === "string" && ad[k].startsWith("data:") && !inlineData) inlineData = ad[k];
      }
      ad.mediaUrl = null;
      ad.pdfUrl = null;
      ad.id = id;
      ad.userId = userId;
      const hasMedia = !!body.hasMedia || !!inlineData;
      const metaStr = JSON.stringify(ad);
      if (metaStr.length > 200_000) return res.status(413).json({ ok: false, error: "meta_too_large" });
      const now = Date.now();
      const created = new Date(ad.createdAt || now).getTime() || now;
      await pool.query(
        "INSERT IGNORE INTO stooorna_ads (id, user_id, meta, has_media, ready, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?)",
        [id, userId, metaStr, hasMedia ? 0 : 1, created, now],
      );
      if (inlineData) {
        const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(inlineData);
        if (m) {
          const buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
          if (buf.length) await storeMedia(id, buf, m[1] || "application/octet-stream");
        }
      }
      res.json({ ok: true, ready: !hasMedia || !!inlineData });
    } catch (e) {
      console.error("[ads] publish failed", e);
      res.status(500).json({ ok: false, error: "ads_publish_failed" });
    }
  });

  // ── رفع ميديا الإعلان (ملف خام) ──
  app.put("/api/ads/:id/media", express.raw({ type: () => true, limit: "60mb" }), async (req: Request, res: Response) => {
    try {
      await ensure();
      const id = cleanId(req.params.id);
      const userId = String(req.query.userId || "");
      const [ex] = (await pool.query("SELECT user_id FROM stooorna_ads WHERE id = ?", [id])) as any;
      if (!(ex as any[]).length) return res.status(404).json({ ok: false, error: "no_ad" });
      if (String(ex[0].user_id) !== userId) return res.status(403).json({ ok: false, error: "not_owner" });
      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ ok: false, error: "empty" });
      await storeMedia(id, buf, String(req.headers["content-type"] || "application/octet-stream"));
      res.json({ ok: true, size: buf.length });
    } catch (e) {
      console.error("[ads] media upload failed", e);
      res.status(500).json({ ok: false, error: "ads_media_failed" });
    }
  });

  // ── عرض ميديا الإعلان ──
  app.get("/api/ads/:id/media", async (req: Request, res: Response) => {
    try {
      await ensure();
      const id = cleanId(req.params.id);
      const [ex] = (await pool.query("SELECT media_mime, has_media FROM stooorna_ads WHERE id = ?", [id])) as any;
      if (!(ex as any[]).length || !ex[0].has_media) return res.status(404).end();
      const [parts] = (await pool.query("SELECT data FROM stooorna_ad_media WHERE ad_id = ? ORDER BY idx", [id])) as any;
      const buf = Buffer.concat((parts as any[]).map((p) => p.data as Buffer));
      const total = buf.length;
      res.set("Content-Type", String(ex[0].media_mime || "application/octet-stream"));
      res.set("Accept-Ranges", "bytes");
      res.set("Cache-Control", "public, max-age=3600");
      const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
      if (range && total) {
        let start = range[1] ? parseInt(range[1], 10) : 0;
        let end = range[2] ? parseInt(range[2], 10) : total - 1;
        if (!range[1] && range[2]) { start = Math.max(0, total - parseInt(range[2], 10)); end = total - 1; }
        end = Math.min(end, total - 1);
        if (start > end || start >= total) { res.status(416).set("Content-Range", `bytes */${total}`).end(); return; }
        res.status(206).set({ "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) });
        res.end(buf.subarray(start, end + 1));
        return;
      }
      res.set("Content-Length", String(total));
      res.end(buf);
    } catch (e) {
      console.error("[ads] media read failed", e);
      res.status(500).end();
    }
  });

  // ── حذف رسمي ──
  app.delete("/api/ads/:id", async (req: Request, res: Response) => {
    try {
      await ensure();
      const id = cleanId(req.params.id);
      const userId = String(req.query.userId || (req.body && (req.body as any).userId) || "");
      const [ex] = (await pool.query("SELECT user_id FROM stooorna_ads WHERE id = ?", [id])) as any;
      if ((ex as any[]).length && String(ex[0].user_id) !== userId) return res.status(403).json({ ok: false, error: "not_owner" });
      await removeAd(id);
      res.json({ ok: true });
    } catch (e) {
      console.error("[ads] delete failed", e);
      res.status(500).json({ ok: false, error: "ads_delete_failed" });
    }
  });
}
