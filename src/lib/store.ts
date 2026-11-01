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

export const REDIS_DB_KEY = "auto_twitter:prod_db:v2";
export const REDIS_CRON_LOCK_KEY = "auto_twitter:cron_lock:v2";
export const REDIS_PKCE_PREFIX = "auto_twitter:pkce:";

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

export const VERIFIED_REAL_X_TARGETS: Array<{
  id: string;
  username: string;
  twitterUserId: string;
  displayName: string;
  bio: string;
  followersCount: number;
  sourceNote: string;
}> = [
  {
    id: "target-1",
    username: "vercel",
    twitterUserId: "4686835494",
    displayName: "Vercel",
    bio: "Agentic Infrastructure for apps and agents.",
    followersCount: 469312,
    sourceNote: "Official @vercel",
  },
  {
    id: "target-2",
    username: "nextjs",
    twitterUserId: "1467726470533754880",
    displayName: "Next.js",
    bio: "The React Framework – created and maintained by @vercel.",
    followersCount: 297068,
    sourceNote: "Official @nextjs",
  },
  {
    id: "target-3",
    username: "shadcn",
    twitterUserId: "31206819",
    displayName: "shadcn",
    bio: "I own a computer. / @vercel",
    followersCount: 247533,
    sourceNote: "Official @shadcn",
  },
  {
    id: "target-4",
    username: "rauchg",
    twitterUserId: "15540222",
    displayName: "Guillermo Rauch",
    bio: "@vercel CEO",
    followersCount: 916142,
    sourceNote: "Official @rauchg",
  },
  {
    id: "target-5",
    username: "leerob",
    twitterUserId: "81712767",
    displayName: "Lee Robinson",
    bio: "Superintelligence at SpaceX. Previously Cursor and Vercel/Next.js.",
    followersCount: 303445,
    sourceNote: "Official @leerob",
  },
  {
    id: "target-6",
    username: "reactjs",
    twitterUserId: "1566463268",
    displayName: "React",
    bio: "The library for web and native user interfaces",
    followersCount: 848526,
    sourceNote: "Official @reactjs",
  },
  {
    id: "target-7",
    username: "tailwindlabs",
    twitterUserId: "1624123374",
    displayName: "Tailwind Labs",
    bio: "We make @tailwindcss, @tailwindui, and @refactoringui",
    followersCount: 10603,
    sourceNote: "Official @tailwindlabs",
  },
  {
    id: "target-8",
    username: "supabase",
    twitterUserId: "1219566488325017602",
    displayName: "Supabase",
    bio: "The Postgres development platform.",
    followersCount: 215745,
    sourceNote: "Official @supabase",
  },
  {
    id: "target-9",
    username: "OpenAI",
    twitterUserId: "4398626122",
    displayName: "OpenAI",
    bio: "OpenAI’s mission is to ensure that AGI benefits all of humanity.",
    followersCount: 5495347,
    sourceNote: "Official @OpenAI",
  },
  {
    id: "target-10",
    username: "AnthropicAI",
    twitterUserId: "1353836358901501952",
    displayName: "Anthropic",
    bio: "AI safety and research company that builds Claude.",
    followersCount: 1862268,
    sourceNote: "Official @AnthropicAI",
  },
  {
    id: "target-11",
    username: "github",
    twitterUserId: "13334762",
    displayName: "GitHub",
    bio: "The AI-powered developer platform to build, scale, and deliver secure software.",
    followersCount: 2731861,
    sourceNote: "Official @github",
  },
  {
    id: "target-12",
    username: "cursor_ai",
    twitterUserId: "1695890961094909952",
    displayName: "Cursor",
    bio: "Coding agent for building ambitious software",
    followersCount: 496717,
    sourceNote: "Official @cursor_ai",
  },
  {
    id: "target-13",
    username: "v0",
    twitterUserId: "1711764162290847745",
    displayName: "v0",
    bio: "Full stack vibe coding platform. Created by @vercel.",
    followersCount: 116813,
    sourceNote: "Official @v0",
  },
  {
    id: "target-14",
    username: "Cloudflare",
    twitterUserId: "32499999",
    displayName: "Cloudflare",
    bio: "Cloudflare is the world’s leading #ConnectivityCloud.",
    followersCount: 324826,
    sourceNote: "Official @Cloudflare",
  },
];

