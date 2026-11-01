import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";

export interface RedisConnectionConfig {
  url: string;
  token: string;
  source:
    | "UPSTASH_REDIS_REST_URL"
    | "KV_REST_API_URL"
    | "RUNTIME_CONFIG"
    | "NONE";
}

const RUNTIME_REDIS_CONFIG_PATH = path.join(
  process.cwd(),
  "data",
  "redis-config.json"
);

let cachedRedisClient: Redis | null = null;
let cachedConfigSignature = "";

export function getSavedRuntimeRedisConfig(): {
  url?: string;
  token?: string;
} {
  try {
    if (fs.existsSync(RUNTIME_REDIS_CONFIG_PATH)) {
      const raw = fs.readFileSync(RUNTIME_REDIS_CONFIG_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // Ignore file read errors in serverless read-only environments
  }
  return {};
}

export function saveRuntimeRedisConfig(url: string, token: string): void {
  try {
    const dir = path.dirname(RUNTIME_REDIS_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      RUNTIME_REDIS_CONFIG_PATH,
      JSON.stringify({ url: url.trim(), token: token.trim() }, null, 2),
      "utf-8"
    );
    cachedRedisClient = null;
    cachedConfigSignature = "";
  } catch {
    // Fallback to process.env in memory if filesystem is read-only
    process.env.UPSTASH_REDIS_REST_URL = url.trim();
    process.env.UPSTASH_REDIS_REST_TOKEN = token.trim();
    cachedRedisClient = null;
    cachedConfigSignature = "";
  }
}

export function resolveRedisConfig(): RedisConnectionConfig {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return {
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
      source: "UPSTASH_REDIS_REST_URL",
    };
  }

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return {
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
      source: "KV_REST_API_URL",
    };
  }

  const runtime = getSavedRuntimeRedisConfig();
  if (runtime.url && runtime.token) {
    return {
      url: runtime.url,
      token: runtime.token,
      source: "RUNTIME_CONFIG",
    };
  }

  return {
    url: "",
    token: "",
    source: "NONE",
  };
}

/**
 * Lazy-initialized Vercel / Upstash Redis client (safe for `next build`).
 */
export function getRedisClient(): Redis | null {
  const cfg = resolveRedisConfig();
  if (!cfg.url || !cfg.token) {
    return null;
  }

  const signature = `${cfg.url}::${cfg.token}`;
  if (!cachedRedisClient || cachedConfigSignature !== signature) {
    cachedRedisClient = new Redis({
      url: cfg.url,
      token: cfg.token,
    });
    cachedConfigSignature = signature;
  }

  return cachedRedisClient;
}

