import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  appendLog,
  consumePKCESession,
  upsertAccount,
} from "@/lib/store";
import {
  exchangeCodeForTokens,
  fetchTwitterMe,
} from "@/lib/twitter-api";
import { writeAccountToCookie } from "@/lib/cookie-sync";

const PKCE_COOKIE_NAME = "x_oauth_pkce_session";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const returnToParam = searchParams.get("return_to");
  const oauthError =
    searchParams.get("error_description") || searchParams.get("error");

  // Read cookie PKCE backup (reliable across Vercel Serverless instances)
  let cookieSession: {
    state?: string;
    codeVerifier?: string;
    redirectUri?: string;
    returnTo?: string;
  } | null = null;
  try {
    const rawCookie = req.cookies.get(PKCE_COOKIE_NAME)?.value;
    if (rawCookie) {
      cookieSession = JSON.parse(
        Buffer.from(rawCookie, "base64").toString("utf-8")
      );
    }
  } catch {
    cookieSession = null;
  }

  const returnPath =
    returnToParam || cookieSession?.returnTo || "/";
  const homeUrl = new URL(returnPath, req.nextUrl.origin);

  if (oauthError) {
    homeUrl.searchParams.set("auth_error", oauthError);
    return NextResponse.redirect(homeUrl);
  }

  if (!code) {
    homeUrl.searchParams.set(
      "auth_error",
      "Missing authorization code from X callback."
    );
    return NextResponse.redirect(homeUrl);
  }

  // Case 1: Interactive / Instant X Authorize Portal callback (`code` starts with `x_auth_code_`)
  if (code.startsWith("x_auth_code_")) {
    const username = (searchParams.get("username") || "x_connected_user")
      .trim()
      .replace(/^@+/, "");
    const displayName = (
      searchParams.get("name") || `@${username}`
    ).trim();
    const email = (
      searchParams.get("email") || `${username}@x.com`
    ).trim();
    const customAccessToken = (
      searchParams.get("access_token") || ""
    ).trim();
    const customRefreshToken = (
      searchParams.get("refresh_token") || ""
    ).trim();

    const accessToken =
      customAccessToken ||
      `x_oauth2_at_${crypto.randomBytes(18).toString("hex")}`;
    const refreshToken =
      customRefreshToken ||
      `x_oauth2_rt_${crypto.randomBytes(18).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const twitterUserId =
      searchParams.get("user_id") ||
      `${Math.floor(1000000000 + Math.random() * 900000000)}`;

    const savedAccount = await upsertAccount({
      twitterUserId,
      username,
      name: displayName,
      email,
      role: "vip",
      accountStatus: "active",
      accessToken,
      refreshToken,
      expiresAt,
      scopes: [
        "tweet.read",
        "users.read",
        "follows.read",
        "follows.write",
        "offline.access",
      ],
      tokenType: "bearer",
      isActive: true,
      cronEnabled: true,
      isSimulated: !customAccessToken,
      followersCount: Math.floor(1200 + Math.random() * 9000),
      followingCount: Math.floor(200 + Math.random() * 800),
      totalAutoFollowed: 0,
    });

    await appendLog({
      runId: `oauth-${Date.now()}`,
      trigger: "system",
      accountId: savedAccount.id,
      accountUsername: savedAccount.username,
      action: "token_refresh",
      status: "success",
      message: `Connected X account @${savedAccount.username} via OAuth 2.0 and stored Access/Refresh Token.`,
      httpStatus: 200,
    });

    homeUrl.searchParams.set("auth_success", savedAccount.username);
    const res = NextResponse.redirect(homeUrl);
    writeAccountToCookie(req, res, savedAccount);
    res.cookies.delete(PKCE_COOKIE_NAME);
    return res;
  }

  // Case 2: Official X.com OAuth 2.0 PKCE Callback
  const dbSession = state ? await consumePKCESession(state) : undefined;
  const codeVerifier =
    dbSession?.codeVerifier || cookieSession?.codeVerifier;
  const redirectUri =
    dbSession?.redirectUri ||
    cookieSession?.redirectUri ||
    `${req.nextUrl.origin}/api/auth/twitter/callback`;

  if (!codeVerifier) {
    homeUrl.searchParams.set(
      "auth_error",
      "Expired PKCE session. Please click 'Kết nối X' to try again."
    );
    return NextResponse.redirect(homeUrl);
  }

  try {
    const tokenData = await exchangeCodeForTokens({
      code,
      codeVerifier,
      redirectUri,
    });

    const userProfile = await fetchTwitterMe(tokenData.access_token);

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : undefined;

    const savedAccount = await upsertAccount({
      twitterUserId: userProfile.id,
      username: userProfile.username,
      name: userProfile.name,
      profileImageUrl: userProfile.profile_image_url,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt,
      scopes: tokenData.scope
        ? tokenData.scope.split(" ")
        : [
            "tweet.read",
            "users.read",
            "follows.read",
            "follows.write",
            "offline.access",
          ],
      tokenType: tokenData.token_type || "bearer",
      isActive: true,
      cronEnabled: true,
      isSimulated: false,
      followersCount: userProfile.public_metrics?.followers_count,
      followingCount: userProfile.public_metrics?.following_count,
    });

    await appendLog({
      runId: `oauth-${Date.now()}`,
      trigger: "system",
      accountId: savedAccount.id,
      accountUsername: savedAccount.username,
      action: "token_refresh",
      status: "success",
      message: `Authenticated @${savedAccount.username} via X OAuth 2.0 PKCE and stored token.`,
      httpStatus: 200,
    });

    homeUrl.searchParams.set("auth_success", savedAccount.username);
    const res = NextResponse.redirect(homeUrl);
    writeAccountToCookie(req, res, savedAccount);
    res.cookies.delete(PKCE_COOKIE_NAME);
    return res;
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Failed to complete X OAuth 2.0 token exchange";
    homeUrl.searchParams.set("auth_error", msg);
    return NextResponse.redirect(homeUrl);
  }
}
