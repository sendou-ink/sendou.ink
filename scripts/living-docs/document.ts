// documents every feature (README, core modules, e2e specs and routes) for the living docs pages of the docs site, see docs/site/src/content/docs/dev/living-docs.mdx

import fs from "node:fs";
import path from "node:path";
import { type AppRoute, appRoutes } from "./app-routes.ts";
import { clearCaches, ROOT } from "./ast.ts";
import { type ClientStateDoc, documentClientState } from "./client-state.ts";
import { buildCoverage, routeFeature, type TestLink } from "./coverage.ts";
import {
	type RepositoryCall,
	reachableTables,
	resolveDeclaration,
	type TableAccess,
	traceDeclaration,
} from "./data-access.ts";
import { documentSpec, type SpecDoc } from "./e2e.ts";
import { discoverFeatures, type FeatureConfig } from "./features.ts";
import {
	routeAnchor,
	screenshotName,
	testAnchor,
	type ViewId,
} from "./links.ts";
import { documentModule, type ModuleDoc } from "./modules.ts";
import { indexPageObjects } from "./page-objects.ts";
import {
	documentPermissions,
	type FeaturePermissions,
	featurePermissions,
	type PermissionsDoc,
} from "./permissions.ts";
import { documentRepository, type RepositoryDoc } from "./repositories.ts";
import { allSourceFiles } from "./source-index.ts";
import { readVisits, SCREENSHOTS_DIR } from "./visits.ts";

export interface FeatureOutline {
	config: FeatureConfig;
	/** Pages the feature has, in the order of `VIEWS`. */
	views: ViewId[];
}

export type RouteDoc = Omit<AppRoute, "parents">;

export interface RouteLink {
	path: string;
	/** Null for a route outside `app/features`, which the Routes page doesn't list. */
	featureId: string | null;
	anchor: string;
}

/** What a loader or action reads and writes, through the repository functions it calls. */
export interface RouteDataTrace {
	/** Where the loader or action is declared. */
	file: string;
	line: number;
	/** Tables it queries itself, outside of repositories. */
	tables: TableAccess[];
	calls: Array<
		RepositoryCall & {
			/** Every table the function ends up querying, through the repositories it calls included. */
			tables: TableAccess[];
		}
	>;
}

export interface RouteData {
	loader: RouteDataTrace | null;
	action: RouteDataTrace | null;
}

export interface FeatureDoc extends FeatureOutline {
	modules: ModuleDoc[];
	repositories: RepositoryDoc[];
	/** The per-object permissions it grants and the checks in its code, null for none. */
	permissions: FeaturePermissions | null;
	/** Its search params and web storage definitions. */
	clientState: ClientStateDoc[];
	specs: SpecDoc[];
	routes: Array<{
		route: RouteDoc;
		/** E2E tests that rendered the route in the last capture. */
		visitedBy: TestLink[];
		data: RouteData;
	}>;
	/** Test anchor → the pages (layouts left out) it rendered in the last capture. */
	renderedRoutes: Map<string, RouteLink[]>;
	/** Screenshots of the last capture that exist on this machine, as `screenshotName`s. */
	screenshots: Set<string>;
	/** Whether route coverage has been captured at all. */
	hasCapture: boolean;
}

/** Every feature and which pages it has, cheap enough to build the docs site's sidebar from. */
export function outlineFeatures(
	permissions: PermissionsDoc = documentPermissions(allSourceFiles()),
	clientState: ClientStateDoc[] = documentClientState(allSourceFiles()),
): FeatureOutline[] {
	const routes = appRoutes();
	const featuresWithRoutes = new Set(
		routes.map(routeFeature).filter((id) => id !== null),
	);

	return discoverFeatures(featuresWithRoutes).map((config) => {
		const views: ViewId[] = [];
		if (config.readmePath || featuresWithRoutes.has(config.id)) {
			views.push("overview");
		}
		if (config.modulePaths.length > 0) views.push("modules");
		if (config.repositoryPaths.length > 0) views.push("repositories");
		if (featurePermissions(permissions, config.id)) views.push("permissions");
		if (clientState.some((definition) => definition.feature === config.id)) {
			views.push("search-params");
		}
		if (config.specs.length > 0) views.push("e2e");

		return { config, views };
	});
}

