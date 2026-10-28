const MAX_ENTRIES = 200;

export type CapturedLevel = "error" | "warn";

export type CapturedSource =
	| "console.error"
	| "console.warn"
	| "uncaught error"
	| "unhandled rejection";

export interface CapturedEntry {
	id: number;
	level: CapturedLevel;
	source: CapturedSource;
	message: string;
	/** How many times the identical message was reported. */
	count: number;
	firstAt: number;
	lastAt: number;
}

let entries: CapturedEntry[] = [];
let nextId = 1;
let isInstalled = false;
const listeners = new Set<() => void>();

/**
 * Starts recording console errors & warnings and uncaught errors for the dev toolbar. Installed from
 * `entry.client.tsx` before hydration, so that hydration mismatches are caught too. Idempotent.
 */
export function install() {
	if (isInstalled || typeof window === "undefined") return;
	isInstalled = true;

	// biome-ignore lint/suspicious/noConsole: wraps the console to record what is logged
	const originalError = console.error;
	// biome-ignore lint/suspicious/noConsole: wraps the console to record what is logged
	const originalWarn = console.warn;

	console.error = (...args: unknown[]) => {
		record("error", "console.error", formatConsoleArgs(args));
		originalError.apply(console, args);
	};
	console.warn = (...args: unknown[]) => {
		record("warn", "console.warn", formatConsoleArgs(args));
		originalWarn.apply(console, args);
	};

	window.addEventListener("error", (event) => {
		record(
			"error",
			"uncaught error",
			event.error instanceof Error
				? errorToText(event.error)
				: String(event.message),
		);
	});
	window.addEventListener("unhandledrejection", (event) => {
		record(
			"error",
			"unhandled rejection",
			event.reason instanceof Error
				? errorToText(event.reason)
				: String(event.reason),
		);
	});
}

/** Recorded entries, most recently reported first. */
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

/** Forgets every recorded entry. */
export function clear() {
	entries = [];
	emit();
}

/** Whether the message is React telling the server and client render disagreed. */
export function isHydrationMessage(message: string) {
	return /hydrat/i.test(message);
}

/** Joins console arguments the way the console prints them, filling in `%s`-style substitutions and dropping `%c` styles. */
export function formatConsoleArgs(args: unknown[]) {
	const [first, ...rest] = args;
	if (typeof first !== "string") return args.map(argToText).join(" ");

	const remaining = [...rest];
	const formatted = first.replace(/%[sdiofOc%]/g, (token) => {
		if (token === "%%") return "%";
		if (remaining.length === 0) return token;

		const arg = remaining.shift();
		return token === "%c" ? "" : argToText(arg);
	});

	return [formatted, ...remaining.map(argToText)].join(" ").trim();
}

function record(level: CapturedLevel, source: CapturedSource, message: string) {
	const now = Date.now();
	const existing = entries.find(
		(entry) => entry.message === message && entry.source === source,
	);

	entries = existing
		? [
				{ ...existing, count: existing.count + 1, lastAt: now },
				...entries.filter((entry) => entry !== existing),
			]
		: [
				{
					id: nextId++,
					level,
					source,
					message,
					count: 1,
					firstAt: now,
					lastAt: now,
				},
				...entries,
			].slice(0, MAX_ENTRIES);

	// a listener re-rendering synchronously could log again mid render
	queueMicrotask(emit);
}

function emit() {
	for (const listener of listeners) {
		listener();
	}
}

function argToText(arg: unknown): string {
	if (arg instanceof Error) return errorToText(arg);
	if (typeof arg === "string") return arg;
	if (typeof arg === "object" && arg !== null) {
		try {
			return JSON.stringify(arg);
		} catch {
			return String(arg);
		}
	}

	return String(arg);
}

function errorToText(error: Error) {
	return error.stack ?? `${error.name}: ${error.message}`;
}
