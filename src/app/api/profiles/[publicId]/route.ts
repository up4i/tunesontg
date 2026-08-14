import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { getPublicProfile } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ publicId: string }> }): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const { publicId } = await context.params;
    if (!/^[a-f\d]{32}$/.test(publicId)) return Response.json({ error: "This profile link is invalid." }, { status: 400 });
    const profile = getPublicProfile(publicId, user);
    if (!profile) return Response.json({ error: "This profile is unavailable." }, { status: 404 });
    return Response.json(profile);
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Could not open profile." }, { status });
  }
}
