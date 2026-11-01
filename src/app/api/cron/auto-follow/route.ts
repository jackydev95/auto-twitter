import { NextRequest, NextResponse } from "next/server";
import { getCronConfig } from "@/lib/store";
import { runAutoFollowJob } from "@/lib/cron-runner";
import { syncCookieAccountsIntoStore } from "@/lib/cookie-sync";

async function isAuthorizedCronRequest(req: NextRequest): Promise<boolean> {
  // Allow same-origin internal auto-caller requests
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") return true;

  // Allow Vercel Cron user-agent
  const ua = req.headers.get("user-agent") || "";
  if (ua.includes("vercel-cron")) return true;

  const config = await getCronConfig();
  const secret = config.cronSecret || process.env.CRON_SECRET;
  if (!secret) return true;

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const querySecret = req.nextUrl.searchParams.get("secret");
  if (querySecret === secret) return true;

  return false;
}

export async function GET(req: NextRequest) {
  await syncCookieAccountsIntoStore(req);
  if (!(await isAuthorizedCronRequest(req))) {
    return NextResponse.json(
      {
        error:
          "Unauthorized cron call. Provide Authorization: Bearer <CRON_SECRET> or ?secret=<CRON_SECRET>",
      },
      { status: 401 }
    );
  }

  const accountId = req.nextUrl.searchParams.get("accountId") || undefined;
  const targetId = req.nextUrl.searchParams.get("targetId") || undefined;
  const result = await runAutoFollowJob("api", accountId, targetId);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    await syncCookieAccountsIntoStore(req);
    const body = await req.json().catch(() => ({}));
    const rawTrigger = body.trigger;
    const trigger: "cron" | "manual" | "api" =
      rawTrigger === "manual"
        ? "manual"
        : rawTrigger === "cron"
        ? "cron"
        : "api";

    if (
      rawTrigger !== "manual" &&
      rawTrigger !== "auto_interval" &&
      !(await isAuthorizedCronRequest(req))
    ) {
      return NextResponse.json(
        { error: "Unauthorized cron webhook request" },
        { status: 401 }
      );
    }

    const result = await runAutoFollowJob(
      trigger,
      body.accountId,
      body.targetId
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to run auto-follow job",
      },
      { status: 500 }
    );
  }
}
