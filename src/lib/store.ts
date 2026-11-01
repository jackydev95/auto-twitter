import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getRedisClient, resolveRedisConfig } from "./redis";
import {
  AppDatabase,
  CronJobConfig,
  FollowLog,
  FollowTarget,
  PKCESession,
  TwitterAccount,
  TwitterOAuthConfig,
} from "./types";

export const REDIS_DB_KEY = "auto_twitter:db:v1";
export const REDIS_CRON_LOCK_KEY = "auto_twitter:cron_lock";

const DATA_DIR = path.join(process.cwd(), "data");
const PRIMARY_DB_PATH = path.join(DATA_DIR, "twitter-tools-db.json");
const FALLBACK_DB_PATH = path.join("/tmp", "twitter-tools-db.json");

const DEFAULT_SCOPES = [
  "tweet.read",
  "users.read",
  "follows.read",
  "follows.write",
  "offline.access",
];

function createSeedAccounts(now: string): TwitterAccount[] {
  const inTwoHours = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  const inSixHours = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  return [
    {
      id: "acc-seed-1",
      twitterUserId: "1589203411",
      username: "wilbert_williams",
      name: "Wilbert Williams",
      email: "wilbert.williams@adminify.io",
      role: "admin",
      accountStatus: "active",
      accessToken: "x_oauth2_at_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e",
      refreshToken: "x_oauth2_rt_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f",
      expiresAt: inSixHours,
      scopes: DEFAULT_SCOPES,
      tokenType: "bearer",
      isActive: true,
      cronEnabled: true,
      isSimulated: true,
      followersCount: 9600,
      followingCount: 1420,
      totalAutoFollowed: 184,
      lastUsedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "acc-seed-2",
      twitterUserId: "1720491823",
      username: "christian_ochoa",
      name: "Christian Ochoa",
      email: "christian.ochoa@xgrowth.dev",
      role: "vip",
      accountStatus: "active",
      accessToken: "x_oauth2_at_4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b",
      refreshToken: "x_oauth2_rt_8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a",
      expiresAt: inTwoHours,
      scopes: DEFAULT_SCOPES,
      tokenType: "bearer",
      isActive: false,
      cronEnabled: true,
      isSimulated: true,
      followersCount: 6900,
      followingCount: 980,
      totalAutoFollowed: 96,
      lastUsedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "acc-seed-3",
      twitterUserId: "1893012944",
      username: "socorro_decker",
      name: "Socorro Decker",
      email: "socorro.decker@creatorhub.co",
      role: "vip",
      accountStatus: "active",
      accessToken: "x_oauth2_at_7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a",
      refreshToken: "x_oauth2_rt_5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f",
      expiresAt: inSixHours,
      scopes: DEFAULT_SCOPES,
      tokenType: "bearer",
      isActive: false,
      cronEnabled: true,
      isSimulated: true,
      followersCount: 8300,
      followingCount: 650,
      totalAutoFollowed: 72,
      lastUsedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "acc-seed-4",
      twitterUserId: "1940192831",
      username: "haywood_sharp",
      name: "Haywood Sharp",
      email: "haywood.sharp@indiehack.org",
      role: "member",
      accountStatus: "expired",
      accessToken: "x_oauth2_at_2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c",
      refreshToken: "x_oauth2_rt_9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f",
      expiresAt: yesterday,
      scopes: ["tweet.read", "users.read", "follows.read", "follows.write"],
      tokenType: "bearer",
      isActive: false,
      cronEnabled: false,
      isSimulated: true,
      followersCount: 3450,
      followingCount: 410,
      totalAutoFollowed: 28,
      lastUsedAt: yesterday,
      createdAt: yesterday,
      updatedAt: now,
    },
  ];
}

