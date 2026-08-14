import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { removePlaylistCollaborator } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; publicId: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { id, publicId } = await context.params;
    if (!/^[a-f\d]{32}$/.test(publicId)) {
      return Response.json({ error: "Collaborator was not found." }, { status: 400 });
    }
    return Response.json({ removed: removePlaylistCollaborator(user, id, publicId) });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove collaborator." }, { status });
  }
}
