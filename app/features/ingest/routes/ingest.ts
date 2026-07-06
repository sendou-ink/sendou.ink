import { ingestCorsMiddleware } from "../ingest-cors-middleware.server";
import type { Route } from "./+types/ingest";

export { action } from "../actions/ingest.server";

export const middleware: Route.MiddlewareFunction[] = [ingestCorsMiddleware];
