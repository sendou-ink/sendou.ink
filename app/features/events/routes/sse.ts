import { nanoid } from "nanoid";
import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as EventBus from "../core/EventBus.server";
import * as SseConnections from "../core/SseConnections.server";
import { userChannel } from "../events-types";

export const HEARTBEAT_INTERVAL_MS = 25_000;

export const loader = ({ request }: LoaderFunctionArgs) => {
	const user = requireUser();
	const connectionId = nanoid();
	let close = () => {};

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			let topics: string[] = [];
			let resubscribe = new AbortController();

			const write = (text: string) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(text));
				} catch {
					close();
				}
			};

			const send = (event: object) => {
				write(`data: ${JSON.stringify(event)}\n\n`);
			};

			const heartbeat = setInterval(() => {
				write(": heartbeat\n\n");
			}, HEARTBEAT_INTERVAL_MS);

			close = () => {
				if (closed) return;
				closed = true;
				clearInterval(heartbeat);
				SseConnections.unregister(connectionId);
				resubscribe.abort();
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

			SseConnections.register(connectionId, {
				userId: user.id,
				setTopics: (newTopics) => {
					topics = newTopics;
					resubscribe.abort();
				},
			});

			const pump = async () => {
				while (!closed) {
					resubscribe = new AbortController();
					const channels = [userChannel(user.id), ...topics];
					for await (const event of EventBus.subscribe(
						channels,
						resubscribe.signal,
					)) {
						send(event);
					}
				}
			};

			void pump();
			send({ kind: "hello", connectionId });
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
