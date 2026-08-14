import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { joinCollaborativePlaylist } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { token } = await context.params;
    if (!/^p_[a-f\d]{32}$/.test(token)) return Response.json({ error: "This playlist link is invalid." }, { status: 400 });
    const result = joinCollaborativePlaylist(user, token.slice(2));
    return Response.json({ joined: true, ...result });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not join playlist." }, { status });
  }
}
