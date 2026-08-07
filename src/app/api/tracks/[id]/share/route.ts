import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { createTrackShare } from "@/lib/db";
import { miniAppDeepLink } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { id } = await context.params;
    const shareId = createTrackShare(user, id);
    return Response.json({ url: miniAppDeepLink(`s_${shareId}`) });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not share track." }, { status });
  }
}
