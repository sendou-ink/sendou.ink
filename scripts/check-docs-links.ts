/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

// checks that every internal link of the built docs site (docs/site/dist) leads to a page, and to an
// element of it when it has a #hash, run by `pnpm run docs:build`

import fs from "node:fs";
import path from "node:path";

const DIST_DIR = path.join(import.meta.dirname, "..", "docs/site/dist");
/** The site is served from the root of its domain (docs.sendou.ink). */
const BASE = "/";
/** Stands in for wherever the site is hosted when resolving its links. */
const SITE_ORIGIN = "http://docs-site.invalid";
const LINK_REGEX = /<a\b[^>]*?\shref="([^"]*)"/g;
const ID_REGEX = /\sid="([^"]+)"/g;

const pages = new Map<string, { ids: Set<string>; links: string[] }>();
for (const file of htmlFiles(DIST_DIR)) {
	const html = fs.readFileSync(file, "utf8");
	pages.set(path.relative(DIST_DIR, file), {
		ids: new Set(
			[...html.matchAll(ID_REGEX)].map(([, id]) => decodeEntities(id)),
		),
		links: [...html.matchAll(LINK_REGEX)].map(([, href]) =>
			decodeEntities(href),
		),
	});
}

const broken: string[] = [];
for (const [page, { links }] of pages) {
	const pageUrl = new URL(
		`${BASE}${page.replace(/index\.html$/, "")}`,
		SITE_ORIGIN,
	);

	for (const href of new Set(links)) {
		if (/^[a-z]+:/i.test(href) && !href.startsWith(SITE_ORIGIN)) continue;

		const url = new URL(href, pageUrl);
		if (!url.pathname.startsWith(BASE)) {
			broken.push(`${page}: ${href} (outside the site's base ${BASE})`);
			continue;
		}

		const target = targetPage(
			decodeURIComponent(url.pathname.slice(BASE.length)),
		);
		if (target === undefined) {
			if (
				!fs.existsSync(path.join(DIST_DIR, url.pathname.slice(BASE.length)))
			) {
				broken.push(`${page}: ${href} (no such page)`);
			}
			continue;
		}

		const hash = decodeURIComponent(url.hash.slice(1));
		if (hash && hash !== "_top" && !pages.get(target)!.ids.has(hash)) {
			broken.push(`${page}: ${href} (no #${hash} on ${target})`);
		}
	}
}

if (broken.length > 0) {
	console.error(
		`${broken.length} broken links in the docs site:\n${broken.join("\n")}`,
	);
	process.exit(1);
}
console.log(`docs site links ok (${pages.size} pages)`);

function targetPage(sitePath: string) {
	for (const candidate of [
		sitePath,
		`${sitePath.replace(/\/?$/, "/")}index.html`,
	]) {
		const normalized = candidate.replace(/^\//, "");
		if (pages.has(normalized)) return normalized;
	}

	return undefined;
}

function htmlFiles(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return htmlFiles(full);
		return entry.name.endsWith(".html") ? [full] : [];
	});
}

function decodeEntities(text: string) {
	return text
		.replaceAll("&amp;", "&")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">");
}