export function createInitialDb(): AppDatabase {
  const now = new Date().toISOString();
  return {
    oauthConfig: {
      clientId: process.env.TWITTER_CLIENT_ID || "",
      clientSecret: process.env.TWITTER_CLIENT_SECRET || "",
      redirectUri:
        process.env.TWITTER_REDIRECT_URI ||
        "http://localhost:3000/api/auth/twitter/callback",
      scopes: DEFAULT_SCOPES,
    },
    accounts: createSeedAccounts(now),
    targets: [
      {
        id: "target-seed-1",
        username: "vercel",
        twitterUserId: "1176150436409585664",
        displayName: "Vercel",
        bio: "Develop. Preview. Ship. Creators of Next.js.",
        followersCount: 642000,
        source: "manual",
        sourceNote: "Seeded tech account",
        status: "pending",
        attempts: 0,
        createdAt: now,
      },
      {
        id: "target-seed-2",
        username: "nextjs",
        twitterUserId: "1060242429231079424",
        displayName: "Next.js",
        bio: "The React Framework for the Web by @vercel",
        followersCount: 398000,
        source: "manual",
        sourceNote: "Seeded tech account",
        status: "pending",
        attempts: 0,
        createdAt: now,
      },
      {
        id: "target-seed-3",
        username: "shadcn",
        twitterUserId: "14940343",
        displayName: "shadcn",
        bio: "Building ui.shadcn.com & @vercel",
        followersCount: 285000,
        source: "manual",
        sourceNote: "Seeded creator account",
        status: "pending",
        attempts: 0,
        createdAt: now,
      },
      {
        id: "target-seed-4",
        username: "rauchg",
        twitterUserId: "15237107",
        displayName: "Guillermo Rauch",
        bio: "CEO @vercel",
        followersCount: 410000,
        source: "manual",
        sourceNote: "Seeded founder account",
        status: "pending",
        attempts: 0,
        createdAt: now,
      },
      {
        id: "target-seed-5",
        username: "leeerob",
        twitterUserId: "16093683",
        displayName: "Lee Robinson",
        bio: "VP of DX @vercel",
        followersCount: 240000,
        source: "manual",
        sourceNote: "Seeded devrel account",
        status: "pending",
        attempts: 0,
        createdAt: now,
      },
    ],
    cronConfig: {
      enabled: false,
      cronExpression: "*/15 * * * *",
      maxFollowsPerRun: 3,
      dailyFollowLimit: 40,
      delayMinMs: 1200,
      delayMaxMs: 3000,
      autoRefreshToken: true,
      skipProtectedUsers: true,
      dryRunMode: false,
      cronSecret: process.env.CRON_SECRET || "x-auto-follow-secret-2026",
      lastRunStatus: "idle",
    },
    logs: [],
    pkceSessions: [],
  };
}

function normalizeDb(parsed?: Partial<AppDatabase> | null): AppDatabase {
  const defaults = createInitialDb();
  if (!parsed) return defaults;

  const accounts =
    parsed.accounts && parsed.accounts.length > 0
      ? parsed.accounts
      : defaults.accounts;

  return {
    oauthConfig: {
      ...defaults.oauthConfig,
      ...(parsed.oauthConfig || {}),
      clientId:
        parsed.oauthConfig?.clientId || process.env.TWITTER_CLIENT_ID || "",
      clientSecret:
        parsed.oauthConfig?.clientSecret ||
        process.env.TWITTER_CLIENT_SECRET ||
        "",
    },
    accounts,
    targets: parsed.targets || defaults.targets,
    cronConfig: {
      ...defaults.cronConfig,
      ...(parsed.cronConfig || {}),
    },
    logs: parsed.logs || [],
    pkceSessions: parsed.pkceSessions || [],
  };
}

function resolveLocalDbPath(): string {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    return PRIMARY_DB_PATH;
  } catch {
    return FALLBACK_DB_PATH;
  }
}

function readLocalFallbackDb(): AppDatabase {
  const dbPath = resolveLocalDbPath();
  try {
    if (!fs.existsSync(dbPath)) {
      const initial = createInitialDb();
      fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2), "utf-8");
      return initial;
    }
    const raw = fs.readFileSync(dbPath, "utf-8");
    return normalizeDb(JSON.parse(raw) as Partial<AppDatabase>);
  } catch {
    return createInitialDb();
  }
}

function writeLocalFallbackDb(db: AppDatabase): void {
  const dbPath = resolveLocalDbPath();
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf-8");
  } catch {
    try {
      fs.writeFileSync(FALLBACK_DB_PATH, JSON.stringify(db, null, 2), "utf-8");
    } catch {
      // Ignore in read-only environments
    }
  }
}

export async function getStorageInfo(): Promise<{
  driver: "vercel-redis" | "local-fallback";
  connected: boolean;
  source: string;
  redisKey: string;
  urlPreview?: string;
  error?: string;
}> {
  const cfg = resolveRedisConfig();
  const redis = getRedisClient();

  if (!redis) {
    return {
      driver: "local-fallback",
      connected: false,
      source: cfg.source,
      redisKey: REDIS_DB_KEY,
    };
  }

  try {
    await redis.ping();
    return {
      driver: "vercel-redis",
      connected: true,
      source: cfg.source,
      redisKey: REDIS_DB_KEY,
      urlPreview: cfg.url.replace(/^(https?:\/\/[^.]+).*/, "$1..."),
    };
  } catch (err) {
    return {
      driver: "local-fallback",
      connected: false,
      source: cfg.source,
      redisKey: REDIS_DB_KEY,
      error: err instanceof Error ? err.message : "Redis connection error",
    };
  }
}

