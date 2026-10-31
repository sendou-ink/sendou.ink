import type { LoaderFunctionArgs } from "react-router";
import { HEARTBEAT_INTERVAL_MS } from "~/features/events/events-types";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { broadcastParamsSchema } from "../broadcast-schemas";
import { broadcastStreamSearchParams } from "../broadcast-search-params";
import type { BroadcastStreamMessage } from "../broadcast-types";
import * as BroadcastHub from "../core/BroadcastHub.server";
import * as CastChannel from "../core/CastChannel";

const HEARTBEAT_MESSAGE = JSON.stringify({
	kind: "heartbeat",
} satisfies BroadcastStreamMessage);

/** Public SSE stream of a broadcast's state, see `BroadcastHub`. */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const { tournament, tournamentId } = await tournamentFromParams(params, {
		for: "view",
	});
	const { channel: slug } = parseParams({
		params,
		schema: broadcastParamsSchema,
	});
	notFoundIfNullish(CastChannel.findBySlug(tournament.ctx.castAccounts, slug));
	const { role } = broadcastStreamSearchParams.parse(request);

	if (BroadcastHub.isAtCapacity({ tournamentId, slug })) {
		return new Response(null, { status: 429 });
	}

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
				tournamentId,
				slug,
				role,
				send: write,
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
};
