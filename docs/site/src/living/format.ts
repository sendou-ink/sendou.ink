import path from "node:path";
import type { MarkdownHeading } from "astro";
import { mergeTableAccesses } from "../../../../scripts/living-docs/data-access.ts";
import type {
	FeatureDoc,
	RouteData,
} from "../../../../scripts/living-docs/document.ts";
import type {
	Divider,
	SpecDoc,
	TestDoc,
} from "../../../../scripts/living-docs/e2e.ts";
import { escapeHtml } from "../../../../scripts/living-docs/highlight.ts";
import {
	anchor,
	exportAnchor,
	featureViewPath,
	groupAnchor,
	screenshotName,
	testAnchor,
	type ViewId,
} from "../../../../scripts/living-docs/links.ts";
import type { UsageGroup } from "../../../../scripts/living-docs/modules.ts";
import type { UnitTestCase } from "../../../../scripts/living-docs/unit-tests.ts";

export const STATIC_ASSETS_URL =
	"https://sendou-assets.nyc3.cdn.digitaloceanspaces.com";

/** A path of the site (no leading slash) with the site's base, e.g. `/sendou.ink/reference/routes/`. */
export function sitePath(pathInSite: string) {
	return `${import.meta.env.BASE_URL.replace(/\/?$/, "/")}${pathInSite}`;
}

/** Link to a feature's page, or to an element on it. */
export function viewHref(featureId: string, view: ViewId, elementId?: string) {
	return sitePath(
		`${featureViewPath(featureId, view)}${elementId ? `#${elementId}` : ""}`,
	);
}

/** The "On this page" outline of a feature's modules page. */
export function modulesHeadings(feature: FeatureDoc) {
	return assertUniqueSlugs(
		feature.modules.flatMap((module) => [
			{ depth: 2, slug: anchor(module.name), text: module.name },
			...[...module.types, ...module.values].map((exported) => ({
				depth: 3,
				slug: exportAnchor(module.name, exported),
				text: exported.name,
			})),
		]),
	);
}

/** The "On this page" outline of a feature's repositories page. */
export function repositoriesHeadings(feature: FeatureDoc) {
	return assertUniqueSlugs(
		feature.repositories.flatMap((repository) => [
			{
				depth: 2,
				slug: anchor(repository.name),
				text: repositoryLabel(repository.path),
			},
			...[...repository.types, ...repository.values].map((exported) => ({
				depth: 3,
				slug: exportAnchor(repository.name, exported),
				text: exported.name,
			})),
		]),
	);
}

/** Link to a repository's function on its feature's repositories page, or to the repository without `name`. */
export function repositoryHref(repository: string, name?: string) {
	return viewHref(
		featureOf(repository),
		"repositories",
		name
			? exportAnchor(moduleLabel(repository), { name, kind: "function" })
			: anchor(moduleLabel(repository)),
	);
}

/** Link to a table on the Database tables page. */
export function dbTableHref(table: string) {
	return sitePath(`reference/db-tables/#${table}`);
}

/** Every table a route's loader and action reach. */
export function routeTables(data: RouteData) {
	return mergeTableAccesses(
		[data.loader, data.action].flatMap((trace) =>
			trace
				? [...trace.tables, ...trace.calls.flatMap((call) => call.tables)]
				: [],
		),
	);
}

/** The "On this page" outline of a feature's e2e tests page, `describe`s nesting as deep as they do in the spec. */
export function e2eHeadings(feature: FeatureDoc) {
	return assertUniqueSlugs(
		feature.specs.flatMap((spec) =>
			spec.groups.flatMap((group) => [
				{
					depth: groupDepth(group),
					slug: groupAnchor(spec.path, group.name),
					text: groupTitle(spec, group),
				},
				...group.tests.map((test) => ({
					depth: groupDepth(group) + 1,
					slug: testAnchor(spec.path, group.name, test),
					text: test.name,
				})),
			]),
		),
	);
}

/** The rules a feature's e2e tests establish: each `describe` with a JSDoc, linked to its tests. */
export function behaviourRules(feature: FeatureDoc) {
	const e2eHref = (elementId: string) =>
		viewHref(feature.config.id, "e2e", elementId);

	return feature.specs.flatMap((spec) =>
		spec.groups.flatMap((group) =>
			group.doc
				? [
						{
							slug: anchor(
								"behaviour",
								path.basename(spec.path, ".spec.ts"),
								group.name ?? "",
							),
							title: groupTitle(spec, group),
							doc: group.doc,
							href: e2eHref(groupAnchor(spec.path, group.name)),
							tests: group.tests.map((test) => ({
								name: test.name,
								href: e2eHref(testAnchor(spec.path, group.name, test)),
							})),
						},
					]
				: [],
		),
	);
}