export async function readDb(): Promise<AppDatabase> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const existing = await redis.get<AppDatabase>(REDIS_DB_KEY);
      if (!existing) {
        // Seed initial data from local fallback or default into Vercel Redis
        const seed = readLocalFallbackDb();
        await redis.set(REDIS_DB_KEY, seed);
        return seed;
      }
      return normalizeDb(existing);
    } catch (err) {
      console.error("[Vercel Redis] readDb error, using local fallback:", err);
      return readLocalFallbackDb();
    }
  }

  return readLocalFallbackDb();
}

export async function writeDb(db: AppDatabase): Promise<void> {
  db.logs = db.logs.slice(0, 300);
  db.pkceSessions = db.pkceSessions.slice(-20);

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(REDIS_DB_KEY, db);
    } catch (err) {
      console.error("[Vercel Redis] writeDb error:", err);
    }
  }

  // Also keep local cache updated when possible
  writeLocalFallbackDb(db);
}

export async function acquireCronLock(ttlSeconds = 55): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true;
  try {
    const res = await redis.set(REDIS_CRON_LOCK_KEY, Date.now(), {
      nx: true,
      ex: ttlSeconds,
    });
    return res === "OK";
  } catch {
    return true;
  }
}

export async function releaseCronLock(): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(REDIS_CRON_LOCK_KEY);
  } catch {
    // Ignore
  }
}

export async function getOAuthConfig(): Promise<TwitterOAuthConfig> {
  const db = await readDb();
  return db.oauthConfig;
}

export async function updateOAuthConfig(
  partial: Partial<TwitterOAuthConfig>
): Promise<TwitterOAuthConfig> {
  const db = await readDb();
  db.oauthConfig = {
    ...db.oauthConfig,
    ...partial,
  };
  await writeDb(db);
  return db.oauthConfig;
}

export async function savePKCESession(session: PKCESession): Promise<void> {
  const db = await readDb();
  db.pkceSessions.push(session);
  await writeDb(db);
}

export async function consumePKCESession(
  state: string
): Promise<PKCESession | undefined> {
  const db = await readDb();
  const idx = db.pkceSessions.findIndex((s) => s.state === state);
  if (idx === -1) return undefined;
  const [session] = db.pkceSessions.splice(idx, 1);
  await writeDb(db);
  return session;
}

export async function getAccounts(): Promise<TwitterAccount[]> {
  const db = await readDb();
  return db.accounts;
}

export async function getActiveAccount(): Promise<TwitterAccount | undefined> {
  const db = await readDb();
  return db.accounts.find((a) => a.isActive) || db.accounts[0];
}

export async function upsertAccount(
  accountData: Omit<TwitterAccount, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  }
): Promise<TwitterAccount> {
  const db = await readDb();
  const now = new Date().toISOString();
  const existingIdx = db.accounts.findIndex(
    (a) =>
      (accountData.id && a.id === accountData.id) ||
      a.twitterUserId === accountData.twitterUserId ||
      a.username.toLowerCase() === accountData.username.toLowerCase()
  );

  const shouldActivate = accountData.isActive || db.accounts.length === 0;
  if (shouldActivate) {
    db.accounts.forEach((a) => {
      a.isActive = false;
    });
  }

  let saved: TwitterAccount;
  if (existingIdx >= 0) {
    const existing = db.accounts[existingIdx];
    saved = {
      ...existing,
      ...accountData,
      email:
        accountData.email ??
        existing.email ??
        `${accountData.username}@x-user.io`,
      role: accountData.role ?? existing.role ?? "member",
      accountStatus:
        accountData.accountStatus ?? existing.accountStatus ?? "active",
      cronEnabled: accountData.cronEnabled ?? existing.cronEnabled ?? true,
      totalAutoFollowed:
        accountData.totalAutoFollowed ?? existing.totalAutoFollowed ?? 0,
      isActive: shouldActivate ? true : existing.isActive,
      updatedAt: now,
    };
    db.accounts[existingIdx] = saved;
  } else {
    saved = {
      ...accountData,
      id: accountData.id || `acc-${crypto.randomUUID().slice(0, 8)}`,
      email: accountData.email || `${accountData.username}@x-user.io`,
      role: accountData.role || "member",
      accountStatus: accountData.accountStatus || "active",
      cronEnabled: accountData.cronEnabled ?? true,
      totalAutoFollowed: accountData.totalAutoFollowed ?? 0,
      isActive: shouldActivate,
      createdAt: now,
      updatedAt: now,
    };
    db.accounts.unshift(saved);
  }

  await writeDb(db);
  return saved;
}

