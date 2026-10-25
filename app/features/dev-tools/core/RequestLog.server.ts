import { AsyncLocalStorage } from "node:async_hooks";
import type { LogEvent } from "kysely";

const MAX_REQUESTS = 100;
const MAX_QUERIES_PER_REQUEST = 500;
const MAX_PARAMETER_LENGTH = 200;
const REPEATED_QUERY_THRESHOLD = 3;
// the dev tools' own polling and the long lived event stream would drown out everything else
const UNTRACKED_PATH_PREFIXES = ["/dev/", "/sse"];

export type RequestKind = "document" | "data" | "action" | "resource";

export interface LoggedQuery {
	sql: string;
	parameters: unknown[];
	durationMs: number;
	error: string | null;
}

export interface LoggedRequest {
	id: number;
	method: string;
	path: string;
	kind: RequestKind;
	/** `null` while in flight or when handling it threw. */
	status: number | null;
	startedAt: number;
	durationMs: number | null;
	queries: LoggedQuery[];
	/** Queries past `MAX_QUERIES_PER_REQUEST`, counted but not kept. */
	droppedQueryCount: number;
}

// created on first use, a module level `new` would keep this module in the production build
let requestAsyncLocalStorage: AsyncLocalStorage<LoggedRequest> | undefined;

let requests: LoggedRequest[] = [];
let nextId = 1;

/** Runs `handle` with every database query it makes recorded against the request, keeping the latest requests in memory. */
export async function track(
	request: Request,
	handle: () => Promise<Response>,
): Promise<Response> {
	const url = new URL(request.url);
	if (
		UNTRACKED_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
	) {
		return handle();
	}

	const entry: LoggedRequest = {
		id: nextId++,
		method: request.method,
		path: displayPath(url),
		kind: requestKind(request, url),
		status: null,
		startedAt: Date.now(),
		durationMs: null,
		queries: [],
		droppedQueryCount: 0,
	};
	requests = [entry, ...requests].slice(0, MAX_REQUESTS);

	const startedAt = performance.now();
	try {
		const response = await requestStorage().run(entry, handle);
		entry.status = response.status;

		return response;
	} finally {
		entry.durationMs = performance.now() - startedAt;
	}
}

/** Records a Kysely log event against the request being tracked, a no-op outside of {@link track}. */
export function recordQuery(event: LogEvent) {
	const entry = requestAsyncLocalStorage?.getStore();
	if (!entry) return;

	if (entry.queries.length >= MAX_QUERIES_PER_REQUEST) {
		entry.droppedQueryCount++;
		return;
	}

	entry.queries.push({
		sql: event.query.sql,
		parameters: event.query.parameters.map(serializableParameter),
		durationMs: event.queryDurationMillis,
		error: event.level === "error" ? String(event.error) : null,
	});
}

/** Method and path of the request being tracked, `null` outside of {@link track}. */
export function currentPath() {
	const entry = requestAsyncLocalStorage?.getStore();
	if (!entry) return null;

	return `${entry.method} ${entry.path}`;
}

/** Method and path as {@link currentPath} shows them. */
export function describeRequest(request: Request) {
	return `${request.method} ${displayPath(new URL(request.url))}`;
}

/** The tracked requests, newest first. */
export function recent() {
	return requests;
}

/** Forgets every tracked request. */
export function clear() {
	requests = [];
}

/** The request without its queries, small enough to list every tracked request at once. */
export function summary({
	queries,
	droppedQueryCount,
	...request
}: LoggedRequest) {
	return {
		...request,
		queryCount: queries.length + droppedQueryCount,
		queryDurationMs: queries.reduce(
			(total, query) => total + query.durationMs,
			0,
		),
		errorCount: queries.filter((query) => query.error).length,
		mostRepeatedCount: repeatedQueries({ queries })[0]?.count ?? null,
	};
}

/** Statements the request ran at least `REPEATED_QUERY_THRESHOLD` times, the tell-tale sign of an N+1. Most repeated first. */
export function repeatedQueries(request: Pick<LoggedRequest, "queries">) {
	const counts = new Map<string, number>();
	for (const query of request.queries) {
		counts.set(query.sql, (counts.get(query.sql) ?? 0) + 1);
	}

	return [...counts]
		.filter(([, count]) => count >= REPEATED_QUERY_THRESHOLD)
		.map(([sql, count]) => ({ sql, count }))
		.sort((a, b) => b.count - a.count);
}

function displayPath(url: URL) {
	const pathname = url.pathname.replace(/\.data$/, "") || "/";
	const search = new URLSearchParams(url.search);
	// added by single fetch to say which loaders to run, noise when reading the log
	search.delete("_routes");
	const searchString = search.toString();

	return searchString ? `${pathname}?${searchString}` : pathname;
}

function requestKind(request: Request, url: URL): RequestKind {
	if (request.method !== "GET" && request.method !== "HEAD") return "action";
	if (url.pathname.endsWith(".data")) return "data";
	if (request.headers.get("Accept")?.includes("text/html")) return "document";

	return "resource";
}

function serializableParameter(parameter: unknown) {
	if (typeof parameter === "bigint") return parameter.toString();
	if (parameter instanceof Uint8Array) return `<${parameter.length} bytes>`;
	if (
		typeof parameter === "string" &&
		parameter.length > MAX_PARAMETER_LENGTH
	) {
		return `${parameter.slice(0, MAX_PARAMETER_LENGTH)}…`;
	}

	return parameter;
}

function requestStorage() {
	requestAsyncLocalStorage ??= new AsyncLocalStorage<LoggedRequest>();

	return requestAsyncLocalStorage;
}
