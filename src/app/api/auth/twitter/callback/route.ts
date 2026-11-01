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

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError =
    searchParams.get("error_description") || searchParams.get("error");

  const homeUrl = new URL("/", req.nextUrl.origin);

  if (oauthError) {
    homeUrl.searchParams.set("auth_error", oauthError);
    return NextResponse.redirect(homeUrl);
  }

  if (!code || !state) {
    homeUrl.searchParams.set(
      "auth_error",
      "Missing authorization code or PKCE state parameter from X callback."
    );
    return NextResponse.redirect(homeUrl);
  }

  const pkceSession = await consumePKCESession(state);
  if (!pkceSession) {
    homeUrl.searchParams.set(
      "auth_error",
      "Invalid or expired PKCE state session. Please try logging in again."
    );
    return NextResponse.redirect(homeUrl);
  }

  try {
    const tokenData = await exchangeCodeForTokens({
      code,
      codeVerifier: pkceSession.codeVerifier,
      redirectUri: pkceSession.redirectUri,
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
      message: `Authenticated @${savedAccount.username} via X OAuth 2.0 PKCE and stored token in Vercel Redis.`,
      httpStatus: 200,
    });

    homeUrl.searchParams.set("auth_success", savedAccount.username);
    return NextResponse.redirect(homeUrl);
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Failed to complete X OAuth 2.0 token exchange";
    homeUrl.searchParams.set("auth_error", msg);
    return NextResponse.redirect(homeUrl);
  }
}
