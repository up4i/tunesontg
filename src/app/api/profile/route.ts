import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { updateProfile } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json() as { displayName?: unknown; bio?: unknown; customPhoto?: unknown };
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const bio = typeof body.bio === "string" ? body.bio.trim() : "";
    const photoValid = body.customPhoto === undefined
      || body.customPhoto === "keep"
      || body.customPhoto === null
      || (typeof body.customPhoto === "string" && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(body.customPhoto));
    const customPhoto = body.customPhoto === undefined || body.customPhoto === "keep"
      ? undefined
      : body.customPhoto === null
        ? null
        : typeof body.customPhoto === "string" ? body.customPhoto : undefined;
    const encodedBytes = customPhoto ? Math.ceil((customPhoto.length - customPhoto.indexOf(",") - 1) * 0.75) : 0;
    if (!displayName || displayName.length > 50 || bio.length > 160 || !photoValid || encodedBytes > 500_000) {
      return Response.json({ error: "Enter a name, a short bio, and a profile picture under 500 KB." }, { status: 400 });
    }
    updateProfile(user, { displayName, bio, customPhoto });
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 404;
    return Response.json({ error: error instanceof Error ? error.message : "Could not update profile." }, { status });
  }
}
