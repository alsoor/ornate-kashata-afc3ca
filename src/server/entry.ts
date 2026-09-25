import { readFileSync } from "node:fs";
const DATA_DIR_VIP = process.cwd() + "/data";
const VIP_FILE = DATA_DIR_VIP + "/vip-directory.json";
const BIZ_FILE = DATA_DIR_VIP + "/business-directory.json";

type VipRowPersisted = {
  userId: string;
  active: boolean;
  since: number;
  expiresAt: number | null;
  color: string;
  feats: { eightMics: boolean; roomMusic: boolean };
  renameUsed: boolean;
};
type BizRowPersisted = {
  userId: string;
  username?: string | null;
  email?: string | null;
  projectName?: string | null;
};

function loadJsonFileSyncVip<T>(file: string, fallback: T): T {
  try {
    const raw = readFileSync(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function saveJsonFileSyncVip(file: string, data: unknown) {
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    fs.mkdirSync(DATA_DIR_VIP, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data), "utf8");
  } catch (e) {
    console.warn("[vip-biz] save failed", e);
  }
}

const vipMem = () => {
  const g = globalThis as typeof globalThis & { __stooornaVip?: Map<string, VipRowPersisted>; __stooornaVipLoaded?: boolean };
  if (!g.__stooornaVip) g.__stooornaVip = new Map();
  if (!g.__stooornaVipLoaded) {
    const arr = loadJsonFileSyncVip<VipRowPersisted[]>(VIP_FILE, []);
    if (Array.isArray(arr)) {
      for (const row of arr) {
        if (row?.userId) g.__stooornaVip.set(String(row.userId), row);
      }
    }
    g.__stooornaVipLoaded = true;
  }
  return g.__stooornaVip;
};
const persistVip = () => {
  saveJsonFileSyncVip(VIP_FILE, Array.from(vipMem().values()));
};
const bizDirMem = () => {
  const g = globalThis as typeof globalThis & { __stooornaBizDir?: Map<string, BizRowPersisted>; __stooornaBizLoaded?: boolean };
  if (!g.__stooornaBizDir) g.__stooornaBizDir = new Map();
  if (!g.__stooornaBizLoaded) {
    const arr = loadJsonFileSyncVip<BizRowPersisted[]>(BIZ_FILE, []);
    if (Array.isArray(arr)) {
      for (const row of arr) {
        if (row?.userId) g.__stooornaBizDir.set(String(row.userId), row);
      }
    }
    g.__stooornaBizLoaded = true;
  }
  return g.__stooornaBizDir;
};
const persistBiz = () => {
  saveJsonFileSyncVip(BIZ_FILE, Array.from(bizDirMem().values()));
};
app.get("/api/vip/directory", (_req, res) => {
  const now = Date.now();
  const users = Array.from(vipMem().values())
    .filter((x) => x && x.active && !(x.expiresAt && now > Number(x.expiresAt)))
    .map((x) => ({
      userId: x.userId,
      active: true,
      color: x.color || "gold",
      expiresAt: x.expiresAt || null,
      feats: x.feats || { eightMics: false, roomMusic: false },
    }));
  res.json({ users });
});
app.get("/api/vip", (req, res) => {
  const userId = String(req.query.userId || "");
  if (!userId) return res.status(400).json({ error: "userId required" });
  const row = vipMem().get(userId) || {
    userId, active: false, since: 0, expiresAt: null, color: "gold",
    feats: { eightMics: false, roomMusic: false }, renameUsed: false,
  };
  if (row.active && row.expiresAt && Date.now() > Number(row.expiresAt)) {
    row.active = false;
    vipMem().set(userId, row);
    persistVip();
  }
  res.json(row);
});
app.post("/api/vip", (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const userId = String(body.userId || "");
  if (!userId) return res.status(400).json({ error: "userId required" });
  const mem = vipMem();
  const row = mem.get(userId) || {
    userId, active: false, since: 0, expiresAt: null, color: "gold",
    feats: { eightMics: false, roomMusic: false }, renameUsed: false,
  };
  const action = String(body.action || "");
  if (action === "activate") {
    row.active = true;
    row.since = Date.now();
    const exp = Number(body.expiresAt);
    row.expiresAt = Number.isFinite(exp) && exp > 0 ? exp : Date.now() + 30 * 24 * 60 * 60 * 1000;
  } else if (action === "deactivate") {
    row.active = false;
  } else if (action === "color") {
    const c = String(body.color || "");
    if (["blue", "gold", "red", "green", "gray", "pink"].includes(c)) row.color = c;
  } else if (action === "feat") {
    if (!row.feats) row.feats = { eightMics: false, roomMusic: false };
    if (body.key === "eightMics" || body.key === "roomMusic") {
      (row.feats as any)[String(body.key)] = !!body.on;
    }
  } else if (action === "rename-used") {
    row.renameUsed = true;
  }
  mem.set(userId, row);
  persistVip();
  res.json(row);
});
app.get("/api/business/directory", (_req, res) => {
  const users = Array.from(bizDirMem().values());
  res.json({ users });
});
app.post("/api/business/directory", (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const action = String(body.action || "upsert");
  const userId = String(body.userId || "");
  if (!userId) return res.status(400).json({ error: "userId required" });
  const mem = bizDirMem();
  if (action === "remove") {
    mem.delete(userId);
  } else {
    mem.set(userId, {
      userId,
      username: body.username ? String(body.username) : null,
      email: body.email ? String(body.email) : null,
      projectName: body.projectName ? String(body.projectName) : null,
    });
  }
  persistBiz();
  res.json({ users: Array.from(mem.values()) });
});