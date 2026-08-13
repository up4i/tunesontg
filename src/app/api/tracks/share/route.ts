import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { createTrackShare } from "@/lib/db";
import { miniAppDeepLink } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json() as { trackIds?: unknown };
    if (
      !Array.isArray(body.trackIds)
      || !body.trackIds.length
      || body.trackIds.length > 10
      || body.trackIds.some((trackId) => typeof trackId !== "string")
    ) {
      return Response.json({ error: "Share between 1 and 10 tracks at a time." }, { status: 400 });
    }
    const trackIds = [...new Set(body.trackIds as string[])];
    const urls = trackIds.map((trackId) =>
      miniAppDeepLink(`s_${createTrackShare(user, trackId)}`),
    );
    return Response.json({ urls });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({
      error: error instanceof Error ? error.message : "Could not share tracks.",
    }, { status });
  }
}
