import crypto from "crypto";
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
} from "@/lib/twitter-api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "import_token") {
      const accessToken = (body.accessToken || "").trim();
      const refreshToken = (body.refreshToken || "").trim() || undefined;
      const verifyOnline = body.verifyOnline !== false;

      if (!accessToken) {
        return NextResponse.json(
          { error: "Access Token is required." },
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

      if (verifyOnline && !body.isSimulated) {
        try {
          const me = await fetchTwitterMe(accessToken);
          twitterUserId = me.id;
          username = me.username;
          name = me.name;
          profileImageUrl = me.profile_image_url;
          followersCount = me.public_metrics?.followers_count;
          followingCount = me.public_metrics?.following_count;
        } catch (verifyErr) {
          if (!username || !twitterUserId) {
            return NextResponse.json(
              {
                error:
                  verifyErr instanceof Error
                    ? `${verifyErr.message}. (Tip: Provide Username & User ID or uncheck 'Verify online via /2/users/me' if using a restricted token)`
                    : "Failed to verify token with X API /2/users/me",
              },
              { status: 400 }
            );
          }
        }
      }

      if (!username) username = `x_user_${Date.now().toString().slice(-4)}`;
      if (!twitterUserId)
        twitterUserId = `${Math.floor(100000000 + Math.random() * 900000000)}`;
      if (!name) name = body.name || `@${username}`;

      const expiresInHours = Number(body.expiresInHours) || 2;
      const expiresAt = new Date(
        Date.now() + expiresInHours * 3600 * 1000
      ).toISOString();

      const saved = await upsertAccount({
        twitterUserId,
        username,
        name,
        email: body.email || `${username}@x-user.io`,
        role: body.role || "member",
        accountStatus: body.accountStatus || "active",
        profileImageUrl,
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
        isSimulated: Boolean(body.isSimulated),
        followersCount: followersCount ?? 1200,
        followingCount: followingCount ?? 340,
      });

      await appendLog({
        runId: `token-${Date.now()}`,
        trigger: "manual",
        accountId: saved.id,
        accountUsername: saved.username,
        action: "token_refresh",
        status: saved.isSimulated ? "dry_run" : "success",
        message: `Saved OAuth 2.0 token in Vercel Redis for @${saved.username} (ID: ${saved.twitterUserId})`,
        httpStatus: 200,
      });

      return NextResponse.json({ ok: true, account: saved });
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
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        expiresAt: body.expiresAt,
        scopes: Array.isArray(body.scopes) ? body.scopes : undefined,
        cronEnabled:
          typeof body.cronEnabled === "boolean"
            ? body.cronEnabled
            : undefined,
        isActive:
          typeof body.isActive === "boolean" ? body.isActive : undefined,
        isSimulated:
          typeof body.isSimulated === "boolean"
            ? body.isSimulated
            : undefined,
      });

      if (!updated) {
        return NextResponse.json(
          { error: "User account not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ ok: true, account: updated });
    }

    if (action === "create_sandbox_token") {
      const customHandle = (body.username || "x_growth_bot")
        .trim()
        .replace(/^@+/, "");
      const simAccessToken = `x_oauth2_at_${crypto
        .randomBytes(18)
        .toString("hex")}`;
      const simRefreshToken = `x_oauth2_rt_${crypto
        .randomBytes(18)
        .toString("hex")}`;
      const expiresAt = new Date(Date.now() + 4 * 3600 * 1000).toISOString();

      const saved = await upsertAccount({
        twitterUserId: `${Math.floor(1000000000 + Math.random() * 900000000)}`,
        username: customHandle,
        name: body.name || `${customHandle}`,
        email: body.email || `${customHandle}@x-sandbox.dev`,
        role: body.role || "vip",
        accountStatus: "active",
        accessToken: simAccessToken,
        refreshToken: simRefreshToken,
        expiresAt,
        scopes: [
          "tweet.read",
          "users.read",
          "follows.read",
          "follows.write",
          "offline.access",
        ],
        tokenType: "bearer",
        isActive: true,
        cronEnabled: true,
        isSimulated: true,
        followersCount: Math.floor(800 + Math.random() * 8500),
        followingCount: Math.floor(150 + Math.random() * 900),
        totalAutoFollowed: Math.floor(10 + Math.random() * 120),
      });

      await appendLog({
        runId: `sandbox-${Date.now()}`,
        trigger: "manual",
        accountId: saved.id,
        accountUsername: saved.username,
        action: "token_refresh",
        status: "dry_run",
        message: `Generated Sandbox OAuth 2.0 token in Vercel Redis for @${saved.username}`,
        httpStatus: 200,
      });

      return NextResponse.json({ ok: true, account: saved });
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
