import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { createPlaylistShare } from "@/lib/db";
import { miniAppDeepLink } from "@/lib/telegram";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { id } = await context.params;
    const shareId = createPlaylistShare(user, id);
    return Response.json({ url: miniAppDeepLink(`p_${shareId}`) });
  } catch (error) {
    const status = error instanceof AuthenticationError
      ? 401
      : error instanceof Error && error.message.startsWith("Make")
        ? 409
        : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not share playlist." }, { status });
  }
}
