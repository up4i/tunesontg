import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { setPlaylistFollow } from "@/lib/db";

export const runtime = "nodejs";

function shareId(token: string): string | null {
  return /^p_[a-f\d]{32}$/.test(token) ? token.slice(2) : null;
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { token } = await context.params;
    const id = shareId(token);
    if (!id) return Response.json({ error: "This playlist link is invalid." }, { status: 400 });
    return Response.json({ following: true, changed: setPlaylistFollow(user, id, true) });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not follow playlist." }, { status });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { token } = await context.params;
    const id = shareId(token);
    if (!id) return Response.json({ error: "This playlist link is invalid." }, { status: 400 });
    return Response.json({ following: false, changed: setPlaylistFollow(user, id, false) });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not unfollow playlist." }, { status });
  }
}
