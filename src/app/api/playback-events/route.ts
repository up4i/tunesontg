import { AuthenticationError, getAuthenticatedUser } from "@/lib/auth";
import { getPlaybackSummary, recordPlaybackEvents, type PlaybackEventInput } from "@/lib/db";

export const runtime = "nodejs";

const allowedEvents = new Set<PlaybackEventInput["event"]>([
  "play_request",
  "playback_started",
  "buffer_start",
  "buffer_end",
  "stream_error",
  "retry_started",
  "retry_recovered",
  "skip",
]);

export function GET(request: Request): Response {
  try {
    const user = getAuthenticatedUser(request);
    return Response.json(getPlaybackSummary(user));
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Could not load playback diagnostics." }, { status });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = getAuthenticatedUser(request);
    const body = await request.json() as { events?: unknown };
    if (!Array.isArray(body.events) || !body.events.length || body.events.length > 20) {
      return Response.json({ error: "Send between 1 and 20 playback events." }, { status: 400 });
    }
    const events: PlaybackEventInput[] = [];
    for (const value of body.events) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return Response.json({ error: "Playback event is invalid." }, { status: 400 });
      }
      const event = value as Record<string, unknown>;
      if (
        typeof event.sessionId !== "string"
        || !/^[a-zA-Z0-9_-]{8,80}$/.test(event.sessionId)
        || typeof event.event !== "string"
        || !allowedEvents.has(event.event as PlaybackEventInput["event"])
        || (event.trackId !== null && typeof event.trackId !== "string")
      ) {
        return Response.json({ error: "Playback event is invalid." }, { status: 400 });
      }
      const startupMs = typeof event.startupMs === "number" && Number.isFinite(event.startupMs)
        ? Math.min(120_000, Math.max(0, Math.round(event.startupMs)))
        : null;
      const positionSeconds = typeof event.positionSeconds === "number" && Number.isFinite(event.positionSeconds)
        ? Math.min(86_400, Math.max(0, event.positionSeconds))
        : null;
      events.push({
        sessionId: event.sessionId,
        event: event.event as PlaybackEventInput["event"],
        trackId: typeof event.trackId === "string" ? event.trackId : null,
        startupMs,
        positionSeconds,
        detail: typeof event.detail === "string" ? event.detail.slice(0, 80) : null,
      });
    }
    const recorded = recordPlaybackEvents(user, events);
    return Response.json({ ok: true, recorded }, { status: 201 });
  } catch (error) {
    const status = error instanceof AuthenticationError ? 401 : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Could not record playback event." }, { status });
  }
}
