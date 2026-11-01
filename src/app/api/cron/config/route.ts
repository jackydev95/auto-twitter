import cron from "node-cron";
import { NextRequest, NextResponse } from "next/server";
import { getCronConfig, updateCronConfig } from "@/lib/store";
import { syncServerCronScheduler } from "@/lib/cron-runner";

export async function GET() {
  const cronConfig = await getCronConfig();
  const scheduler = await syncServerCronScheduler();
  return NextResponse.json({ cronConfig, scheduler });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (
      body.cronExpression &&
      !cron.validate(String(body.cronExpression).trim())
    ) {
      return NextResponse.json(
        {
          error: `Invalid cron expression: "${body.cronExpression}". Use standard 5-field syntax (e.g., "*/15 * * * *").`,
        },
        { status: 400 }
      );
    }

    const updated = await updateCronConfig({
      enabled:
        typeof body.enabled === "boolean" ? body.enabled : undefined,
      cronExpression: body.cronExpression
        ? String(body.cronExpression).trim()
        : undefined,
      maxFollowsPerRun:
        body.maxFollowsPerRun !== undefined
          ? Math.max(1, Math.min(50, Number(body.maxFollowsPerRun)))
          : undefined,
      dailyFollowLimit:
        body.dailyFollowLimit !== undefined
          ? Math.max(1, Math.min(400, Number(body.dailyFollowLimit)))
          : undefined,
      delayMinMs:
        body.delayMinMs !== undefined
          ? Math.max(200, Number(body.delayMinMs))
          : undefined,
      delayMaxMs:
        body.delayMaxMs !== undefined
          ? Math.max(300, Number(body.delayMaxMs))
          : undefined,
      autoRefreshToken:
        typeof body.autoRefreshToken === "boolean"
          ? body.autoRefreshToken
          : undefined,
      skipProtectedUsers:
        typeof body.skipProtectedUsers === "boolean"
          ? body.skipProtectedUsers
          : undefined,
      dryRunMode:
        typeof body.dryRunMode === "boolean" ? body.dryRunMode : undefined,
      cronSecret:
        body.cronSecret !== undefined ? String(body.cronSecret) : undefined,
    });

    const scheduler = await syncServerCronScheduler();

    return NextResponse.json({
      ok: true,
      cronConfig: updated,
      scheduler,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to update cron configuration",
      },
      { status: 500 }
    );
  }
}
