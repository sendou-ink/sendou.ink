import type { LogEvent } from "kysely";
import type { MiddlewareFunction } from "react-router";
import * as RequestLog from "./core/RequestLog.server";
import * as ServerConsole from "./core/ServerConsole.server";

export interface DevToolsServerHooks {
	/** Records each request's database queries and the server's console errors. */
	middleware: MiddlewareFunction<Response>;
	/** Records a query against the request being handled, from the database's log hook. */
	recordQuery: (event: LogEvent) => void;
	/** Logs an error React Router reports outside the request's async context with that request attached. */
	logRequestError: (request: Request, log: () => void) => void;
}

/**
 * Everything the server calls in the dev tools. Production builds resolve this module to
 * `dev-tools-server-hooks.stub.ts` (`vite.config.ts`), so `null` there and none of the dev tools bundled.
 */
export const devToolsServerHooks: DevToolsServerHooks | null = {
	middleware: ({ request }, next) => {
		ServerConsole.install();

		return RequestLog.track(request, next);
	},
	recordQuery: RequestLog.recordQuery,
	logRequestError: ServerConsole.withRequest,
};
