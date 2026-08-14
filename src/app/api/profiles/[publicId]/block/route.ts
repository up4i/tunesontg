import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { blockPublicUser, unblockPublicUser } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { publicId } = await context.params;
    if (!/^[a-f\d]{32}$/.test(publicId)) return Response.json({ error: "Listener was not found." }, { status: 400 });
    return Response.json({ blocked: blockPublicUser(user, publicId) });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not block listener." }, { status });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { publicId } = await context.params;
    if (!/^[a-f\d]{32}$/.test(publicId)) return Response.json({ error: "Listener was not found." }, { status: 400 });
    return Response.json({ unblocked: unblockPublicUser(user, publicId) });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not unblock listener." }, { status });
  }
}
