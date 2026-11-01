"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import type {
  CronJobConfig,
  FollowLog,
  FollowTarget,
  TwitterAccount,
  TwitterOAuthConfig,
} from "@/lib/types";

type ActiveTab = "auth" | "cron" | "targets" | "logs";

interface AppStateResponse {
  oauthConfig: TwitterOAuthConfig;
  accounts: TwitterAccount[];
  activeAccountId: string | null;
  targets: FollowTarget[];
  cronConfig: CronJobConfig;
  logs: FollowLog[];
  todayFollowCount: number;
  scheduler: {
    active: boolean;
    cronExpression: string;
    valid: boolean;
  };
}

const CRON_PRESETS = [
  { label: "Mỗi 5 phút", expr: "*/5 * * * *" },
  { label: "Mỗi 15 phút", expr: "*/15 * * * *" },
  { label: "Mỗi 30 phút", expr: "*/30 * * * *" },
  { label: "Mỗi 1 giờ", expr: "0 * * * *" },
  { label: "Mỗi 6 giờ", expr: "0 */6 * * *" },
];

export default function XAutoFollowStudioPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("auth");
  const [loading, setLoading] = useState(true);
  const [runningJob, setRunningJob] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Server state
  const [accounts, setAccounts] = useState<TwitterAccount[]>([]);
  const [targets, setTargets] = useState<FollowTarget[]>([]);
  const [logs, setLogs] = useState<FollowLog[]>([]);
  const [todayFollowCount, setTodayFollowCount] = useState(0);
  const [schedulerStatus, setSchedulerStatus] = useState<{
    active: boolean;
    cronExpression: string;
    valid: boolean;
  }>({
    active: false,
    cronExpression: "*/15 * * * *",
    valid: true,
  });

  // OAuth form state
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(
    "http://localhost:3000/api/auth/twitter/callback"
  );

  // Manual token / Cookie import state
  const [authImportMode, setAuthImportMode] = useState<"cookie" | "oauth2">(
    "cookie"
  );
  const [cookieAuthToken, setCookieAuthToken] = useState("");
  const [cookieCt0, setCookieCt0] = useState("");
  const [manualAccessToken, setManualAccessToken] = useState("");
  const [manualRefreshToken, setManualRefreshToken] = useState("");
  const [manualUsername, setManualUsername] = useState("");
  const [manualUserId, setManualUserId] = useState("");
  const [verifyOnline, setVerifyOnline] = useState(true);
  const [revealedTokens, setRevealedTokens] = useState<Record<string, boolean>>(
    {}
  );

  // Cron form state
  const [cronForm, setCronForm] = useState<CronJobConfig>({
    enabled: false,
    cronExpression: "*/15 * * * *",
    maxFollowsPerRun: 3,
    dailyFollowLimit: 40,
    delayMinMs: 1200,
    delayMaxMs: 3000,
    autoRefreshToken: true,
    skipProtectedUsers: true,
    dryRunMode: false,
    cronSecret: "x-auto-follow-secret-2026",
  });

  // Target queue state
  const [bulkUsernames, setBulkUsernames] = useState("");
  const [discoverSourceHandle, setDiscoverSourceHandle] = useState("");
  const [discoverLimit, setDiscoverLimit] = useState(10);
  const [targetFilter, setTargetFilter] = useState<
    "all" | "pending" | "followed" | "failed"
  >("all");
  const [importingTargets, setImportingTargets] = useState(false);

  const showNotice = useCallback(
    (type: "success" | "error" | "info", text: string) => {
      setBanner({ type, text });
    },
    []
  );

  const fetchState = useCallback(async (hydrateForms = false) => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load application state");
      const data: AppStateResponse = await res.json();

      setAccounts(data.accounts);
      setTargets(data.targets);
      setLogs(data.logs);
      setTodayFollowCount(data.todayFollowCount);
      setSchedulerStatus(data.scheduler);

      if (hydrateForms) {
        setClientId(data.oauthConfig.clientId || "");
        setClientSecret(data.oauthConfig.clientSecret || "");
        const dynamicCallback =
          typeof window !== "undefined"
            ? `${window.location.origin}/api/auth/twitter/callback`
            : "http://localhost:3000/api/auth/twitter/callback";
        setRedirectUri(
          data.oauthConfig.redirectUri &&
            !data.oauthConfig.redirectUri.includes("localhost")
            ? data.oauthConfig.redirectUri
            : dynamicCallback
        );
        setCronForm(data.cronConfig);
      } else {
        setCronForm((prev) => ({
          ...prev,
          lastRunAt: data.cronConfig.lastRunAt,
          lastRunStatus: data.cronConfig.lastRunStatus,
          lastRunSummary: data.cronConfig.lastRunSummary,
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState(true);

    // Check URL query params for OAuth callback results
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const authSuccess = params.get("auth_success");
      const authError = params.get("auth_error");
      if (authSuccess) {
        showNotice(
          "success",
          `Đã xác thực và lưu OAuth 2.0 Token thành công cho tài khoản @${authSuccess}!`
        );
        window.history.replaceState({}, "", "/");
      } else if (authError) {
        showNotice("error", `Lỗi xác thực X OAuth 2.0: ${authError}`);
        window.history.replaceState({}, "", "/");
      }
    }

    const interval = setInterval(() => {
      fetchState(false);
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchState, showNotice]);

  const activeAccount = useMemo(
    () => accounts.find((a) => a.isActive) || accounts[0] || null,
    [accounts]
  );

  const queueStats = useMemo(() => {
    const pending = targets.filter((t) => t.status === "pending").length;
    const followed = targets.filter((t) => t.status === "followed").length;
    const failed = targets.filter(
      (t) => t.status === "failed" || t.status === "skipped"
    ).length;
    return { pending, followed, failed, total: targets.length };
  }, [targets]);

  const filteredTargets = useMemo(() => {
    if (targetFilter === "all") return targets;
    if (targetFilter === "failed") {
      return targets.filter(
        (t) => t.status === "failed" || t.status === "skipped"
      );
    }
    return targets.filter((t) => t.status === targetFilter);
  }, [targets, targetFilter]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showNotice("info", `Đã copy ${label} vào clipboard!`);
    } catch {
      showNotice("error", "Không thể copy vào clipboard.");
    }
  };

  // Handlers: OAuth & Token
  const handleSaveOAuthConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_oauth_config",
          clientId,
          clientSecret,
          redirectUri,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save OAuth config");
      showNotice("success", "Đã lưu cấu hình X OAuth 2.0 Client thành công!");
    } catch (err) {
      showNotice(
        "error",
        err instanceof Error ? err.message : "Lỗi khi lưu cấu hình"
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const handleStartOAuthLogin = async (forceInteractive = false) => {
    try {
      const currentCallback =
        typeof window !== "undefined"
          ? `${window.location.origin}/api/auth/twitter/callback`
          : redirectUri;

      if (clientId.trim()) {
        await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_oauth_config",
            clientId,
            clientSecret,
            redirectUri: currentCallback,
          }),
        });
      }

      const query = new URLSearchParams({
        mode: "json",
        return_to: "/",
        ...(forceInteractive ? { interactive: "1" } : {}),
      });

      const res = await fetch(`/api/auth/twitter/login?${query.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.authorizationUrl) {
        throw new Error(data.error || "Không thể khởi tạo OAuth 2.0");
      }
      window.location.href = data.authorizationUrl;
    } catch (err) {
      showNotice(
        "error",
        err instanceof Error ? err.message : "Không thể khởi tạo OAuth 2.0"
      );
    }
  };

  const handleImportManualToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const payload =
        authImportMode === "cookie"
          ? {
              action: "import_cookie",
              authToken: cookieAuthToken,
              ct0: cookieCt0,
            }
          : {
              action: "import_token",
              accessToken: manualAccessToken,
              refreshToken: manualRefreshToken,
              username: manualUsername,
              twitterUserId: manualUserId,
              verifyOnline,
            };

      const res = await fetch("/api/auth/twitter/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Xác thực thất bại");
      setCookieAuthToken("");
      setCookieCt0("");
      setManualAccessToken("");
      setManualRefreshToken("");
      setManualUsername("");
      setManualUserId("");
      await fetchState(false);
      showNotice(
        "success",
        `Đã xác thực thật và lưu vào Vercel Redis cho tài khoản @${data.account.username} (ID: ${data.account.twitterUserId})!`
      );
    } catch (err) {
      showNotice(
        "error",
        err instanceof Error ? err.message : "Không thể xác thực tài khoản X"
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRefreshAccountToken = async (accountId: string) => {
    try {
      const res = await fetch("/api/auth/twitter/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_token", accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchState(false);
      showNotice(
        "success",
        `Đã làm mới (refresh) Access Token cho @${data.account.username}!`
      );
    } catch (err) {
      showNotice(
        "error",
        err instanceof Error ? err.message : "Refresh token thất bại"
      );
    }
  };

  const handleSetActiveAccount = async (accountId: string) => {
    await fetch("/api/auth/twitter/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_active", accountId }),
    });
    await fetchState(false);
    showNotice("info", "Đã đổi tài khoản mặc định chạy Cron Job.");
  };

  const handleDeleteAccount = async (accountId: string) => {
    await fetch("/api/auth/twitter/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_account", accountId }),
    });
    await fetchState(false);
    showNotice("info", "Đã xóa tài khoản khỏi hệ thống.");
  };

  // Handlers: Cron Config & Run
  const handleSaveCronConfig = async (
    overridePartial?: Partial<CronJobConfig>
  ) => {
    setSavingConfig(true);
    const payload = { ...cronForm, ...(overridePartial || {}) };
    try {
      const res = await fetch("/api/cron/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lưu cấu hình Cron thất bại");
      setCronForm(data.cronConfig);
      setSchedulerStatus(data.scheduler);
      showNotice(
        "success",
        data.cronConfig.enabled
          ? `Cron Job tự động Follow đang BẬT (${data.cronConfig.cronExpression})!`
          : "Đã lưu cấu hình Cron Job (Đang tạm dừng)."
      );
    } catch (err) {
      showNotice(
        "error",
        err instanceof Error ? err.message : "Lỗi cấu hình Cron"
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRunCronNow = async () => {
    setRunningJob(true);
    try {
      const res = await fetch("/api/cron/auto-follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chạy Cron Job thất bại");
      await fetchState(false);
      showNotice(
        data.status === "error" ? "error" : "success",
        data.summary || "Đã hoàn tất chạy Cron Job!"
      );
    } catch (err) {
      showNotice(
        "error",
        err instanceof Error ? err.message : "Lỗi khi chạy Cron Job"
      );
    } finally {
      setRunningJob(false);
    }
  };

  // Handlers: Target Queue
  const handleAddManualTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkUsernames.trim()) return;
    setImportingTargets(true);
    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_manual",
          rawText: bulkUsernames,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBulkUsernames("");
      setTargets(data.targets);
      showNotice(
        "success",
        `Đã thêm ${data.added} user vào hàng đợi Follow (${data.skippedDuplicates} trùng lặp đã bỏ qua).`
      );
    } catch (err) {
      showNotice(
        "error",
        err instanceof Error ? err.message : "Lỗi khi thêm danh sách user"
      );
    } finally {
      setImportingTargets(false);
    }
  };

  const handleImportFollowers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discoverSourceHandle.trim()) return;
    setImportingTargets(true);
    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_followers",
          sourceUsername: discoverSourceHandle,
          maxResults: discoverLimit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDiscoverSourceHandle("");
      setTargets(data.targets);
      showNotice(
        "success",
        `Đã quét và thêm ${data.added} followers vào danh sách chờ Follow!`
      );
    } catch (err) {
      showNotice(
        "error",
        err instanceof Error ? err.message : "Không thể quét followers"
      );
    } finally {
      setImportingTargets(false);
    }
  };

  const handleTargetAction = async (
    action: "reset_failed" | "clear_status" | "delete",
    extra?: Record<string, string>
  ) => {
    const res = await fetch("/api/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (res.ok && data.targets) {
      setTargets(data.targets);
    }
  };

  const handleClearLogs = async () => {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_logs" }),
    });
    setLogs([]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 font-bold text-lg shadow-inner">
              𝕏
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white sm:text-lg">
                  X Auto-Follow Studio
                </h1>
                <span className="rounded-full bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 text-[11px] font-medium text-sky-400">
                  OAuth 2.0 + Cron Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Lấy Token X (Twitter) OAuth 2.0 & chạy Cron Jobs tự động đi
                follow users khác
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Active Account Pill */}
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  activeAccount ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              {activeAccount ? (
                <span className="font-medium text-slate-200">
                  @{activeAccount.username}
                  <span className="ml-1.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                    {activeAccount.authType === "cookie" ? "Cookie Auth" : "OAuth 2.0"}
                  </span>
                </span>
              ) : (
                <span className="text-amber-300">Chưa có Token</span>
              )}
            </div>

            {/* Cron Status Pill */}
            <button
              onClick={() => {
                setActiveTab("cron");
              }}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                schedulerStatus.active
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>
                Cron:{" "}
                {schedulerStatus.active
                  ? `Đang bật (${schedulerStatus.cronExpression})`
                  : "Tạm dừng"}
              </span>
            </button>

            {/* 1-Click Connect X OAuth Button */}
            <button
              onClick={() => handleStartOAuthLogin(false)}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-sm hover:bg-slate-200 transition cursor-pointer"
            >
              <span className="font-black text-sm leading-none">𝕏</span>
              <span>Authen Kết nối X</span>
            </button>

            {/* Admin Dashboard Link */}
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#ef1c1c] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 transition"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Admin Dashboard (/admin)</span>
            </Link>

            {/* Run Now CTA */}
            <button
              onClick={handleRunCronNow}
              disabled={runningJob}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow-sm hover:bg-sky-400 disabled:opacity-50 transition cursor-pointer"
            >
              {runningJob ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
              <span>Chạy Cron Follow Ngay</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* Notification Banner */}
        {banner && (
          <div
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
              banner.type === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : banner.type === "error"
                ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                : "border-sky-500/40 bg-sky-500/10 text-sky-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {banner.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : banner.type === "error" ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              ) : (
                <Sparkles className="h-4 w-4 shrink-0 text-sky-400" />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              onClick={() => setBanner(null)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              Đóng
            </button>
          </div>
        )}

        {/* Top 4 KPI Cards */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Tài khoản & Token đang dùng</span>
              <KeyRound className="h-4 w-4 text-sky-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-lg font-bold text-white truncate">
                {activeAccount ? `@${activeAccount.username}` : "Chưa kết nối"}
              </p>
              <span className="text-xs text-slate-400">
                {accounts.length} tài khoản
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 truncate">
              {activeAccount
                ? activeAccount.refreshToken
                  ? "Có Refresh Token (Auto-renew)"
                  : "Chỉ có Access Token"
                : "Hãy lấy token ở tab Xác thực"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Hàng đợi Users cần Follow</span>
              <Users className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-2xl font-bold text-white">
                {queueStats.pending}
              </p>
              <span className="text-xs text-emerald-400">
                Đã follow: {queueStats.followed}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Tổng cộng {queueStats.total} mục tiêu ({queueStats.failed} lỗi/bỏ
              qua)
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Hạn mức Follow hôm nay</span>
              <UserPlus className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-2xl font-bold text-white">
                {todayFollowCount}{" "}
                <span className="text-sm font-normal text-slate-400">
                  / {cronForm.dailyFollowLimit}
                </span>
              </p>
              <span className="text-xs text-slate-400">
                {Math.min(
                  100,
                  Math.round(
                    (todayFollowCount /
                      Math.max(1, cronForm.dailyFollowLimit)) *
                      100
                  )
                )}
                %
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    (todayFollowCount /
                      Math.max(1, cronForm.dailyFollowLimit)) *
                      100
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Trạng thái Cron Job</span>
              <Activity className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-lg font-bold text-white">
                {schedulerStatus.active
                  ? schedulerStatus.cronExpression
                  : "Đang tắt"}
              </p>
              <span className="text-xs text-sky-400">
                {cronForm.maxFollowsPerRun} user / lần
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 truncate">
              {cronForm.lastRunAt
                ? `Lần cuối: ${new Date(
                    cronForm.lastRunAt
                  ).toLocaleTimeString("vi-VN")}`
                : "Chưa chạy lần nào"}
            </p>
          </div>
        </section>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab("auth")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition cursor-pointer ${
              activeTab === "auth"
                ? "bg-sky-500 text-slate-950 font-semibold"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            <KeyRound className="h-4 w-4" />
            <span>1. Xác thực & Lấy Token X</span>
          </button>

          <button
            onClick={() => setActiveTab("targets")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition cursor-pointer ${
              activeTab === "targets"
                ? "bg-sky-500 text-slate-950 font-semibold"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>
              2. Danh sách User cần Follow ({queueStats.pending} chờ)
            </span>
          </button>

          <button
            onClick={() => setActiveTab("cron")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition cursor-pointer ${
              activeTab === "cron"
                ? "bg-sky-500 text-slate-950 font-semibold"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>3. Cấu hình Cron Jobs Auto-Follow</span>
          </button>

          <button
            onClick={() => setActiveTab("logs")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition cursor-pointer ${
              activeTab === "logs"
                ? "bg-sky-500 text-slate-950 font-semibold"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            <Terminal className="h-4 w-4" />
            <span>4. Nhật ký chạy Cron ({logs.length})</span>
          </button>
        </div>

        {/* TAB 1: AUTH & TOKEN MANAGEMENT */}
        {activeTab === "auth" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Left card: Official X OAuth 2.0 PKCE Flow */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 border border-sky-500/30 px-2.5 py-0.5 text-xs font-medium text-sky-400">
                      Cách 1: OAuth 2.0 PKCE Chính thức
                    </span>
                    <h2 className="mt-2 text-base font-bold text-white">
                      Đăng nhập X & Tự động lấy Access + Refresh Token
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                      Kết nối với X Developer Portal để lấy token có quyền{" "}
                      <code className="text-sky-300">follows.write</code> và{" "}
                      <code className="text-sky-300">offline.access</code> (tự
                      động gia hạn khi chạy Cron).
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveOAuthConfig} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      X OAuth 2.0 Client ID <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="Ví dụ: V1p6R2x... (Lấy trong X Developer Portal -> OAuth 2.0 Keys)"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Client Secret (Tùy chọn cho Confidential Client)
                    </label>
                    <input
                      type="password"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="Nhập Client Secret nếu App của bạn là Confidential Client"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Callback / Redirect URI (Thêm URL này vào X Developer Portal)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={redirectUri}
                        onChange={(e) => setRedirectUri(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-200 focus:border-sky-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(redirectUri, "Callback URL")
                        }
                        className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-400">
                    <p className="font-medium text-slate-300 mb-1">
                      Scopes tự động yêu cầu:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "tweet.read",
                        "users.read",
                        "follows.read",
                        "follows.write",
                        "offline.access",
                      ].map((scope) => (
                        <span
                          key={scope}
                          className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-sky-300"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleStartOAuthLogin(false)}
                      className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-slate-200 transition cursor-pointer shadow-sm"
                    >
                      <span className="font-black text-sm leading-none">𝕏</span>
                      <span>Bấm Authen Kết nối X & Lấy Token Ngay</span>
                    </button>

                    <button
                      type="submit"
                      disabled={savingConfig}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>Lưu Client Config</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Right card: Real X Session Cookie (auth_token + ct0) or Direct Access Token */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                      Cách 2: Kết nối bằng Cookie X (auth_token + ct0) hoặc Access Token
                    </span>
                    <h2 className="mt-2 text-base font-bold text-white">
                      Xác thực trực tiếp tài khoản X thật (Hoạt động 100%)
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                      Hỗ trợ xác thực bằng Cookie trình duyệt (
                      <code className="text-emerald-300">auth_token</code> +{" "}
                      <code className="text-emerald-300">ct0</code>) để đi
                      follow thật mà không bị giới hạn gói trả phí X API, hoặc
                      dán OAuth 2.0 Access Token.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 rounded-lg bg-slate-950 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setAuthImportMode("cookie")}
                    className={`flex-1 rounded-md py-1.5 font-semibold transition cursor-pointer ${
                      authImportMode === "cookie"
                        ? "bg-emerald-500 text-slate-950"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Cookie X (auth_token + ct0)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthImportMode("oauth2")}
                    className={`flex-1 rounded-md py-1.5 font-semibold transition cursor-pointer ${
                      authImportMode === "oauth2"
                        ? "bg-sky-500 text-slate-950"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    OAuth 2.0 Access Token
                  </button>
                </div>

                <form onSubmit={handleImportManualToken} className="space-y-3">
                  {authImportMode === "cookie" ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Cookie <code>auth_token</code> (từ x.com → F12 → Application → Cookies){" "}
                          <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={cookieAuthToken}
                          onChange={(e) => setCookieAuthToken(e.target.value)}
                          placeholder="Dán giá trị auth_token từ trình duyệt đang đăng nhập X..."
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Cookie <code>ct0</code> (CSRF Token){" "}
                          <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={cookieCt0}
                          onChange={(e) => setCookieCt0(e.target.value)}
                          placeholder="Dán giá trị ct0 từ trình duyệt..."
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div className="pt-1">
                        <button
                          type="submit"
                          disabled={
                            savingConfig ||
                            !cookieAuthToken.trim() ||
                            !cookieCt0.trim()
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition cursor-pointer"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          <span>
                            Xác thực Cookie X Thật & Lưu vào Vercel Redis
                          </span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Access Token (OAuth 2.0 User Context){" "}
                          <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={manualAccessToken}
                          onChange={(e) =>
                            setManualAccessToken(e.target.value)
                          }
                          placeholder="Dán access_token vào đây..."
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Refresh Token (Để Cron tự gia hạn token)
                        </label>
                        <input
                          type="text"
                          value={manualRefreshToken}
                          onChange={(e) =>
                            setManualRefreshToken(e.target.value)
                          }
                          placeholder="Dán refresh_token (nếu có)..."
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">
                            Username X (Tùy chọn)
                          </label>
                          <input
                            type="text"
                            value={manualUsername}
                            onChange={(e) => setManualUsername(e.target.value)}
                            placeholder="vd: my_twitter_acc"
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">
                            Twitter User ID (Tùy chọn)
                          </label>
                          <input
                            type="text"
                            value={manualUserId}
                            onChange={(e) => setManualUserId(e.target.value)}
                            placeholder="vd: 14567890123"
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={verifyOnline}
                          onChange={(e) => setVerifyOnline(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-950 text-sky-500"
                        />
                        <span>
                          Xác thực online qua{" "}
                          <code className="text-sky-300">GET /2/users/me</code>
                        </span>
                      </label>

                      <div className="pt-1">
                        <button
                          type="submit"
                          disabled={savingConfig || !manualAccessToken.trim()}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition cursor-pointer"
                        >
                          <Plus className="h-4 w-4" />
                          <span>Xác thực & Lưu Access Token</span>
                        </button>
                      </div>
                    </>
                  )}
                </form>
              </div>
            </div>

            {/* Connected Accounts & Token Inspector */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Danh sách Token X đã lưu ({accounts.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Token của tài khoản đang chọn <strong className="text-emerald-400">Active</strong> sẽ được dùng cho Cron Job tự động đi follow.
                  </p>
                </div>
              </div>

              {accounts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center">
                  <KeyRound className="mx-auto h-8 w-8 text-slate-600" />
                  <p className="mt-2 text-sm font-medium text-slate-300">
                    Chưa có tài khoản X nào được lưu Token
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Hãy bấm &ldquo;Đăng nhập X & Lấy Token&rdquo;, dán Access Token, hoặc bấm &ldquo;Tạo Token Sandbox&rdquo; ở trên để bắt đầu.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map((acc) => {
                    const isRevealed = Boolean(revealedTokens[acc.id]);
                    const maskToken = (t?: string) =>
                      !t
                        ? "—"
                        : isRevealed
                        ? t
                        : `${t.slice(0, 10)}••••••••••••••••${t.slice(-6)}`;

                    return (
                      <div
                        key={acc.id}
                        className={`rounded-xl border p-4 transition ${
                          acc.isActive
                            ? "border-sky-500/50 bg-sky-500/5"
                            : "border-slate-800 bg-slate-950/60"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-sky-400">
                              {acc.username.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white">
                                  @{acc.username}
                                </span>
                                <span className="text-xs text-slate-400">
                                  (ID: {acc.twitterUserId})
                                </span>
                                {acc.isActive && (
                                  <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                                    Đang dùng cho Cron
                                  </span>
                                )}
                                <span className="rounded-full bg-sky-500/20 border border-sky-500/40 px-2 py-0.5 text-[11px] text-sky-300">
                                  {acc.authType === "cookie"
                                    ? "Cookie Session (auth_token + ct0)"
                                    : "OAuth 2.0 Token"}
                                </span>
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                                <span>
                                  Following:{" "}
                                  <strong className="text-slate-200">
                                    {acc.followingCount ?? 0}
                                  </strong>
                                </span>
                                {acc.expiresAt && (
                                  <span>
                                    Hết hạn:{" "}
                                    {new Date(acc.expiresAt).toLocaleString(
                                      "vi-VN"
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() =>
                                setRevealedTokens((prev) => ({
                                  ...prev,
                                  [acc.id]: !prev[acc.id],
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 cursor-pointer"
                            >
                              {isRevealed ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                              <span>{isRevealed ? "Ẩn Token" : "Hiện Token"}</span>
                            </button>

                            <button
                              onClick={() => handleRefreshAccountToken(acc.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-sky-300 hover:bg-slate-700 cursor-pointer"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              <span>Refresh Token</span>
                            </button>

                            {!acc.isActive && (
                              <button
                                onClick={() => handleSetActiveAccount(acc.id)}
                                className="inline-flex items-center gap-1 rounded-lg bg-sky-500/20 border border-sky-500/40 px-2.5 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/30 cursor-pointer"
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                                <span>Chọn chạy Cron</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleDeleteAccount(acc.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Token strings */}
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                            <div className="truncate">
                              <span className="text-slate-500 mr-2">
                                Access Token:
                              </span>
                              <code className="text-sky-300 font-mono">
                                {maskToken(acc.accessToken)}
                              </code>
                            </div>
                            <button
                              onClick={() =>
                                copyToClipboard(
                                  acc.accessToken,
                                  "Access Token"
                                )
                              }
                              className="text-slate-400 hover:text-white shrink-0"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                            <div className="truncate">
                              <span className="text-slate-500 mr-2">
                                Refresh Token:
                              </span>
                              <code className="text-emerald-300 font-mono">
                                {maskToken(acc.refreshToken)}
                              </code>
                            </div>
                            {acc.refreshToken && (
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    acc.refreshToken!,
                                    "Refresh Token"
                                  )
                                }
                                className="text-slate-400 hover:text-white shrink-0"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: TARGET USERS QUEUE */}
        {activeTab === "targets" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Bulk Add Usernames */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Thêm danh sách Users cần Follow
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Nhập mỗi dòng 1 username (`@username`), link profile
                    (`https://x.com/username`), hoặc `username:user_id`.
                  </p>
                </div>

                <form onSubmit={handleAddManualTargets} className="space-y-3">
                  <textarea
                    rows={4}
                    value={bulkUsernames}
                    onChange={(e) => setBulkUsernames(e.target.value)}
                    placeholder={`@elonmusk\nhttps://x.com/reactjs\ndan_abramov\nt3dotgg`}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs font-mono text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={importingTargets || !bulkUsernames.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Thêm vào Hàng đợi Follow</span>
                  </button>
                </form>
              </div>

              {/* Import Followers of another user */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Quét Followers của tài khoản X bất kỳ
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Sử dụng Token X hiện tại để gọi{" "}
                    <code className="text-sky-300">
                      GET /2/users/:id/followers
                    </code>{" "}
                    và tự động đưa tệp khách hàng tiềm năng vào hàng đợi.
                  </p>
                </div>

                <form onSubmit={handleImportFollowers} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Username tài khoản nguồn cần quét Followers
                    </label>
                    <input
                      type="text"
                      value={discoverSourceHandle}
                      onChange={(e) => setDiscoverSourceHandle(e.target.value)}
                      placeholder="Ví dụ: @vercel hoặc @nextjs"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Số lượng muốn lấy (5 - 100)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={discoverLimit}
                      onChange={(e) =>
                        setDiscoverLimit(Number(e.target.value) || 10)
                      }
                      className="w-36 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      importingTargets || !discoverSourceHandle.trim()
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-50 cursor-pointer"
                  >
                    <Search className="h-4 w-4" />
                    <span>Quét Followers & Đưa vào Hàng đợi</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Target Queue Table */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: "all", label: `Tất cả (${queueStats.total})` },
                      {
                        id: "pending",
                        label: `Đang chờ (${queueStats.pending})`,
                      },
                      {
                        id: "followed",
                        label: `Đã Follow (${queueStats.followed})`,
                      },
                      {
                        id: "failed",
                        label: `Lỗi / Bỏ qua (${queueStats.failed})`,
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setTargetFilter(tab.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                        targetFilter === tab.id
                          ? "bg-sky-500/20 border border-sky-500/40 text-sky-300"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {queueStats.failed > 0 && (
                    <button
                      onClick={() => handleTargetAction("reset_failed")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Thử lại các mục lỗi</span>
                    </button>
                  )}
                  {queueStats.followed > 0 && (
                    <button
                      onClick={() =>
                        handleTargetAction("clear_status", {
                          status: "followed",
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Xóa mục đã Follow</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2.5 px-3">User mục tiêu</th>
                      <th className="py-2.5 px-3">Twitter User ID</th>
                      <th className="py-2.5 px-3">Nguồn / Ghi chú</th>
                      <th className="py-2.5 px-3">Trạng thái</th>
                      <th className="py-2.5 px-3">Thời gian</th>
                      <th className="py-2.5 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredTargets.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/30">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-white">
                            @{item.username}
                          </div>
                          {item.bio && (
                            <div className="text-[11px] text-slate-400 truncate max-w-xs">
                              {item.bio}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-300">
                          {item.twitterUserId || (
                            <span className="text-slate-500 italic">
                              Tự động resolve khi chạy
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-400">
                          {item.sourceNote || item.source}
                        </td>
                        <td className="py-3 px-3">
                          {item.status === "pending" && (
                            <span className="inline-flex rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
                              Chờ Follow
                            </span>
                          )}
                          {item.status === "followed" && (
                            <span className="inline-flex rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                              Đã Follow ✓
                            </span>
                          )}
                          {(item.status === "failed" ||
                            item.status === "skipped") && (
                            <div>
                              <span className="inline-flex rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-[11px] font-medium text-rose-300">
                                {item.status === "failed" ? "Lỗi" : "Bỏ qua"}
                              </span>
                              {item.lastError && (
                                <p className="mt-1 text-[11px] text-rose-400 max-w-xs truncate">
                                  {item.lastError}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-400">
                          {item.followedAt
                            ? new Date(item.followedAt).toLocaleString("vi-VN")
                            : new Date(item.createdAt).toLocaleDateString(
                                "vi-VN"
                              )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() =>
                              handleTargetAction("delete", {
                                targetId: item.id,
                              })
                            }
                            className="rounded p-1 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CRON JOBS CONFIGURATION */}
        {activeTab === "cron" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Cấu hình Cron Job Tự động đi Follow
                  </h2>
                  <p className="text-xs text-slate-400">
                    Hệ thống sẽ tự động lấy Token đang Active, kiểm tra hạn sử
                    dụng, refresh token nếu cần và đi follow theo lịch.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleSaveCronConfig({ enabled: !cronForm.enabled })
                  }
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition cursor-pointer ${
                    cronForm.enabled
                      ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  <Zap className="h-4 w-4" />
                  <span>
                    {cronForm.enabled
                      ? "ĐANG BẬT CRON TỰ ĐỘNG"
                      : "BẬT CRON TỰ ĐỘNG NGAY"}
                  </span>
                </button>
              </div>

              {/* Cron Schedule Expression */}
              <div className="space-y-2.5">
                <label className="block text-xs font-medium text-slate-300">
                  Lịch chạy Cron (Cron Expression 5 trường)
                </label>
                <div className="flex flex-wrap gap-2">
                  {CRON_PRESETS.map((preset) => (
                    <button
                      key={preset.expr}
                      type="button"
                      onClick={() =>
                        setCronForm((prev) => ({
                          ...prev,
                          cronExpression: preset.expr,
                        }))
                      }
                      className={`rounded-lg border px-3 py-1.5 text-xs transition cursor-pointer ${
                        cronForm.cronExpression === preset.expr
                          ? "border-sky-500 bg-sky-500/15 text-sky-300 font-semibold"
                          : "border-slate-700 bg-slate-950 text-slate-400 hover:text-white"
                      }`}
                    >
                      {preset.label} ({preset.expr})
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={cronForm.cronExpression}
                  onChange={(e) =>
                    setCronForm((prev) => ({
                      ...prev,
                      cronExpression: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-sky-300 focus:border-sky-500 focus:outline-none"
                />
              </div>

              {/* Rate limits & delays */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Số lượng Follow mỗi lần Cron chạy (Batch Size)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={cronForm.maxFollowsPerRun}
                    onChange={(e) =>
                      setCronForm((prev) => ({
                        ...prev,
                        maxFollowsPerRun: Number(e.target.value) || 1,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Khuyên dùng: 2 - 5 users mỗi lần chạy để tránh bị X đánh dấu
                    spam.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Giới hạn Follow tối đa mỗi ngày (Daily Safety Cap)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={400}
                    value={cronForm.dailyFollowLimit}
                    onChange={(e) =>
                      setCronForm((prev) => ({
                        ...prev,
                        dailyFollowLimit: Number(e.target.value) || 20,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    X giới hạn tối đa 400 follows/ngày, an toàn nhất là 30 - 80
                    follows/ngày.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Độ trễ tối thiểu giữa 2 lần Follow (ms)
                  </label>
                  <input
                    type="number"
                    min={200}
                    step={100}
                    value={cronForm.delayMinMs}
                    onChange={(e) =>
                      setCronForm((prev) => ({
                        ...prev,
                        delayMinMs: Number(e.target.value) || 1000,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Độ trễ tối đa giữa 2 lần Follow (ms)
                  </label>
                  <input
                    type="number"
                    min={500}
                    step={100}
                    value={cronForm.delayMaxMs}
                    onChange={(e) =>
                      setCronForm((prev) => ({
                        ...prev,
                        delayMaxMs: Number(e.target.value) || 3000,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Checkboxes */}
              <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cronForm.autoRefreshToken}
                    onChange={(e) =>
                      setCronForm((prev) => ({
                        ...prev,
                        autoRefreshToken: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-700 bg-slate-900 text-sky-500"
                  />
                  <span>
                    <strong>Tự động Refresh OAuth2 Token</strong> trước khi chạy
                    Cron nếu token sắp hết hạn (cần scope{" "}
                    <code className="text-sky-300">offline.access</code>)
                  </span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cronForm.skipProtectedUsers}
                    onChange={(e) =>
                      setCronForm((prev) => ({
                        ...prev,
                        skipProtectedUsers: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-700 bg-slate-900 text-sky-500"
                  />
                  <span>
                    Bỏ qua các tài khoản X khóa riêng tư (Protected Accounts)
                  </span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-amber-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cronForm.dryRunMode}
                    onChange={(e) =>
                      setCronForm((prev) => ({
                        ...prev,
                        dryRunMode: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-700 bg-slate-900 text-amber-500"
                  />
                  <span>
                    <strong>Chế độ Dry-Run (Giả lập Follow)</strong>: Kiểm tra
                    luồng Cron & ghi log nhưng không trừ quota thật trên X API
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleSaveCronConfig()}
                  disabled={savingConfig}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-sky-400 cursor-pointer"
                >
                  <Settings className="h-4 w-4" />
                  <span>Lưu Cấu hình Cron Job</span>
                </button>

                <button
                  type="button"
                  onClick={handleRunCronNow}
                  disabled={runningJob}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                >
                  <Play className="h-4 w-4" />
                  <span>Test Chạy Cron Ngay Lập Tức</span>
                </button>
              </div>
            </div>

            {/* Right Column: Webhook & Vercel Cron Endpoint */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div className="flex items-center gap-2 text-sky-400">
                <ShieldCheck className="h-5 w-5" />
                <h3 className="text-sm font-bold text-white">
                  Tích hợp Vercel Cron & Webhook ngoài
                </h3>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Ngoài bộ lập lịch{" "}
                <code className="text-sky-300">node-cron</code> chạy ngầm trực
                tiếp trong server Next.js, dự án đã cấu hình sẵn{" "}
                <code className="text-sky-300">vercel.json</code> và API
                Endpoint để gọi từ Vercel Cron, GitHub Actions, hoặc{" "}
                <code className="text-sky-300">cron-job.org</code>.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  CRON_SECRET bảo vệ API
                </label>
                <input
                  type="text"
                  value={cronForm.cronSecret}
                  onChange={(e) =>
                    setCronForm((prev) => ({
                      ...prev,
                      cronSecret: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Lệnh cURL gọi Cron:</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `curl -X GET "http://localhost:3000/api/cron/auto-follow" -H "Authorization: Bearer ${cronForm.cronSecret}"`,
                        "Lệnh cURL"
                      )
                    }
                    className="text-sky-400 hover:underline"
                  >
                    Copy cURL
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] font-mono text-slate-300">
{`curl -X GET \\
  "http://localhost:3000/api/cron/auto-follow" \\
  -H "Authorization: Bearer ${cronForm.cronSecret}"`}
                </pre>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs space-y-1.5 text-slate-400">
                <p className="font-semibold text-slate-200">
                  Cơ chế hoạt động mỗi chu kỳ Cron:
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Kiểm tra Token của tài khoản Active.</li>
                  <li>
                    Nếu Token hết hạn trong &lt; 5 phút, tự động gọi{" "}
                    <code className="text-sky-300">/2/oauth2/token</code> để
                    lấy Access Token mới.
                  </li>
                  <li>
                    Lấy tối đa <strong>{cronForm.maxFollowsPerRun}</strong>{" "}
                    users đang chờ trong hàng đợi.
                  </li>
                  <li>
                    Gọi{" "}
                    <code className="text-sky-300">
                      POST /2/users/:id/following
                    </code>{" "}
                    kèm delay ngẫu nhiên chống khóa tài khoản.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: EXECUTION LOGS */}
        {activeTab === "logs" && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white">
                  Nhật ký thực thi Cron Jobs & Follow API
                </h2>
                <p className="text-xs text-slate-400">
                  Ghi lại chi tiết mọi lần lấy/làm mới Token và từng lệnh Follow
                  trên X.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchState(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Làm mới</span>
                </button>
                {logs.length > 0 && (
                  <button
                    onClick={handleClearLogs}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Xóa nhật ký</span>
                  </button>
                )}
              </div>
            </div>

            {logs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-400">
                Chưa có lịch sử chạy. Hãy bấm &ldquo;Chạy Cron Follow Ngay&rdquo;
                ở góc trên để kiểm tra!
              </div>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/70 px-4 py-2.5 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                          log.status === "success"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : log.status === "dry_run"
                            ? "bg-sky-500/20 text-sky-300"
                            : log.status === "error"
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {log.status}
                      </span>

                      <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                        {log.action}
                      </span>

                      <span className="text-slate-200">{log.message}</span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                      {log.durationMs !== undefined && (
                        <span>{log.durationMs}ms</span>
                      )}
                      {log.httpStatus && <span>HTTP {log.httpStatus}</span>}
                      <span>
                        {new Date(log.timestamp).toLocaleTimeString("vi-VN")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
