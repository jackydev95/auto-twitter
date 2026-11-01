import crypto from "crypto";
import {
  appendLog,
  getOAuthConfig,
  savePKCESession,
  upsertAccount,
} from "./store";
import { TwitterAccount } from "./types";

const X_AUTH_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const X_API_BASE = "https://api.twitter.com/2";

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createOAuthAuthorizationUrl(options?: {
  customRedirectUri?: string;
  origin?: string;
  forceInteractivePortal?: boolean;
  returnTo?: string;
}): Promise<{
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  isInteractivePortal: boolean;
}> {
  const config = await getOAuthConfig();

  const state = base64UrlEncode(crypto.randomBytes(24));
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );

  const origin = options?.origin || "http://localhost:3000";
  const redirectUri =
    options?.customRedirectUri ||
    (config.redirectUri &&
    !config.redirectUri.includes("localhost") &&
    origin.includes("localhost") === false
      ? config.redirectUri
      : `${origin}/api/auth/twitter/callback`);

  const scopes =
    config.scopes && config.scopes.length > 0
      ? config.scopes
      : [
          "tweet.read",
          "users.read",
          "follows.read",
          "follows.write",
          "offline.access",
        ];

  await savePKCESession({
    state,
    codeVerifier,
    redirectUri,
    createdAt: new Date().toISOString(),
  });

  const hasRealClientId = Boolean(config.clientId && config.clientId.trim());
  const useInteractive =
    options?.forceInteractivePortal || !hasRealClientId;

  if (useInteractive) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: config.clientId || "x_auto_follow_studio_client",
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      return_to: options?.returnTo || "/",
    });

    return {
      authorizationUrl: `${origin}/oauth/x-authorize?${params.toString()}`,
      state,
      codeVerifier,
      redirectUri,
      isInteractivePortal: true,
    };
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId.trim(),
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    authorizationUrl: `${X_AUTH_URL}?${params.toString()}`,
    state,
    codeVerifier,
    redirectUri,
    isInteractivePortal: false,
  };
}

export interface TokenExchangeResponse {
  token_type: string;
  expires_in?: number;
  access_token: string;
  scope?: string;
  refresh_token?: string;
}

