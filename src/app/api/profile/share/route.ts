import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { getPublicProfileId } from "@/lib/db";
import { miniAppDeepLink } from "@/lib/telegram";

export const runtime = "nodejs";

export function POST(request: Request): Response {
  try {
    const user = getAuthenticatedUser(request);
    const publicId = getPublicProfileId(user);
    return Response.json({ url: miniAppDeepLink(`u_${publicId}`) });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Could not share profile." }, { status });
  }
}
