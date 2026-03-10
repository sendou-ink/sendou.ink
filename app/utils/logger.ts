/** biome-ignore-all lint/suspicious/noConsole: stub file to enable different solution later */
import { getSessionId as getClientSessionId } from "./session-id";

declare global {
	var __getServerSessionId: (() => string | undefined) | undefined;
}

function getSessionIdForLog(): string {
	if (typeof window !== "undefined") {
		return getClientSessionId();
	}

	return globalThis.__getServerSessionId?.() ?? "no-session";
}

function formatLog(...args: unknown[]) {
	const sessionId = getSessionIdForLog();
	return [`[${sessionId}]`, ...args];
}

export const logger = {
	info: (...args: unknown[]) => console.log(...formatLog(...args)),
	error: (...args: unknown[]) => console.error(...formatLog(...args)),
	warn: (...args: unknown[]) => console.warn(...formatLog(...args)),
};
