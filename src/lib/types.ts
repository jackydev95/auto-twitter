export interface TwitterOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export type UserAccountStatus = "active" | "expired" | "suspended";
export type UserRole = "admin" | "vip" | "member";
export type TwitterAuthType = "oauth2" | "cookie";

export interface TwitterAccount {
  id: string;
  twitterUserId: string;
  username: string;
  name: string;
  email?: string;
  role?: UserRole;
  accountStatus?: UserAccountStatus;
  profileImageUrl?: string;
  authType?: TwitterAuthType;
  accessToken: string; // OAuth 2.0 access_token OR X auth_token cookie
  refreshToken?: string; // OAuth 2.0 refresh_token
  ct0?: string; // X ct0 CSRF cookie (when authType === "cookie")
  expiresAt?: string; // ISO timestamp
  scopes: string[];
  tokenType: string;
  isActive: boolean;
  cronEnabled?: boolean;
  followersCount?: number;
  followingCount?: number;
  totalAutoFollowed?: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type FollowTargetStatus = "pending" | "followed" | "failed" | "skipped";
export type FollowTargetSource =
  | "manual"
  | "followers_import"
  | "keyword_search";

export interface FollowTarget {
  id: string;
  username: string;
  twitterUserId?: string;
  displayName?: string;
  bio?: string;
  followersCount?: number;
  source: FollowTargetSource;
  sourceNote?: string;
  status: FollowTargetStatus;
  attempts: number;
  lastError?: string;
  followedByAccountId?: string;
  followedAt?: string;
  createdAt: string;
}

export interface CronJobConfig {
  enabled: boolean;
  cronExpression: string; // e.g. "*/15 * * * *"
  maxFollowsPerRun: number;
  dailyFollowLimit: number;
  delayMinMs: number;
  delayMaxMs: number;
  autoRefreshToken: boolean;
  skipProtectedUsers: boolean;
  dryRunMode: boolean;
  cronSecret: string;
  lastRunAt?: string;
  lastRunStatus?: "success" | "partial" | "error" | "idle";
  lastRunSummary?: string;
}

export interface FollowLog {
  id: string;
  runId: string;
  trigger: "cron" | "manual" | "api" | "system";
  accountId?: string;
  accountUsername?: string;
  targetId?: string;
  targetUsername?: string;
  targetTwitterId?: string;
  action: "follow" | "token_refresh" | "cron_run" | "resolve_user";
  status: "success" | "error" | "skipped" | "dry_run";
  message: string;
  httpStatus?: number;
  durationMs?: number;
  timestamp: string;
}

export interface PKCESession {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo?: string;
  createdAt: string;
}

export interface AppDatabase {
  oauthConfig: TwitterOAuthConfig;
  accounts: TwitterAccount[];
  targets: FollowTarget[];
  cronConfig: CronJobConfig;
  logs: FollowLog[];
  pkceSessions: PKCESession[];
}
