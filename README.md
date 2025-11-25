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

## Detailed example

The library is most useful when you centralize your payload schemas and share a
domain-specific hook.

```ts
import {
  useEventSource,
  type SSEDescriptor,
} from "@heecheon92/use-event-source";
import { z } from "zod";

const warehouseSSEPayloadSchema = {
  "warehouse:inventory:updated": z.object({
    sku: z.string(),
    delta: z.number(),
    newQuantity: z.number(),
  }),
  "warehouse:shipment:arrived": z.object({
    shipmentId: z.string(),
    expectedAt: z.string(),
    items: z.array(
      z.object({ sku: z.string(), quantity: z.number(), lot: z.string() }),
    ),
  }),
  "warehouse:task:assigned": z.object({
    taskId: z.string(),
    assignee: z.string(),
    type: z.enum(["pick", "putaway", "cycleCount"]),
    priority: z.number(),
  }),
  "warehouse:alerts": z.array(
    z.object({ level: z.enum(["info", "warn", "error"]), message: z.string() }),
  ),
} as const;

type WarehouseSSEPayloadSchema = typeof warehouseSSEPayloadSchema;
type WarehouseSSEDescriptor = SSEDescriptor<WarehouseSSEPayloadSchema>;

const WAREHOUSE_SSE_URL = `${process.env.NEXT_PUBLIC_API_BASE}/warehouse/sse`;

export function useWarehouseEventSource(descriptors: WarehouseSSEDescriptor[]) {
  useEventSource<WarehouseSSEPayloadSchema>({
    key: "warehouse-stream",
    url: WAREHOUSE_SSE_URL,
    schema: warehouseSSEPayloadSchema,
    descriptors,
    closeOnUnmount: true,
    onUnauthorized: async ({ attempt }) => {
      if (attempt > 2) return;
      const token = await refreshSession();
      return { headers: { Authorization: `Bearer ${token}` } };
    },
    onInvalidPayload: ({ eventName, raw }) => {
      console.warn(`Unexpected ${eventName} payload`, raw);
    },
  });
}

// Component-level usage
function WarehouseDashboard() {
  useWarehouseEventSource([
    {
      eventName: "warehouse:inventory:updated",
      handler: ({ sku, newQuantity }) => updateSkuQuantity(sku, newQuantity),
    },
    {
      eventName: "warehouse:task:assigned",
      handler: ({ assignee, taskId, type }) =>
        notifyAssignee(assignee, `${type} task #${taskId} assigned`),
    },
  ]);

  return null;
}
```

## API highlights

- `useEventSource` – subscribe to named SSE events with Zod schemas and typed handlers.
- `onUnauthorized` – hook for rebuilding the connection (e.g., refresh tokens) with a configurable retry limit.
- `onInvalidPayload` – observe parse/validation failures without throwing.
- `SSEService` – share/reuse SSE connections across components, or close them with `closeOnUnmount`.
