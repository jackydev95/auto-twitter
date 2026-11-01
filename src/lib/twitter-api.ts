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

// Official X Web Client Bearer Token used for Cookie (auth_token + ct0) requests
const X_WEB_BEARER_TOKEN =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

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
  returnTo?: string;
  clientIdOverride?: string;
}): Promise<{
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
}> {
  const config = await getOAuthConfig();
  const clientId = (options?.clientIdOverride || config.clientId || "").trim();

  if (!clientId) {
    throw new Error(
      "MISSING_CLIENT_ID: Vui lòng nhập X OAuth 2.0 Client ID (từ developer.x.com) trước khi chuyển hướng sang X.com."
    );
  }

  const state = base64UrlEncode(crypto.randomBytes(24));
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );

  const origin = options?.origin || "https://auto-twitter.vercel.app";
  const redirectUri =
    options?.customRedirectUri || `${origin}/api/auth/twitter/callback`;

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
    returnTo: options?.returnTo || "/",
    createdAt: new Date().toISOString(),
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
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
  const clientId = config.clientId?.trim();
  const clientSecret = config.clientSecret?.trim();

  if (!clientId) {
    throw new Error("Twitter OAuth 2.0 Client ID is not configured.");
  }

  const body = new URLSearchParams({
    code: params.code,
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });

  // 1. Try with Basic Auth if clientSecret is provided (Confidential Client)
  if (clientSecret) {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64"
    );
    const res = await fetch(X_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.access_token) {
      return data as TokenExchangeResponse;
    }

    // If app is configured as Public Client in X Portal, retry without Basic Auth header
  }

  // 2. Public Client PKCE token request
  const publicRes = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const publicData = await publicRes.json().catch(() => ({}));
  if (!publicRes.ok || !publicData.access_token) {
    throw new Error(
      publicData?.error_description ||
        publicData?.error ||
        `X OAuth 2.0 token exchange failed (HTTP ${publicRes.status})`
    );
  }

  return publicData as TokenExchangeResponse;
}

export async function refreshAccountAccessToken(
  account: TwitterAccount
): Promise<TwitterAccount> {
  if (account.authType === "cookie") {
    if (!account.ct0) {
      throw new Error(
        `Account @${account.username} uses Cookie auth and requires ct0 CSRF token.`
      );
    }
    const verified = await verifyTwitterCookieSession(
      account.accessToken,
      account.ct0
    );
    const updated = await upsertAccount({
      ...account,
      twitterUserId: verified.id,
      username: verified.username,
      name: verified.name,
      profileImageUrl: verified.profile_image_url,
      followersCount: verified.public_metrics?.followers_count,
      followingCount: verified.public_metrics?.following_count,
      accountStatus: "active",
    });
    await appendLog({
      runId: `verify-${Date.now()}`,
      trigger: "system",
      accountId: updated.id,
      accountUsername: updated.username,
      action: "token_refresh",
      status: "success",
      message: `Verified active X session cookie (auth_token + ct0) for @${updated.username}`,
      httpStatus: 200,
    });
    return updated;
  }

  if (!account.refreshToken) {
    throw new Error(
      `Tài khoản @${account.username} không có refresh_token. Hãy đảm bảo bật quyền 'offline.access' khi lấy token.`
    );
  }

  const config = await getOAuthConfig();
  const clientId = config.clientId?.trim();
  const clientSecret = config.clientSecret?.trim();

  if (!clientId) {
    throw new Error(
      "Không thể refresh token: Chưa cấu hình X OAuth 2.0 Client ID."
    );
  }

  const body = new URLSearchParams({
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
    client_id: clientId,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (clientSecret) {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64"
    );
    headers["Authorization"] = `Basic ${basicAuth}`;
  }

  const start = Date.now();
  let res = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!res.ok && clientSecret) {
    // Fallback to Public Client refresh
    res = await fetch(X_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  }

  const data = await res.json().catch(() => ({}));
  const durationMs = Date.now() - start;

  if (!res.ok || !data.access_token) {
    const errMsg =
      data?.error_description ||
      data?.error ||
      `Refresh token failed (HTTP ${res.status})`;
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
    message: `Refreshed OAuth 2.0 access_token for @${updated.username}`,
    httpStatus: 200,
    durationMs,
  });

  return updated;
}

export async function ensureValidToken(
  account: TwitterAccount,
  autoRefresh = true
): Promise<TwitterAccount> {
  if (account.authType === "cookie") {
    return account;
  }
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

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.data) {
    throw new Error(
      json?.detail ||
        json?.title ||
        json?.errors?.[0]?.message ||
        `X API /2/users/me trả về lỗi (HTTP ${res.status})`
    );
  }

  return json.data as XUserProfile;
}

/**
 * Verifies a real X Web Session (`auth_token` + `ct0` cookies) against X's account API.
 */
