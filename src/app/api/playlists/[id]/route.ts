import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { deletePlaylist } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { id } = await context.params;
    deletePlaylist(user, id);
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete playlist." }, { status });
  }
}