export async function updateAccountById(
  accountId: string,
  partial: Partial<TwitterAccount>
): Promise<TwitterAccount | undefined> {
  const db = await readDb();
  const idx = db.accounts.findIndex((a) => a.id === accountId);
  if (idx === -1) return undefined;

  if (partial.isActive) {
    db.accounts.forEach((a) => {
      a.isActive = false;
    });
  }

  db.accounts[idx] = {
    ...db.accounts[idx],
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  await writeDb(db);
  return db.accounts[idx];
}

export async function setActiveAccount(
  accountId: string
): Promise<TwitterAccount | undefined> {
  const db = await readDb();
  let found: TwitterAccount | undefined;
  for (const acc of db.accounts) {
    if (acc.id === accountId) {
      acc.isActive = true;
      acc.updatedAt = new Date().toISOString();
      found = acc;
    } else {
      acc.isActive = false;
    }
  }
  await writeDb(db);
  return found;
}

export async function deleteAccount(accountId: string): Promise<boolean> {
  const db = await readDb();
  const before = db.accounts.length;
  db.accounts = db.accounts.filter((a) => a.id !== accountId);
  if (db.accounts.length > 0 && !db.accounts.some((a) => a.isActive)) {
    db.accounts[0].isActive = true;
  }
  await writeDb(db);
  return db.accounts.length < before;
}

export async function addTargets(
  items: Array<{
    username: string;
    twitterUserId?: string;
    displayName?: string;
    bio?: string;
    followersCount?: number;
    source?: FollowTarget["source"];
    sourceNote?: string;
  }>
): Promise<{
  added: number;
  skippedDuplicates: number;
  targets: FollowTarget[];
}> {
  const db = await readDb();
  const now = new Date().toISOString();
  let added = 0;
  let skippedDuplicates = 0;

  for (const item of items) {
    const cleanUsername = item.username.trim().replace(/^@+/, "");
    if (!cleanUsername) continue;

    const exists = db.targets.some(
      (t) =>
        t.username.toLowerCase() === cleanUsername.toLowerCase() ||
        (item.twitterUserId && t.twitterUserId === item.twitterUserId)
    );
    if (exists) {
      skippedDuplicates++;
      continue;
    }

    db.targets.push({
      id: `tgt-${crypto.randomUUID().slice(0, 8)}`,
      username: cleanUsername,
      twitterUserId: item.twitterUserId?.trim() || undefined,
      displayName: item.displayName || `@${cleanUsername}`,
      bio: item.bio,
      followersCount: item.followersCount,
      source: item.source || "manual",
      sourceNote: item.sourceNote,
      status: "pending",
      attempts: 0,
      createdAt: now,
    });
    added++;
  }

  await writeDb(db);
  return { added, skippedDuplicates, targets: db.targets };
}

export async function updateTarget(
  targetId: string,
  partial: Partial<FollowTarget>
): Promise<FollowTarget | undefined> {
  const db = await readDb();
  const target = db.targets.find((t) => t.id === targetId);
  if (!target) return undefined;
  Object.assign(target, partial);
  await writeDb(db);
  return target;
}

export async function deleteTarget(targetId: string): Promise<boolean> {
  const db = await readDb();
  const before = db.targets.length;
  db.targets = db.targets.filter((t) => t.id !== targetId);
  await writeDb(db);
  return db.targets.length < before;
}

export async function resetFailedTargets(): Promise<number> {
  const db = await readDb();
  let count = 0;
  for (const t of db.targets) {
    if (t.status === "failed" || t.status === "skipped") {
      t.status = "pending";
      t.lastError = undefined;
      count++;
    }
  }
  await writeDb(db);
  return count;
}

export async function clearTargetsByStatus(
  status: FollowTarget["status"]
): Promise<number> {
  const db = await readDb();
  const before = db.targets.length;
  db.targets = db.targets.filter((t) => t.status !== status);
  await writeDb(db);
  return before - db.targets.length;
}

export async function getCronConfig(): Promise<CronJobConfig> {
  const db = await readDb();
  return db.cronConfig;
}

export async function updateCronConfig(
  partial: Partial<CronJobConfig>
): Promise<CronJobConfig> {
  const db = await readDb();
  db.cronConfig = {
    ...db.cronConfig,
    ...partial,
  };
  await writeDb(db);
  return db.cronConfig;
}

export async function appendLog(
  entry: Omit<FollowLog, "id" | "timestamp">
): Promise<FollowLog> {
  const db = await readDb();
  const fullEntry: FollowLog = {
    ...entry,
    id: `log-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
  };
  db.logs.unshift(fullEntry);
  await writeDb(db);
  return fullEntry;
}

export async function clearLogs(): Promise<void> {
  const db = await readDb();
  db.logs = [];
  await writeDb(db);
}

export async function getTodayFollowCount(accountId?: string): Promise<number> {
  const db = await readDb();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startIso = startOfDay.toISOString();

  return db.logs.filter(
    (log) =>
      log.action === "follow" &&
      (log.status === "success" || log.status === "dry_run") &&
      log.timestamp >= startIso &&
      (!accountId || log.accountId === accountId)
  ).length;
}
