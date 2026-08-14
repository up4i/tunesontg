import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { createPlaylistFolder } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json() as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 50) return Response.json({ error: "Enter a folder name up to 50 characters." }, { status: 400 });
    return Response.json({ id: createPlaylistFolder(user, name) }, { status: 201 });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 400;
    return Response.json({ error: error instanceof Error ? error.message : "Could not create folder." }, { status });
  }
}
