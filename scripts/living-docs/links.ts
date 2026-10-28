import path from "node:path";

const GITHUB_BLOB_URL = "https://github.com/sendou-ink/sendou.ink/blob/main";

/** The pages of a feature, the first one it has is where it is linked to. */
export const VIEWS = [
	{ id: "overview", label: "Overview" },
	{ id: "modules", label: "Modules" },
	{ id: "repositories", label: "Repositories" },
	{ id: "permissions", label: "Permissions" },
	{ id: "search-params", label: "Search params & storage" },
	{ id: "e2e", label: "E2E tests" },
] as const;

export type ViewId = (typeof VIEWS)[number]["id"];

/** Path of a feature's page, relative to the docs site's base. The overview is the feature's own path. */
export function featureViewPath(featureId: string, view: ViewId) {
	return view === "overview"
		? `features/${featureId}/`
		: `features/${featureId}/${view}/`;
}

export function githubUrl(file: string, line: number) {
	return `${GITHUB_BLOB_URL}/${encodeURI(file)}#L${line}`;
}

/** Id of an e2e test's element on its feature page. */
export function testAnchor(
	specPath: string,
	groupName: string | null,
	test: { name: string; line: number; modifier: string | null },
) {
	return anchor(
		path.basename(specPath, ".spec.ts"),
		groupName ?? "",
		test.name,
		test.modifier === "hook" ? String(test.line) : "",
	);
}

/** Id of a module export's element, types suffixed as `Stats` and `stats` may both be exported. */
export function exportAnchor(
	moduleName: string,
	exported: { name: string; kind: string },
) {
	const isType = exported.kind === "type" || exported.kind === "interface";
	return anchor(moduleName, exported.name, isType ? "type" : "");
}

/** Id of a `describe`'s heading on its feature page. */
export function groupAnchor(specPath: string, groupName: string | null) {
	return anchor(path.basename(specPath, ".spec.ts"), groupName ?? "");
}

/** Id of a route's element on its feature page. */
export function routeAnchor(route: { file: string; isLayout: boolean }) {
	return anchor(route.file, route.isLayout ? "layout" : "");
}

/** Id of a public API endpoint's heading. */
export function apiEndpointAnchor(endpoint: { method: string; path: string }) {
	return anchor(endpoint.method, endpoint.path);
}

/** Id of a public API type's heading. */
export function apiTypeAnchor(name: string) {
	return anchor("type", name);
}

export function anchor(...parts: string[]) {
	return parts
		.filter(Boolean)
		.join("-")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/** Path of the screenshot of a page divider within the screenshots directory, named after the spec line it starts on. */
export function screenshotName(spec: string, line: number) {
	return `${path.basename(spec, ".spec.ts")}/${line}.jpg`;
}
