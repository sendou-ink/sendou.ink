import * as React from "react";
import { HEARTBEAT_INTERVAL_MS } from "~/features/events/events-types";
import type { BroadcastState, BroadcastStreamMessage } from "./broadcast-types";

// a connection dropped while the machine was suspended raises no error of its own
const SILENT_CONNECTION_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2 + 15_000;
const LIVENESS_CHECK_INTERVAL_MS = 5_000;
const REOPEN_BASE_DELAY_MS = 1_000;
const REOPEN_MAX_DELAY_MS = 30_000;

/**
 * Latest state of the broadcast pushed over its stream, starting from the loader's. The last state is
 * kept while disconnected and the stream is reopened with backoff, the server sends a fresh state on reconnect.
 */
export function useBroadcastStream({
	url,
	initialState,
}: {
	url: string;
	initialState: BroadcastState;
}) {
	const [state, setState] = React.useState(initialState);
	const [isConnected, setIsConnected] = React.useState(false);

	React.useEffect(() => {
		let source: EventSource | null = null;
		let reopenTimeout: ReturnType<typeof setTimeout> | undefined;
		let failedReopens = 0;
		let lastMessageAt = Date.now();

		const open = () => {
			lastMessageAt = Date.now();
			source = new EventSource(url);
			source.onmessage = (event) => {
				lastMessageAt = Date.now();
				failedReopens = 0;
				setIsConnected(true);

				const message = JSON.parse(event.data) as BroadcastStreamMessage;
				if (message.kind === "state") setState(message.state);
			};
			source.onerror = () => {
				setIsConnected(false);
				// CLOSED means the browser gave up reconnecting on its own, e.g. after a non-200 response
				if (source?.readyState === EventSource.CLOSED) reopen();
			};
		};

		const reopen = () => {
			source?.close();
			source = null;
			clearTimeout(reopenTimeout);
			reopenTimeout = setTimeout(
				open,
				Math.min(
					REOPEN_BASE_DELAY_MS * 2 ** failedReopens,
					REOPEN_MAX_DELAY_MS,
				),
			);
			failedReopens++;
		};

		const livenessCheck = setInterval(() => {
			if (
				!source ||
				Date.now() - lastMessageAt < SILENT_CONNECTION_TIMEOUT_MS
			) {
				return;
			}

			setIsConnected(false);
			reopen();
		}, LIVENESS_CHECK_INTERVAL_MS);

		open();

		return () => {
			clearInterval(livenessCheck);
			clearTimeout(reopenTimeout);
			source?.close();
		};
	}, [url]);

	return { state, isConnected };
}
