import {
	dataPathOf,
	PAGE_HEADER,
	REVALIDATE_KEY,
	ROUTES_HEADER,
	SINGLE_FLIGHT_HEADER,
} from "./revalidation";

const EXPIRED_COOKIE_REGEX = /;\s*(max-age=0\s*(;|$)|expires=[^;]*1970)/i;

/**
 * Runs the loaders the client is about to revalidate after a mutation (sent along with it, see `singleFlightFetch`)
 * and appends their data to the mutation's response, so the revalidation needs no second round trip.
 * Skipped when the action failed, redirected or opted out with `Revalidation.none()`.
 */
export async function handleMutationResponse(
	response: Response,
	{
		request,
		load,
	}: { request: Request; load: (request: Request) => Promise<Response> },
) {
	const pagePath = request.headers.get(PAGE_HEADER);
	const routeIds = request.headers.get(ROUTES_HEADER);
	if (
		!pagePath?.startsWith("/") ||
		pagePath.startsWith("//") ||
		!routeIds ||
		response.status !== 200
	) {
		return response;
	}

	const actionText = await response.text();
	const actionResponse = () =>
		new Response(actionText, {
			status: response.status,
			headers: response.headers,
		});

	if (optsOutOfRevalidation(actionText)) return actionResponse();

	const loaderUrl = new URL(dataPathOf(pagePath), request.url);
	loaderUrl.searchParams.set("_routes", routeIds);

	const loaderResponse = await load(
		new Request(loaderUrl, {
			headers: loaderRequestHeaders(request, response),
			signal: request.signal,
		}),
	);
	if (loaderResponse.status !== 200) return actionResponse();

	const headers = new Headers(response.headers);
	for (const cookie of loaderResponse.headers.getSetCookie()) {
		headers.append("Set-Cookie", cookie);
	}
	loaderUrl.searchParams.delete("_routes");
	headers.set(
		SINGLE_FLIGHT_HEADER,
		JSON.stringify({
			url: loaderUrl.pathname + loaderUrl.search,
			routeIds: routeIds.split(","),
		}),
	);

	return new Response(`${actionText}\n${await loaderResponse.text()}`, {
		status: response.status,
		headers,
	});
}

function optsOutOfRevalidation(actionText: string) {
	try {
		return JSON.parse(actionText)?.data?.[REVALIDATE_KEY] === false;
	} catch {
		return false;
	}
}

/** The mutation's request headers with the cookies its response set applied, so the loaders see the session after it. */
function loaderRequestHeaders(request: Request, response: Response) {
	const headers = new Headers(request.headers);
	for (const name of [
		"Content-Type",
		"Content-Length",
		PAGE_HEADER,
		ROUTES_HEADER,
	]) {
		headers.delete(name);
	}

	const setCookies = response.headers.getSetCookie();
	if (setCookies.length === 0) return headers;

	const cookies = new Map(
		(headers.get("Cookie") ?? "")
			.split(";")
			.map((part) => part.trim())
			.filter(Boolean)
			.map((part) => [part.split("=")[0], part] as const),
	);
	for (const setCookie of setCookies) {
		const pair = setCookie.split(";")[0].trim();
		const name = pair.split("=")[0];
		if (EXPIRED_COOKIE_REGEX.test(setCookie)) {
			cookies.delete(name);
		} else {
			cookies.set(name, pair);
		}
	}
	headers.set("Cookie", [...cookies.values()].join("; "));

	return headers;
}