export function createInitialDb(): AppDatabase {
  const now = new Date().toISOString();
  const defaultRedirect = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/auth/twitter/callback`
    : "https://auto-twitter.vercel.app/api/auth/twitter/callback";

  return {
    oauthConfig: {
      clientId: process.env.TWITTER_CLIENT_ID || "",
      clientSecret: process.env.TWITTER_CLIENT_SECRET || "",
      redirectUri: process.env.TWITTER_REDIRECT_URI || defaultRedirect,
      scopes: DEFAULT_SCOPES,
    },
    accounts: [],
    targets: VERIFIED_REAL_X_TARGETS.map((t) => ({
      ...t,
      source: "manual" as const,
      status: "pending" as const,
      attempts: 0,
      createdAt: now,
    })),
    cronConfig: {
      enabled: true,
      cronExpression: "*/5 * * * *",
      maxFollowsPerRun: 3,
      dailyFollowLimit: 40,
      delayMinMs: 1200,
      delayMaxMs: 2800,
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

  const verifiedMap = new Map(
    VERIFIED_REAL_X_TARGETS.map((t) => [t.username.toLowerCase(), t])
  );

  const existingTargets = Array.isArray(parsed.targets)
    ? parsed.targets.map((t) => {
        const cleanHandle =
          t.username.toLowerCase() === "leeerob" ? "leerob" : t.username;
        const verified = verifiedMap.get(cleanHandle.toLowerCase());
        if (verified) {
          return {
            ...t,
            username: verified.username,
            twitterUserId: verified.twitterUserId,
            displayName: verified.displayName,
            bio: t.bio || verified.bio,
            followersCount: verified.followersCount,
          };
        }
        return t;
      })
    : [...defaults.targets];

  // Ensure all verified real targets exist so the queue stays populated
  const existingHandles = new Set(
    existingTargets.map((t) => t.username.toLowerCase())
  );
  for (const vt of VERIFIED_REAL_X_TARGETS) {
    if (!existingHandles.has(vt.username.toLowerCase())) {
      existingTargets.push({
        ...vt,
        source: "manual",
        status: "pending",
        attempts: 0,
        createdAt: new Date().toISOString(),
      });
    }
  }

  const mergedCron: CronJobConfig = {
    ...defaults.cronConfig,
    ...(parsed.cronConfig || {}),
  };

  // Auto-enable if never run before so auto-follow works out of the box
  if (!mergedCron.lastRunAt && parsed.cronConfig?.enabled === false) {
    mergedCron.enabled = true;
  }

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
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    targets: existingTargets,
    cronConfig: mergedCron,
    logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    pkceSessions: Array.isArray(parsed.pkceSessions)
      ? parsed.pkceSessions
      : [],
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
        const initial = createInitialDb();
        await redis.set(REDIS_DB_KEY, initial);
        return initial;
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

  writeLocalFallbackDb(db);
}

export async function acquireCronLock(ttlSeconds = 45): Promise<boolean> {
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
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(`${REDIS_PKCE_PREFIX}${session.state}`, session, {
        ex: 900,
      });
    } catch {
      // Fallback to db.pkceSessions
    }
  }
  const db = await readDb();
  db.pkceSessions.push(session);
  await writeDb(db);
}

export async function consumePKCESession(
  state: string
): Promise<PKCESession | undefined> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const key = `${REDIS_PKCE_PREFIX}${state}`;
      const session = await redis.get<PKCESession>(key);
      if (session) {
        await redis.del(key);
        return session;
      }
    } catch {
      // Fallback to db.pkceSessions
    }
  }

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
      authType: accountData.authType ?? existing.authType ?? "oauth2",
      email:
        accountData.email ??
        existing.email ??
        `${accountData.username}@x.com`,
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
      authType: accountData.authType || "oauth2",
      email: accountData.email || `${accountData.username}@x.com`,
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

  // Ensure Cron Auto-Follow is automatically enabled when an account is connected
  db.cronConfig.enabled = true;

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
