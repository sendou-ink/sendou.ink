import { DEV_SERVER_CONSOLE_URL } from "../dev-tools-urls";
import type { DevServerConsoleLoaderData } from "../routes/dev.server-console";
import { postDev } from "./dev-api";
import type { ServerConsoleEntry } from "./ServerConsole.server";

const POLL_INTERVAL_MS = 3000;
// the server's and this tab's clocks are compared, allow them to disagree a little
const CLOCK_SKEW_GRACE_MS = 1000;

let entries: ServerConsoleEntry[] = [];
let entriesKey = "";
let isInstalled = false;
const listeners = new Set<() => void>();

/** Starts polling the dev server's console errors & warnings logged since this page loaded, while the tab is visible. Idempotent. */
export function install() {
	if (isInstalled) return;
	isInstalled = true;

	void poll();
	window.setInterval(() => {
		if (document.visibilityState === "visible") void poll();
	}, POLL_INTERVAL_MS);
}

/** Polled entries, most recently logged first. */
export function getSnapshot() {
	return entries;
}

/** For `useSyncExternalStore`. Returns an unsubscribe function. */
export function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Forgets the entries, on the server too, so for every tab. */
export async function clear() {
	update([]);
	await postDev(DEV_SERVER_CONSOLE_URL);
}

async function poll() {
	let data: DevServerConsoleLoaderData;
	try {
		const response = await fetch(DEV_SERVER_CONSOLE_URL);
		if (!response.ok) return;
		data = await response.json();
	} catch {
		// the dev server is restarting
		return;
	}

	const pageLoadedAt =
		data.now - (Date.now() - performance.timeOrigin) - CLOCK_SKEW_GRACE_MS;

	update(data.entries.filter((entry) => entry.lastAt >= pageLoadedAt));
}

function update(nextEntries: ServerConsoleEntry[]) {
	const nextKey = nextEntries
		.map((entry) => `${entry.id}:${entry.count}`)
		.join();
	if (nextKey === entriesKey) return;

	entries = nextEntries;
	entriesKey = nextKey;
	for (const listener of listeners) {
		listener();
	}
}