export async function exchangeCodeForTokens(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenExchangeResponse> {
  const config = await getOAuthConfig();
  if (!config.clientId) {
    throw new Error("Twitter Client ID is not configured.");
  }

  const body = new URLSearchParams({
    code: params.code,
    grant_type: "authorization_code",
    client_id: config.clientId,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (config.clientSecret) {
    const basicAuth = Buffer.from(
      `${config.clientId}:${config.clientSecret}`
    ).toString("base64");
    headers["Authorization"] = `Basic ${basicAuth}`;
  }

  const res = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data?.error_description ||
        data?.error ||
        `Token exchange failed with HTTP ${res.status}`
    );
  }

  return data as TokenExchangeResponse;
}

export async function refreshAccountAccessToken(
  account: TwitterAccount
): Promise<TwitterAccount> {
  if (account.isSimulated) {
    const expiresAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
    const updated = await upsertAccount({
      ...account,
      accountStatus: "active",
      accessToken: `sim_x_oauth2_${crypto.randomBytes(12).toString("hex")}`,
      expiresAt,
    });
    await appendLog({
      runId: `refresh-${Date.now()}`,
      trigger: "system",
      accountId: updated.id,
      accountUsername: updated.username,
      action: "token_refresh",
      status: "dry_run",
      message: `Refreshed OAuth2 token in Vercel Redis for @${updated.username}`,
      httpStatus: 200,
    });
    return updated;
  }

  if (!account.refreshToken) {
    throw new Error(
      `Account @${account.username} does not have a refresh_token. Ensure 'offline.access' scope is enabled.`
    );
  }

  const config = await getOAuthConfig();
  if (!config.clientId) {
    throw new Error(
      "Cannot refresh token: Twitter Client ID is missing in OAuth Config."
    );
  }

  const body = new URLSearchParams({
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
    client_id: config.clientId,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (config.clientSecret) {
    const basicAuth = Buffer.from(
      `${config.clientId}:${config.clientSecret}`
    ).toString("base64");
    headers["Authorization"] = `Basic ${basicAuth}`;
  }

  const start = Date.now();
  const res = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  const data = await res.json();
  const durationMs = Date.now() - start;

  if (!res.ok) {
    const errMsg =
      data?.error_description ||
      data?.error ||
      `Token refresh failed (HTTP ${res.status})`;
    await appendLog({
      runId: `refresh-${Date.now()}`,
      trigger: "system",
      accountId: account.id,
      accountUsername: account.username,
      action: "token_refresh",
      status: "error",
      message: errMsg,
      httpStatus: res.status,
      durationMs,
    });
    throw new Error(errMsg);
  }

  const tokenData = data as TokenExchangeResponse;
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : account.expiresAt;

  const updated = await upsertAccount({
    ...account,
    accountStatus: "active",
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || account.refreshToken,
    expiresAt,
    scopes: tokenData.scope ? tokenData.scope.split(" ") : account.scopes,
  });

  await appendLog({
    runId: `refresh-${Date.now()}`,
    trigger: "system",
    accountId: updated.id,
    accountUsername: updated.username,
    action: "token_refresh",
    status: "success",
    message: `Successfully refreshed OAuth 2.0 access token for @${updated.username}`,
    httpStatus: 200,
    durationMs,
  });

  return updated;
}

export async function ensureValidToken(
  account: TwitterAccount,
  autoRefresh = true
): Promise<TwitterAccount> {
  if (!autoRefresh || !account.expiresAt || !account.refreshToken) {
    return account;
  }
  const expiresMs = new Date(account.expiresAt).getTime();
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
  if (expiresMs <= fiveMinutesFromNow) {
    return await refreshAccountAccessToken(account);
  }
  return account;
}

export interface XUserProfile {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
  description?: string;
  protected?: boolean;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
}

export async function fetchTwitterMe(
  accessToken: string
): Promise<XUserProfile> {
  const url = `${X_API_BASE}/users/me?user.fields=id,name,username,profile_image_url,description,public_metrics`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const json = await res.json();
  if (!res.ok || !json?.data) {
    throw new Error(
      json?.detail ||
        json?.title ||
        json?.errors?.[0]?.message ||
        `Failed to fetch /2/users/me (HTTP ${res.status})`
    );
  }

  return json.data as XUserProfile;
}

export async function lookupTwitterUserByUsername(
  accessToken: string,
  username: string
): Promise<XUserProfile> {
  const clean = username.trim().replace(/^@+/, "");
  const url = `${X_API_BASE}/users/by/username/${encodeURIComponent(
    clean
  )}?user.fields=id,name,username,profile_image_url,description,protected,public_metrics`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const json = await res.json();
  if (!res.ok || !json?.data) {
    throw new Error(
      json?.detail ||
        json?.errors?.[0]?.detail ||
        json?.title ||
        `Failed to lookup @${clean} (HTTP ${res.status})`
    );
  }

  return json.data as XUserProfile;
}

export async function fetchUserFollowersFromTwitter(
  accessToken: string,
  targetUsername: string,
  maxResults = 20
): Promise<XUserProfile[]> {
  const targetUser = await lookupTwitterUserByUsername(
    accessToken,
    targetUsername
  );

  const clampedMax = Math.max(5, Math.min(100, maxResults));
  const url = `${X_API_BASE}/users/${targetUser.id}/followers?max_results=${clampedMax}&user.fields=id,name,username,description,protected,public_metrics`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      json?.detail ||
        json?.title ||
        `Failed to fetch followers for @${targetUsername} (HTTP ${res.status})`
    );
  }

  return (json.data || []) as XUserProfile[];
}

export async function executeTwitterFollowRequest(params: {
  sourceUserId: string;
  targetUserId: string;
  accessToken: string;
}): Promise<{
  following: boolean;
  pending_follow: boolean;
  httpStatus: number;
}> {
  const url = `${X_API_BASE}/users/${encodeURIComponent(
    params.sourceUserId
  )}/following`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target_user_id: params.targetUserId,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      json?.detail ||
      json?.errors?.[0]?.message ||
      json?.title ||
      `Follow API error (HTTP ${res.status})`;
    const error = new Error(detail) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  return {
    following: Boolean(json?.data?.following),
    pending_follow: Boolean(json?.data?.pending_follow),
    httpStatus: res.status,
  };
}
