import cron, { ScheduledTask } from "node-cron";
import {
  acquireCronLock,
  addTargets,
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
  fetchUserFollowersFromTwitter,
  lookupTwitterUserByUsername,
} from "./twitter-api";
import { FollowLog, TwitterAccount } from "./types";

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
  specificAccountId?: string,
  specificTargetId?: string
): Promise<AutoFollowRunResult> {
  const runId = `run-${Date.now().toString(36)}`;
  const runLogs: FollowLog[] = [];

  const hasRedisLock = await acquireCronLock(45);
  if (global.__autoTwitterIsRunning || !hasRedisLock) {
    const log = await appendLog({
      runId,
      trigger,
      action: "cron_run",
      status: "skipped",
      message:
        "Đang có tiến trình gọi API Follow khác chạy, bỏ qua lượt trùng lặp.",
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

    // Select candidate accounts to run Follow API
    let candidateAccounts: TwitterAccount[] = [];
    if (specificAccountId) {
      const found = allAccounts.find((a) => a.id === specificAccountId);
      if (found) candidateAccounts = [found];
    } else {
      // Prioritize active account first, then all other cronEnabled accounts
      const sorted = [...allAccounts].sort(
        (a, b) => Number(b.isActive) - Number(a.isActive)
      );
      candidateAccounts = sorted.filter(
        (a) => a.cronEnabled !== false && a.accountStatus !== "suspended"
      );
      if (candidateAccounts.length === 0 && allAccounts.length > 0) {
        const active = await getActiveAccount();
        if (active) candidateAccounts = [active];
      }
    }

    if (candidateAccounts.length === 0) {
      const msg =
        "Chưa có tài khoản X nào được kết nối. Vui lòng xác thực OAuth 2.0 hoặc nhập Token/Cookie để hệ thống tự động gọi API Follow.";
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

    let totalProcessed = 0;
    let totalFollowed = 0;
    let totalFailed = 0;
    const accountSummaries: string[] = [];

    for (let accIdx = 0; accIdx < candidateAccounts.length; accIdx++) {
      let account = candidateAccounts[accIdx];

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
        runLogs.push(log);
        totalFailed++;
        accountSummaries.push(`@${account.username}: lỗi refresh token`);
        continue;
      }

      // 2. Check daily follow limit for this account
      const todayFollowed = await getTodayFollowCount(account.id);
      const remainingToday = Math.max(
        0,
        config.dailyFollowLimit - todayFollowed
      );
      if (remainingToday <= 0 && !specificTargetId) {
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
        runLogs.push(log);
        accountSummaries.push(`@${account.username}: đạt hạn mức ngày`);
        continue;
      }

      // 3. Pick pending targets (or specificTargetId if requested)
      let db = await readDb();
      let pendingTargets = specificTargetId
        ? db.targets.filter((t) => t.id === specificTargetId)
        : db.targets.filter(
            (t) =>
              t.status === "pending" &&
              t.username.toLowerCase() !== account.username.toLowerCase()
          );

      // 4. Auto-discover / refill queue via X API if pending queue is empty!
      if (pendingTargets.length === 0 && !specificTargetId) {
        try {
          const seedSource =
            db.targets.find((t) => t.status === "followed")?.username ||
            "vercel";
          const discovered = await fetchUserFollowersFromTwitter(
            account,
            seedSource,
            10
          );
          if (discovered.length > 0) {
            await addTargets(
              discovered.map((f) => ({
                username: f.username,
                twitterUserId: f.id,
                displayName: f.name,
                bio: f.description,
                followersCount: f.public_metrics?.followers_count,
                source: "followers_import" as const,
                sourceNote: `Auto-discovered from @${seedSource}`,
              }))
            );
            db = await readDb();
            pendingTargets = db.targets.filter(
              (t) =>
                t.status === "pending" &&
                t.username.toLowerCase() !== account.username.toLowerCase()
            );
          }
        } catch {
          // Ignore auto-discovery error if none available
        }
      }

      if (pendingTargets.length === 0) {
        const msg =
          "Hàng đợi trống: Không còn user nào ở trạng thái chờ Follow.";
        const log = await appendLog({
          runId,
          trigger,
          accountId: account.id,
          accountUsername: account.username,
          action: "cron_run",
          status: "skipped",
          message: msg,
        });
        runLogs.push(log);
        accountSummaries.push(`@${account.username}: hàng đợi trống`);
        continue;
      }

      const batchSize = specificTargetId
        ? 1
        : Math.min(
            config.maxFollowsPerRun,
            remainingToday,
            pendingTargets.length
          );
      const batch = pendingTargets.slice(0, batchSize);

      let accFollowed = 0;
      let accFailed = 0;

      for (let i = 0; i < batch.length; i++) {
        const target = batch[i];
        const startMs = Date.now();
        totalProcessed++;

        try {
          let targetUserId = target.twitterUserId;

          // Resolve username -> userId if missing
          if (!targetUserId) {
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
                message: `Bỏ qua tài khoản khóa riêng tư @${target.username}`,
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
            accFollowed++;
            totalFollowed++;

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
              message: `[Dry-Run API] Đã gọi Follow @${target.username} (ID: ${
                targetUserId || "auto"
              })`,
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
            accFollowed++;
            totalFollowed++;

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
                ? `[${followRes.endpointUsed}] Đã gửi yêu cầu follow tới @${target.username} bằng @${account.username}`
                : `[${followRes.endpointUsed}] Đã tự động gọi API Follow thành công @${target.username} (ID: ${
                    followRes.resolvedUserId || targetUserId
                  }) bằng @${account.username}`,
              httpStatus: followRes.httpStatus,
              durationMs,
            });
            runLogs.push(log);
          }
        } catch (err) {
          accFailed++;
          totalFailed++;
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
            message: `Lỗi gọi API Follow @${target.username} (bằng @${account.username}): ${errMsg}`,
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
            ? 200
            : randomBetween(config.delayMinMs, config.delayMaxMs);
          await sleep(waitMs);
        }
      }

      if (accFollowed > 0) {
        await upsertAccount({
          ...account,
          followingCount: (account.followingCount || 0) + accFollowed,
          totalAutoFollowed: (account.totalAutoFollowed || 0) + accFollowed,
          lastUsedAt: new Date().toISOString(),
        });
      }

      accountSummaries.push(
        `@${account.username} (${accFollowed}/${batch.length} thành công)`
      );

      // If single target was requested and processed, stop looping accounts
      if (specificTargetId && totalFollowed > 0) {
        break;
      }
    }

    const overallStatus =
      totalFailed === 0 && totalFollowed > 0
        ? "success"
        : totalFollowed > 0
        ? "partial"
        : totalProcessed === 0
        ? "skipped"
        : "error";

    const summary =
      totalProcessed > 0
        ? `Tự động gọi API Follow hoàn tất: ${totalFollowed} thành công, ${totalFailed} lỗi [${accountSummaries.join(
            ", "
          )}].`
        : accountSummaries.join(" | ") ||
          "Không có mục tiêu nào cần xử lý trong chu kỳ này.";

    const summaryLog = await appendLog({
      runId,
      trigger,
      accountId: candidateAccounts[0]?.id,
      accountUsername: candidateAccounts[0]?.username,
      action: "cron_run",
      status:
        overallStatus === "error"
          ? "error"
          : overallStatus === "skipped"
          ? "skipped"
          : config.dryRunMode
          ? "dry_run"
          : "success",
      message: summary,
    });
    runLogs.push(summaryLog);

    await updateCronConfig({
      lastRunAt: new Date().toISOString(),
      lastRunStatus: overallStatus === "skipped" ? "idle" : overallStatus,
      lastRunSummary: summary,
    });

    return {
      runId,
      trigger,
      status: overallStatus,
      summary,
      processedCount: totalProcessed,
      followedCount: totalFollowed,
      failedCount: totalFailed,
      todayTotalFollowed: await getTodayFollowCount(),
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
