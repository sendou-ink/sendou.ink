type MiddlewareArgs = {
	request: Request;
	context: unknown;
};

type MiddlewareFn = (
	args: MiddlewareArgs,
	next: () => Promise<Response>,
) => Promise<Response>;

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
	"Access-Control-Max-Age": "86400",
};

export const apiCorsMiddleware: MiddlewareFn = async ({ request }, next) => {
	const url = new URL(request.url);
	const isApiRoute = url.pathname.startsWith("/api/");

	if (!isApiRoute) {
		return next();
	}

	if (request.method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: CORS_HEADERS,
		});
	}

	const response = await next();
	const newHeaders = new Headers(response.headers);

	for (const [key, value] of Object.entries(CORS_HEADERS)) {
		newHeaders.set(key, value);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders,
	});
};
