import { AsyncLocalStorage } from "node:async_hooks";
import { stripVTControlCharacters } from "node:util";
import { formatConsoleArgs } from "./ConsoleCapture";
import * as RequestLog from "./RequestLog.server";

const MAX_ENTRIES = 100;
const MAX_MESSAGE_LENGTH = 5000;
// Vite forwards browser errors to the terminal, each tab already records its own
const FORWARDED_FROM_BROWSER = "[vite] (client)";

export interface ServerConsoleEntry {
	id: number;
	level: "error" | "warn";
	message: string;
	/** The request being handled when it was logged, if any. */
	path: string | null;
	/** How many times the identical message was logged. */
	count: number;
	firstAt: number;
	lastAt: number;
}

interface ServerConsoleStore {
	entries: ServerConsoleEntry[];
	nextId: number;
	record: (level: ServerConsoleEntry["level"], args: unknown[]) => void;
}

// created on first use, a module level `new` would keep this module in the production build
let requestPathStorage: AsyncLocalStorage<string> | undefined;

declare global {
	var __devToolsServerConsole: ServerConsoleStore | undefined;
}

/**
 * Starts recording the dev server's console errors & warnings, which includes errors thrown by loaders and
 * actions. The console is patched once; `record` is swapped on every call so the latest evaluation of this
 * module (and its request log) does the recording after the dev server re-evaluates modules.
 */
export function install() {
	if (globalThis.__devToolsServerConsole) {
		globalThis.__devToolsServerConsole.record = record;
		return;
	}
	globalThis.__devToolsServerConsole = { entries: [], nextId: 1, record };

	// biome-ignore lint/suspicious/noConsole: wraps the console to record what is logged
	const originalError = console.error;
	// biome-ignore lint/suspicious/noConsole: wraps the console to record what is logged
	const originalWarn = console.warn;

	console.error = (...args: unknown[]) => {
		originalError.apply(console, args);
		globalThis.__devToolsServerConsole?.record("error", args);
	};
	console.warn = (...args: unknown[]) => {
		originalWarn.apply(console, args);
		globalThis.__devToolsServerConsole?.record("warn", args);
	};
}

/** Runs `log` with what it logs attached to the request, for code React Router calls outside of the request's async context (`handleError`). */
export function withRequest(request: Request, log: () => void) {
	requestPathStorage ??= new AsyncLocalStorage<string>();
	requestPathStorage.run(RequestLog.describeRequest(request), log);
}

/** Recorded entries, most recently logged first. */
export function recent() {
	return globalThis.__devToolsServerConsole?.entries ?? [];
}

/** Forgets every recorded entry. */
export function clear() {
	if (globalThis.__devToolsServerConsole) {
		globalThis.__devToolsServerConsole.entries = [];
	}
}

function record(level: ServerConsoleEntry["level"], args: unknown[]) {
	const store = globalThis.__devToolsServerConsole;
	if (!store) return;

	// Vite colors its errors for the terminal
	const message = stripVTControlCharacters(formatConsoleArgs(args)).slice(
		0,
		MAX_MESSAGE_LENGTH,
	);
	if (message.includes(FORWARDED_FROM_BROWSER)) return;

	const path = requestPathStorage?.getStore() ?? RequestLog.currentPath();
	const now = Date.now();
	const existing = store.entries.find(
		(entry) =>
			entry.message === message && entry.level === level && entry.path === path,
	);

	store.entries = existing
		? [
				{ ...existing, count: existing.count + 1, lastAt: now },
				...store.entries.filter((entry) => entry !== existing),
			]
		: [
				{
					id: store.nextId++,
					level,
					message,
					path,
					count: 1,
					firstAt: now,
					lastAt: now,
				},
				...store.entries,
			].slice(0, MAX_ENTRIES);
}
