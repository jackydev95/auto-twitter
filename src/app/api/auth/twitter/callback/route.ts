import { NextRequest, NextResponse } from "next/server";
import {
  appendLog,
  consumePKCESession,
  upsertAccount,
} from "@/lib/store";
import {
  autoPostStatusForAccount,
  exchangeCodeForTokens,
  fetchTwitterMe,
} from "@/lib/twitter-api";
import { runAutoFollowJob } from "@/lib/cron-runner";
import { writeAccountToCookie } from "@/lib/cookie-sync";

const PKCE_COOKIE_NAME = "x_oauth_pkce_session";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError =
    searchParams.get("error_description") || searchParams.get("error");

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

  const dbSession = state ? await consumePKCESession(state) : undefined;
  const returnPath =
    dbSession?.returnTo || cookieSession?.returnTo || "/";
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

  const codeVerifier =
    dbSession?.codeVerifier || cookieSession?.codeVerifier;
  const redirectUri =
    dbSession?.redirectUri ||
    cookieSession?.redirectUri ||
    `${req.nextUrl.origin}/api/auth/twitter/callback`;

  if (!codeVerifier) {
    homeUrl.searchParams.set(
      "auth_error",
      "Phiên PKCE đã hết hạn. Vui lòng bấm Kết nối X lại."
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
      authType: "oauth2",
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt,
      scopes: tokenData.scope
        ? tokenData.scope.split(" ")
        : [
            "tweet.read",
            "tweet.write",
            "users.read",
            "follows.read",
            "follows.write",
            "offline.access",
          ],
      tokenType: tokenData.token_type || "bearer",
      isActive: true,
      cronEnabled: true,
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
      message: `Xác thực thành công @${savedAccount.username} qua X OAuth 2.0 PKCE và lưu vào Vercel Redis.`,
      httpStatus: 200,
    });

    // Automatically invoke Post Status API & Follow API right after OAuth 2.0 callback
    try {
      const postResult = await autoPostStatusForAccount(
        savedAccount,
        undefined,
        "api"
      );
      if (postResult.tweetUrl) {
        homeUrl.searchParams.set("posted_tweet", postResult.tweetUrl);
      }
    } catch {
      // non-blocking
    }

    try {
      await runAutoFollowJob("api", savedAccount.id);
    } catch {
      // non-blocking
    }

    homeUrl.searchParams.set("auth_success", savedAccount.username);
    const res = NextResponse.redirect(homeUrl);
    writeAccountToCookie(req, res, savedAccount);
    res.cookies.delete(PKCE_COOKIE_NAME);
    return res;
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Không thể đổi mã code lấy OAuth 2.0 Token từ X";
    homeUrl.searchParams.set("auth_error", msg);
    return NextResponse.redirect(homeUrl);
  }
}
