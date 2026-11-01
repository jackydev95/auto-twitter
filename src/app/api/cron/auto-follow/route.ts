import { NextRequest, NextResponse } from "next/server";
import { getCronConfig } from "@/lib/store";
import { runAutoFollowJob } from "@/lib/cron-runner";

async function isAuthorizedCronRequest(req: NextRequest): Promise<boolean> {
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
  if (!(await isAuthorizedCronRequest(req))) {
    return NextResponse.json(
      {
        error:
          "Unauthorized cron call. Provide Authorization: Bearer <CRON_SECRET> or ?secret=<CRON_SECRET>",
      },
      { status: 401 }
    );
  }

  const result = await runAutoFollowJob("api");
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const trigger = body.trigger === "manual" ? "manual" : "api";

    if (trigger === "api" && !(await isAuthorizedCronRequest(req))) {
      return NextResponse.json(
        { error: "Unauthorized cron webhook request" },
        { status: 401 }
      );
    }

    const result = await runAutoFollowJob(trigger, body.accountId);
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
