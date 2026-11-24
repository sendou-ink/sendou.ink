import type { LoaderFunctionArgs } from "react-router";
import * as EventBus from "~/features/events/core/EventBus.server";
import { HEARTBEAT_INTERVAL_MS } from "~/features/events/events-types";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import * as ServerShutdown from "~/modules/server-shutdown/ServerShutdown.server";
import { notFound } from "~/utils/remix.server";
import type { StationsDisplayStreamMessage } from "../tournament-stations-types";
import { stationsBoardTopics } from "../tournament-stations-utils";

const HEARTBEAT_MESSAGE = message({ kind: "heartbeat" });
const CHANGED_MESSAGE = message({ kind: "changed" });

/**
 * Public SSE stream of a LAN tournament's display screen: a `changed` message whenever the stations board may have
 * changed, heartbeats keeping the connection alive. Logged out viewers (the venue's screens) have no events connection
 * of their own.
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const { tournament } = await tournamentFromParams(params, { for: "view" });
	if (!tournament.isLan || tournament.ctx.isFinalized) notFound();

	const topics = stationsBoardTopics(tournament);
	let close = () => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			const disconnect = new AbortController();
			let closed = false;

			const write = (text: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(text));
				} catch {
					close();
				}
			};

			const heartbeat = setInterval(
				() => write(HEARTBEAT_MESSAGE),
				HEARTBEAT_INTERVAL_MS,
			);

			// the browser opens a new connection by itself once it ends
			const stopOnShutdown = ServerShutdown.onShutdown(() => close());

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

			void (async () => {
				for await (const event of EventBus.subscribe(
					topics,
					disconnect.signal,
				)) {
					if (event.kind === "revalidate") write(CHANGED_MESSAGE);
				}
			})();
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
};

function message(content: StationsDisplayStreamMessage) {
	return `data: ${JSON.stringify(content)}\n\n`;
}
