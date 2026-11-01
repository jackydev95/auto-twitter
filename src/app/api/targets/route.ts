import { NextRequest, NextResponse } from "next/server";
import {
  addTargets,
  clearTargetsByStatus,
  deleteTarget,
  getActiveAccount,
  readDb,
  resetFailedTargets,
} from "@/lib/store";
import { fetchUserFollowersFromTwitter } from "@/lib/twitter-api";

export async function GET() {
  const db = await readDb();
  return NextResponse.json({ targets: db.targets });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "add_manual") {
      const rawText = (body.rawText || "").trim();
      const items: Array<{
        username: string;
        twitterUserId?: string;
        displayName?: string;
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
            items.push({
              username,
              twitterUserId: idPart?.trim() || undefined,
              displayName: `@${username}`,
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
      return NextResponse.json({
        ok: true,
        added: result.added,
        skippedDuplicates: result.skippedDuplicates,
        targets: result.targets,
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
      if (!activeAccount) {
        return NextResponse.json(
          {
            error:
              "Vui lòng kết nối tài khoản X (OAuth 2.0 hoặc Cookie) trước khi quét followers.",
          },
          { status: 400 }
        );
      }

      const followers = await fetchUserFollowersFromTwitter(
        activeAccount,
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

      return NextResponse.json({
        ok: true,
        added: result.added,
        skippedDuplicates: result.skippedDuplicates,
        targets: result.targets,
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
