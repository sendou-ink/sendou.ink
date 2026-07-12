import { ingestCorsMiddleware } from "../ingest-cors-middleware.server";
import type { Route } from "./+types/ingest.vod";

export { action } from "../actions/ingest.vod.server";

export const middleware: Route.MiddlewareFunction[] = [ingestCorsMiddleware];
