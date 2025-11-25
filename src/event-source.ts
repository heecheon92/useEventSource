import type { EventSourcePolyfillInit } from "event-source-polyfill";
import { EventSourcePolyfill, NativeEventSource } from "event-source-polyfill";
import { z } from "zod";

type Maybe<T> = T | undefined | null;
type EventSourceFactory = (
	url: string,
	init?: EventSourcePolyfillInit,
) => globalThis.EventSource;
const DefaultEventSource =
	EventSourcePolyfill || NativeEventSource || globalThis.EventSource;

const defaultEventSourceFactory: EventSourceFactory = (url, init) =>
	new DefaultEventSource(url, init);

export type SSESourceMap = Record<string, Maybe<ManagedEventSource>>;

interface EventListener {
	type: string;
	listener: (event: Event) => void;
}

export const sseConnectionEventSchema = z.object({
	type: z.string(),
	target: z.any(),
	status: z.number(),
	statusText: z.string(),
	header: z.any(),
});
export type SSEConnectionEvent = z.infer<typeof sseConnectionEventSchema>;

export class ManagedEventSource {
	private _source: globalThis.EventSource;
	private _listeners: EventListener[] = [];

	constructor(source: globalThis.EventSource) {
		this._source = source;
	}

	public addEventListener(type: string, listener: (event: Event) => void) {
		this._listeners.push({ type, listener });
		this._source.addEventListener(type, listener as EventListener["listener"]);
	}

	public removeEventListener(type: string, listener: (event: Event) => void) {
		this._listeners = this._listeners.filter(
			(l) => l.type !== type || l.listener !== listener,
		);
		this._source.removeEventListener(
			type,
			listener as EventListener["listener"],
		);
	}

	public recreate(factory: () => globalThis.EventSource) {
		this._source.close();
		this._source = factory();
		this._listeners.forEach(({ type, listener }) => {
			this._source.addEventListener(
				type,
				listener as EventListener["listener"],
			);
		});
	}

	public close() {
		this._source.close();
		this._listeners.forEach(({ type, listener }) => {
			this._source.removeEventListener(
				type,
				listener as EventListener["listener"],
			);
		});
	}

	public get listeners(): Readonly<EventListener[]> {
		return this._listeners;
	}
	public get readyState() {
		return this._source.readyState;
	}
	public get url() {
		return this._source.url;
	}
	public get withCredentials() {
		return this._source.withCredentials;
	}
}

export class SSEService {
	private _sources: SSESourceMap = {};
	private _eventSourceRecreateCount: Record<string, number> = {};

	constructor(
		private readonly factory: EventSourceFactory = defaultEventSourceFactory,
	) {}

	public get eventSourceRecreateCount() {
		return this._eventSourceRecreateCount;
	}

	public resetRecreateAttempt(key: string) {
		this._eventSourceRecreateCount[key] = 0;
	}

	public getEventSource(key: string) {
		return this._sources[key];
	}

	public addEventSource(
		key: string,
		url: string,
		eventSourceInit?: EventSourcePolyfillInit,
	) {
		const existing = this._sources[key];
		if (existing) return existing;

		const source = new ManagedEventSource(
			this.factory(url, {
				headers: {
					Connection: "keep-alive",
					Accept: "text/event-stream",
					...(eventSourceInit?.headers ?? {}),
				},
				heartbeatTimeout: eventSourceInit?.heartbeatTimeout ?? 86400000,
				...eventSourceInit,
			}),
		);

		this._sources[key] = source;
		this._eventSourceRecreateCount[key] = 0;

		return source;
	}

	public removeEventSource(key: string) {
		if (this._sources[key]) {
			this._sources[key]?.close();
			delete this._sources[key];
			delete this._eventSourceRecreateCount[key];
		}
	}

	public recreateEventSource(
		key: string,
		url: string,
		eventSourceInit?: EventSourcePolyfillInit,
	) {
		if (!this._sources[key]) {
			return this.addEventSource(key, url, eventSourceInit);
		}

		this._eventSourceRecreateCount[key] =
			(this._eventSourceRecreateCount[key] ?? 0) + 1;

		const source = this._sources[key];
		source?.recreate(() =>
			this.factory(url, {
				headers: {
					Connection: "keep-alive",
					Accept: "text/event-stream",
					...(eventSourceInit?.headers ?? {}),
				},
				heartbeatTimeout: eventSourceInit?.heartbeatTimeout ?? 86400000,
				...eventSourceInit,
			}),
		);

		return source;
	}

	public addEventListener(
		key: string,
		type: string,
		listener: (event: Event) => void,
	) {
		this._sources[key]?.addEventListener(type, listener);
	}

	public removeEventListener(
		key: string,
		type: string,
		listener: (event: Event) => void,
	) {
		this._sources[key]?.removeEventListener(type, listener);
	}
}

export const sseService = new SSEService();
