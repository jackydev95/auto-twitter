import { NextRequest, NextResponse } from "next/server";
import { TwitterAccount } from "./types";
import { upsertAccount } from "./store";

export const ACCOUNTS_COOKIE_NAME = "x_connected_accounts_v1";

export function readAccountsFromCookie(req: NextRequest): TwitterAccount[] {
  try {
    const raw = req.cookies.get(ACCOUNTS_COOKIE_NAME)?.value;
    if (!raw) return [];
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function syncCookieAccountsIntoStore(
  req: NextRequest
): Promise<void> {
  const cookieAccounts = readAccountsFromCookie(req);
  if (cookieAccounts.length === 0) return;

  for (const acc of cookieAccounts) {
    if (acc && acc.username && acc.accessToken) {
      await upsertAccount(acc);
    }
  }
}

export function writeAccountToCookie(
  req: NextRequest,
  res: NextResponse,
  account: TwitterAccount
): void {
  try {
    const existing = readAccountsFromCookie(req);
    const filtered = existing.filter(
      (a) =>
        a.id !== account.id &&
        a.username.toLowerCase() !== account.username.toLowerCase()
    );
    if (account.isActive) {
      filtered.forEach((a) => {
        a.isActive = false;
      });
    }
    const updated = [account, ...filtered].slice(0, 6);
    const encoded = Buffer.from(JSON.stringify(updated), "utf-8").toString(
      "base64"
    );
    res.cookies.set(ACCOUNTS_COOKIE_NAME, encoded, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
    });
  } catch {
    // Ignore cookie size errors
  }
}

