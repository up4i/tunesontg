import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { getLibrary } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    return Response.json(getLibrary(user));
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load the library." },
      { status },
    );
  }
}
