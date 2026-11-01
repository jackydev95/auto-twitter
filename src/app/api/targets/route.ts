import { NextRequest, NextResponse } from "next/server";
import {
  addTargets,
  clearTargetsByStatus,
  deleteTarget,
  getActiveAccount,
  readDb,
  resetFailedTargets,
} from "@/lib/store";
import {
  fetchUserFollowersFromTwitter,
  resolvePublicXUserProfile,
} from "@/lib/twitter-api";
import { runAutoFollowJob } from "@/lib/cron-runner";
import { syncCookieAccountsIntoStore } from "@/lib/cookie-sync";

export async function GET() {
  const db = await readDb();
  return NextResponse.json({ targets: db.targets });
}

export async function POST(req: NextRequest) {
  try {
    await syncCookieAccountsIntoStore(req);
    const body = await req.json();
    const { action } = body;

    if (action === "add_manual") {
      const rawText = (body.rawText || "").trim();
      const items: Array<{
        username: string;
        twitterUserId?: string;
        displayName?: string;
        bio?: string;
        followersCount?: number;
        sourceNote?: string;
      }> = [];

      if (rawText) {
        const lines = rawText
          .split(/[\n,;]+/)
          .map((l: string) => l.trim())
          .filter(Boolean);

        for (const line of lines) {
          const cleaned = line
            .replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, "")
            .split(/[/?#]/)[0]
            .trim();

          const [handlePart, idPart] = cleaned.split(":");
          const username = handlePart.replace(/^@+/, "").trim();
          if (username) {
            let resolvedId = idPart?.trim() || undefined;
            let displayName = `@${username}`;
            let bio: string | undefined;
            let followersCount: number | undefined;

            if (!resolvedId) {
              try {
                const pub = await resolvePublicXUserProfile(username);
                resolvedId = pub.id;
                displayName = pub.name;
                bio = pub.description;
                followersCount = pub.public_metrics?.followers_count;
              } catch {
                // Keep username and resolve during cron run
              }
            }

            items.push({
              username,
              twitterUserId: resolvedId,
              displayName,
              bio,
              followersCount,
              sourceNote: body.sourceNote || "Manual Queue Import",
            });
          }
        }
      } else if (Array.isArray(body.items)) {
        items.push(...body.items);
      }

      if (items.length === 0) {
        return NextResponse.json(
          { error: "Vui lòng nhập ít nhất một username X hợp lệ." },
          { status: 400 }
        );
      }

      const result = await addTargets(items);

      let autoFollow = null;
      if (body.autoFollowNow !== false && result.added > 0) {
        const activeAccount = await getActiveAccount();
        if (activeAccount) {
          try {
            autoFollow = await runAutoFollowJob("api");
          } catch {
            // non-blocking
          }
        }
      }

      const latestDb = await readDb();
      return NextResponse.json({
        ok: true,
        added: result.added,
        skippedDuplicates: result.skippedDuplicates,
        targets: latestDb.targets,
        autoFollow,
      });
    }

    if (action === "import_followers") {
      const sourceUsername = (body.sourceUsername || "")
        .trim()
        .replace(/^@+/, "");
      const maxResults = Number(body.maxResults) || 15;

      if (!sourceUsername) {
        return NextResponse.json(
          { error: "Vui lòng nhập username tài khoản X cần quét followers." },
          { status: 400 }
        );
      }

      const activeAccount = await getActiveAccount();
      const dummyAccount = activeAccount || {
        id: "public",
        twitterUserId: "",
        username: "",
        name: "",
        accessToken: "",
        scopes: [],
        tokenType: "bearer",
        isActive: false,
        createdAt: "",
        updatedAt: "",
      };

      const followers = await fetchUserFollowersFromTwitter(
        dummyAccount,
        sourceUsername,
        maxResults
      );

      const result = await addTargets(
        followers.map((f) => ({
          username: f.username,
          twitterUserId: f.id,
          displayName: f.name,
          bio: f.description,
          followersCount: f.public_metrics?.followers_count,
          source: "followers_import" as const,
          sourceNote: `Followers of @${sourceUsername}`,
        }))
      );

      let autoFollow = null;
      if (body.autoFollowNow !== false && activeAccount && result.added > 0) {
        try {
          autoFollow = await runAutoFollowJob("api");
        } catch {
          // non-blocking
        }
      }

      const latestDb = await readDb();
      return NextResponse.json({
        ok: true,
        added: result.added,
        skippedDuplicates: result.skippedDuplicates,
        targets: latestDb.targets,
        autoFollow,
      });
    }

    if (action === "reset_failed") {
      const count = await resetFailedTargets();
      const db = await readDb();
      return NextResponse.json({
        ok: true,
        resetCount: count,
        targets: db.targets,
      });
    }

    if (action === "clear_status") {
      const removed = await clearTargetsByStatus(body.status);
      const db = await readDb();
      return NextResponse.json({
        ok: true,
        removedCount: removed,
        targets: db.targets,
      });
    }

    if (action === "delete") {
      await deleteTarget(body.targetId);
      const db = await readDb();
      return NextResponse.json({
        ok: true,
        targets: db.targets,
      });
    }

    return NextResponse.json(
      { error: "Unsupported target action" },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Target operation failed",
      },
      { status: 500 }
    );
  }
}
