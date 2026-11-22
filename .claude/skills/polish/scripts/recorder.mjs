// Where a sweep's findings go: one per component (a rule plus the element's class signature, see
// `keyOf`) with the pages, viewers and widths it was seen at, a marked screenshot of the first
// sighting and what earlier runs said about it. Also keeps what is judged over the whole site at
// the end of a run: page titles and the census of sizes in use.
import fs from "node:fs";
import path from "node:path";
import {
	loadVerdicts,
	moduleFileOf,
	OUTPUT_DIR,
	SKILL_DIR,
	shootMarked,
	slug,
	sourcesOf,
	stableText,
	VIEWPORTS,
	viewportClassOf,
} from "./lib.mjs";

const PAGES_PER_FINDING = 12;
const PAGES_PER_MODULE = 12;
const JUNK_TITLE = /\b(undefined|NaN|null)\b|\[object /;
/** How far off a token a value can be and still read as a slip rather than a choice. */
const NEAR_TOKEN = { fontSize: 1.6, fontWeight: 0, radius: 2, gap: 2 };
const CENSUS_LABELS = {
	fontSize: "font size",
	fontWeight: "font weight",
	radius: "corner radius",
	gap: "gap",
};

export class Recorder {
	/**
	 * `runDir` gets `mechanical.json` and `media/`. With `selftest` every finding is tagged with the
	 * fixture case (`data-case`) its element sits in.
	 */
	constructor({
		runDir,
		evidencePerRule = Number.POSITIVE_INFINITY,
		selftest = false,
	}) {
		this.runDir = runDir;
		this.mediaDir = path.join(runDir, "media");
		this.evidencePerRule = evidencePerRule;
		this.selftest = selftest;
		/** key -> finding */
		this.findings = new Map();
		/** key -> what a finding collects as sets */
		this.seen = new Map();
		this.evidenceCount = new Map();
		this.mediaIndex = 0;
		this.counters = {};
		this.allowlist = JSON.parse(
			fs.readFileSync(path.join(SKILL_DIR, "allowlist.json"), "utf8"),
		);
		this.verdicts = loadVerdicts();
		this.tokens = null;
		/** kind -> value -> { count, signatures, pages, example } */
		this.census = { fontSize: {}, fontWeight: {}, radius: {}, gap: {} };
		/** one per page and viewport class: `{ url, route, viewer, viewportName, title, heading }` */
		this.pageFacts = [];
		/** CSS module file -> pages showing one of its classes */
		this.modulePages = new Map();
		fs.mkdirSync(this.mediaDir, { recursive: true });
	}

	count(name, by = 1) {
		this.counters[name] = (this.counters[name] ?? 0) + by;
	}

	/** A path under `media/` for a piece of evidence, numbered in the order taken. */
	stem(kind, context) {
		return path.join(
			this.mediaDir,
			`${String(++this.mediaIndex).padStart(4, "0")}-${kind}-${context.viewportName}-${slug(context.entry.url)}`,
		);
	}

	relative(file) {
		return path.relative(this.runDir, file);
	}

	takeEvidence(rule) {
		const count = this.evidenceCount.get(rule) ?? 0;
		if (count >= this.evidencePerRule) return false;
		this.evidenceCount.set(rule, count + 1);
		return true;
	}

	async caseOf(page, nodeId) {
		if (!this.selftest || !nodeId) return undefined;
		return page
			.evaluate((id) => window.__polish.caseOf(id), nodeId)
			.catch(() => undefined);
	}

	async recordAll(page, found, context) {
		for (const item of found) await this.record(page, item, context);
	}

	/** Adds the finding, with a marked screenshot when it is the first of its kind. */
	async record(page, item, context) {
		const key = keyOf(item, context);
		const isFirst = !this.findings.has(key);
		const media = [];
		const caseId = await this.caseOf(page, item.nodeId);

		if (
			isFirst &&
			item.nodeId &&
			!this.isAllowed(item, context) &&
			this.takeEvidence(item.rule)
		) {
			const position = await page
				.evaluate((id) => window.__polish.reveal(id), item.nodeId)
				.catch(() => null);
			if (position) {
				const file = `${this.stem(item.rule, context)}-${context.theme}.png`;
				// `markGrow` keeps the mark off what the picture is about (a focus ring around the element)
				const grow = item.markGrow ?? 0;
				await shootMarked(page, file, {
					marks: [
						{
							rect: {
								x: position.rect.x - grow,
								y: position.rect.y - grow,
								width: position.rect.width + grow * 2,
								height: position.rect.height + grow * 2,
							},
							dashed: grow > 0,
							label: item.rule,
						},
					],
					pad: viewportClass(context) === "mobile" ? 140 : 180,
				}).catch(() => {});
				if (fs.existsSync(file)) media.push(this.relative(file));
			}
		}

		return this.add(key, { ...item, media, caseId }, context);
	}

	isAllowed(item, context) {
		const haystack = `${item.selector} ${item.sig} ${context.entry.url} ${item.detail}`;
		return this.allowlist.some(
			(allowed) =>
				(allowed.rule === "*" || allowed.rule === item.rule) &&
				haystack.includes(allowed.match),
		);
	}

	/** Adds a finding under a key of the caller's choosing (the passes that judge more than one element). */
	add(key, item, context) {
		if (this.isAllowed(item, context)) return null;
		const { entry } = context;

		let seen = this.seen.get(key);
		if (!seen) {
			seen = {
				stress: new Set(),
				ordinary: new Set(),
				viewers: new Set(),
				widths: new Set(),
				cases: new Set(),
				components: new Set(),
			};
			this.seen.set(key, seen);
		}
		(entry.stress ? seen.stress : seen.ordinary).add(entry.url);
		seen.viewers.add(entry.viewer ?? "anon");
		const width =
			context.width ?? VIEWPORTS[context.viewportName]?.viewport.width;
		if (width) seen.widths.add(width);
		if (item.caseId) seen.cases.add(item.caseId);

		if (item.component) seen.components.add(stableText(item.component));

		const existing = this.findings.get(key);
		if (existing) {
			existing.occurrences++;
			if (
				!existing.pages.includes(entry.url) &&
				existing.pages.length < PAGES_PER_FINDING
			) {
				existing.pages.push(entry.url);
			}
			return existing;
		}

		const stableKey = stableText(key);
		const finding = {
			id: `m${this.findings.size + 1}`,
			key,
			stableKey,
			rule: item.rule,
			detail: item.detail,
			text: item.text ?? "",
			selector: item.selector ?? "",
			sig: item.sig ?? "",
			source: sourcesOf(item.sig || item.selector).map(
				({ file, name }) => `${file} .${name}`,
			),
			url: entry.url,
			route: entry.route,
			feature: entry.feature,
			viewer: entry.viewer ?? null,
			viewport: context.viewportName,
			theme: context.theme,
			lang: context.lang ?? "en",
			state: context.state ?? null,
			steps: context.steps ?? [],
			stress: entry.stress ?? null,
			scenario: entry.scenario ?? null,
			known: this.verdicts[stableKey] ?? null,
			occurrences: 1,
			pages: [entry.url],
			media: item.media ?? [],
		};
		this.findings.set(key, finding);
		return finding;
	}

	/** The design tokens, read once from the first page that has them. */
	async noteTokens(page) {
		if (this.tokens) return;
		this.tokens = await page
			.evaluate(() => window.__polish.tokens())
			.catch(() => null);
	}

	/** What `window.__polish.census()` saw on a page: sizes in use, the title, the main heading. */
	noteCensus(context, census) {
		if (!census) return;
		const { entry } = context;
		for (const [kind, values] of Object.entries(census.values)) {
			for (const [value, seen] of Object.entries(values)) {
				this.census[kind][value] ??= {
					count: 0,
					signatures: new Set(),
					pages: new Set(),
					example: null,
				};
				const total = this.census[kind][value];
				total.count += seen.count;
				for (const signature of seen.signatures)
					total.signatures.add(stableText(signature));
				total.pages.add(entry.url);
				total.example ??= {
					...seen.example,
					url: entry.url,
					viewer: entry.viewer ?? null,
					viewport: context.viewportName,
					entry,
				};
			}
		}
		this.pageFacts.push({
			entry,
			viewportName: context.viewportName,
			title: census.title,
			heading: census.heading,
		});
	}

	noteModules(url, hashes) {
		for (const hash of hashes ?? []) {
			const file = moduleFileOf(hash);
			if (!file) {
				this.count("moduleHashesUnresolved");
				continue;
			}
			this.count("moduleHashesResolved");
			const pages = this.modulePages.get(file) ?? new Set();
			pages.add(url);
			this.modulePages.set(file, pages);
		}
	}

	/**
	 * The findings that only show over the whole run: page titles shared or broken, sizes off the
	 * design tokens, a page heading unlike the others. Call once, after the last page.
	 */
	finalize() {
		this.titleFindings();
		this.censusFindings();
		this.headingFindings();
	}

	titleFindings() {
		const facts = this.pageFacts;
		const routesByTitle = new Map();
		for (const fact of facts) {
			const title = (fact.title ?? "").trim();
			const context = {
				entry: fact.entry,
				viewportName: fact.viewportName,
				theme: "dark",
			};
			if (!title) {
				this.add(
					`page-title|empty|${fact.entry.route}`,
					{
						rule: "page-title",
						detail: "the page has no title (the browser tab shows the URL)",
						sig: fact.entry.route,
					},
					context,
				);
				continue;
			}
			if (JUNK_TITLE.test(title)) {
				this.add(
					`page-title|junk|${fact.entry.route}`,
					{
						rule: "page-title",
						detail: `the page title is "${title}"`,
						sig: fact.entry.route,
						text: title,
					},
					context,
				);
			}
			const routes = routesByTitle.get(title) ?? new Map();
			routes.set(fact.entry.route, fact);
			routesByTitle.set(title, routes);
		}
		for (const [title, routes] of routesByTitle) {
			// two things of one name (a team and an organization) are a coincidence: three pages of one
			// section sharing a title are tabs nobody can tell apart
			const bySection = Map.groupBy(
				routes.keys(),
				(route) => route.split("/")[1] ?? "",
			);
			if (![...bySection.values()].some((group) => group.length >= 3)) continue;
			const [first] = routes.values();
			const finding = this.add(
				`page-title|shared|${title}`,
				{
					rule: "page-title",
					detail: `${routes.size} different pages share the title "${title}": ${[...routes.keys()].slice(0, 8).join(", ")}${routes.size > 8 ? "..." : ""}`,
					sig: title,
					text: title,
				},
				{ entry: first.entry, viewportName: first.viewportName, theme: "dark" },
			);
			if (finding) {
				finding.pages = [...routes.values()]
					.map((fact) => fact.entry.url)
					.slice(0, PAGES_PER_FINDING);
			}
		}
	}

	censusFindings() {
		if (!this.tokens) return;
		for (const kind of Object.keys(this.census)) {
			const tokens = Object.entries(this.tokens[kind] ?? {}).map(
				([value, name]) => ({ value: Number(value), name }),
			);
			if (tokens.length === 0) continue;
			for (const [text, usage] of Object.entries(this.census[kind])) {
				const value = Number(text);
				const nearest = tokens.toSorted(
					(a, b) => Math.abs(a.value - value) - Math.abs(b.value - value),
				)[0];
				const distance = Math.abs(nearest.value - value);
				if (distance <= (kind === "fontWeight" ? 0 : 0.3)) continue;
				const isNear = distance <= NEAR_TOKEN[kind];
				const isRare = usage.signatures.size <= 2;
				if (!isNear && !isRare) continue;
				const unit = kind === "fontWeight" ? "" : "px";
				const finding = this.add(
					`off-token|${kind}|${text}`,
					{
						rule: "off-token",
						detail: `a ${CENSUS_LABELS[kind]} of ${text}${unit} is not one of the design tokens (nearest: ${nearest.name}, ${nearest.value}${unit}); ${usage.signatures.size} component${usage.signatures.size === 1 ? "" : "s"} on ${usage.pages.size} page${usage.pages.size === 1 ? "" : "s"} use it, e.g. ${[...usage.signatures].slice(0, 3).join(", ")}`,
						sig: [...usage.signatures][0] ?? "",
						selector: usage.example.selector,
						text: usage.example.text,
					},
					{
						entry: usage.example.entry,
						viewportName: usage.example.viewport,
						theme: "dark",
					},
				);
				if (finding)
					finding.pages = [...usage.pages].slice(0, PAGES_PER_FINDING);
			}
		}
	}

	headingFindings() {
		const facts = this.pageFacts.filter(
			(fact) =>
				fact.heading && viewportClassOfName(fact.viewportName) === "desktop",
		);
		if (facts.length < 8) return;
		const bySize = Map.groupBy(facts, (fact) => fact.heading.fontSize);
		const [commonSize, common] = [...bySize].sort(
			(a, b) => b[1].length - a[1].length,
		)[0];
		if (common.length < facts.length * 0.6) return;
		for (const [size, odd] of bySize) {
			if (size === commonSize) continue;
			const finding = this.add(
				`inconsistent-heading|${size}`,
				{
					rule: "inconsistent-heading",
					detail: `the page heading is ${size}px here and ${commonSize}px on ${common.length} other pages (${odd.length} page${odd.length === 1 ? "" : "s"} like this one)`,
					sig: stableText(odd[0].heading.selector),
					selector: odd[0].heading.selector,
					text: odd[0].heading.text,
				},
				{
					entry: odd[0].entry,
					viewportName: odd[0].viewportName,
					theme: "dark",
				},
			);
			if (finding) {
				finding.pages = odd
					.map((fact) => fact.entry.url)
					.slice(0, PAGES_PER_FINDING);
			}
		}
	}

	save() {
		const findings = [...this.findings.values()].map((finding) => {
			const seen = this.seen.get(finding.key);
			return {
				...finding,
				stressPages: seen.stress.size,
				ordinaryPages: seen.ordinary.size,
				onStressPage: seen.stress.size > 0,
				viewers: [...seen.viewers],
				widths: [...seen.widths].sort((a, b) => a - b),
				...(seen.components.size > 0
					? { components: [...seen.components].slice(0, 80) }
					: {}),
				...(this.selftest ? { cases: [...seen.cases] } : {}),
			};
		});
		fs.writeFileSync(
			path.join(this.runDir, "mechanical.json"),
			JSON.stringify(findings, null, "\t"),
		);
		return findings;
	}

	/** `census.json` of the run: every size in use with how often and where, for the reviewer looking at consistency. */
	saveCensus() {
		const values = {};
		for (const [kind, byValue] of Object.entries(this.census)) {
			values[kind] = Object.entries(byValue)
				.map(([value, usage]) => ({
					value: Number(value),
					token: this.tokens?.[kind]?.[value] ?? null,
					uses: usage.count,
					components: usage.signatures.size,
					pages: usage.pages.size,
					examples: [...usage.signatures].slice(0, 4),
					exampleUrl: usage.example.url,
					exampleSelector: usage.example.selector,
				}))
				.sort((a, b) => a.value - b.value);
		}
		fs.writeFileSync(
			path.join(this.runDir, "census.json"),
			JSON.stringify(
				{ tokens: this.tokens, values, counters: this.counters },
				null,
				"\t",
			),
		);
	}

	/** Merges which page shows which CSS module into `modules.json`, what `changed.mjs` maps a diff to pages with. */
	saveModules() {
		const file = path.join(OUTPUT_DIR, "modules.json");
		const merged = fs.existsSync(file)
			? JSON.parse(fs.readFileSync(file, "utf8"))
			: {};
		for (const [module, pages] of this.modulePages) {
			const known = new Set(merged[module] ?? []);
			for (const page of pages) {
				if (known.size >= PAGES_PER_MODULE) break;
				known.add(page);
			}
			merged[module] = [...known];
		}
		fs.writeFileSync(file, JSON.stringify(merged, null, "\t"));
	}
}

function viewportClass(context) {
	return context.viewportClass ?? viewportClassOfName(context.viewportName);
}

function viewportClassOfName(name) {
	const width =
		VIEWPORTS[name]?.viewport.width ?? Number(String(name).split("x")[0]);
	return viewportClassOf(width);
}

/** What makes two sightings the same finding: the rule and the component, per kind of layout. */
function keyOf(item, context) {
	const layout = viewportClass(context);
	if (item.rule === "low-contrast" || item.rule === "low-contrast-ui") {
		return item.overPicture
			? `${item.rule}|picture|${item.sig}|${context.theme}`
			: `${item.rule}|${item.colors}|${context.theme}`;
	}
	return `${item.rule}|${item.sig}|${layout}`;
}
