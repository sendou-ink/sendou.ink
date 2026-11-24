import * as ServerShutdown from "~/modules/server-shutdown/ServerShutdown.server";
import { BROADCAST_HEARTBEAT_INTERVAL_MS } from "./broadcast-constants";
import type { BroadcastStreamMessage } from "./broadcast-types";

const HEARTBEAT_MESSAGE = JSON.stringify({
	kind: "heartbeat",
} satisfies BroadcastStreamMessage);
const RESTART_MESSAGE = JSON.stringify({
	kind: "restart",
} satisfies BroadcastStreamMessage);

/**
 * Server-sent events response of a broadcast's stream: the client connected (e.g. to the broadcast's hub with
 * `BroadcastHub.connect`) until it goes away, heartbeats keeping the connection alive. Ended with a `restart` as the
 * server shuts down, so the client knows to wait for the next one.
 */
export function broadcastStreamResponse({
	request,
	connect,
}: {
	request: Request;
	connect: (connection: {
		send: (message: string) => void;
		close: () => void;
		signal: AbortSignal;
	}) => void;
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
				BROADCAST_HEARTBEAT_INTERVAL_MS,
			);
			const stopOnShutdown = ServerShutdown.onShutdown(() => {
				write(RESTART_MESSAGE);
				close();
			});

			close = () => {
				if (closed) return;
				closed = true;
				clearInterval(heartbeat);
				stopOnShutdown();
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

			connect({
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
			// a socket kept alive after the stream ends would hold up the server closing, e.g. on a deploy
			Connection: "close",
		},
	});
}
