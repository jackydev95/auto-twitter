"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";

type AuthMethodTab = "oauth2_pkce" | "cookie_session" | "bearer_token";

function XRealAuthGatewayContent() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return_to") || "/";
  const urlError = searchParams.get("error");

  const [tab, setTab] = useState<AuthMethodTab>("oauth2_pkce");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [callbackUri, setCallbackUri] = useState(
    "https://auto-twitter.vercel.app/api/auth/twitter/callback"
  );

  // Cookie session state
  const [authToken, setAuthToken] = useState("");
  const [ct0, setCt0] = useState("");

  // Bearer token state
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(urlError);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCallbackUri(`${window.location.origin}/api/auth/twitter/callback`);
    }
    fetch("/api/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.oauthConfig?.clientId) {
          setClientId(data.oauthConfig.clientId);
        }
        if (data?.oauthConfig?.clientSecret) {
          setClientSecret(data.oauthConfig.clientSecret);
        }
      })
      .catch(() => {});
  }, []);

  const handleCopyCallback = async () => {
    await navigator.clipboard.writeText(callbackUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 1. Official X.com OAuth 2.0 PKCE Redirect
  const handleStartOfficialOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/twitter/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId.trim() || undefined,
          clientSecret: clientSecret.trim() || undefined,
          redirectUri: callbackUri,
          returnTo,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.authorizationUrl) {
        throw new Error(data.error || "Không thể khởi tạo phiên OAuth 2.0 PKCE");
      }
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Lỗi khởi tạo OAuth 2.0"
      );
      setSubmitting(false);
    }
  };

  // 2. Real X Cookie Session (auth_token + ct0)
  const handleConnectCookie = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/twitter/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_cookie",
          authToken: authToken.trim(),
          ct0: ct0.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Xác thực Cookie X thất bại");
      }
      const redirectUrl = new URL(returnTo, window.location.origin);
      redirectUrl.searchParams.set("auth_success", data.account.username);
      window.location.href = redirectUrl.toString();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Không thể xác thực Cookie X"
      );
      setSubmitting(false);
    }
  };

  // 3. Real OAuth 2.0 Access Token
  const handleConnectBearerToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/twitter/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_token",
          accessToken: accessToken.trim(),
          refreshToken: refreshToken.trim(),
          verifyOnline: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Xác thực Access Token thất bại");
      }
      const redirectUrl = new URL(returnTo, window.location.origin);
      redirectUrl.searchParams.set("auth_success", data.account.username);
      window.location.href = redirectUrl.toString();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Không thể xác thực Access Token"
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-black font-black text-2xl">
              𝕏
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">
                Xác thực & Kết nối tài khoản 𝕏 Thật
              </h1>
              <p className="text-xs text-zinc-400">
                100% Real X API v2 OAuth 2.0 PKCE & X Session Cookie Auth
              </p>
            </div>
          </div>

          <Link
            href={returnTo}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Quay lại
          </Link>
        </div>

        {/* Method Selector Tabs */}
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-zinc-900 p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setTab("oauth2_pkce");
              setErrorMsg(null);
            }}
            className={`rounded-lg py-2 px-2 font-semibold transition cursor-pointer ${
              tab === "oauth2_pkce"
                ? "bg-white text-black shadow-xs"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            1. OAuth 2.0 PKCE (X.com)
          </button>

          <button
            type="button"
            onClick={() => {
              setTab("cookie_session");
              setErrorMsg(null);
            }}
            className={`rounded-lg py-2 px-2 font-semibold transition cursor-pointer ${
              tab === "cookie_session"
                ? "bg-white text-black shadow-xs"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            2. Cookie X (auth_token + ct0)
          </button>

          <button
            type="button"
            onClick={() => {
              setTab("bearer_token");
              setErrorMsg(null);
            }}
            className={`rounded-lg py-2 px-2 font-semibold transition cursor-pointer ${
              tab === "bearer_token"
                ? "bg-white text-black shadow-xs"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            3. Dán Access Token
          </button>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* TAB 1: OFFICIAL X OAUTH 2.0 PKCE */}
        {tab === "oauth2_pkce" && (
          <form onSubmit={handleStartOfficialOAuth} className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 text-xs text-zinc-300 space-y-2">
              <p className="font-semibold text-white">
                Chuyển hướng trực tiếp sang <code>https://x.com/i/oauth2/authorize</code>
              </p>
              <p className="text-zinc-400">
                Trong{" "}
                <a
                  href="https://developer.x.com/en/portal/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 underline"
                >
                  X Developer Portal
                </a>{" "}
                (User authentication settings → OAuth 2.0), hãy thêm Callback
                URI sau:
              </p>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-black px-3 py-2 font-mono text-[11px] text-sky-300">
                <span className="truncate">{callbackUri}</span>
                <button
                  type="button"
                  onClick={handleCopyCallback}
                  className="shrink-0 inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-[10px] text-white hover:bg-zinc-700 cursor-pointer"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copied ? "Đã copy!" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                X OAuth 2.0 Client ID (Tùy chọn — để trống sẽ dùng Client ID mặc định)
              </label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Ví dụ: V1p6R2x... (từ X Developer Portal -> Keys and tokens)"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-xs font-mono text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                X OAuth 2.0 Client Secret (Nếu chọn Web App / Confidential Client)
              </label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Để trống nếu chọn Single Page App / Native App (Public Client)"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-xs font-mono text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-black hover:bg-zinc-200 disabled:opacity-50 transition cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              <span>Đi tới X.com để Ủy quyền & Lấy Token</span>
            </button>
          </form>
        )}

        {/* TAB 2: REAL X COOKIE SESSION (auth_token + ct0) */}
        {tab === "cookie_session" && (
          <form onSubmit={handleConnectCookie} className="space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-200 space-y-1.5">
              <p className="font-semibold">
                Khuyên dùng: Hoạt động 100% trên mọi tài khoản X (Không cần mua gói X API $100/tháng)
              </p>
              <p className="text-emerald-300/80">
                Mở <code>https://x.com</code> → bấm <code>F12 (DevTools)</code>{" "}
                → tab <code>Application</code> → <code>Cookies</code> → copy 2
                giá trị <code>auth_token</code> và <code>ct0</code>. Hệ thống sẽ
                xác thực trực tiếp với máy chủ X và thực thi Auto-Follow thật.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Cookie <code>auth_token</code>{" "}
                <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="Ví dụ: 84a9b2c1d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-xs font-mono text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Cookie <code>ct0</code> (CSRF Token){" "}
                <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={ct0}
                onChange={(e) => setCt0(e.target.value)}
                placeholder="Ví dụ: 1a2b3c4d5e6f..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-xs font-mono text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-bold text-black hover:bg-emerald-400 disabled:opacity-50 transition cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              <span>Xác thực Cookie X thật & Lưu vào Vercel Redis</span>
            </button>
          </form>
        )}

        {/* TAB 3: DIRECT ACCESS TOKEN */}
        {tab === "bearer_token" && (
          <form onSubmit={handleConnectBearerToken} className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 text-xs text-zinc-300">
              Dán trực tiếp <strong>OAuth 2.0 User Access Token</strong> đã lấy
              từ X Developer Portal hoặc Postman. Hệ thống sẽ kiểm tra trực tiếp
              qua <code>GET https://api.twitter.com/2/users/me</code>.
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                OAuth 2.0 Access Token <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Dán access_token..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-xs font-mono text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                OAuth 2.0 Refresh Token (Tùy chọn)
              </label>
              <input
                type="text"
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
                placeholder="Dán refresh_token (nếu có)..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-xs font-mono text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-sky-500 px-6 py-3 text-sm font-bold text-black hover:bg-sky-400 disabled:opacity-50 transition cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              <span>Kiểm tra qua /2/users/me & Lưu Token</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function XAuthorizePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black text-white flex items-center justify-center text-sm">
          Đang tải cổng xác thực X...
        </div>
      }
    >
      <XRealAuthGatewayContent />
    </Suspense>
  );
}
