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
          { error: "Please provide at least one valid X username." },
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
          { error: "Please enter a target username to fetch followers from." },
          { status: 400 }
        );
      }

      const activeAccount = await getActiveAccount();
      if (!activeAccount) {
        return NextResponse.json(
          {
            error:
              "Connect or select an active X token first before importing followers.",
          },
          { status: 400 }
        );
      }

      if (activeAccount.isSimulated) {
        const sampleFollowers = Array.from({
          length: Math.min(maxResults, 10),
        }).map((_, idx) => {
          const suffix = Math.floor(100 + Math.random() * 899);
          const uname = `${sourceUsername}_fan_${idx + 1}_${suffix}`;
          return {
            username: uname,
            twitterUserId: `18000${Date.now().toString().slice(-6)}${idx}`,
            displayName: `${sourceUsername} Follower #${idx + 1}`,
            bio: `Builder & follower of @${sourceUsername} on X`,
            followersCount: Math.floor(50 + Math.random() * 2500),
            source: "followers_import" as const,
            sourceNote: `Followers of @${sourceUsername}`,
          };
        });

        const result = await addTargets(sampleFollowers);
        return NextResponse.json({
          ok: true,
          added: result.added,
          skippedDuplicates: result.skippedDuplicates,
          targets: result.targets,
          simulated: true,
        });
      }

      const followers = await fetchUserFollowersFromTwitter(
        activeAccount.accessToken,
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
