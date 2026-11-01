import { NextRequest, NextResponse } from "next/server";
import { createOAuthAuthorizationUrl } from "@/lib/twitter-api";

export async function GET(req: NextRequest) {
  try {
    const mode = req.nextUrl.searchParams.get("mode");
    const { authorizationUrl, state } = await createOAuthAuthorizationUrl();

    if (mode === "json") {
      return NextResponse.json({ authorizationUrl, state });
    }

    return NextResponse.redirect(authorizationUrl);
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
    const { authorizationUrl, state } = await createOAuthAuthorizationUrl(
      body.redirectUri
    );
    return NextResponse.json({ authorizationUrl, state });
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
