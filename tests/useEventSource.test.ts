import { renderHook, waitFor } from "@testing-library/react";
import type { EventSourcePolyfillInit } from "event-source-polyfill";
import { act } from "react";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { SSEService } from "../src/event-source";
import { useEventSource } from "../src/useEventSource";

class FakeEventSource {
	public url: string;
	public withCredentials = false;
	public readyState = 0;
	public init?: EventSourcePolyfillInit;
	private listeners: Record<string, ((event: Event) => void)[]> = {};

	constructor(url: string, init?: EventSourcePolyfillInit) {
		this.url = url;
		this.init = init;
	}

	public addEventListener(type: string, listener: (event: Event) => void) {
		this.listeners[type] ??= [];
		this.listeners[type].push(listener);
	}

	public removeEventListener(type: string, listener: (event: Event) => void) {
		this.listeners[type] = (this.listeners[type] ?? []).filter(
			(l) => l !== listener,
		);
	}

	public dispatch(type: string, event: Event) {
		(this.listeners[type] ?? []).forEach((listener) => listener(event));
	}

	public close() {
		this.listeners = {};
		this.readyState = 2;
	}

	// unused but part of the interface
	public onopen: ((this: EventSource, ev: Event) => void) | null = null;
	public onmessage: ((this: EventSource, ev: MessageEvent) => void) | null =
		null;
	public onerror: ((this: EventSource, ev: Event) => void) | null = null;
}

describe("useEventSource", () => {
	it("invokes handlers when payload matches schema", async () => {
		const handler = vi.fn();
		const created: FakeEventSource[] = [];
		const service = new SSEService((url, init) => {
			const instance = new FakeEventSource(url, init);
			created.push(instance);
			return instance as unknown as EventSource;
		});

		const schema = {
			ping: z.object({ message: z.string() }),
		};

		renderHook(() =>
			useEventSource({
				key: "ping",
				url: "/sse",
				schema,
				service,
				descriptors: [{ eventName: "ping", handler }],
			}),
		);

		const fake = created[0];
		act(() => {
			fake.dispatch(
				"ping",
				new MessageEvent("ping", {
					data: JSON.stringify({ payload: { message: "hello" } }),
				}),
			);
		});

		await waitFor(() => {
			expect(handler).toHaveBeenCalledWith({ message: "hello" });
		});
	});

	it("calls onUnauthorized and recreates the EventSource with new init", async () => {
		const created: {
			url: string;
			init?: EventSourcePolyfillInit;
			instance: FakeEventSource;
		}[] = [];
		const service = new SSEService((url, init) => {
			const instance = new FakeEventSource(url, init);
			created.push({ url, init, instance });
			return instance as unknown as EventSource;
		});

		const onUnauthorized = vi.fn(async () => ({
			headers: { Authorization: "Bearer refreshed" },
		}));

		const schema = {
			ping: z.object({ message: z.string() }),
		};

		renderHook(() =>
			useEventSource({
				key: "auth",
				url: "/sse",
				schema,
				service,
				onUnauthorized,
				descriptors: [
					{ eventName: "ping", handler: vi.fn() },
				],
			}),
		);

		const fake =
			created[0]?.instance ??
			((service.getEventSource("auth") as unknown as FakeEventSource) ??
				null);
		if (!fake) throw new Error("Fake event source not created");

		act(() => {
			fake.dispatch(
				"error",
				{
					type: "error",
					status: 401,
					statusText: "Unauthorized",
					target: null,
					header: {},
				} as unknown as Event,
			);
		});

		await waitFor(() => {
			expect(onUnauthorized).toHaveBeenCalledTimes(1);
			expect(created).toHaveLength(2);
		});

		expect(created[1]?.init?.headers).toMatchObject({
			Authorization: "Bearer refreshed",
		});
	});
});
