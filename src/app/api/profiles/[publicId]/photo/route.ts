import { getPublicProfilePhoto } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ publicId: string }> }): Promise<Response> {
  const { publicId } = await context.params;
  if (!/^[a-f\d]{32}$/.test(publicId)) return Response.json({ error: "Profile not found." }, { status: 404 });
  const photo = getPublicProfilePhoto(publicId);
  if (!photo) return Response.json({ error: "Profile picture not found." }, { status: 404 });
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(photo);
  if (!match) return Response.json({ error: "Profile picture is invalid." }, { status: 500 });
  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": match[1],
      "x-content-type-options": "nosniff",
    },
  });
}
