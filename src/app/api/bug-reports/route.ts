import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { createBugReport } from "@/lib/db";
import { callTelegram } from "@/lib/telegram";

export const runtime = "nodejs";

const allowedContextKeys = new Set([
  "platform",
  "telegramVersion",
  "colorScheme",
  "viewport",
  "userAgent",
]);

export async function POST(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json() as { description?: unknown; context?: unknown };
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (description.length < 3 || description.length > 2000) {
      return Response.json({ error: "Describe the problem in 3 to 2000 characters." }, { status: 400 });
    }

    const context: Record<string, string | number | boolean | null> = {};
    if (body.context && typeof body.context === "object" && !Array.isArray(body.context)) {
      for (const [key, value] of Object.entries(body.context)) {
        if (!allowedContextKeys.has(key)) continue;
        if (typeof value === "string") context[key] = value.slice(0, 300);
        else if (typeof value === "number" || typeof value === "boolean" || value === null) context[key] = value;
      }
    }

    const id = createBugReport(user, { description, context });
    const reportChatId = process.env.BUG_REPORT_CHAT_ID;
    if (reportChatId) {
      try {
        const contextLines = Object.entries(context).map(([key, value]) => `${key}: ${String(value)}`);
        await callTelegram("sendMessage", {
          chat_id: reportChatId,
          text: [`Bug report ${id}`, `From Telegram user ${user.id}`, "", description, "", ...contextLines].join("\n"),
        });
      } catch (notificationError) {
        console.error("Could not notify the bug-report chat", notificationError);
      }
    }

    return Response.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 500;
    return Response.json({
      error: error instanceof Error ? error.message : "Could not submit the bug report.",
    }, { status });
  }
}
