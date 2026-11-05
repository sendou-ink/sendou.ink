import { describe, expect, test, vi } from "vitest";
import {
	PAGE_HEADER,
	REVALIDATE_KEY,
	ROUTES_HEADER,
	SINGLE_FLIGHT_HEADER,
} from "./revalidation";
import { handleMutationResponse } from "./single-flight.server";

const ROUTE_IDS = "features/a/routes/a,features/a/routes/a.b";
const LOADER_BODY = JSON.stringify({ "features/a/routes/a": { data: 1 } });

describe("handleMutationResponse", () => {
	test("appends the loader data of the page's revalidating routes", async () => {
		const load = loaderReturning(new Response(LOADER_BODY));

		const response = await handleMutationResponse(actionResponse(), {
			request: mutationRequest(),
			load,
		});

		const loaderRequest = load.mock.calls[0][0];
		expect(loaderRequest.method).toBe("GET");
		expect(loaderRequest.url).toBe(
			`http://localhost/a/b.data?x=1&_routes=${encodeURIComponent(ROUTE_IDS)}`,
		);
		expect(loaderRequest.headers.get(ROUTES_HEADER)).toBeNull();
		expect(await response.text()).toBe(
			`${JSON.stringify({ data: null })}\n${LOADER_BODY}`,
		);
		expect(JSON.parse(response.headers.get(SINGLE_FLIGHT_HEADER)!)).toEqual({
			url: "/a/b.data?x=1",
			routeIds: ROUTE_IDS.split(","),
		});
	});

	test.each([
		{ why: "no page sent", request: mutationRequest({ page: null }) },
		{ why: "no routes sent", request: mutationRequest({ routes: null }) },
		{
			why: "page of another origin",
			request: mutationRequest({ page: "//evil.com/a" }),
		},
	])("leaves the response alone with $why", async ({ request }) => {
		const load = loaderReturning(new Response(LOADER_BODY));
		const response = actionResponse();

		expect(await handleMutationResponse(response, { request, load })).toBe(
			response,
		);
		expect(load).not.toHaveBeenCalled();
	});

	test.each([
		{ why: "the action failed", status: 400, body: { error: "x" } },
		{
			why: "the action opted out",
			status: 200,
			body: { data: { [REVALIDATE_KEY]: false } },
		},
	])("loads nothing when $why", async ({ status, body }) => {
		const load = loaderReturning(new Response(LOADER_BODY));

		const response = await handleMutationResponse(
			actionResponse({ status, body }),
			{ request: mutationRequest(), load },
		);

		expect(load).not.toHaveBeenCalled();
		expect(response.headers.has(SINGLE_FLIGHT_HEADER)).toBe(false);
		expect(await response.text()).toBe(JSON.stringify(body));
	});

	test("returns the plain action response when the loaders redirect", async () => {
		const load = loaderReturning(new Response("{}", { status: 202 }));

		const response = await handleMutationResponse(actionResponse(), {
			request: mutationRequest(),
			load,
		});

		expect(response.headers.has(SINGLE_FLIGHT_HEADER)).toBe(false);
		expect(await response.text()).toBe(JSON.stringify({ data: null }));
	});

	test("loads with the cookies the action set", async () => {
		const load = loaderReturning(new Response(LOADER_BODY));
		const headers = new Headers();
		headers.append("Set-Cookie", "session=new; Path=/; HttpOnly");
		headers.append(
			"Set-Cookie",
			"flash=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
		);

		await handleMutationResponse(actionResponse({ headers }), {
			request: mutationRequest({
				cookie: "session=old; flash=hello; theme=dark",
			}),
			load,
		});

		expect(load.mock.calls[0][0].headers.get("Cookie")).toBe(
			"session=new; theme=dark",
		);
	});
});

function loaderReturning(response: Response) {
	return vi.fn(async (_request: Request) => response);
}

function actionResponse({
	status = 200,
	body = { data: null } as unknown,
	headers = new Headers(),
} = {}) {
	return new Response(JSON.stringify(body), { status, headers });
}

function mutationRequest({
	page = "/a/b?x=1" as string | null,
	routes = ROUTE_IDS as string | null,
	cookie = "session=abc",
} = {}) {
	const headers = new Headers({
		Cookie: cookie,
		"Content-Type": "application/x-www-form-urlencoded",
	});
	if (page) headers.set(PAGE_HEADER, page);
	if (routes) headers.set(ROUTES_HEADER, routes);

	return new Request("http://localhost/a/b.data", {
		method: "POST",
		headers,
		body: "_action=X",
	});
}
