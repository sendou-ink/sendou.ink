import { type AppRoute, matchRoute } from "./app-routes.ts";
import type { SpecDoc, TestDoc } from "./e2e.ts";
import { testAnchor } from "./links.ts";
import { type Visits, visitsOfTest } from "./visits.ts";

export interface TestLink {
	name: string;
	featureId: string;
	anchor: string;
}

export interface RouteCoverage {
	route: AppRoute;
	/** E2E tests that rendered the route in the last capture. */
	visitedBy: TestLink[];
}

export interface Coverage {
	hasCapture: boolean;
	routesOfFeature: (featureId: string) => RouteCoverage[];
	/** Routes a test rendered in the last capture. */
	routesOfTest: (test: TestDoc) => AppRoute[];
}

/** Which routes each e2e test rendered (from the last capture) and so which ones no test reaches. */
export function buildCoverage(
	features: Array<{ id: string; specs: SpecDoc[] }>,
	routes: AppRoute[],
	visits: Visits,
): Coverage {
	const visitors = new Map<AppRoute, TestLink[]>();
	const routesByTest = new Map<TestDoc, AppRoute[]>();

	for (const feature of features) {
		for (const spec of feature.specs) {
			for (const group of spec.groups) {
				for (const test of group.tests) {
					const rendered = new Set<AppRoute>();
					for (const pathname of visitsOfTest(
						visits,
						spec.path,
						test.titlePath,
					)) {
						const route = matchRoute(routes, pathname);
						if (!route) continue;
						for (const shown of [...route.parents, route]) rendered.add(shown);
					}

					routesByTest.set(test, [...rendered]);
					for (const route of rendered) {
						visitors.set(route, [
							...(visitors.get(route) ?? []),
							{
								name: test.name,
								featureId: feature.id,
								anchor: testAnchor(spec.path, group.name, test),
							},
						]);
					}
				}
			}
		}
	}

	return {
		hasCapture: Object.keys(visits).length > 0,
		routesOfFeature: (featureId) =>
			routes
				.filter((route) => routeFeature(route) === featureId)
				.map((route) => ({ route, visitedBy: visitors.get(route) ?? [] })),
		routesOfTest: (test) => routesByTest.get(test) ?? [],
	};
}

/** The feature folder a route's module lives in. */
export function routeFeature(route: AppRoute) {
	return route.file.match(/^app\/features\/([^/]+)\//)?.[1] ?? null;
}
