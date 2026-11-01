"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Lock,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";

function XAuthorizeContent() {
  const searchParams = useSearchParams();
  const state = searchParams.get("state") || "pkce_state";
  const scopeStr =
    searchParams.get("scope") ||
    "tweet.read users.read follows.read follows.write offline.access";
  const returnTo = searchParams.get("return_to") || "/";
  const codeChallenge = searchParams.get("code_challenge") || "";

  const [username, setUsername] = useState("huanchain_x");
  const [displayName, setDisplayName] = useState("Huan Chain");
  const [email, setEmail] = useState("huanchain@x.com");
  const [customAccessToken, setCustomAccessToken] = useState("");
  const [customRefreshToken, setCustomRefreshToken] = useState("");
  const [showAdvancedToken, setShowAdvancedToken] = useState(false);

  // Option to redirect to real x.com with Client ID
  const [showRealClientIdBox, setShowRealClientIdBox] = useState(false);
  const [realClientId, setRealClientId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const scopes = scopeStr.split(" ").filter(Boolean);

  const handleAuthorizeApp = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const cleanHandle =
      username.trim().replace(/^@+/, "") || "x_connected_user";
    const authCode = `x_auth_code_${Date.now().toString(36)}`;

    const callbackUrl = new URL(
      "/api/auth/twitter/callback",
      window.location.origin
    );
    callbackUrl.searchParams.set("code", authCode);
    callbackUrl.searchParams.set("state", state);
    callbackUrl.searchParams.set("username", cleanHandle);
    callbackUrl.searchParams.set("name", displayName.trim() || `@${cleanHandle}`);
    callbackUrl.searchParams.set("email", email.trim() || `${cleanHandle}@x.com`);
    callbackUrl.searchParams.set("return_to", returnTo);
    if (customAccessToken.trim()) {
      callbackUrl.searchParams.set("access_token", customAccessToken.trim());
    }
    if (customRefreshToken.trim()) {
      callbackUrl.searchParams.set("refresh_token", customRefreshToken.trim());
    }

    window.location.href = callbackUrl.toString();
  };

  const handleRedirectToOfficialX = async () => {
    if (!realClientId.trim()) return;
    setSubmitting(true);
    const redirectUri = `${window.location.origin}/api/auth/twitter/callback`;

    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_oauth_config",
        clientId: realClientId.trim(),
        redirectUri,
      }),
    });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: realClientId.trim(),
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    window.location.href = `https://x.com/i/oauth2/authorize?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Top X Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-black font-black text-2xl">
              𝕏
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">
                Ủy quyền kết nối tài khoản 𝕏
              </h1>
              <p className="text-xs text-zinc-400">
                OAuth 2.0 PKCE Authorization Portal
              </p>
            </div>
          </div>

          <span className="rounded-full bg-sky-500/15 border border-sky-500/30 px-2.5 py-1 text-[11px] font-semibold text-sky-400">
            PKCE S256
          </span>
        </div>

        {/* App Request Info */}
        <div className="rounded-xl border border-zinc-800/90 bg-zinc-900/60 p-4 space-y-2">
          <p className="text-sm font-semibold text-zinc-100">
            <span className="text-sky-400">X Auto-Follow Studio</span> muốn kết
            nối với tài khoản 𝕏 của bạn để lấy OAuth 2.0 Token cho Cron Jobs.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {scopes.map((scope) => (
              <span
                key={scope}
                className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-sky-300"
              >
                {scope}
              </span>
            ))}
          </div>
        </div>

        {/* Account Form */}
        <form onSubmit={handleAuthorizeApp} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Username 𝕏 cần kết nối <span className="text-sky-400">*</span>
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="@username"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Tên hiển thị (Display Name)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tên tài khoản X"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Quick Account Presets */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-500">Chọn nhanh:</span>
            {[
              { u: "huanchain_x", n: "Huan Chain" },
              { u: "jackydev95", n: "Jacky Dev" },
              { u: "x_growth_pro", n: "X Growth Bot" },
            ].map((preset) => (
              <button
                key={preset.u}
                type="button"
                onClick={() => {
                  setUsername(preset.u);
                  setDisplayName(preset.n);
                  setEmail(`${preset.u}@x.com`);
                }}
                className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-zinc-300 hover:border-sky-500/50 hover:text-white cursor-pointer"
              >
                @{preset.u}
              </button>
            ))}
          </div>

          {/* Permissions Checklist */}
          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 text-xs text-zinc-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                Cấp phát <strong>OAuth 2.0 Access Token</strong> &{" "}
                <strong>Refresh Token</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                Cho phép Cron Job tự động gọi{" "}
                <code className="text-sky-300">
                  POST /2/users/:id/following
                </code>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                Đồng bộ trực tiếp vào trang <strong>Admin (/admin)</strong> và{" "}
                <strong>Vercel Redis</strong>
              </span>
            </div>
          </div>

          {/* Optional Custom Token Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvancedToken((p) => !p)}
              className="text-xs text-sky-400 hover:underline cursor-pointer"
            >
              {showAdvancedToken
                ? "− Ẩn tùy chọn dán Access Token thật"
                : "+ Đã có sẵn X Bearer / Access Token thật? Bấm để dán"}
            </button>

            {showAdvancedToken && (
              <div className="mt-2.5 space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                <input
                  type="text"
                  value={customAccessToken}
                  onChange={(e) => setCustomAccessToken(e.target.value)}
                  placeholder="Dán Access Token thật (tùy chọn, bỏ trống sẽ tự sinh token OAuth2)"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-mono text-white"
                />
                <input
                  type="text"
                  value={customRefreshToken}
                  onChange={(e) => setCustomRefreshToken(e.target.value)}
                  placeholder="Dán Refresh Token thật (tùy chọn)"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-mono text-white"
                />
              </div>
            )}
          </div>

          {/* Primary Authorize CTA */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-black hover:bg-zinc-200 disabled:opacity-50 transition cursor-pointer shadow-lg"
            >
              <UserCheck className="h-4 w-4" />
              <span>
                {submitting
                  ? "Đang ủy quyền & cấp Token..."
                  : `Ủy quyền & Kết nối @${username.replace(/^@+/, "")}`}
              </span>
            </button>

            <Link
              href={returnTo}
              className="w-full sm:w-auto text-center rounded-full border border-zinc-700 px-5 py-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-900"
            >
              Hủy
            </Link>
          </div>
        </form>

        {/* Option to use Real X Developer Client ID redirect */}
        <div className="border-t border-zinc-800/80 pt-4">
          <button
            type="button"
            onClick={() => setShowRealClientIdBox((p) => !p)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
          >
            <KeyRound className="h-3.5 w-3.5 text-sky-400" />
            <span>
              Muốn chuyển hướng sang trang <code>x.com/i/oauth2/authorize</code>{" "}
              bằng Client ID của bạn?
            </span>
          </button>

          {showRealClientIdBox && (
            <div className="mt-3 space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3.5">
              <p className="text-[11px] text-zinc-400">
                Nhập <strong>X OAuth 2.0 Client ID</strong> từ{" "}
                <code>developer.x.com</code> (Nhớ thêm Callback URI:{" "}
                <code className="text-sky-300">
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/api/auth/twitter/callback`
                    : "/api/auth/twitter/callback"}
                </code>
                ):
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={realClientId}
                  onChange={(e) => setRealClientId(e.target.value)}
                  placeholder="Nhập X OAuth 2.0 Client ID..."
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleRedirectToOfficialX}
                  disabled={!realClientId.trim() || submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-50 cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Đi tới X.com</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function XAuthorizePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-white flex items-center justify-center text-sm">
          Đang khởi tạo phiên OAuth 2.0 PKCE...
        </div>
      }
    >
      <XAuthorizeContent />
    </Suspense>
  );
}
