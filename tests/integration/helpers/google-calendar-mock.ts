import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Stands in for Google's real googleapis.com/calendar/v3 endpoints used by
// the availability engine (Trello I2, freeBusy) and calendar sync (Trello
// I3, events). Same reasoning as google-oauth-mock.ts/graph-api-mock.ts:
// the route handler under test runs in a separately-spawned `next dev`
// process, so this has to be a real local HTTP server, wired in via
// GOOGLE_CALENDAR_API_BASE_URL.
//
// Every scenario is driven by the requested calendarId (never shared
// mutable state, so tests can run concurrently):
// - "trigger-freebusy-failure" -> freeBusy query fails outright
// - "busy-calendar" -> freeBusy returns one interval spanning the whole
//   requested [timeMin, timeMax) window
// - "trigger-events-failure" -> every events create/update/delete call fails
// - anything else -> freeBusy returns no busy intervals; events calls
//   succeed (create returns an incrementing mock-event-N id)
// Deleting the fixed event id "already-gone-event" returns 410, simulating
// an event removed by hand -- I3 treats that as a successful delete.
//
// Every create/update body is captured (keyed by the event id both sides
// already exchange, e.g. `google_event_id`), readable via GET /__events and
// clearable via DELETE /__events -- same inspection shape as
// tests/integration/helpers/email.ts's `__sent`, for tests that need to
// assert on what was actually sent to "Google" (start/end/summary/
// description), not just that a sync happened. Requests for the magic
// scenario ids above still succeed/fail as documented and are never
// captured -- they're not simulating a real event.
export type CapturedCalendarEvent = {
  id: string;
  summary?: string;
  description?: string | null;
  start?: { dateTime: string };
  end?: { dateTime: string };
};

export function startGoogleCalendarMock(): Promise<{ url: string; stop: () => Promise<void> }> {
  let nextEventId = 1;
  const capturedEvents = new Map<string, CapturedCalendarEvent>();

  const server: Server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/__events" && req.method === "GET") {
      return send(200, [...capturedEvents.values()]);
    }
    if (url.pathname === "/__events" && req.method === "DELETE") {
      capturedEvents.clear();
      res.writeHead(204);
      return res.end();
    }

    if (url.pathname === "/calendar/v3/freeBusy" && req.method === "POST") {
      return readJsonBody(req, (body: { timeMin: string; timeMax: string; items: { id: string }[] }) => {
        const calendarId = body.items[0]?.id ?? "primary";

        if (calendarId === "trigger-freebusy-failure") {
          return send(400, { error: { message: "mock: freeBusy query failed" } });
        }
        if (calendarId === "busy-calendar") {
          return send(200, {
            calendars: { [calendarId]: { busy: [{ start: body.timeMin, end: body.timeMax }] } },
          });
        }
        return send(200, { calendars: { [calendarId]: { busy: [] } } });
      });
    }

    const eventsMatch = url.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (eventsMatch) {
      const calendarId = decodeURIComponent(eventsMatch[1]);
      const eventId = eventsMatch[2] ? decodeURIComponent(eventsMatch[2]) : null;

      if (calendarId === "trigger-events-failure") {
        return send(400, { error: { message: "mock: events call failed" } });
      }

      if (req.method === "POST" && !eventId) {
        return readJsonBody(req, (body: Omit<CapturedCalendarEvent, "id">) => {
          const id = `mock-event-${nextEventId++}`;
          capturedEvents.set(id, { ...body, id });
          send(200, { id });
        });
      }
      if (req.method === "PATCH" && eventId) {
        return readJsonBody(req, (body: Partial<Omit<CapturedCalendarEvent, "id">>) => {
          const existing = capturedEvents.get(eventId);
          capturedEvents.set(eventId, { ...existing, ...body, id: eventId });
          send(200, { id: eventId });
        });
      }
      if (req.method === "DELETE" && eventId) {
        if (eventId === "already-gone-event") return send(410, { error: { message: "mock: gone" } });
        capturedEvents.delete(eventId);
        res.writeHead(204);
        return res.end();
      }
    }

    send(404, { error: { message: "mock: unknown endpoint" } });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        stop: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function readJsonBody<T = unknown>(req: import("node:http").IncomingMessage, onEnd: (body: T) => void) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => onEnd(raw ? JSON.parse(raw) : {}));
}
