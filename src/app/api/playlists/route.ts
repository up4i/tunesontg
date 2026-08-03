import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { createPlaylist } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json() as { name?: unknown; description?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!name || name.length > 60 || description.length > 160) {
      return Response.json({ error: "Enter a playlist name up to 60 characters." }, { status: 400 });
    }
    const id = createPlaylist(user, { name, description });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Could not create playlist." }, { status });
  }
}