export async function verifyTwitterCookieSession(
  authToken: string,
  ct0: string
): Promise<XUserProfile> {
  const cleanAuthToken = authToken.trim();
  const cleanCt0 = ct0.trim();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${decodeURIComponent(X_WEB_BEARER_TOKEN)}`,
    Cookie: `auth_token=${cleanAuthToken}; ct0=${cleanCt0}`,
    "x-csrf-token": cleanCt0,
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };

  const res = await fetch(
    "https://api.x.com/1.1/account/verify_credentials.json?include_entities=false&skip_status=true",
    {
      method: "GET",
      headers,
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id_str) {
    const errDetail =
      data?.errors?.[0]?.message ||
      `Không thể xác thực Cookie X (HTTP ${res.status}). Hãy kiểm tra lại auth_token và ct0.`;
    throw new Error(errDetail);
  }

  return {
    id: String(data.id_str),
    name: String(data.name || data.screen_name),
    username: String(data.screen_name),
    profile_image_url: data.profile_image_url_https,
    description: data.description,
    protected: Boolean(data.protected),
    public_metrics: {
      followers_count: Number(data.followers_count || 0),
      following_count: Number(data.friends_count || 0),
      tweet_count: Number(data.statuses_count || 0),
    },
  };
}

export async function lookupTwitterUserByUsername(
  account: TwitterAccount,
  username: string
): Promise<XUserProfile> {
  const clean = username.trim().replace(/^@+/, "");

  if (account.authType === "cookie" && account.ct0) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${decodeURIComponent(X_WEB_BEARER_TOKEN)}`,
      Cookie: `auth_token=${account.accessToken}; ct0=${account.ct0}`,
      "x-csrf-token": account.ct0,
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    };

    const res = await fetch(
      `https://api.x.com/1.1/users/show.json?screen_name=${encodeURIComponent(
        clean
      )}`,
      { headers }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.id_str) {
      throw new Error(
        data?.errors?.[0]?.message ||
          `Failed to resolve @${clean} via X Session (HTTP ${res.status})`
      );
    }

    return {
      id: String(data.id_str),
      name: String(data.name || clean),
      username: String(data.screen_name || clean),
      profile_image_url: data.profile_image_url_https,
      description: data.description,
      protected: Boolean(data.protected),
      public_metrics: {
        followers_count: Number(data.followers_count || 0),
        following_count: Number(data.friends_count || 0),
        tweet_count: Number(data.statuses_count || 0),
      },
    };
  }

  const url = `${X_API_BASE}/users/by/username/${encodeURIComponent(
    clean
  )}?user.fields=id,name,username,profile_image_url,description,protected,public_metrics`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
    },
  });

  const json = await res.json().catch(() => ({}));
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
  account: TwitterAccount,
  targetUsername: string,
  maxResults = 20
): Promise<XUserProfile[]> {
  const clean = targetUsername.trim().replace(/^@+/, "");
  const clampedMax = Math.max(5, Math.min(100, maxResults));

  if (account.authType === "cookie" && account.ct0) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${decodeURIComponent(X_WEB_BEARER_TOKEN)}`,
      Cookie: `auth_token=${account.accessToken}; ct0=${account.ct0}`,
      "x-csrf-token": account.ct0,
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    };

    const res = await fetch(
      `https://api.x.com/1.1/followers/list.json?screen_name=${encodeURIComponent(
        clean
      )}&count=${clampedMax}&skip_status=true&include_user_entities=false`,
      { headers }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data?.users)) {
      throw new Error(
        data?.errors?.[0]?.message ||
          `Failed to fetch followers for @${clean} (HTTP ${res.status})`
      );
    }

    return data.users.map((u: Record<string, unknown>) => ({
      id: String(u.id_str || ""),
      name: String(u.name || u.screen_name || ""),
      username: String(u.screen_name || ""),
      description: String(u.description || ""),
      protected: Boolean(u.protected),
      public_metrics: {
        followers_count: Number(u.followers_count || 0),
        following_count: Number(u.friends_count || 0),
        tweet_count: Number(u.statuses_count || 0),
      },
    }));
  }

  const targetUser = await lookupTwitterUserByUsername(account, clean);
  const url = `${X_API_BASE}/users/${targetUser.id}/followers?max_results=${clampedMax}&user.fields=id,name,username,description,protected,public_metrics`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
    },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      json?.detail ||
        json?.title ||
        `Failed to fetch followers for @${clean} (HTTP ${res.status})`
    );
  }

  return (json.data || []) as XUserProfile[];
}

export async function executeTwitterFollowRequest(params: {
  account: TwitterAccount;
  targetUserId?: string;
  targetUsername: string;
}): Promise<{
  following: boolean;
  pending_follow: boolean;
  httpStatus: number;
  resolvedUserId?: string;
}> {
  const { account, targetUserId, targetUsername } = params;

  // 1. Real Follow via X Cookie Session (auth_token + ct0)
  if (account.authType === "cookie" && account.ct0) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${decodeURIComponent(X_WEB_BEARER_TOKEN)}`,
      Cookie: `auth_token=${account.accessToken}; ct0=${account.ct0}`,
      "x-csrf-token": account.ct0,
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes",
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `https://x.com/${targetUsername}`,
      Origin: "https://x.com",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    };

    const form = new URLSearchParams({
      include_profile_interstitial_type: "1",
      skip_status: "true",
    });
    if (targetUserId) {
      form.set("user_id", targetUserId);
    } else {
      form.set("screen_name", targetUsername.replace(/^@+/, ""));
    }

    const res = await fetch(
      "https://x.com/i/api/1.1/friendships/create.json",
      {
        method: "POST",
        headers,
        body: form.toString(),
      }
    );

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail =
        json?.errors?.[0]?.message ||
        `X Follow API error (HTTP ${res.status})`;
      const error = new Error(detail) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }

    return {
      following: Boolean(json?.following ?? true),
      pending_follow: Boolean(json?.follow_request_sent),
      httpStatus: res.status,
      resolvedUserId: json?.id_str ? String(json.id_str) : targetUserId,
    };
  }

  // 2. Real Follow via Official X API v2 OAuth 2.0 User Context
  if (!targetUserId) {
    throw new Error(`Missing target_user_id for @${targetUsername}`);
  }

  const url = `${X_API_BASE}/users/${encodeURIComponent(
    account.twitterUserId
  )}/following`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target_user_id: targetUserId,
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
    resolvedUserId: targetUserId,
  };
}
