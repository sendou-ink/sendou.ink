type MiddlewareArgs = {
	request: Request;
	context: unknown;
};

type MiddlewareFn = (
	args: MiddlewareArgs,
	next: () => Promise<Response>,
) => Promise<Response>;

const ALLOWED_ORIGIN_PATTERNS = [
	/^https:\/\/emberz\.sendou\.ink$/,
	/^http:\/\/localhost:\d+$/,
];

export const ingestCorsMiddleware: MiddlewareFn = async ({ request }, next) => {
	const headers = corsHeaders(request.headers.get("Origin"));

	if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: headers ?? undefined });
	}

	const response = await next();
	if (!headers) return response;

	const newHeaders = new Headers(response.headers);
	for (const [key, value] of Object.entries(headers)) {
		newHeaders.set(key, value);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders,
	});
};

function corsHeaders(origin: string | null) {
	if (
		!origin ||
		!ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))
	) {
		return null;
	}

	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		// xxx: we will also need to allow auth header eventually?
		"Access-Control-Allow-Headers": "Content-Type, Lohi-Token",
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	};
}
