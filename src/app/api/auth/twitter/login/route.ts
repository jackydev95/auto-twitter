import { NextRequest, NextResponse } from "next/server";
import { createOAuthAuthorizationUrl } from "@/lib/twitter-api";

export const PKCE_COOKIE_NAME = "x_oauth_pkce_session";

export async function GET(req: NextRequest) {
  try {
    const mode = req.nextUrl.searchParams.get("mode");
    const forceInteractive =
      req.nextUrl.searchParams.get("interactive") === "1";
    const returnTo = req.nextUrl.searchParams.get("return_to") || "/";

    const {
      authorizationUrl,
      state,
      codeVerifier,
      redirectUri,
      isInteractivePortal,
    } = await createOAuthAuthorizationUrl({
      origin: req.nextUrl.origin,
      forceInteractivePortal: forceInteractive,
      returnTo,
    });

    const cookiePayload = Buffer.from(
      JSON.stringify({ state, codeVerifier, redirectUri, returnTo }),
      "utf-8"
    ).toString("base64");

    if (mode === "json") {
      const res = NextResponse.json({
        authorizationUrl,
        state,
        isInteractivePortal,
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
    const redirectUrl = new URL("/", req.nextUrl.origin);
    redirectUrl.searchParams.set("auth_error", msg);
    return NextResponse.redirect(redirectUrl);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      authorizationUrl,
      state,
      codeVerifier,
      redirectUri,
      isInteractivePortal,
    } = await createOAuthAuthorizationUrl({
      customRedirectUri: body.redirectUri,
      origin: req.nextUrl.origin,
      forceInteractivePortal: Boolean(body.forceInteractivePortal),
      returnTo: body.returnTo || "/",
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
      isInteractivePortal,
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
