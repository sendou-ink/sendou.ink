import type { HydratedRouterProps } from "react-router/dom";
import {
	PAGE_HEADER,
	ROUTES_HEADER,
	SINGLE_FLIGHT_HEADER,
} from "./revalidation";

type RouterFetch = NonNullable<HydratedRouterProps["unstable_fetch"]>;
type RouterFetchContext = Parameters<RouterFetch>[1];
type DataRouter = NonNullable<typeof window.__reactRouterDataRouter>;
type RouteManifest = NonNullable<typeof window.__reactRouterManifest>["routes"];

const PREFETCHED_LOADER_DATA_TTL_MS = 3000;

let prefetched: PrefetchedLoaderData | null = null;

type PrefetchedLoaderData = {
	url: string;
	routeIds: string[];
	/** React Router leaves out the `_routes` param when every loader of the page revalidates */
	isEveryLoader: boolean;
	body: string;
	expiresAt: number;
};

/**
 * `fetch` for React Router's data requests. A mutation sends along which loaders will revalidate after it, the
 * server appends their data to its response (see `handleMutationResponse`) and that answers the revalidation request.
 */
export const singleFlightFetch: RouterFetch = async (request, context) => {
	if (request.method === "GET") {
		const prefetchedResponse = takePrefetched(prefetched, request.url);
		if (prefetchedResponse) {
			prefetched = null;
			return prefetchedResponse;
		}

		return window.fetch(request);
	}

	prefetched = null;

	const router = window.__reactRouterDataRouter;
	const routes = window.__reactRouterManifest?.routes;
	const revalidation =
		router && routes
			? predictRevalidation({
					router,
					routes,
					context,
					origin: window.location.origin,
				})
			: null;
	if (revalidation) {
		request.headers.set(PAGE_HEADER, revalidation.pagePath);
		request.headers.set(ROUTES_HEADER, revalidation.routeIds.join(","));
	}

	const response = await window.fetch(request);
	const singleFlight = response.headers.get(SINGLE_FLIGHT_HEADER);
	if (!singleFlight) return response;

	const text = await response.text();
	const separatorIdx = text.indexOf("\n");
	const { url, routeIds } = JSON.parse(singleFlight) as Pick<
		PrefetchedLoaderData,
		"url" | "routeIds"
	>;
	prefetched = {
		url,
		routeIds,
		isEveryLoader: revalidation?.isEveryLoader ?? false,
		body: text.slice(separatorIdx + 1),
		expiresAt: Date.now() + PREFETCHED_LOADER_DATA_TTL_MS,
	};

	return new Response(text.slice(0, separatorIdx), {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
};

/**
 * The page and the ids of its routes whose loaders React Router revalidates once the mutation being sent succeeds,
 * asking each route's `shouldRevalidate` with the arguments React Router will give it. Null when the revalidation
 * is for another page (a navigation submission elsewhere, or a fetcher submitting mid-navigation).
 * @internal
 */
export function predictRevalidation({
	router,
	routes,
	context,
	origin,
}: {
	router: Pick<DataRouter, "state">;
	routes: RouteManifest;
	context: RouterFetchContext;
	origin: string;
}) {
	const { state } = router;
	if (state.navigation.state !== "idle" && context.type !== "navigation") {
		return null;
	}

	const submission =
		context.type === "navigation"
			? state.navigation
			: context.type === "fetcher" && context.fetcherKey
				? state.fetchers.get(context.fetcherKey)
				: undefined;
	if (!submission?.formMethod) return null;

	const pagePath = pathOf(state.location);
	if (
		context.type === "navigation" &&
		(!state.navigation.location ||
			pathOf(state.navigation.location) !== pagePath)
	) {
		return null;
	}

	const url = new URL(pagePath, origin);
	const params = state.matches[0]?.params ?? {};
	const args = {
		currentUrl: url,
		nextUrl: url,
		currentParams: params,
		nextParams: params,
		formMethod: submission.formMethod,
		formAction: submission.formAction,
		formEncType: submission.formEncType,
		formData: submission.formData,
		json: submission.json,
		text: submission.text,
		actionResult: undefined,
		actionStatus: 200,
		defaultShouldRevalidate: true,
	} as Parameters<
		NonNullable<DataRouter["routes"][number]["shouldRevalidate"]>
	>[0];

	const loaderMatches = state.matches.filter(({ route }) => {
		const manifestRoute = routes[route.id];
		return manifestRoute?.hasLoader && !manifestRoute.hasClientLoader;
	});
	const routeIds = loaderMatches
		.filter(({ route }) => {
			const choice = route.shouldRevalidate?.(args);
			return typeof choice === "boolean" ? choice : true;
		})
		.map(({ route }) => route.id);
	if (routeIds.length === 0) return null;

	return {
		pagePath,
		routeIds,
		isEveryLoader: routeIds.length === loaderMatches.length,
	};
}

/**
 * The prefetched loader data as a response to a revalidation request of `requestUrl`, when it was prefetched for
 * that page and holds every route the request asks for.
 * @internal
 */
export function takePrefetched(
	data: PrefetchedLoaderData | null,
	requestUrl: string,
) {
	if (!data || data.expiresAt < Date.now()) return null;

	const url = new URL(requestUrl);
	// biome-ignore lint/plugin: React Router's own single fetch param
	const requestedRouteIds = url.searchParams.get("_routes")?.split(",");
	url.searchParams.delete("_routes");

	const holdsRequestedRoutes = requestedRouteIds
		? requestedRouteIds.every((id) => data.routeIds.includes(id))
		: data.isEveryLoader;
	if (!holdsRequestedRoutes || url.pathname + url.search !== data.url) {
		return null;
	}

	return new Response(data.body, {
		status: 200,
		headers: { "Content-Type": "text/x-script", "X-Remix-Response": "yes" },
	});
}

function pathOf(location: { pathname: string; search: string }) {
	return location.pathname + location.search;
}
