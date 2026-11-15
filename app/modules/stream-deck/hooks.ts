import * as React from "react";
import { useHydrated } from "~/hooks/useHydrated";
import * as StreamDeck from "./stream-deck";

/**
 * The Stream Deck connected in this tab (WebHID, Chromium only), shared by every component using it: it stays
 * connected while the user moves between pages. Connected once, it reconnects by itself when a page loads or it
 * is plugged back in, until disconnected.
 */
export function useStreamDeck() {
	const isHydrated = useHydrated();
	const { connection, problem } = React.useSyncExternalStore(
		StreamDeck.subscribe,
		StreamDeck.current,
		() => StreamDeck.NO_DECK,
	);

	React.useEffect(() => {
		StreamDeck.watchDevices();
	}, []);

	return {
		/** `null` until hydrated, then whether the browser has WebHID. */
		isAvailable: isHydrated ? StreamDeck.webHid() !== null : null,
		connection,
		problem,
		/** Shows the browser's device picker, call it straight from a click. */
		connect: StreamDeck.connect,
		disconnect: StreamDeck.disconnect,
	};
}
