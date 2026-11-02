import { NextRequest, NextResponse } from "next/server";
import { createOAuthAuthorizationUrl } from "@/lib/twitter-api";
import { getOAuthConfig, updateOAuthConfig } from "@/lib/store";

export const PKCE_COOKIE_NAME = "x_oauth_pkce_session";

export async function GET(req: NextRequest) {
  try {
    const mode = req.nextUrl.searchParams.get("mode");
    const returnTo = req.nextUrl.searchParams.get("return_to") || "/";
    const clientIdParam = req.nextUrl.searchParams.get("client_id")?.trim();

    if (clientIdParam) {
      await updateOAuthConfig({
        clientId: clientIdParam,
        redirectUri: `${req.nextUrl.origin}/api/auth/twitter/callback`,
      });
    }

    const { authorizationUrl, state, codeVerifier, redirectUri } =
      await createOAuthAuthorizationUrl({
        origin: req.nextUrl.origin,
        returnTo,
        clientIdOverride: clientIdParam,
      });

    const cookiePayload = Buffer.from(
      JSON.stringify({ state, codeVerifier, redirectUri, returnTo }),
      "utf-8"
    ).toString("base64");

    if (mode === "json") {
      const res = NextResponse.json({
        authorizationUrl,
        state,
      });
      res.cookies.set(PKCE_COOKIE_NAME, cookiePayload, {
        path: "/",
        httpOnly: true,
        maxAge: 900,
        sameSite: "lax",
      });
      return res;
    }

    const res = NextResponse.redirect(authorizationUrl);
    res.cookies.set(PKCE_COOKIE_NAME, cookiePayload, {
      path: "/",
      httpOnly: true,
      maxAge: 900,
      sameSite: "lax",
    });
    return res;
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Failed to initiate X OAuth 2.0 flow";
    if (req.nextUrl.searchParams.get("mode") === "json") {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const redirectUrl = new URL("/oauth/x-authorize", req.nextUrl.origin);
    redirectUrl.searchParams.set("error", msg);
    return NextResponse.redirect(redirectUrl);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.clientId) {
      await updateOAuthConfig({
        clientId: String(body.clientId).trim(),
        clientSecret: body.clientSecret
          ? String(body.clientSecret).trim()
          : undefined,
        redirectUri:
          body.redirectUri ||
          `${req.nextUrl.origin}/api/auth/twitter/callback`,
      });
    }

    const { authorizationUrl, state, codeVerifier, redirectUri } =
      await createOAuthAuthorizationUrl({
        customRedirectUri: body.redirectUri,
        origin: req.nextUrl.origin,
        returnTo: body.returnTo || "/",
        clientIdOverride: body.clientId,
      });

    const cookiePayload = Buffer.from(
      JSON.stringify({
        state,
        codeVerifier,
        redirectUri,
        returnTo: body.returnTo || "/",
      }),
      "utf-8"
    ).toString("base64");

    const res = NextResponse.json({
      authorizationUrl,
      state,
    });
    res.cookies.set(PKCE_COOKIE_NAME, cookiePayload, {
      path: "/",
      httpOnly: true,
      maxAge: 900,
      sameSite: "lax",
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to generate OAuth URL",
      },
      { status: 400 }
    );
  }
}
