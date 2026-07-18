import { getUser } from "~/features/auth/core/user.server";
import { ingestCorsMiddleware } from "../ingest-cors-middleware.server";
import type { Route } from "./+types/ingest.me";

export const middleware: Route.MiddlewareFunction[] = [ingestCorsMiddleware];

/**
 * Who the session is logged in as, for external ingest clients (emberz)
 * that reuse the sendou.ink login instead of having their own.
 */
export const loader = () => {
	const user = getUser();

	return {
		user: user ? { id: user.id, username: user.username } : null,
	};
};