/** Heading level of a `describe` (2 for the outermost), its tests a level below. */
export function groupDepth(group: SpecDoc["groups"][number]) {
	return Math.min(1 + Math.max(group.titlePath.length, 1), 5);
}

export function groupTitle(spec: SpecDoc, group: SpecDoc["groups"][number]) {
	return group.titlePath.at(-1) ?? path.basename(spec.path);
}

export function testsOf(feature: FeatureDoc) {
	return feature.specs.flatMap((spec) =>
		spec.groups.flatMap((group) => group.tests),
	);
}

/** What a test's storyboard shows: its `test.step`s, or without those, each page it moves through. */
export function storyboardOf(test: TestDoc) {
	const titledChapters = test.chapters.filter((chapter) => chapter.title);
	if (titledChapters.length > 0) {
		return titledChapters.map((chapter) => ({
			line: chapter.line,
			plainLabel: chapter.title!,
		}));
	}

	return test.chapters
		.flatMap((chapter) => chapter.segments)
		.flatMap((segment) => segment.items)
		.filter((item): item is Divider => item.kind === "divider");
}

/** URL of a screenshot from the last capture, null when this machine has no such capture. */
export function screenshotSrc(
	feature: FeatureDoc,
	specPath: string,
	line: number,
) {
	const name = screenshotName(specPath, line);
	if (!feature.screenshots.has(name)) return null;

	return sitePath(`screenshots/${name}`);
}

/** Tests sharing their first word ("accepts …", "rejects …") grouped under it, in order of first appearance. */
export function groupByLeadingWord(tests: UnitTestCase[]) {
	const groups = new Map<string, Array<{ test: UnitTestCase; rest: string }>>();

	for (const test of tests) {
		const match = test.name.match(/^(.*? › )?(\S+) (.+)$/);
		const key = match ? `${match[1] ?? ""}${match[2]}` : test.name;
		groups.set(key, [
			...(groups.get(key) ?? []),
			{ test, rest: match?.[3] ?? test.name },
		]);
	}

	return [...groups].map(([heading, cases]) => ({
		heading: cases.length > 1 ? heading : null,
		cases,
	}));
}

/** A route's path as HTML, its params highlighted and line breaks allowed after each `/`. */
export function routePathHtml(routePath: string) {
	return escapeHtml(routePath)
		.replaceAll("/", "/<wbr>")
		.replace(/(:[\w-]+\??|\*)/g, `<span class="route-param">$1</span>`);
}

/** A chip per file using an export, labelled with the paths of the routes it serves when it serves any. */
export function usageChips(group: UsageGroup) {
	const chips = group.items.flatMap((item) =>
		(item.routes.length > 0
			? item.routes
			: [`${featureOf(item.file)}/${path.basename(item.file)}`]
		).map((label) => ({ label, file: item.file, line: item.line })),
	);

	return chips.filter(
		(chip, index) =>
			chips.findIndex((other) => other.label === chip.label) === index,
	);
}

/** e.g. `ScrimPostRepository` */
export function repositoryLabel(file: string) {
	return path.basename(file).replace(/\.server\.ts$/, "");
}

export function moduleLabel(file: string) {
	return path.basename(file).replace(/\.tsx?$/, "");
}

export function featureOf(file: string) {
	return (
		file.match(/^app\/features\/([^/]+)\//)?.[1] ??
		file.split("/").slice(0, 2).join("/")
	);
}

export function count(
	amount: number,
	singular: string,
	plural = `${singular}s`,
) {
	return `${amount} ${amount === 1 ? singular : plural}`;
}

export function initials(label: string) {
	return label
		.replace(/[^A-Za-z0-9 ]/g, "")
		.split(" ")
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

/** Paragraphs and `inline code`, enough for JSDoc and comments. */
export function markdown(text: string) {
	return text
		.split(/\n\s*\n/)
		.map(
			(paragraph) =>
				`<p>${escapeHtml(paragraph.replace(/\s*\n\s*/g, " ")).replace(/`([^`]+)`/g, "<code>$1</code>")}</p>`,
		)
		.join("");
}

/** Links and the outline resolve ids, a duplicate sends them to the wrong element. */
function assertUniqueSlugs(headings: MarkdownHeading[]) {
	const seen = new Set<string>();
	for (const { slug } of headings) {
		if (seen.has(slug)) throw new Error(`Duplicate heading id "${slug}"`);
		seen.add(slug);
	}

	return headings;
}
