import { describe, expect, test } from "vitest";
import { predictRevalidation, takePrefetched } from "./single-flight.client";

const ROOT = "root";
const LAYOUT = "features/a/routes/a";
const PAGE = "features/a/routes/a.b";
const NO_LOADER = "features/a/routes/a.b.c";

const ORIGIN = "http://localhost";

describe("predictRevalidation", () => {
	test("lists the loader routes whose shouldRevalidate lets them revalidate", () => {
		expect(
			predictRevalidation(
				args({
					shouldRevalidate: {
						[ROOT]: () => false,
						[LAYOUT]: (a) => a.defaultShouldRevalidate,
					},
				}),
			),
		).toEqual({
			pagePath: "/a/b?x=1",
			routeIds: [LAYOUT, PAGE],
			isEveryLoader: false,
		});
	});

	test("gives shouldRevalidate the submission", () => {
		const prediction = predictRevalidation(
			args({
				shouldRevalidate: {
					[ROOT]: (a) => a.formData?.get("revalidateRoot") === "true",
				},
				formData: formData({ revalidateRoot: "true" }),
			}),
		);

		expect(prediction?.routeIds).toEqual([ROOT, LAYOUT, PAGE]);
		expect(prediction?.isEveryLoader).toBe(true);
	});

	test("is null when no loader revalidates", () => {
		expect(
			predictRevalidation(
				args({
					shouldRevalidate: {
						[ROOT]: () => false,
						[LAYOUT]: () => false,
						[PAGE]: () => false,
					},
				}),
			),
		).toBeNull();
	});

	test("is null for a fetcher submitting mid-navigation", () => {
		expect(
			predictRevalidation(args({ navigatingTo: "/elsewhere" })),
		).toBeNull();
	});

	test("predicts a navigation submission to the page itself", () => {
		expect(
			predictRevalidation(
				args({ submittedBy: "navigation", navigatingTo: "/a/b?x=1" }),
			)?.routeIds,
		).toEqual([ROOT, LAYOUT, PAGE]);
	});

	test("is null for a navigation submission to another page", () => {
		expect(
			predictRevalidation(
				args({ submittedBy: "navigation", navigatingTo: "/elsewhere" }),
			),
		).toBeNull();
	});
});

describe("takePrefetched", () => {
	const prefetched = {
		url: "/a/b.data?x=1",
		routeIds: [LAYOUT, PAGE],
		isEveryLoader: false,
		body: "loader data",
		expiresAt: Date.now() + 60_000,
	};

	test("answers a request for some of the prefetched routes", async () => {
		const response = takePrefetched(
			prefetched,
			revalidationUrl("/a/b.data?x=1", [PAGE]),
		);

		expect(await response?.text()).toBe("loader data");
		expect(response?.headers.get("X-Remix-Response")).toBe("yes");
	});

	test.each([
		{
			why: "a route not prefetched",
			url: revalidationUrl("/a/b.data?x=1", [ROOT, PAGE]),
			data: prefetched,
		},
		{
			why: "another page",
			url: revalidationUrl("/a/b.data?x=2", [PAGE]),
			data: prefetched,
		},
		{
			why: "expired data",
			url: revalidationUrl("/a/b.data?x=1", [PAGE]),
			data: { ...prefetched, expiresAt: Date.now() - 1 },
		},
		{
			why: "every loader requested, some prefetched",
			url: `${ORIGIN}/a/b.data?x=1`,
			data: prefetched,
		},
		{
			why: "no data",
			url: revalidationUrl("/a/b.data?x=1", [PAGE]),
			data: null,
		},
	])("is null for $why", ({ url, data }) => {
		expect(takePrefetched(data, url)).toBeNull();
	});

	test("answers a request for every loader when every loader was prefetched", () => {
		expect(
			takePrefetched(
				{ ...prefetched, isEveryLoader: true },
				`${ORIGIN}/a/b.data?x=1`,
			),
		).not.toBeNull();
	});
});

type ShouldRevalidate = (args: {
	defaultShouldRevalidate: boolean;
	formData?: FormData;
}) => boolean | undefined;

function args({
	shouldRevalidate = {},
	formData: submittedFormData = formData({ _action: "X" }),
	submittedBy = "fetcher",
	navigatingTo,
}: {
	shouldRevalidate?: Record<string, ShouldRevalidate>;
	formData?: FormData;
	submittedBy?: "fetcher" | "navigation";
	navigatingTo?: string;
}) {
	const submission = {
		state: "submitting",
		formMethod: "POST",
		formAction: "/a/b",
		formEncType: "application/x-www-form-urlencoded",
		formData: submittedFormData,
	};
	const navigationLocation = navigatingTo
		? new URL(navigatingTo, ORIGIN)
		: undefined;

	const state = {
		location: { pathname: "/a/b", search: "?x=1" },
		matches: [ROOT, LAYOUT, PAGE, NO_LOADER].map((id) => ({
			params: {},
			route: { id, shouldRevalidate: shouldRevalidate[id] },
		})),
		navigation: navigationLocation
			? {
					...(submittedBy === "navigation" ? submission : {}),
					state: submittedBy === "navigation" ? "submitting" : "loading",
					location: {
						pathname: navigationLocation.pathname,
						search: navigationLocation.search,
					},
				}
			: { state: "idle" },
		fetchers: new Map([["key", submission]]),
	};

	return {
		router: { state } as never,
		routes: {
			[ROOT]: { hasLoader: true, hasClientLoader: false },
			[LAYOUT]: { hasLoader: true, hasClientLoader: false },
			[PAGE]: { hasLoader: true, hasClientLoader: false },
			[NO_LOADER]: { hasLoader: false, hasClientLoader: false },
		} as never,
		context:
			submittedBy === "navigation"
				? ({
						type: "navigation",
						fetcherKey: null,
						navigationType: "PUSH",
					} as never)
				: ({
						type: "fetcher",
						fetcherKey: "key",
						navigationType: null,
					} as const),
		origin: ORIGIN,
	};
}

function formData(values: Record<string, string>) {
	const result = new FormData();
	for (const [key, value] of Object.entries(values)) {
		result.set(key, value);
	}
	return result;
}

function revalidationUrl(path: string, routeIds: string[]) {
	const url = new URL(path, ORIGIN);
	url.searchParams.set("_routes", routeIds.join(","));
	return url.href;
}
