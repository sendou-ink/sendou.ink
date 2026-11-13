import { HEARTBEAT_INTERVAL_MS } from "~/features/events/events-types";
import type { BroadcastState, BroadcastStreamMessage } from "./broadcast-types";
import * as BroadcastHub from "./core/BroadcastHub.server";

const HEARTBEAT_MESSAGE = JSON.stringify({
	kind: "heartbeat",
} satisfies BroadcastStreamMessage);

/**
 * Server-sent events response of a broadcast's stream: the client connected to the broadcast's hub until it goes away,
 * heartbeats keeping the connection alive.
 */
export function broadcastStreamResponse<State extends BroadcastState>({
	request,
	...args
}: Omit<
	Parameters<typeof BroadcastHub.connect<State>>[0],
	"send" | "close" | "signal"
> & {
	request: Request;
}) {
	let close = () => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			const disconnect = new AbortController();
			let closed = false;

			const write = (message: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`data: ${message}\n\n`));
				} catch {
					close();
				}
			};

			const heartbeat = setInterval(
				() => write(HEARTBEAT_MESSAGE),
				HEARTBEAT_INTERVAL_MS,
			);

			close = () => {
				if (closed) return;
				closed = true;
				clearInterval(heartbeat);
				disconnect.abort();
				try {
					controller.close();
				} catch {
					// stream already closed by the client
				}
			};
			if (request.signal.aborted) {
				close();
				return;
			}
			request.signal.addEventListener("abort", close, { once: true });

			BroadcastHub.connect({
				...args,
				send: write,
				close,
				signal: disconnect.signal,
			});
		},
		cancel() {
			close();
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			// no-transform keeps compression from buffering the stream
			"Cache-Control": "no-cache, no-transform",
			"X-Accel-Buffering": "no",
		},
	});
}
