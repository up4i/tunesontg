import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { saveAccessibleTrackToLibrary } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { id } = await context.params;
    const result = saveAccessibleTrackToLibrary(user, id);
    return Response.json({ created: result.created, trackId: result.track.id });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not save track." }, { status });
  }
}
