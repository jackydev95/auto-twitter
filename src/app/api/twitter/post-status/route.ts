import { NextRequest, NextResponse } from "next/server";
import { getAccounts, getActiveAccount } from "@/lib/store";
import { autoPostStatusForAccount } from "@/lib/twitter-api";
import { syncCookieAccountsIntoStore } from "@/lib/cookie-sync";

export async function POST(req: NextRequest) {
  try {
    await syncCookieAccountsIntoStore(req);
    const body = await req.json().catch(() => ({}));
    const accountId = body.accountId;
    const customText = typeof body.text === "string" ? body.text : undefined;

    const accounts = await getAccounts();
    const targetAccount = accountId
      ? accounts.find((a) => a.id === accountId)
      : await getActiveAccount();

    if (!targetAccount) {
      return NextResponse.json(
        {
          error:
            "Chưa có tài khoản X nào được kết nối. Vui lòng xác thực OAuth 2.0 hoặc nhập Token/Cookie trước khi đăng status.",
        },
        { status: 400 }
      );
    }

    const result = await autoPostStatusForAccount(
      targetAccount,
      customText,
      body.trigger === "manual" ? "manual" : "api"
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error || result.message,
          result,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to post status on X",
      },
      { status: 500 }
    );
  }
}