/** Everything the living docs show of every feature, read fresh from the files on each call. */
export function documentFeatures(): FeatureDoc[] {
	clearCaches();

	const sourceFiles = allSourceFiles();
	const pageObjects = indexPageObjects();
	const routes = appRoutes();
	const routePathsByFile = routePathsOfFiles(routes);
	const visits = readVisits();

	const permissions = documentPermissions(sourceFiles);
	const clientState = documentClientState(sourceFiles);

	const documented = outlineFeatures(permissions, clientState).map(
		(outline) => ({
			...outline,
			modules: outline.config.modulePaths.map((modulePath) =>
				documentModule(modulePath, sourceFiles, routePathsByFile),
			),
			repositories: outline.config.repositoryPaths.map((repositoryPath) =>
				documentRepository(
					repositoryPath,
					sourceFiles,
					routePathsByFile,
					permissions.grants.filter(
						(grant) => grant.feature === outline.config.id,
					),
				),
			),
			specs: outline.config.specs.map((spec) =>
				documentSpec(spec, pageObjects),
			),
			permissions: featurePermissions(permissions, outline.config.id),
			clientState: clientState.filter(
				(definition) => definition.feature === outline.config.id,
			),
		}),
	);

	const coverage = buildCoverage(
		documented.map((feature) => ({
			id: feature.config.id,
			specs: feature.specs,
		})),
		routes,
		visits,
	);

	return documented.map((feature) => {
		const renderedRoutes = new Map<string, RouteLink[]>();
		for (const spec of feature.specs) {
			for (const group of spec.groups) {
				for (const test of group.tests) {
					renderedRoutes.set(
						testAnchor(spec.path, group.name, test),
						coverage
							.routesOfTest(test)
							.filter((route) => !route.isLayout)
							.map((route) => ({
								path: route.path,
								featureId: routeFeature(route),
								anchor: routeAnchor(route),
							})),
					);
				}
			}
		}

		return {
			...feature,
			routes: coverage
				.routesOfFeature(feature.config.id)
				.map(({ route: { parents: _parents, ...route }, visitedBy }) => ({
					route,
					visitedBy,
					data: {
						loader: route.hasLoader
							? traceRouteExport(route.file, "loader")
							: null,
						action: route.hasAction
							? traceRouteExport(route.file, "action")
							: null,
					},
				})),
			renderedRoutes,
			screenshots: existingScreenshots(feature.specs),
			hasCapture: coverage.hasCapture,
		};
	});
}

/** Route paths by the files serving them: the route modules and the files their loaders and actions are declared in. */
function routePathsOfFiles(routes: AppRoute[]) {
	const byFile = new Map<string, string[]>();
	const add = (file: string, routePath: string) => {
		const paths = byFile.get(file) ?? [];
		if (!paths.includes(routePath)) byFile.set(file, [...paths, routePath]);
	};

	for (const route of routes) {
		add(route.file, route.path);
		for (const name of ["loader", "action"]) {
			const declaration = resolveDeclaration(route.file, name);
			if (declaration) add(declaration.file, route.path);
		}
	}

	return byFile;
}

function traceRouteExport(
	routeFile: string,
	name: "loader" | "action",
): RouteDataTrace | null {
	const declaration = resolveDeclaration(routeFile, name);
	if (!declaration) return null;

	const trace = traceDeclaration(declaration);

	return {
		file: declaration.file,
		line: trace.line,
		tables: trace.tables,
		calls: trace.repositoryCalls.map((call) => ({
			...call,
			tables: reachableTables({ file: call.repository, name: call.name }),
		})),
	};
}

function existingScreenshots(specs: SpecDoc[]) {
	const names = new Set<string>();

	for (const spec of specs) {
		const specDir = path.dirname(screenshotName(spec.path, 1));
		const dir = path.join(ROOT, SCREENSHOTS_DIR, specDir);
		if (!fs.existsSync(dir)) continue;

		for (const file of fs.readdirSync(dir)) names.add(`${specDir}/${file}`);
	}

	return names;
}
