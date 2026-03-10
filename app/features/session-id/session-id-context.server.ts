import { AsyncLocalStorage } from "node:async_hooks";

interface SessionIdContext {
	sessionId: string | undefined;
}

export const sessionIdAsyncLocalStorage =
	new AsyncLocalStorage<SessionIdContext>();

function getSessionId(): string | undefined {
	return sessionIdAsyncLocalStorage.getStore()?.sessionId;
}

declare global {
	var __getServerSessionId: (() => string | undefined) | undefined;
}

globalThis.__getServerSessionId = getSessionId;
