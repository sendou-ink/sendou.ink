import { apiAuthMiddleware } from "../api-auth-middleware.server";
import { apiCorsMiddleware } from "../api-cors-middleware.server";
import type { Route } from "./+types/api.layout";

export const middleware: Route.MiddlewareFunction[] = [
	apiAuthMiddleware,
	apiCorsMiddleware,
];
