# @heecheon92/use-event-source

Lightweight React hook and service helpers for Server-Sent Events that pair
runtime payload validation (via `zod`) with sensible lifecycle management.

## Installation

```bash
npm install @heecheon92/use-event-source event-source-polyfill zod
```

## Quick start

```ts
import { useEventSource } from "@heecheon92/use-event-source";
import { z } from "zod";

const schema = {
  ping: z.object({ message: z.string() }),
};

export function Notifications() {
  useEventSource({
    key: "ping-stream",
    url: "/api/sse",
    schema,
    descriptors: [
      {
        eventName: "ping",
        handler: ({ message }) => console.log("ping:", message),
      },
    ],
    eventSourceInit: { withCredentials: true },
    onUnauthorized: async ({ attempt }) => {
      if (attempt > 2) return;
      const token = await refreshTokenSomehow();
      return { headers: { Authorization: `Bearer ${token}` } };
    },
  });

  return null;
}
```

## API highlights

- `useEventSource` – subscribe to named SSE events with Zod schemas and typed handlers.
- `onUnauthorized` – hook for rebuilding the connection (e.g., refresh tokens) with a configurable retry limit.
- `onInvalidPayload` – observe parse/validation failures without throwing.
- `SSEService` – share/reuse SSE connections across components, or close them with `closeOnUnmount`.
