import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { dismissRecommendation } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ trackId: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { trackId } = await context.params;
    dismissRecommendation(user, trackId);
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not dismiss recommendation." }, { status });
  }
}
