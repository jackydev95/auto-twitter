"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Layers,
  LayoutGrid,
  Loader2,
  LogOut,
  Menu,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type {
  CronJobConfig,
  FollowLog,
  FollowTarget,
  TwitterAccount,
  TwitterOAuthConfig,
  UserAccountStatus,
  UserRole,
} from "@/lib/types";

type AdminSection =
  | "analytics"
  | "users"
  | "targets"
  | "cron"
  | "logs"
  | "settings";

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
  storage?: {
    driver: "vercel-redis" | "local-fallback";
    connected: boolean;
    source: string;
    redisKey: string;
    urlPreview?: string;
    error?: string;
  };
}

interface UserModalFormState {
  accountId?: string;
  name: string;
  username: string;
  twitterUserId: string;
  email: string;
  role: UserRole;
  accountStatus: UserAccountStatus;
  accessToken: string;
  refreshToken: string;
  cronEnabled: boolean;
  isActive: boolean;
  isSimulated: boolean;
  verifyOnline: boolean;
}

const INITIAL_USER_FORM: UserModalFormState = {
  name: "",
  username: "",
  twitterUserId: "",
  email: "",
  role: "member",
  accountStatus: "active",
  accessToken: "",
  refreshToken: "",
  cronEnabled: true,
  isActive: false,
  isSimulated: false,
  verifyOnline: false,
};

export default function AdminifyUsersAndTokensPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeSection, setActiveSection] =
    useState<AdminSection>("analytics");
  const [showWelcomeToast, setShowWelcomeToast] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "expired" | "cron_on"
  >("all");

  // Data state
  const [accounts, setAccounts] = useState<TwitterAccount[]>([]);
  const [targets, setTargets] = useState<FollowTarget[]>([]);
  const [logs, setLogs] = useState<FollowLog[]>([]);
  const [cronConfig, setCronConfig] = useState<CronJobConfig>({
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
  const [oauthConfig, setOauthConfig] = useState<TwitterOAuthConfig>({
    clientId: "",
    clientSecret: "",
    redirectUri: "http://localhost:3000/api/auth/twitter/callback",
    scopes: [],
  });
  const [todayFollowCount, setTodayFollowCount] = useState(0);
  const [scheduler, setScheduler] = useState({
    active: false,
    cronExpression: "*/15 * * * *",
    valid: true,
  });
  const [storageInfo, setStorageInfo] = useState<{
    driver: "vercel-redis" | "local-fallback";
    connected: boolean;
    source: string;
    redisKey: string;
    urlPreview?: string;
    error?: string;
  }>({
    driver: "local-fallback",
    connected: false,
    source: "NONE",
    redisKey: "auto_twitter:db:v1",
  });
  const [redisUrlInput, setRedisUrlInput] = useState("");
  const [redisTokenInput, setRedisTokenInput] = useState("");

  // UI feedback & modals
  const [revealedTokens, setRevealedTokens] = useState<Record<string, boolean>>(
    {}
  );
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Add/Edit User & Token Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [userForm, setUserForm] =
    useState<UserModalFormState>(INITIAL_USER_FORM);
  const [savingUser, setSavingUser] = useState(false);

  // Inspect Token Modal
  const [inspectedUser, setInspectedUser] = useState<TwitterAccount | null>(
    null
  );

  const notify = useCallback(
    (type: "success" | "error" | "info", text: string) => {
      setBanner({ type, text });
    },
    []
  );

  const fetchAdminData = useCallback(async (hydrateConfig = false) => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return;
      const data: AppStateResponse = await res.json();
      setAccounts(data.accounts);
      setTargets(data.targets);
      setLogs(data.logs);
      setTodayFollowCount(data.todayFollowCount);
      setScheduler(data.scheduler);
      setCronConfig(data.cronConfig);
      if (data.storage) {
        setStorageInfo(data.storage);
      }
      if (hydrateConfig) {
        setOauthConfig(data.oauthConfig);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchAdminData(true);
    const timer = setInterval(() => fetchAdminData(false), 8000);
    return () => clearInterval(timer);
  }, [fetchAdminData]);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return accounts.filter((acc) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        acc.username.toLowerCase().includes(q) ||
        acc.name.toLowerCase().includes(q) ||
        (acc.email && acc.email.toLowerCase().includes(q)) ||
        acc.twitterUserId.toLowerCase().includes(q) ||
        acc.accessToken.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      const isExpired =
        acc.accountStatus === "expired" ||
        (acc.expiresAt && new Date(acc.expiresAt).getTime() < Date.now());

      if (statusFilter === "active") return !isExpired;
      if (statusFilter === "expired") return Boolean(isExpired);
      if (statusFilter === "cron_on") return Boolean(acc.cronEnabled);
      return true;
    });
  }, [accounts, searchQuery, statusFilter]);

  // Aggregate Analytics metrics
  const metrics = useMemo(() => {
    const totalFollowers = accounts.reduce(
      (sum, a) => sum + (a.followersCount || 0),
      0
    );
    const totalFollowing = accounts.reduce(
      (sum, a) => sum + (a.followingCount || 0),
      0
    );
    const totalAutoFollowed = accounts.reduce(
      (sum, a) => sum + (a.totalAutoFollowed || 0),
      0
    );
    const validTokens = accounts.filter(
      (a) =>
        a.accountStatus !== "expired" &&
        (!a.expiresAt || new Date(a.expiresAt).getTime() > Date.now())
    ).length;
    const cronEnabledUsers = accounts.filter((a) => a.cronEnabled).length;
    const pendingTargets = targets.filter((t) => t.status === "pending").length;
    const followedTargets = targets.filter(
      (t) => t.status === "followed"
    ).length;

    return {
      totalFollowers,
      totalFollowing,
      totalAutoFollowed,
      validTokens,
      cronEnabledUsers,
      pendingTargets,
      followedTargets,
    };
  }, [accounts, targets]);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify("info", `Đã copy ${label} vào clipboard!`);
    } catch {
      notify("error", "Không thể copy vào clipboard.");
    }
  };

  // Open Modal for Create or Edit
  const openCreateUserModal = () => {
    setModalMode("create");
    setUserForm({
      ...INITIAL_USER_FORM,
      accessToken: `x_oauth2_at_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`,
      refreshToken: `x_oauth2_rt_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`,
      isSimulated: true,
    });
    setIsModalOpen(true);
  };

  const openEditUserModal = (acc: TwitterAccount) => {
    setModalMode("edit");
    setUserForm({
      accountId: acc.id,
      name: acc.name,
      username: acc.username,
      twitterUserId: acc.twitterUserId,
      email: acc.email || `${acc.username}@x-user.io`,
      role: acc.role || "member",
      accountStatus: acc.accountStatus || "active",
      accessToken: acc.accessToken,
      refreshToken: acc.refreshToken || "",
      cronEnabled: acc.cronEnabled ?? true,
      isActive: acc.isActive,
      isSimulated: Boolean(acc.isSimulated),
      verifyOnline: false,
    });
    setIsModalOpen(true);
  };

  const handleSaveUserModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      if (modalMode === "create") {
        const res = await fetch("/api/auth/twitter/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "import_token",
            ...userForm,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Không thể thêm User");
        notify(
          "success",
          `Đã thêm User @${data.account.username} và lưu OAuth2 Token thành công!`
        );
      } else {
        const res = await fetch("/api/auth/twitter/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_user",
            ...userForm,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Không thể cập nhật User");
        notify(
          "success",
          `Đã cập nhật thông tin & Token cho @${data.account.username}!`
        );
      }
      setIsModalOpen(false);
      await fetchAdminData(false);
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Lỗi khi lưu thông tin User"
      );
    } finally {
      setSavingUser(false);
    }
  };

  const handleRefreshUserToken = async (acc: TwitterAccount) => {
    setBusyAccountId(acc.id);
    try {
      const res = await fetch("/api/auth/twitter/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_token", accountId: acc.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchAdminData(false);
      notify(
        "success",
        `Đã làm mới (Refresh) OAuth 2.0 Token cho @${acc.username}!`
      );
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Refresh token thất bại"
      );
    } finally {
      setBusyAccountId(null);
    }
  };

  const handleRunFollowForUser = async (acc: TwitterAccount) => {
    setBusyAccountId(acc.id);
    try {
      const res = await fetch("/api/cron/auto-follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual", accountId: acc.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchAdminData(false);
      notify(
        data.status === "error" ? "error" : "success",
        data.summary || `Đã chạy Auto-Follow bằng token của @${acc.username}!`
      );
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Chạy Auto-Follow thất bại"
      );
    } finally {
      setBusyAccountId(null);
    }
  };

  const handleToggleUserCron = async (acc: TwitterAccount) => {
    const nextVal = !acc.cronEnabled;
    await fetch("/api/auth/twitter/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_user",
        accountId: acc.id,
        cronEnabled: nextVal,
      }),
    });
    await fetchAdminData(false);
    notify(
      "info",
      `Đã ${nextVal ? "BẬT" : "TẮT"} Cron Auto-Follow cho @${acc.username}.`
    );
  };

  const handleSetPrimaryAccount = async (acc: TwitterAccount) => {
    await fetch("/api/auth/twitter/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_active",
        accountId: acc.id,
      }),
    });
    await fetchAdminData(false);
    notify(
      "success",
      `Đã đặt @${acc.username} làm tài khoản chính chạy Cron Job!`
    );
  };

  const handleDeleteUser = async (acc: TwitterAccount) => {
    await fetch("/api/auth/twitter/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete_account",
        accountId: acc.id,
      }),
    });
    await fetchAdminData(false);
    notify("info", `Đã xóa tài khoản & thu hồi token của @${acc.username}.`);
  };

  const handleQuickGenerateSandboxUser = async () => {
    const randomSuffix = Math.floor(100 + Math.random() * 899);
    await fetch("/api/auth/twitter/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_sandbox_token",
        username: `x_member_${randomSuffix}`,
        name: `X Creator #${randomSuffix}`,
      }),
    });
    await fetchAdminData(false);
    notify("success", `Đã tạo nhanh User & Token mẫu #${randomSuffix}!`);
  };

  const sidebarItems: Array<{
    id: AdminSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    hasSub?: boolean;
  }> = [
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "users", label: "Users & Tokens", icon: Users, hasSub: true },
    {
      id: "targets",
      label: "Follow Queue",
      icon: UserPlus,
      hasSub: true,
    },
    { id: "cron", label: "Cron Scheduler", icon: Calendar, hasSub: true },
    { id: "logs", label: "Activity Logs", icon: FileText, hasSub: true },
    { id: "settings", label: "User Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex bg-[#f4f6f9] text-slate-800 font-sans">
      {/* LEFT SIDEBAR (Adminify Style) */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-20"
        } shrink-0 bg-white border-r border-slate-200 flex flex-col transition-all duration-200 z-20`}
      >
        {/* Red Brand Header */}
        <div className="h-16 bg-[#ef1c1c] px-5 flex items-center gap-3 text-white shadow-sm">
          <div className="flex items-center -space-x-1.5">
            <span className="h-5 w-5 rotate-45 rounded-[3px] bg-white/95 inline-block shadow-sm" />
            <span className="h-5 w-5 rotate-45 rounded-[3px] bg-white/75 inline-block" />
            <span className="h-5 w-5 rotate-45 rounded-[3px] bg-white/50 inline-block" />
          </div>
          {sidebarOpen && (
            <span className="text-xl font-extrabold tracking-tight ml-1">
              Adminify
            </span>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition cursor-pointer ${
                  isActive
                    ? "bg-[#f2f4f8] text-slate-900 font-semibold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-md transition ${
                      isActive
                        ? "bg-[#ef1c1c] text-white shadow-xs"
                        : "text-slate-700"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  {sidebarOpen && <span>{item.label}</span>}
                </div>
                {sidebarOpen && item.hasSub && (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                )}
              </button>
            );
          })}

          <div className="pt-4 mt-4 border-t border-slate-100">
            <Link
              href="/"
              className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-md text-slate-700">
                  <ExternalLink className="h-4 w-4" />
                </span>
                {sidebarOpen && <span>Trang User Lấy Token</span>}
              </div>
            </Link>

            <Link
              href="/"
              className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-md text-slate-700">
                  <LogOut className="h-4 w-4" />
                </span>
                {sidebarOpen && <span>Logout</span>}
              </div>
            </Link>
          </div>
        </nav>
      </aside>

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER BAR */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen((p) => !p)}
              className="h-9 w-9 flex items-center justify-center rounded-md border border-[#ef1c1c] text-[#ef1c1c] hover:bg-rose-50 transition cursor-pointer"
              title="Toggle Sidebar"
            >
              <Menu className="h-4 w-4" />
            </button>

            {/* Search Input */}
            <div className="relative w-64 sm:w-80">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search user, @handle, token..."
                className="w-full rounded-md bg-[#f2f4f8] pl-4 pr-9 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ef1c1c]/30"
              />
              <Search className="h-4 w-4 text-slate-600 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Right Header Icons & Admin Profile */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveSection("settings")}
              className={`hidden lg:inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                storageInfo.connected
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-amber-300 bg-amber-50 text-amber-800"
              }`}
              title="Trạng thái kết nối Vercel Redis (@upstash/redis)"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  storageInfo.connected ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span>
                {storageInfo.connected
                  ? "Vercel Redis: Connected"
                  : "Vercel Redis: Chưa cấu hình URL"}
              </span>
            </button>

            <button
              onClick={openCreateUserModal}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-[#ef1c1c] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Thêm User & Token</span>
            </button>

            <div className="flex items-center gap-4">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs"
                title="Language"
              >
                🇺🇸
              </span>

              <button
                onClick={() => setActiveSection("users")}
                className="relative text-slate-600 hover:text-slate-900 cursor-pointer"
                title="Active Tokens"
              >
                <MessageSquare className="h-5 w-5" />
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">
                  {accounts.length}
                </span>
              </button>

              <button
                onClick={() => setActiveSection("logs")}
                className="relative text-slate-600 hover:text-slate-900 cursor-pointer"
                title="Cron Activity Logs"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ef1c1c] px-1 text-[10px] font-bold text-white">
                  {metrics.pendingTargets}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ef1c1c] text-white font-bold text-sm ring-2 ring-rose-200">
                WW
              </div>
              <div className="hidden md:block leading-tight">
                <div className="text-xs font-bold text-slate-800">
                  Wilbert Williams
                </div>
                <div className="text-[11px] text-slate-500">Super Admin</div>
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT BODY */}
        <main className="p-6 space-y-6 max-w-[1600px]">
          {/* Notification Alert */}
          {banner && (
            <div
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-xs font-medium shadow-xs ${
                banner.type === "success"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : banner.type === "error"
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : "border-sky-300 bg-sky-50 text-sky-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{banner.text}</span>
              </div>
              <button
                onClick={() => setBanner(null)}
                className="text-slate-500 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Dashboard Header & Floating Dark Welcome Toast */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {activeSection === "analytics" && "Analytics Dashboard"}
                {activeSection === "users" &&
                  "Quản lý Users & X OAuth 2.0 Tokens"}
                {activeSection === "targets" &&
                  "Quản lý Hàng đợi Users cần Follow"}
                {activeSection === "cron" &&
                  "Quản lý Cron Jobs Tự động Follow"}
                {activeSection === "logs" && "Nhật ký Hệ thống & Follow Logs"}
                {activeSection === "settings" &&
                  "Cấu hình X Developer OAuth 2.0"}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Hệ thống quản trị tập trung Users, Access/Refresh Tokens và
                Cron Jobs tự động đi Follow trên X.
              </p>
            </div>

            {showWelcomeToast && (
              <div className="flex items-center gap-3 rounded-lg bg-[#111318] px-4 py-2.5 text-white shadow-md">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ef1c1c] text-xs font-bold">
                  𝕏
                </div>
                <span className="text-xs font-medium">
                  Welcome to Adminify X-Token Manager
                </span>
                <button
                  onClick={() => setShowWelcomeToast(false)}
                  className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-900 text-xs font-bold hover:bg-slate-200 cursor-pointer"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {/* TOP ANALYTICS ROW (4 Colorful Cards + Bar Chart Card) */}
          {(activeSection === "analytics" || activeSection === "users") && (
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
              {/* Left 2x2 Colorful Stat Cards */}
              <div className="xl:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Card 1: Indigo Blue */}
                <div className="relative overflow-hidden rounded-lg bg-[#3f4b96] p-6 text-white shadow-sm">
                  <div className="opacity-80">
                    <Users className="h-7 w-7" />
                  </div>
                  <div className="mt-2 text-center">
                    <div className="text-4xl font-extrabold tracking-tight">
                      {metrics.totalFollowers.toLocaleString()}
                    </div>
                    <div className="mt-1 text-xs font-medium text-indigo-100">
                      Tổng Followers ({accounts.length} Users đã kết nối)
                    </div>
                  </div>
                </div>

                {/* Card 2: Vibrant Purple */}
                <div className="relative overflow-hidden rounded-lg bg-[#7b1fa2] p-6 text-white shadow-sm">
                  <div className="opacity-80">
                    <KeyRound className="h-7 w-7" />
                  </div>
                  <div className="mt-2 text-center">
                    <div className="text-4xl font-extrabold tracking-tight">
                      {metrics.validTokens} / {accounts.length}
                    </div>
                    <div className="mt-1 text-xs font-medium text-purple-100">
                      Tokens hợp lệ ({metrics.cronEnabledUsers} bật Cron)
                    </div>
                  </div>
                </div>

                {/* Card 3: Vibrant Red */}
                <div className="relative overflow-hidden rounded-lg bg-[#ef1c1c] p-6 text-white shadow-sm">
                  <div className="opacity-80">
                    <ShoppingBag className="h-7 w-7" />
                  </div>
                  <div className="mt-2 text-center">
                    <div className="text-4xl font-extrabold tracking-tight">
                      {metrics.totalAutoFollowed + metrics.followedTargets}
                    </div>
                    <div className="mt-1 text-xs font-medium text-rose-100">
                      Tổng lượt Auto-Follow (Hôm nay: {todayFollowCount})
                    </div>
                  </div>
                </div>

                {/* Card 4: Vibrant Gold/Yellow */}
                <div className="relative overflow-hidden rounded-lg bg-[#f9c823] p-6 text-white shadow-sm">
                  <div className="opacity-90">
                    <Activity className="h-7 w-7" />
                  </div>
                  <div className="mt-2 text-center">
                    <div className="text-4xl font-extrabold tracking-tight">
                      {metrics.pendingTargets}
                    </div>
                    <div className="mt-1 text-xs font-medium text-amber-50">
                      Users trong hàng đợi chờ Follow
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Revenue / Token Performance Bar Chart Card */}
              <div className="xl:col-span-6 rounded-lg bg-white border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    Token & Auto-Follow Performance
                  </h2>
                  <span className="text-xs font-medium text-slate-400">
                    Real-time Metrics
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center flex-1">
                  {/* Left mini stat list */}
                  <div className="sm:col-span-5 space-y-2.5">
                    <div className="rounded-md border border-slate-100 bg-slate-50/70 px-3.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-slate-900">
                          {accounts.length} Users
                        </span>
                        <TrendingUp className="h-4 w-4 text-[#ef1c1c]" />
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Connected Accounts
                      </div>
                    </div>

                    <div className="rounded-md border border-slate-100 bg-slate-50/70 px-3.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-slate-900">
                          {metrics.validTokens} Active
                        </span>
                        <TrendingUp className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="text-[11px] text-slate-400">
                        OAuth 2.0 Tokens
                      </div>
                    </div>

                    <div className="rounded-md border border-slate-100 bg-slate-50/70 px-3.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-slate-900">
                          {metrics.totalAutoFollowed} Follows
                        </span>
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Total Executed
                      </div>
                    </div>

                    <div className="rounded-md border border-slate-100 bg-slate-50/70 px-3.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-slate-900">
                          {metrics.pendingTargets} Queue
                        </span>
                        <TrendingUp className="h-4 w-4 text-amber-500" />
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Pending Targets
                      </div>
                    </div>
                  </div>

                  {/* Right Vertical Bars (Adminify Red, Blue, Green, Yellow) */}
                  <div className="sm:col-span-7 h-56 flex flex-col justify-end border-l border-b border-slate-200 pl-6 pr-4 pb-2 relative">
                    <div className="absolute inset-x-6 top-4 bottom-8 flex flex-col justify-between pointer-events-none">
                      <div className="border-b border-dashed border-slate-200 w-full" />
                      <div className="border-b border-dashed border-slate-200 w-full" />
                      <div className="border-b border-dashed border-slate-200 w-full" />
                      <div className="border-b border-dashed border-slate-200 w-full" />
                    </div>

                    <div className="relative z-10 flex items-end justify-around h-44 gap-4">
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className="w-7 rounded-t-sm bg-[#ef1c1c] transition-all"
                          style={{ height: "145px" }}
                        />
                        <span className="text-[11px] text-slate-500">
                          Tokens
                        </span>
                      </div>

                      <div className="flex flex-col items-center gap-2">
                        <div
                          className="w-7 rounded-t-sm bg-[#0d6efd] transition-all"
                          style={{ height: "115px" }}
                        />
                        <span className="text-[11px] text-slate-500">
                          Follows
                        </span>
                      </div>

                      <div className="flex flex-col items-center gap-2">
                        <div
                          className="w-7 rounded-t-sm bg-[#198754] transition-all"
                          style={{ height: "92px" }}
                        />
                        <span className="text-[11px] text-slate-500">
                          Refreshed
                        </span>
                      </div>

                      <div className="flex flex-col items-center gap-2">
                        <div
                          className="w-7 rounded-t-sm bg-[#f9c823] transition-all"
                          style={{ height: "72px" }}
                        />
                        <span className="text-[11px] text-slate-500">
                          Queue
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* MIDDLE 3-COLUMN CARDS (Orders -> Token Events, Payments -> Users Token Status, Earnings -> Growth Funnel) */}
          {activeSection === "analytics" && (
            <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* Card 1: Recent Token Scopes & Activity */}
              <div className="rounded-lg bg-white border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">
                    Recent User Tokens
                  </h3>
                  <button
                    onClick={handleQuickGenerateSandboxUser}
                    className="text-xs font-semibold text-[#ef1c1c] hover:underline cursor-pointer"
                  >
                    + Quick Demo Token
                  </button>
                </div>

                <div className="space-y-4">
                  {accounts.slice(0, 3).map((acc, idx) => (
                    <div
                      key={acc.id}
                      className="flex items-center gap-4 border-b border-slate-100 pb-3 last:border-none last:pb-0"
                    >
                      <div className="relative h-14 w-20 shrink-0 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center font-mono text-xs font-bold text-slate-700">
                        <span className="absolute -top-1.5 -left-1.5 rounded bg-[#ef1c1c] px-1.5 py-0.5 text-[9px] font-bold text-white shadow-xs">
                          {idx === 0
                            ? "OAuth2"
                            : idx === 1
                            ? "PKCE"
                            : "Token"}
                        </span>
                        @{acc.username.slice(0, 6)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-900 truncate">
                          {acc.name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          Token:{" "}
                          <code className="text-slate-700">
                            {acc.accessToken.slice(0, 12)}...
                          </code>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {acc.scopes.length} scopes • ID #{acc.twitterUserId}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 2: Users Token Health (Like "Payments" card in screenshot) */}
              <div className="rounded-lg bg-white border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">
                    Users Token Health
                  </h3>
                  <span className="text-xs text-slate-400">
                    Click to Refresh
                  </span>
                </div>

                <div className="space-y-4">
                  {accounts.slice(0, 3).map((acc) => {
                    const isExpired =
                      acc.accountStatus === "expired" ||
                      (acc.expiresAt &&
                        new Date(acc.expiresAt).getTime() < Date.now());
                    return (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-none last:pb-0"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white font-bold text-xs">
                            {acc.name
                              .split(" ")
                              .map((w) => w[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">
                              {acc.name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              @{acc.username}
                            </div>
                            <span
                              className={`mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-bold text-white ${
                                isExpired ? "bg-amber-500" : "bg-[#ef1c1c]"
                              }`}
                            >
                              {isExpired ? "Token Expired" : "Token Active"}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRefreshUserToken(acc)}
                          disabled={busyAccountId === acc.id}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          {busyAccountId === acc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Refresh"
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Card 3: Auto-Follow Pyramid (Like "Earnings" pyramid in screenshot) */}
              <div className="rounded-lg bg-white border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  Auto-Follow Pipeline
                </h3>

                <div className="my-3 flex flex-col items-center space-y-1.5">
                  <div className="w-24 rounded-xs bg-[#f25c5c] py-1 text-center text-[10px] font-semibold text-white shadow-2xs">
                    OAuth2 PKCE
                  </div>
                  <div className="w-32 rounded-xs bg-[#ef4444] py-1 text-center text-[10px] font-semibold text-white shadow-2xs">
                    Token Refresh
                  </div>
                  <div className="w-40 rounded-xs bg-[#f87171] py-1 text-center text-[10px] font-semibold text-white shadow-2xs">
                    Queue Lookup
                  </div>
                  <div className="w-48 rounded-xs bg-[#fb7185] py-1 text-center text-[10px] font-semibold text-white shadow-2xs">
                    Rate-Limit Guard
                  </div>
                  <div className="w-56 rounded-xs bg-[#ef1c1c] py-1 text-center text-[10px] font-semibold text-white shadow-2xs">
                    Auto-Follow Cron
                  </div>
                  <div className="w-64 rounded-xs bg-[#dc2626] py-1 text-center text-[10px] font-semibold text-white shadow-2xs">
                    X API v2 Following
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-extrabold text-slate-900">
                    {metrics.totalFollowers.toLocaleString()} Followers
                  </div>
                  <div className="text-xs text-slate-500">
                    Monthly Audience & Auto-Follow Reach
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* FULL-WIDTH USERS & TOKENS MANAGEMENT TABLE */}
          {(activeSection === "analytics" || activeSection === "users") && (
            <section className="rounded-lg bg-white border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Danh sách Users & Quản lý X OAuth Tokens ({filteredUsers.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Quản lý trực tiếp Access Token, Refresh Token, trạng thái
                    Cron tự động đi Follow và chạy Follow cho từng User.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: "all", label: `Tất cả (${accounts.length})` },
                      {
                        id: "active",
                        label: `Token Hợp lệ (${metrics.validTokens})`,
                      },
                      {
                        id: "cron_on",
                        label: `Đang bật Cron (${metrics.cronEnabledUsers})`,
                      },
                      { id: "expired", label: "Hết hạn" },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setStatusFilter(f.id)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                        statusFilter === f.id
                          ? "bg-[#ef1c1c] text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}

                  <button
                    onClick={openCreateUserModal}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Thêm User & Token</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-700 font-bold">
                      <th className="py-3 px-3">User / X Account</th>
                      <th className="py-3 px-3">Token Expiry</th>
                      <th className="py-3 px-3">
                        OAuth 2.0 Access & Refresh Token
                      </th>
                      <th className="py-3 px-3">Followers</th>
                      <th className="py-3 px-3">Auto-Followed</th>
                      <th className="py-3 px-3">Scopes</th>
                      <th className="py-3 px-3">Cron Job</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((acc) => {
                      const isRevealed = Boolean(revealedTokens[acc.id]);
                      const isExpired =
                        acc.accountStatus === "expired" ||
                        (acc.expiresAt &&
                          new Date(acc.expiresAt).getTime() < Date.now());

                      const formatToken = (token?: string) => {
                        if (!token) return "—";
                        return isRevealed
                          ? token
                          : `${token.slice(0, 10)}••••••${token.slice(-5)}`;
                      };

                      return (
                        <tr
                          key={acc.id}
                          className="hover:bg-slate-50/90 transition"
                        >
                          {/* User Info */}
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-rose-50 border border-rose-200 text-[#ef1c1c] font-bold text-xs">
                                {acc.username.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900 text-xs">
                                    {acc.name}
                                  </span>
                                  {acc.isActive && (
                                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                      Primary
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] font-semibold text-[#ef1c1c]">
                                  @{acc.username}{" "}
                                  <span className="text-slate-400 font-normal">
                                    #{acc.twitterUserId}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {acc.email || `${acc.username}@x-user.io`}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Expiry Date */}
                          <td className="py-3.5 px-3 text-slate-600 whitespace-nowrap">
                            <div>
                              {acc.expiresAt
                                ? new Date(acc.expiresAt).toLocaleDateString(
                                    "vi-VN"
                                  )
                                : "Không giới hạn"}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {acc.expiresAt
                                ? new Date(acc.expiresAt).toLocaleTimeString(
                                    "vi-VN"
                                  )
                                : ""}
                            </div>
                          </td>

                          {/* Tokens column */}
                          <td className="py-3.5 px-3">
                            <div className="space-y-1 max-w-xs">
                              <div className="flex items-center gap-1.5">
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                  AT
                                </span>
                                <code className="font-mono text-[11px] text-slate-800 truncate">
                                  {formatToken(acc.accessToken)}
                                </code>
                                <button
                                  onClick={() =>
                                    copyText(
                                      acc.accessToken,
                                      `Access Token của @${acc.username}`
                                    )
                                  }
                                  className="text-slate-400 hover:text-slate-800 cursor-pointer"
                                  title="Copy Access Token"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                  RT
                                </span>
                                <code className="font-mono text-[11px] text-slate-500 truncate">
                                  {formatToken(acc.refreshToken)}
                                </code>
                                {acc.refreshToken && (
                                  <button
                                    onClick={() =>
                                      copyText(
                                        acc.refreshToken!,
                                        `Refresh Token của @${acc.username}`
                                      )
                                    }
                                    className="text-slate-400 hover:text-slate-800 cursor-pointer"
                                    title="Copy Refresh Token"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                )}

                                <button
                                  onClick={() =>
                                    setRevealedTokens((p) => ({
                                      ...p,
                                      [acc.id]: !p[acc.id],
                                    }))
                                  }
                                  className="text-slate-400 hover:text-slate-800 ml-1 cursor-pointer"
                                  title="Hiện/Ẩn Token"
                                >
                                  {isRevealed ? (
                                    <EyeOff className="h-3 w-3" />
                                  ) : (
                                    <Eye className="h-3 w-3" />
                                  )}
                                </button>

                                <button
                                  onClick={() => setInspectedUser(acc)}
                                  className="text-[10px] text-blue-600 hover:underline ml-1 cursor-pointer"
                                >
                                  Chi tiết
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* Followers */}
                          <td className="py-3.5 px-3 font-semibold text-slate-700">
                            {(acc.followersCount || 0).toLocaleString()}
                          </td>

                          {/* Auto-Followed */}
                          <td className="py-3.5 px-3 font-bold text-[#ef1c1c]">
                            {(acc.totalAutoFollowed || 0).toLocaleString()}
                          </td>

                          {/* Scopes Stars */}
                          <td className="py-3.5 px-3">
                            <div
                              className="flex items-center gap-0.5 text-amber-400"
                              title={acc.scopes.join(", ")}
                            >
                              {Array.from({ length: 5 }).map((_, idx) => (
                                <Star
                                  key={idx}
                                  className={`h-3.5 w-3.5 ${
                                    idx < Math.min(5, acc.scopes.length)
                                      ? "fill-amber-400 text-amber-400"
                                      : "text-slate-300"
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {acc.scopes.length} quyền OAuth2
                            </div>
                          </td>

                          {/* Cron Enabled Toggle */}
                          <td className="py-3.5 px-3">
                            <button
                              onClick={() => handleToggleUserCron(acc)}
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition cursor-pointer ${
                                acc.cronEnabled
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {acc.cronEnabled ? "Cron ON" : "Cron OFF"}
                            </button>
                          </td>

                          {/* Token Status Pill (like Paid in screenshot) */}
                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                                isExpired
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-rose-200/80 text-[#ef1c1c]"
                              }`}
                            >
                              {isExpired ? "Expired" : "Valid Token"}
                            </span>
                          </td>

                          {/* Action Buttons (like Delivered pill + quick actions) */}
                          <td className="py-3.5 px-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                onClick={() => handleRunFollowForUser(acc)}
                                disabled={busyAccountId === acc.id}
                                className="inline-flex items-center gap-1 rounded bg-[#ef1c1c] px-2.5 py-1 text-[10px] font-bold text-white shadow-2xs hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                                title="Dùng Token của User này đi Follow ngay"
                              >
                                {busyAccountId === acc.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Play className="h-2.5 w-2.5 fill-current" />
                                )}
                                <span>Follow Ngay</span>
                              </button>

                              <button
                                onClick={() => handleRefreshUserToken(acc)}
                                disabled={busyAccountId === acc.id}
                                className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 cursor-pointer"
                                title="Refresh Token"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                              </button>

                              {!acc.isActive && (
                                <button
                                  onClick={() => handleSetPrimaryAccount(acc)}
                                  className="rounded border border-slate-200 bg-white p-1.5 text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                                  title="Đặt làm User chính cho Cron"
                                >
                                  <UserCheck className="h-3.5 w-3.5" />
                                </button>
                              )}

                              <button
                                onClick={() => openEditUserModal(acc)}
                                className="rounded border border-slate-200 bg-white p-1.5 text-blue-600 hover:bg-blue-50 cursor-pointer"
                                title="Sửa User & Token"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>

                              <button
                                onClick={() => handleDeleteUser(acc)}
                                className="rounded border border-slate-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title="Xóa User & Token"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* TARGETS SECTION IN ADMIN */}
          {activeSection === "targets" && (
            <section className="rounded-lg bg-white border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">
                  Hàng đợi Users mục tiêu cần Follow ({targets.length})
                </h2>
                <Link
                  href="/"
                  className="text-xs font-semibold text-[#ef1c1c] hover:underline"
                >
                  + Thêm / Quét Followers thêm tại Portal
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-700 font-bold">
                      <th className="py-2.5 px-3">Username</th>
                      <th className="py-2.5 px-3">Twitter ID</th>
                      <th className="py-2.5 px-3">Bio / Ghi chú</th>
                      <th className="py-2.5 px-3">Trạng thái</th>
                      <th className="py-2.5 px-3">Thời gian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {targets.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 font-bold text-slate-900">
                          @{t.username}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500">
                          {t.twitterUserId || "Auto-resolve"}
                        </td>
                        <td className="py-3 px-3 text-slate-500">
                          {t.bio || t.sourceNote}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                              t.status === "followed"
                                ? "bg-emerald-100 text-emerald-700"
                                : t.status === "pending"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400">
                          {new Date(t.createdAt).toLocaleString("vi-VN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* CRON SCHEDULER SECTION IN ADMIN */}
          {activeSection === "cron" && (
            <section className="rounded-lg bg-white border border-slate-200 p-6 shadow-xs space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Trạng thái & Cấu hình Cron Job Tự động Follow
                  </h2>
                  <p className="text-xs text-slate-500">
                    Lịch trình hiện tại:{" "}
                    <code className="font-bold text-[#ef1c1c]">
                      {cronConfig.cronExpression}
                    </code>{" "}
                    ({scheduler.active ? "Đang chạy tự động" : "Đang tạm dừng"})
                  </p>
                </div>

                <button
                  onClick={async () => {
                    const res = await fetch("/api/cron/config", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        ...cronConfig,
                        enabled: !cronConfig.enabled,
                      }),
                    });
                    if (res.ok) {
                      await fetchAdminData(false);
                      notify(
                        "success",
                        !cronConfig.enabled
                          ? "Đã BẬT Cron Job tự động Follow!"
                          : "Đã TẠM DỪNG Cron Job."
                      );
                    }
                  }}
                  className={`rounded-md px-4 py-2 text-xs font-bold text-white cursor-pointer ${
                    cronConfig.enabled
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-[#ef1c1c] hover:bg-red-700"
                  }`}
                >
                  {cronConfig.enabled
                    ? "ĐANG BẬT CRON (Bấm để dừng)"
                    : "BẬT CRON TỰ ĐỘNG NGAY"}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="text-xs text-slate-500">
                    Biểu thức Cron (5 trường)
                  </div>
                  <input
                    type="text"
                    value={cronConfig.cronExpression}
                    onChange={(e) =>
                      setCronConfig((p) => ({
                        ...p,
                        cronExpression: e.target.value,
                      }))
                    }
                    className="mt-1.5 w-full rounded border border-slate-300 px-3 py-1.5 text-sm font-mono"
                  />
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="text-xs text-slate-500">
                    Số lượng Follow / chu kỳ Cron
                  </div>
                  <input
                    type="number"
                    value={cronConfig.maxFollowsPerRun}
                    onChange={(e) =>
                      setCronConfig((p) => ({
                        ...p,
                        maxFollowsPerRun: Number(e.target.value) || 1,
                      }))
                    }
                    className="mt-1.5 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="text-xs text-slate-500">
                    Giới hạn Follow tối đa / ngày
                  </div>
                  <input
                    type="number"
                    value={cronConfig.dailyFollowLimit}
                    onChange={(e) =>
                      setCronConfig((p) => ({
                        ...p,
                        dailyFollowLimit: Number(e.target.value) || 20,
                      }))
                    }
                    className="mt-1.5 w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
              </div>

              <button
                onClick={async () => {
                  const res = await fetch("/api/cron/config", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(cronConfig),
                  });
                  if (res.ok) {
                    await fetchAdminData(false);
                    notify("success", "Đã lưu cấu hình Cron Job!");
                  }
                }}
                className="rounded-md bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
              >
                Lưu Cấu hình Cron
              </button>
            </section>
          )}

          {/* ACTIVITY LOGS SECTION IN ADMIN */}
          {activeSection === "logs" && (
            <section className="rounded-lg bg-white border border-slate-200 p-5 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                Nhật ký hoạt động Cron & Token ({logs.length})
              </h2>
              <div className="space-y-2">
                {logs.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    Chưa có nhật ký nào. Hãy bấm &ldquo;Follow Ngay&rdquo; trên
                    bảng Users để chạy thử!
                  </p>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-3.5 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            log.status === "error"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {log.status}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">
                          [{log.action}]
                        </span>
                        <span className="text-slate-800 font-medium">
                          {log.message}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString("vi-VN")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* OAUTH & VERCEL REDIS SETTINGS SECTION IN ADMIN */}
          {activeSection === "settings" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-lg bg-white border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">
                    Cấu hình Vercel Redis (@upstash/redis)
                  </h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      storageInfo.connected
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {storageInfo.connected ? "Connected" : "Fallback Mode"}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Sử dụng{" "}
                  <code className="text-[#ef1c1c] font-semibold">
                    @upstash/redis
                  </code>{" "}
                  (Vercel Marketplace Redis). Tự động đọc biến môi trường{" "}
                  <code className="font-mono">UPSTASH_REDIS_REST_URL</code> /{" "}
                  <code className="font-mono">KV_REST_API_URL</code> hoặc nhập
                  trực tiếp bên dưới. Key lưu trữ:{" "}
                  <code className="font-mono font-bold">
                    {storageInfo.redisKey}
                  </code>
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      UPSTASH_REDIS_REST_URL (hoặc KV_REST_API_URL)
                    </label>
                    <input
                      type="text"
                      value={redisUrlInput}
                      onChange={(e) => setRedisUrlInput(e.target.value)}
                      placeholder={
                        storageInfo.urlPreview ||
                        "https://your-db.upstash.io"
                      }
                      className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      UPSTASH_REDIS_REST_TOKEN (hoặc KV_REST_API_TOKEN)
                    </label>
                    <input
                      type="password"
                      value={redisTokenInput}
                      onChange={(e) => setRedisTokenInput(e.target.value)}
                      placeholder="AX..."
                      className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      const res = await fetch("/api/state", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "update_redis_config",
                          redisUrl: redisUrlInput,
                          redisToken: redisTokenInput,
                        }),
                      });
                      const data = await res.json();
                      if (data.storage) {
                        setStorageInfo(data.storage);
                        if (data.storage.connected) {
                          notify(
                            "success",
                            "Đã kết nối và đồng bộ toàn bộ Users & Tokens lên Vercel Redis thành công!"
                          );
                        } else {
                          notify(
                            "error",
                            data.storage.error ||
                              "Không thể kết nối tới Vercel Redis. Kiểm tra lại URL & Token."
                          );
                        }
                      }
                    }}
                    className="rounded-md bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
                  >
                    Kết nối & Đồng bộ lên Vercel Redis
                  </button>
                </div>
              </section>

              <section className="rounded-lg bg-white border border-slate-200 p-6 shadow-xs space-y-4">
                <h2 className="text-base font-bold text-slate-900">
                  Cấu hình X Developer OAuth 2.0 App Keys
                </h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      X OAuth 2.0 Client ID
                    </label>
                    <input
                      type="text"
                      value={oauthConfig.clientId}
                      onChange={(e) =>
                        setOauthConfig((p) => ({
                          ...p,
                          clientId: e.target.value,
                        }))
                      }
                      className="w-full rounded border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      X OAuth 2.0 Client Secret
                    </label>
                    <input
                      type="password"
                      value={oauthConfig.clientSecret}
                      onChange={(e) =>
                        setOauthConfig((p) => ({
                          ...p,
                          clientSecret: e.target.value,
                        }))
                      }
                      className="w-full rounded border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Callback Redirect URI
                    </label>
                    <input
                      type="text"
                      value={oauthConfig.redirectUri}
                      onChange={(e) =>
                        setOauthConfig((p) => ({
                          ...p,
                          redirectUri: e.target.value,
                        }))
                      }
                      className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      await fetch("/api/state", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "update_oauth_config",
                          ...oauthConfig,
                        }),
                      });
                      notify("success", "Đã lưu cấu hình OAuth 2.0 vào Redis!");
                    }}
                    className="rounded-md bg-[#ef1c1c] px-4 py-2 text-xs font-bold text-white hover:bg-red-700 cursor-pointer"
                  >
                    Lưu OAuth Config
                  </button>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: ADD / EDIT USER & TOKEN */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {modalMode === "create"
                  ? "Thêm User & X OAuth 2.0 Token mới"
                  : `Chỉnh sửa User & Token (@${userForm.username})`}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUserModal} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Họ tên hiển thị (Name)
                  </label>
                  <input
                    type="text"
                    required
                    value={userForm.name}
                    onChange={(e) =>
                      setUserForm((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="VD: Wilbert Williams"
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Username X (@handle)
                  </label>
                  <input
                    type="text"
                    required
                    value={userForm.username}
                    onChange={(e) =>
                      setUserForm((p) => ({ ...p, username: e.target.value }))
                    }
                    placeholder="VD: wilbert_williams"
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Twitter User ID
                  </label>
                  <input
                    type="text"
                    value={userForm.twitterUserId}
                    onChange={(e) =>
                      setUserForm((p) => ({
                        ...p,
                        twitterUserId: e.target.value,
                      }))
                    }
                    placeholder="VD: 1589203411"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Email quản lý
                  </label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) =>
                      setUserForm((p) => ({ ...p, email: e.target.value }))
                    }
                    placeholder="user@domain.com"
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Phân quyền (Role)
                  </label>
                  <select
                    value={userForm.role}
                    onChange={(e) =>
                      setUserForm((p) => ({
                        ...p,
                        role: e.target.value as UserRole,
                      }))
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                  >
                    <option value="member">Member</option>
                    <option value="vip">VIP</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Trạng thái Token
                  </label>
                  <select
                    value={userForm.accountStatus}
                    onChange={(e) =>
                      setUserForm((p) => ({
                        ...p,
                        accountStatus: e.target.value as UserAccountStatus,
                      }))
                    }
                    className="w-full rounded-md border border-slate-300 px-3 py-2"
                  >
                    <option value="active">Active (Hoạt động)</option>
                    <option value="expired">Expired (Hết hạn)</option>
                    <option value="suspended">Suspended (Tạm khóa)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  OAuth 2.0 Access Token <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={userForm.accessToken}
                  onChange={(e) =>
                    setUserForm((p) => ({ ...p, accessToken: e.target.value }))
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  OAuth 2.0 Refresh Token (Dùng để tự động gia hạn khi chạy Cron)
                </label>
                <input
                  type="text"
                  value={userForm.refreshToken}
                  onChange={(e) =>
                    setUserForm((p) => ({ ...p, refreshToken: e.target.value }))
                  }
                  className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={userForm.cronEnabled}
                    onChange={(e) =>
                      setUserForm((p) => ({
                        ...p,
                        cronEnabled: e.target.checked,
                      }))
                    }
                  />
                  <span>Cho phép chạy Cron Auto-Follow</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={userForm.isSimulated}
                    onChange={(e) =>
                      setUserForm((p) => ({
                        ...p,
                        isSimulated: e.target.checked,
                      }))
                    }
                  />
                  <span>Tài khoản Sandbox / Giả lập</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="rounded-md bg-[#ef1c1c] px-5 py-2 text-xs font-bold text-white hover:bg-red-700 cursor-pointer"
                >
                  {savingUser ? "Đang lưu..." : "Lưu User & Token"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: INSPECT FULL TOKEN */}
      {inspectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Chi tiết Token của @{inspectedUser.username}
                </h3>
                <p className="text-slate-500">
                  Twitter User ID: #{inspectedUser.twitterUserId}
                </p>
              </div>
              <button
                onClick={() => setInspectedUser(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between font-semibold text-slate-700 mb-1">
                  <span>Access Token (Bearer):</span>
                  <button
                    onClick={() =>
                      copyText(inspectedUser.accessToken, "Access Token")
                    }
                    className="text-[#ef1c1c] hover:underline"
                  >
                    Copy
                  </button>
                </div>
                <pre className="overflow-x-auto rounded bg-slate-900 p-3 font-mono text-[11px] text-emerald-400">
                  {inspectedUser.accessToken}
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between font-semibold text-slate-700 mb-1">
                  <span>Refresh Token:</span>
                  {inspectedUser.refreshToken && (
                    <button
                      onClick={() =>
                        copyText(inspectedUser.refreshToken!, "Refresh Token")
                      }
                      className="text-[#ef1c1c] hover:underline"
                    >
                      Copy
                    </button>
                  )}
                </div>
                <pre className="overflow-x-auto rounded bg-slate-900 p-3 font-mono text-[11px] text-sky-400">
                  {inspectedUser.refreshToken || "Không có refresh_token"}
                </pre>
              </div>

              <div>
                <span className="font-semibold text-slate-700 block mb-1">
                  Scopes đã cấp:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {inspectedUser.scopes.map((s) => (
                    <span
                      key={s}
                      className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
