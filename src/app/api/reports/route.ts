import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { reportPublicContent } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json() as { targetType?: unknown; targetId?: unknown; reason?: unknown };
    const targetType = body.targetType === "profile" || body.targetType === "playlist" ? body.targetType : null;
    const targetId = typeof body.targetId === "string" ? body.targetId.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!targetType || !targetId || !reason || reason.length > 500) {
      return Response.json({ error: "Describe the problem in up to 500 characters." }, { status: 400 });
    }
    return Response.json({ id: reportPublicContent(user, { targetType, targetId, reason }) });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not submit report." }, { status });
  }
}
