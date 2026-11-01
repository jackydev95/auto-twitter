import { NextRequest, NextResponse } from "next/server";
import {
  appendLog,
  deleteAccount,
  getAccounts,
  setActiveAccount,
  updateAccountById,
  upsertAccount,
} from "@/lib/store";
import {
  fetchTwitterMe,
  refreshAccountAccessToken,
  verifyTwitterCookieSession,
} from "@/lib/twitter-api";
import {
  syncCookieAccountsIntoStore,
  writeAccountToCookie,
} from "@/lib/cookie-sync";

export async function POST(req: NextRequest) {
  try {
    await syncCookieAccountsIntoStore(req);
    const body = await req.json();
    const { action } = body;

    if (action === "import_cookie") {
      const authToken = (body.authToken || "").trim();
      const ct0 = (body.ct0 || "").trim();

      if (!authToken || !ct0) {
        return NextResponse.json(
          {
            error:
              "Vui lòng nhập đầy đủ cả hai giá trị cookie: auth_token và ct0 từ trình duyệt đang đăng nhập X.com.",
          },
          { status: 400 }
        );
      }

      const verifiedProfile = await verifyTwitterCookieSession(authToken, ct0);

      const saved = await upsertAccount({
        twitterUserId: verifiedProfile.id,
        username: verifiedProfile.username,
        name: verifiedProfile.name,
        email: body.email || `${verifiedProfile.username}@x.com`,
        role: body.role || "vip",
        accountStatus: "active",
        profileImageUrl: verifiedProfile.profile_image_url,
        authType: "cookie",
        accessToken: authToken,
        ct0,
        scopes: [
          "tweet.read",
          "users.read",
          "follows.read",
          "follows.write",
          "cookie.session",
        ],
        tokenType: "cookie_session",
        isActive: true,
        cronEnabled: true,
        followersCount: verifiedProfile.public_metrics?.followers_count,
        followingCount: verifiedProfile.public_metrics?.following_count,
      });

      await appendLog({
        runId: `cookie-${Date.now()}`,
        trigger: "manual",
        accountId: saved.id,
        accountUsername: saved.username,
        action: "token_refresh",
        status: "success",
        message: `Đã xác thực Cookie X (auth_token + ct0) thành công cho @${saved.username} (ID: ${saved.twitterUserId})`,
        httpStatus: 200,
      });

      const res = NextResponse.json({ ok: true, account: saved });
      writeAccountToCookie(req, res, saved);
      return res;
    }

    if (action === "import_token") {
      const accessToken = (body.accessToken || "").trim();
      const refreshToken = (body.refreshToken || "").trim() || undefined;
      const verifyOnline = body.verifyOnline !== false;

      if (!accessToken) {
        return NextResponse.json(
          { error: "Vui lòng nhập OAuth 2.0 Access Token." },
          { status: 400 }
        );
      }

      let twitterUserId = (body.twitterUserId || "").trim();
      let username = (body.username || "").trim().replace(/^@+/, "");
      let name = (body.name || "").trim();
      let profileImageUrl: string | undefined;
      let followersCount: number | undefined = body.followersCount
        ? Number(body.followersCount)
        : undefined;
      let followingCount: number | undefined = body.followingCount
        ? Number(body.followingCount)
        : undefined;

      if (verifyOnline) {
        const me = await fetchTwitterMe(accessToken);
        twitterUserId = me.id;
        username = me.username;
        name = me.name;
        profileImageUrl = me.profile_image_url;
        followersCount = me.public_metrics?.followers_count;
        followingCount = me.public_metrics?.following_count;
      } else {
        if (!username || !twitterUserId) {
          return NextResponse.json(
            {
              error:
                "Khi bỏ chọn kiểm tra online qua /2/users/me, bạn bắt buộc phải nhập Username và Twitter User ID thật của tài khoản.",
            },
            { status: 400 }
          );
        }
      }

      if (!name) name = `@${username}`;

      const expiresInHours = Number(body.expiresInHours) || 2;
      const expiresAt = new Date(
        Date.now() + expiresInHours * 3600 * 1000
      ).toISOString();

      const saved = await upsertAccount({
        twitterUserId,
        username,
        name,
        email: body.email || `${username}@x.com`,
        role: body.role || "member",
        accountStatus: body.accountStatus || "active",
        profileImageUrl,
        authType: "oauth2",
        accessToken,
        refreshToken,
        expiresAt,
        scopes: Array.isArray(body.scopes)
          ? body.scopes
          : [
              "tweet.read",
              "users.read",
              "follows.read",
              "follows.write",
              ...(refreshToken ? ["offline.access"] : []),
            ],
        tokenType: "bearer",
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
        cronEnabled:
          body.cronEnabled !== undefined ? Boolean(body.cronEnabled) : true,
        followersCount: followersCount ?? 0,
        followingCount: followingCount ?? 0,
      });

      await appendLog({
        runId: `token-${Date.now()}`,
        trigger: "manual",
        accountId: saved.id,
        accountUsername: saved.username,
        action: "token_refresh",
        status: "success",
        message: `Đã lưu OAuth 2.0 Token cho @${saved.username} (ID: ${saved.twitterUserId}) vào Vercel Redis`,
        httpStatus: 200,
      });

      const res = NextResponse.json({ ok: true, account: saved });
      writeAccountToCookie(req, res, saved);
      return res;
    }

    if (action === "update_user") {
      const accountId = body.accountId;
      if (!accountId) {
        return NextResponse.json(
          { error: "Missing accountId" },
          { status: 400 }
        );
      }

      const updated = await updateAccountById(accountId, {
        name: body.name,
        username: body.username
          ? String(body.username).trim().replace(/^@+/, "")
          : undefined,
        twitterUserId: body.twitterUserId,
        email: body.email,
        role: body.role,
        accountStatus: body.accountStatus,
        authType: body.authType,
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        ct0: body.ct0,
        expiresAt: body.expiresAt,
        scopes: Array.isArray(body.scopes) ? body.scopes : undefined,
        cronEnabled:
          typeof body.cronEnabled === "boolean"
            ? body.cronEnabled
            : undefined,
        isActive:
          typeof body.isActive === "boolean" ? body.isActive : undefined,
      });

      if (!updated) {
        return NextResponse.json(
          { error: "User account not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ ok: true, account: updated });
    }

    if (action === "refresh_token") {
      const accountId = body.accountId;
      const accounts = await getAccounts();
      const targetAcc = accounts.find((a) => a.id === accountId) || accounts[0];
      if (!targetAcc) {
        return NextResponse.json(
          { error: "Account not found" },
          { status: 404 }
        );
      }

      const refreshed = await refreshAccountAccessToken(targetAcc);
      return NextResponse.json({ ok: true, account: refreshed });
    }

    if (action === "set_active") {
      const updated = await setActiveAccount(body.accountId);
      return NextResponse.json({ ok: true, account: updated });
    }

    if (action === "delete_account") {
      const deleted = await deleteAccount(body.accountId);
      return NextResponse.json({ ok: deleted });
    }

    return NextResponse.json(
      { error: "Invalid token action" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Token operation failed",
      },
      { status: 500 }
    );
  }
}
