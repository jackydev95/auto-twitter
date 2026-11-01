import { NextRequest, NextResponse } from "next/server";
import {
  clearLogs,
  getActiveAccount,
  getStorageInfo,
  getTodayFollowCount,
  readDb,
  updateOAuthConfig,
  writeDb,
} from "@/lib/store";
import { saveRuntimeRedisConfig } from "@/lib/redis";
import { syncServerCronScheduler } from "@/lib/cron-runner";

export async function GET() {
  const [db, activeAccount, scheduler, storage] = await Promise.all([
    readDb(),
    getActiveAccount(),
    syncServerCronScheduler(),
    getStorageInfo(),
  ]);
  const todayFollowCount = await getTodayFollowCount(activeAccount?.id);

  return NextResponse.json({
    oauthConfig: db.oauthConfig,
    accounts: db.accounts,
    activeAccountId: activeAccount?.id || null,
    targets: db.targets,
    cronConfig: db.cronConfig,
    logs: db.logs.slice(0, 100),
    todayFollowCount,
    scheduler,
    storage,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "update_oauth_config") {
      const updated = await updateOAuthConfig({
        clientId: body.clientId?.trim() ?? "",
        clientSecret: body.clientSecret?.trim() ?? "",
        redirectUri:
          body.redirectUri?.trim() ||
          "http://localhost:3000/api/auth/twitter/callback",
        scopes: Array.isArray(body.scopes) ? body.scopes : undefined,
      });
      return NextResponse.json({ ok: true, oauthConfig: updated });
    }

    if (body.action === "update_redis_config") {
      const currentDb = await readDb();
      saveRuntimeRedisConfig(body.redisUrl || "", body.redisToken || "");
      await writeDb(currentDb);
      const storage = await getStorageInfo();
      return NextResponse.json({ ok: true, storage });
    }

    if (body.action === "clear_logs") {
      await clearLogs();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "Unsupported action" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to update state",
      },
      { status: 500 }
    );
  }
}
