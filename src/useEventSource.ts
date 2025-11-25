"use client";

import type { EventSourcePolyfillInit } from "event-source-polyfill";
import { useEffect } from "react";
import {
  type SSEConnectionEvent,
  type SSEService,
  sseConnectionEventSchema,
  sseService,
} from "./event-source";
import {
  type SSEDescriptor,
  type SSEPayloadSchema,
  processDescriptor,
  sseContainerSchema,
} from "./types";

export type UseEventSourceOptions<TSchema extends SSEPayloadSchema> = {
  descriptors: SSEDescriptor<TSchema>[];
  schema: TSchema;
  key: string;
  url: string;
  service?: SSEService;
  eventSourceInit?: EventSourcePolyfillInit;
  maxReconnectAttempts?: number;
  onOpen?: (event: Event) => void;
  onError?: (event: Event) => void;
  onMessage?: (event: MessageEvent) => void;
  onUnauthorized?: (ctx: {
    event: SSEConnectionEvent;
    attempt: number;
  }) =>
    | Promise<EventSourcePolyfillInit | undefined>
    | EventSourcePolyfillInit
    | undefined;
  onInvalidPayload?: (context: {
    eventName: string;
    error: unknown;
    raw: unknown;
  }) => void;
  closeOnUnmount?: boolean;
};

const parseJSON = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export function useEventSource<TSchema extends SSEPayloadSchema>({
  descriptors,
  schema,
  key,
  url,
  service = sseService,
  eventSourceInit,
  maxReconnectAttempts = 3,
  onError,
  onMessage,
  onOpen,
  onUnauthorized,
  onInvalidPayload,
  closeOnUnmount = false,
}: UseEventSourceOptions<TSchema>) {
  useEffect(() => {
    service.addEventSource(key, url, eventSourceInit);

    const eventSink = descriptors.map((descriptor) => ({
      eventName: String(descriptor.eventName),
      handler: (event: Event) => {
        if (!(event instanceof MessageEvent)) return;
        const preparsed = parseJSON(event.data);
        try {
          const ssePayload = sseContainerSchema.parse(preparsed).payload;
          const parsedPayload = schema[descriptor.eventName].parse(ssePayload);
          processDescriptor(descriptor, parsedPayload);
        } catch (error) {
          onInvalidPayload?.({
            eventName: String(descriptor.eventName),
            error,
            raw: preparsed,
          });
        }
      },
    }));

    eventSink.forEach(({ eventName, handler }) => {
      service.addEventListener(key, eventName, handler);
    });

    const openHandler = (event: Event) => {
      service.resetRecreateAttempt(key);
      onOpen?.(event);
    };

    const errorHandler = async (event: Event) => {
      const connectionEvent = sseConnectionEventSchema.safeParse(event);
      if (
        connectionEvent.success &&
        connectionEvent.data.status === 401 &&
        onUnauthorized
      ) {
        const attempt = service.eventSourceRecreateCount[key] ?? 0;
        if (attempt < maxReconnectAttempts) {
          const nextInit = await onUnauthorized({
            event: connectionEvent.data,
            attempt,
          });
          const mergedInit: EventSourcePolyfillInit | undefined =
            nextInit || eventSourceInit
              ? {
                  ...eventSourceInit,
                  ...nextInit,
                  headers: {
                    ...(eventSourceInit?.headers ?? {}),
                    ...(nextInit && "headers" in nextInit
                      ? nextInit.headers
                      : {}),
                  },
                }
              : undefined;
          service.recreateEventSource(key, url, mergedInit);
          return;
        }
        service.removeEventSource(key);
      }

      onError?.(event);
    };

    const messageHandler = (event: Event) => {
      if (event instanceof MessageEvent) {
        onMessage?.(event);
      }
    };

    service.addEventListener(key, "open", openHandler);
    service.addEventListener(key, "error", errorHandler);
    service.addEventListener(key, "message", messageHandler);

    return () => {
      eventSink.forEach(({ eventName, handler }) => {
        service.removeEventListener(key, eventName, handler);
      });
      service.removeEventListener(key, "open", openHandler);
      service.removeEventListener(key, "error", errorHandler);
      service.removeEventListener(key, "message", messageHandler);
      if (closeOnUnmount) {
        service.removeEventSource(key);
      }
    };
  }, [
    key,
    url,
    descriptors,
    schema,
    service,
    eventSourceInit,
    maxReconnectAttempts,
    onError,
    onMessage,
    onOpen,
    onUnauthorized,
    onInvalidPayload,
    closeOnUnmount,
  ]);
}
