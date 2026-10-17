import path from "node:path";
import { createRequestHandler, type ServerBuild } from "react-router";

const BUILD_DIR = path.join(import.meta.dir, "build");
const CLIENT_DIR = path.join(BUILD_DIR, "client");
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const REVALIDATE_CACHE_CONTROL = "public, max-age=0";
/** Above the SSE heartbeat interval so an idle event stream isn't cut */
const IDLE_TIMEOUT_SECONDS = 120;

const build: ServerBuild = await import(
	path.join(BUILD_DIR, "server", "index.js")
);
const handleRequest = createRequestHandler(build, process.env.NODE_ENV);

const server = Bun.serve({
	port: Number(process.env.PORT) || 3000,
	idleTimeout: IDLE_TIMEOUT_SECONDS,
	routes: await staticFileRoutes(),
	fetch(request) {
		return handleRequest(withForwardedOrigin(request));
	},
});

// eslint-disable-next-line no-console -- server startup log
console.log(`[server] http://localhost:${server.port}`);

/** Every client build file as an in-memory route; `/assets` is fingerprinted so it is cached forever */
async function staticFileRoutes() {
	const routes: Record<string, Response> = {};

	for await (const filePath of new Bun.Glob("**/*").scan({
		cwd: CLIENT_DIR,
		onlyFiles: true,
	})) {
		const file = Bun.file(path.join(CLIENT_DIR, filePath));
		routes[`/${filePath}`] = new Response(await file.bytes(), {
			headers: {
				"Content-Type": file.type,
				"Cache-Control": filePath.startsWith("assets/")
					? IMMUTABLE_CACHE_CONTROL
					: REVALIDATE_CACHE_CONTROL,
			},
		});
	}

	return routes;
}

/** TLS terminates at the proxy, but the app must see the URL the user requested: React Router rejects actions whose `Origin` doesn't match it */
function withForwardedOrigin(request: Request) {
	const protocol = firstHeaderValue(request, "x-forwarded-proto");
	const host = firstHeaderValue(request, "x-forwarded-host");
	if (!protocol && !host) return request;

	const url = new URL(request.url);
	if (protocol) url.protocol = protocol;
	if (host) url.host = host;
	if (url.href === request.url) return request;

	return new Request(url, request);
}

function firstHeaderValue(request: Request, name: string) {
	return request.headers.get(name)?.split(",")[0].trim();
}
