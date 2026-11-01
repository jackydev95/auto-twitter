import cron, { ScheduledTask } from "node-cron";
import {
  acquireCronLock,
  appendLog,
  getActiveAccount,
  getCronConfig,
  getTodayFollowCount,
  readDb,
  releaseCronLock,
  updateCronConfig,
  updateTarget,
  upsertAccount,
} from "./store";
import {
  ensureValidToken,
  executeTwitterFollowRequest,
  lookupTwitterUserByUsername,
} from "./twitter-api";
import { FollowLog } from "./types";

declare global {
  var __autoTwitterCronTask: ScheduledTask | undefined;
  var __autoTwitterCronExpression: string | undefined;
  var __autoTwitterIsRunning: boolean | undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  const low = Math.max(0, Math.min(min, max));
  const high = Math.max(low, max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

export interface AutoFollowRunResult {
  runId: string;
  trigger: "cron" | "manual" | "api";
  status: "success" | "partial" | "error" | "skipped";
  summary: string;
  processedCount: number;
  followedCount: number;
  failedCount: number;
  todayTotalFollowed: number;
  logs: FollowLog[];
}

export async function runAutoFollowJob(
  trigger: "cron" | "manual" | "api" = "cron",
  specificAccountId?: string
): Promise<AutoFollowRunResult> {
  const runId = `run-${Date.now().toString(36)}`;
  const runLogs: FollowLog[] = [];

  const hasRedisLock = await acquireCronLock(55);
  if (global.__autoTwitterIsRunning || !hasRedisLock) {
    const log = await appendLog({
      runId,
      trigger,
      action: "cron_run",
      status: "skipped",
      message: "Skipped cron execution because another job is currently running.",
    });
    return {
      runId,
      trigger,
      status: "skipped",
      summary: log.message,
      processedCount: 0,
      followedCount: 0,
      failedCount: 0,
      todayTotalFollowed: await getTodayFollowCount(),
      logs: [log],
    };
  }

  global.__autoTwitterIsRunning = true;

  try {
    const config = await getCronConfig();
    const dbSnapshot = await readDb();
    const allAccounts = dbSnapshot.accounts;
    let account = specificAccountId
      ? allAccounts.find((a) => a.id === specificAccountId)
      : await getActiveAccount();

    if (!account) {
      const msg =
        "Chưa có tài khoản X nào được kết nối. Vui lòng xác thực OAuth 2.0 hoặc nhập Token/Cookie trước.";
      const log = await appendLog({
        runId,
        trigger,
        action: "cron_run",
        status: "error",
        message: msg,
      });
      await updateCronConfig({
        lastRunAt: new Date().toISOString(),
        lastRunStatus: "error",
        lastRunSummary: msg,
      });
      return {
        runId,
        trigger,
        status: "error",
        summary: msg,
        processedCount: 0,
        followedCount: 0,
        failedCount: 0,
        todayTotalFollowed: 0,
        logs: [log],
      };
    }

    // 1. Ensure token is valid / refresh if expiring
    try {
      account = await ensureValidToken(account, config.autoRefreshToken);
    } catch (refreshErr) {
      const errMsg =
        refreshErr instanceof Error
          ? refreshErr.message
          : "Failed to refresh token before cron run";
      const log = await appendLog({
        runId,
        trigger,
        accountId: account.id,
        accountUsername: account.username,
        action: "token_refresh",
        status: "error",
        message: errMsg,
      });
      await updateCronConfig({
        lastRunAt: new Date().toISOString(),
        lastRunStatus: "error",
        lastRunSummary: errMsg,
      });
      return {
        runId,
        trigger,
        status: "error",
        summary: errMsg,
        processedCount: 0,
        followedCount: 0,
        failedCount: 0,
        todayTotalFollowed: await getTodayFollowCount(account.id),
        logs: [log],
      };
    }

    // 2. Check daily follow limit
    const todayFollowed = await getTodayFollowCount(account.id);
    const remainingToday = Math.max(0, config.dailyFollowLimit - todayFollowed);
    if (remainingToday <= 0) {
      const msg = `Đã đạt giới hạn Follow hôm nay (${todayFollowed}/${config.dailyFollowLimit}) cho @${account.username}.`;
      const log = await appendLog({
        runId,
        trigger,
        accountId: account.id,
        accountUsername: account.username,
        action: "cron_run",
        status: "skipped",
        message: msg,
      });
      await updateCronConfig({
        lastRunAt: new Date().toISOString(),
        lastRunStatus: "idle",
        lastRunSummary: msg,
      });
      return {
        runId,
        trigger,
        status: "skipped",
        summary: msg,
        processedCount: 0,
        followedCount: 0,
        failedCount: 0,
        todayTotalFollowed: todayFollowed,
        logs: [log],
      };
    }

    // 3. Pick pending targets
    const db = await readDb();
    const pendingTargets = db.targets.filter(
      (t) =>
        t.status === "pending" &&
        t.username.toLowerCase() !== account!.username.toLowerCase()
    );

    if (pendingTargets.length === 0) {
      const msg = "Hàng đợi trống: Không còn user nào ở trạng thái chờ Follow.";
      const log = await appendLog({
        runId,
        trigger,
        accountId: account.id,
        accountUsername: account.username,
        action: "cron_run",
        status: "skipped",
        message: msg,
      });
      await updateCronConfig({
        lastRunAt: new Date().toISOString(),
        lastRunStatus: "idle",
        lastRunSummary: msg,
      });
      return {
        runId,
        trigger,
        status: "skipped",
        summary: msg,
        processedCount: 0,
        followedCount: 0,
        failedCount: 0,
        todayTotalFollowed: todayFollowed,
        logs: [log],
      };
    }

    const batchSize = Math.min(
      config.maxFollowsPerRun,
      remainingToday,
      pendingTargets.length
    );
    const batch = pendingTargets.slice(0, batchSize);

    let followedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < batch.length; i++) {
      const target = batch[i];
      const startMs = Date.now();

      try {
        let targetUserId = target.twitterUserId;

        // Resolve username -> userId if missing and using OAuth2 API v2
        if (!targetUserId && !config.dryRunMode && account.authType !== "cookie") {
          const profile = await lookupTwitterUserByUsername(
            account,
            target.username
          );
          targetUserId = profile.id;
          await updateTarget(target.id, {
            twitterUserId: profile.id,
            displayName: profile.name,
            bio: profile.description,
            followersCount: profile.public_metrics?.followers_count,
          });

          if (config.skipProtectedUsers && profile.protected) {
            await updateTarget(target.id, {
              status: "skipped",
              lastError: "Skipped protected account",
            });
            const skipLog = await appendLog({
              runId,
              trigger,
              accountId: account.id,
              accountUsername: account.username,
              targetId: target.id,
              targetUsername: target.username,
              targetTwitterId: targetUserId,
              action: "follow",
              status: "skipped",
              message: `Skipped protected user @${target.username}`,
              durationMs: Date.now() - startMs,
            });
            runLogs.push(skipLog);
            continue;
          }
        }

        if (config.dryRunMode) {
          await sleep(randomBetween(150, 350));
          const durationMs = Date.now() - startMs;
          await updateTarget(target.id, {
            status: "followed",
            attempts: target.attempts + 1,
            followedByAccountId: account.id,
            followedAt: new Date().toISOString(),
            lastError: undefined,
          });
          followedCount++;

          const log = await appendLog({
            runId,
            trigger,
            accountId: account.id,
            accountUsername: account.username,
            targetId: target.id,
            targetUsername: target.username,
            targetTwitterId: targetUserId,
            action: "follow",
            status: "dry_run",
            message: `[Dry-Run] Followed @${target.username} (${targetUserId || "by handle"})`,
            httpStatus: 200,
            durationMs,
          });
          runLogs.push(log);
        } else {
          const followRes = await executeTwitterFollowRequest({
            account,
            targetUserId,
            targetUsername: target.username,
          });
          const durationMs = Date.now() - startMs;

          await updateTarget(target.id, {
            status: "followed",
            twitterUserId: followRes.resolvedUserId || targetUserId,
            attempts: target.attempts + 1,
            followedByAccountId: account.id,
            followedAt: new Date().toISOString(),
            lastError: undefined,
          });
          followedCount++;

          const log = await appendLog({
            runId,
            trigger,
            accountId: account.id,
            accountUsername: account.username,
            targetId: target.id,
            targetUsername: target.username,
            targetTwitterId: followRes.resolvedUserId || targetUserId,
            action: "follow",
            status: "success",
            message: followRes.pending_follow
              ? `Đã gửi yêu cầu follow tới @${target.username}`
              : `Đã follow thành công @${target.username} trên X`,
            httpStatus: followRes.httpStatus,
            durationMs,
          });
          runLogs.push(log);
        }
      } catch (err) {
        failedCount++;
        const durationMs = Date.now() - startMs;
        const errMsg =
          err instanceof Error ? err.message : "Unknown X API error";
        const httpStatus =
          err && typeof err === "object" && "status" in err
            ? Number((err as { status?: number }).status)
            : 500;

        await updateTarget(target.id, {
          status: "failed",
          attempts: target.attempts + 1,
          lastError: errMsg,
        });

        const log = await appendLog({
          runId,
          trigger,
          accountId: account.id,
          accountUsername: account.username,
          targetId: target.id,
          targetUsername: target.username,
          targetTwitterId: target.twitterUserId,
          action: "follow",
          status: "error",
          message: `Lỗi khi follow @${target.username}: ${errMsg}`,
          httpStatus,
          durationMs,
        });
        runLogs.push(log);

        if (httpStatus === 429) {
          break;
        }
      }

      if (i < batch.length - 1) {
        const waitMs = config.dryRunMode
          ? 250
          : randomBetween(config.delayMinMs, config.delayMaxMs);
        await sleep(waitMs);
      }
    }

    if (followedCount > 0) {
      await upsertAccount({
        ...account,
        followingCount: (account.followingCount || 0) + followedCount,
        totalAutoFollowed: (account.totalAutoFollowed || 0) + followedCount,
        lastUsedAt: new Date().toISOString(),
      });
    }

    const overallStatus =
      failedCount === 0
        ? "success"
        : followedCount > 0
        ? "partial"
        : "error";

    const summary = `Đã xử lý ${batch.length} mục tiêu bằng tài khoản @${account.username}: ${followedCount} thành công, ${failedCount} lỗi.`;

    const summaryLog = await appendLog({
      runId,
      trigger,
      accountId: account.id,
      accountUsername: account.username,
      action: "cron_run",
      status:
        overallStatus === "error"
          ? "error"
          : config.dryRunMode
          ? "dry_run"
          : "success",
      message: summary,
    });
    runLogs.push(summaryLog);

    await updateCronConfig({
      lastRunAt: new Date().toISOString(),
      lastRunStatus: overallStatus,
      lastRunSummary: summary,
    });

    return {
      runId,
      trigger,
      status: overallStatus,
      summary,
      processedCount: batch.length,
      followedCount,
      failedCount,
      todayTotalFollowed: await getTodayFollowCount(account.id),
      logs: runLogs,
    };
  } finally {
    global.__autoTwitterIsRunning = false;
    await releaseCronLock();
  }
}

export async function syncServerCronScheduler(): Promise<{
  active: boolean;
  cronExpression: string;
  valid: boolean;
}> {
  const config = await getCronConfig();
  const isValid = cron.validate(config.cronExpression);

  if (global.__autoTwitterCronTask) {
    global.__autoTwitterCronTask.stop();
    global.__autoTwitterCronTask = undefined;
  }

  if (config.enabled && isValid) {
    global.__autoTwitterCronTask = cron.schedule(
      config.cronExpression,
      async () => {
        await runAutoFollowJob("cron");
      }
    );
    global.__autoTwitterCronExpression = config.cronExpression;
    return {
      active: true,
      cronExpression: config.cronExpression,
      valid: true,
    };
  }

  return {
    active: false,
    cronExpression: config.cronExpression,
    valid: isValid,
  };
}
