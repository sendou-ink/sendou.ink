import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./ast.ts";
import { featureModulePaths } from "./modules.ts";
import { featureRepositoryPaths } from "./repositories.ts";

const FEATURES_DIR = "app/features";
const E2E_DIR = "e2e";
/** A feature's handwritten overview, shown at the top of its page. */
const FEATURE_README_PATTERN = "docs/site/src/content/feature-readmes/*.mdx";

/** Specs whose file name doesn't start with the name of the feature they test. */
const SPEC_FEATURE_OVERRIDES: Record<string, string> = {
	analyzer: "build-analyzer",
	events: "availability",
	"global-search": "search",
	"map-tools": "map-list-generator",
	org: "tournament-organization",
	plus: "plus-voting",
	"q-pages": "sendouq",
};

/** Specs that test no feature in particular, e.g. navigation. */
const SITE_WIDE = { id: "site-wide", label: "Site-wide" };

/** Feature folder → one of `NAV_ICONS` (`app/utils/urls.ts`). */
const NAV_ICONS: Record<string, string> = {
	"build-analyzer": "analyzer",
	"build-stats": "builds",
	builds: "builds",
	calendar: "calendar",
	art: "art",
	articles: "articles",
	associations: "associations",
	badges: "badges",
	"comp-analyzer": "comp-analyzer",
	leaderboards: "leaderboards",
	lfg: "lfg",
	links: "links",
	lobbies: "lobbies",
	"map-list-generator": "maps",
	"map-planner": "plans",
	"object-damage-calculator": "object-damage-calculator",
	"plus-suggestions": "plus",
	"plus-voting": "plus",
	scanner: "scanner",
	"scanner-ingest": "scanner",
	scrims: "scrims",
	sendouq: "sendouq",
	"sendouq-match": "sendouq",
	"sendouq-streams": "sendouq",
	settings: "settings",
	team: "t",
	"tier-list-maker": "tier-list-maker",
	"top-search": "xsearch",
	tournament: "medal",
	"tournament-admin": "medal",
	"tournament-bracket": "medal",
	"tournament-lfg": "medal",
	"tournament-match": "medal",
	"tournament-organization": "medal",
	"tournament-subs": "medal",
	trophies: "trophies",
	"user-card": "u",
	"user-page": "u",
	"user-report": "u",
	vods: "vods",
};

const LABELS: Record<string, string> = {
	"api-public": "Public API",
	"img-export": "Image export",
	lfg: "LFG",
	mmr: "MMR",
	sendouq: "SendouQ",
	"sendouq-match": "SendouQ match",
	"sendouq-streams": "SendouQ streams",
	"tournament-lfg": "Tournament LFG",
};

export interface FeatureConfig {
	id: string;
	label: string;
	navIcon: string | null;
	/** Repo relative path of the feature's README, null when it has none. */
	readmePath: string | null;
	modulePaths: string[];
	repositoryPaths: string[];
	specs: string[];
}

/** Every feature with a README, Module.ts files, repositories, e2e specs or routes, specs matched to the feature their file name starts with. */
export function discoverFeatures(
	featuresWithRoutes: Set<string>,
): FeatureConfig[] {
	const featureIds = fs
		.readdirSync(path.join(ROOT, FEATURES_DIR), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

	const specsByFeature = new Map<string, string[]>();
	for (const spec of fs.readdirSync(path.join(ROOT, E2E_DIR)).sort()) {
		const stem = spec.match(/^(.+)\.spec\.ts$/)?.[1];
		if (!stem) continue;

		const featureId =
			SPEC_FEATURE_OVERRIDES[stem] ??
			featureIds
				.filter((id) => stem === id || stem.startsWith(`${id}-`))
				.sort((a, b) => b.length - a.length)[0] ??
			SITE_WIDE.id;

		specsByFeature.set(featureId, [
			...(specsByFeature.get(featureId) ?? []),
			`${E2E_DIR}/${spec}`,
		]);
	}

	const features = featureIds.map((id) => ({
		id,
		label: LABELS[id] ?? capitalize(id.replaceAll("-", " ")),
		navIcon: NAV_ICONS[id] ?? null,
		readmePath: readmePathOf(id),
		modulePaths: featureModulePaths(`${FEATURES_DIR}/${id}`),
		repositoryPaths: featureRepositoryPaths(`${FEATURES_DIR}/${id}`),
		specs: specsByFeature.get(id) ?? [],
	}));

	const siteWide = {
		...SITE_WIDE,
		navIcon: null,
		readmePath: null,
		modulePaths: [],
		repositoryPaths: [],
		specs: specsByFeature.get(SITE_WIDE.id) ?? [],
	};

	return [...features, siteWide]
		.filter(
			(feature) =>
				feature.readmePath !== null ||
				feature.modulePaths.length +
					feature.repositoryPaths.length +
					feature.specs.length >
					0 ||
				featuresWithRoutes.has(feature.id),
		)
		.sort((a, b) => (a.label < b.label ? -1 : 1));
}

/** The feature an `app/` file belongs to, or for files outside the feature folders their directory (`app/hooks`). */
export function featureOfFile(file: string) {
	return (
		file.match(new RegExp(`^${FEATURES_DIR}/([^/]+)/`))?.[1] ??
		path.posix.dirname(file)
	);
}

function readmePathOf(featureId: string) {
	const readmePath = FEATURE_README_PATTERN.replace("*", featureId);

	return fs.existsSync(path.join(ROOT, readmePath)) ? readmePath : null;
}

function capitalize(text: string) {
	return text.charAt(0).toUpperCase() + text.slice(1);
}
