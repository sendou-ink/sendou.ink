/** biome-ignore-all lint/suspicious/noConsole: script */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseSync } from "vite";

// Generates the index of where each translation key is used (source files and the routes rendering them)
// shown on the /translate page. Literal keys are matched exactly, template literals (t(`sorts.${x}`)) by
// their static prefix and the route of a file is found by following imports from each route module.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "app");
const OUTPUT_PATH = path.join(ROOT, "translation-usage.json");
const ENGLISH_LOCALES_PATH = path.join(ROOT, "locales", "en");
const ROOT_MODULE = "root.tsx";

const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const NAMESPACE_DECLARING_FUNCTIONS = ["useTranslation", "getServerTFunction"];
const PLURAL_SUFFIXES = ["_one", "_other"];
const MIN_TEMPLATE_PREFIX_LENGTH = 3;

type RouteEntry = {
	file: string;
	path?: string;
	index?: boolean;
	children?: RouteEntry[];
};

type ParsedFile = {
	imports: string[];
	namespaces: string[];
	literals: string[];
	templatePrefixes: string[];
};

const startedAt = performance.now();

const knownIds = loadKnownIds();
const files = listSourceFiles(APP);
const parsed = new Map(files.map((file) => [file, parseFile(file)]));

const routes = flattenRoutes(
	(await import(pathToFileURL(path.join(APP, "routes.ts")).href))
		.default as RouteEntry[],
);
const siteWideFiles = reachableFrom(ROOT_MODULE);
// a layout route and its index route share a path
const routePaths = [...new Set(routes.map((route) => route.path))];
const routesByFile = new Map<string, Set<number>>();
for (const route of routes) {
	for (const file of reachableFrom(route.file)) {
		if (!routesByFile.has(file)) routesByFile.set(file, new Set());
		routesByFile.get(file)!.add(routePaths.indexOf(route.path));
	}
}

const filePaths: string[] = [];
const usage: Record<string, { f: number[]; r: number[]; s?: 1 }> = {};

for (const [file, { namespaces, literals, templatePrefixes }] of parsed) {
	const ids = new Set<string>();
	for (const literal of literals) {
		for (const id of matchLiteral(literal, namespaces)) ids.add(id);
	}
	for (const prefix of templatePrefixes) {
		for (const id of matchPrefix(prefix, namespaces)) ids.add(id);
	}
	if (ids.size === 0) continue;

	const fileIdx = filePaths.push(`app/${file}`) - 1;
	for (const id of ids) {
		usage[id] ??= { f: [], r: [] };
		const entry = usage[id];
		entry.f.push(fileIdx);
		if (siteWideFiles.has(file)) entry.s = 1;
		for (const routeIdx of routesByFile.get(file) ?? []) {
			if (!entry.r.includes(routeIdx)) entry.r.push(routeIdx);
		}
	}
}

for (const entry of Object.values(usage)) {
	entry.r.sort((a, b) => a - b);
}

fs.writeFileSync(
	OUTPUT_PATH,
	JSON.stringify({ routes: routePaths, files: filePaths, keys: usage }),
);

console.info(
	`Translation usage of ${Object.keys(usage).length} keys written to ${path.relative(ROOT, OUTPUT_PATH)} in ${Math.round(performance.now() - startedAt)}ms`,
);

/** Namespace -> ids of its keys, plural keys also by their id without the suffix */
function loadKnownIds() {
	const result = new Map<string, Set<string>>();

	for (const file of fs.readdirSync(ENGLISH_LOCALES_PATH)) {
		const namespace = file.replace(".json", "");
		const keys = Object.keys(
			JSON.parse(
				fs.readFileSync(path.join(ENGLISH_LOCALES_PATH, file), "utf8"),
			),
		);

		const ids = new Set<string>();
		for (const key of keys) {
			const suffix = PLURAL_SUFFIXES.find((sfx) => key.endsWith(sfx));
			ids.add(suffix ? key.slice(0, -suffix.length) : key);
			ids.add(key);
		}
		result.set(namespace, ids);
	}

	return result;
}

function matchLiteral(literal: string, fileNamespaces: string[]): string[] {
	const separatorIdx = literal.indexOf(":");
	if (separatorIdx !== -1) {
		const namespace = literal.slice(0, separatorIdx);
		const id = literal.slice(separatorIdx + 1);
		if (knownIds.get(namespace)?.has(id)) return [`${namespace}:${id}`];
	}

	const candidates =
		fileNamespaces.length > 0 ? fileNamespaces : [...knownIds.keys()];
	// bare words in files declaring no namespace are more likely e.g. object keys than translation keys
	if (fileNamespaces.length === 0 && !literal.includes(".")) return [];

	return candidates
		.filter((namespace) => knownIds.get(namespace)?.has(literal))
		.map((namespace) => `${namespace}:${literal}`);
}

function matchPrefix(prefix: string, fileNamespaces: string[]): string[] {
	let namespaces = fileNamespaces;
	let idPrefix = prefix;

	const separatorIdx = prefix.indexOf(":");
	if (separatorIdx !== -1 && knownIds.has(prefix.slice(0, separatorIdx))) {
		namespaces = [prefix.slice(0, separatorIdx)];
		idPrefix = prefix.slice(separatorIdx + 1);
	}

	if (idPrefix.length < MIN_TEMPLATE_PREFIX_LENGTH) return [];

	return namespaces.flatMap((namespace) =>
		[...(knownIds.get(namespace) ?? [])]
			.filter((id) => id.startsWith(idPrefix))
			.map((id) => `${namespace}:${id}`),
	);
}

function listSourceFiles(dir: string): string[] {
	return fs
		.readdirSync(dir, { recursive: true, encoding: "utf8" })
		.filter(
			(file) =>
				SOURCE_EXTENSIONS.includes(path.extname(file)) &&
				!file.includes(".test.") &&
				!file.endsWith(".d.ts"),
		)
		.map((file) => file.split(path.sep).join("/"));
}

function parseFile(file: string): ParsedFile {
	const result: ParsedFile = {
		imports: [],
		namespaces: [],
		literals: [],
		templatePrefixes: [],
	};

	const source = fs.readFileSync(path.join(APP, file), "utf8");
	const { program } = parseSync(file, source);

	const visit = (node: unknown) => {
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (!node || typeof node !== "object") return;

		const n = node as Record<string, any>;

		switch (n.type) {
			case "ImportDeclaration":
				if (n.importKind !== "type") result.imports.push(n.source.value);
				return;
			case "ExportNamedDeclaration":
			case "ExportAllDeclaration":
				if (n.source && n.exportKind !== "type") {
					result.imports.push(n.source.value);
				}
				break;
			case "ImportExpression":
				if (typeof n.source?.value === "string") {
					result.imports.push(n.source.value);
				}
				break;
			case "CallExpression":
				if (NAMESPACE_DECLARING_FUNCTIONS.includes(n.callee?.name)) {
					result.namespaces.push(...stringValues(n.arguments[0]));
				}
				break;
			case "Literal":
				if (typeof n.value === "string") result.literals.push(n.value);
				return;
			case "TemplateLiteral":
				if (n.expressions.length === 0) {
					result.literals.push(n.quasis[0].value.cooked);
				} else {
					result.templatePrefixes.push(n.quasis[0].value.cooked);
				}
				break;
			case "TSTypeAnnotation":
			case "TSTypeAliasDeclaration":
			case "TSInterfaceDeclaration":
				return;
		}

		for (const [key, value] of Object.entries(n)) {
			if (key === "type" || key === "start" || key === "end") continue;
			visit(value);
		}
	};
	visit(program.body);

	return result;
}

function stringValues(node: any): string[] {
	if (!node) return [];
	if (node.type === "Literal" && typeof node.value === "string") {
		return [node.value];
	}
	if (node.type === "ArrayExpression")
		return node.elements.flatMap(stringValues);
	if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression") {
		return stringValues(node.expression);
	}

	return [];
}

function reachableFrom(entry: string) {
	const seen = new Set<string>();
	const queue = [entry];

	while (queue.length > 0) {
		const file = queue.pop()!;
		if (seen.has(file)) continue;
		seen.add(file);

		for (const specifier of parsed.get(file)?.imports ?? []) {
			const resolved = resolveImport(file, specifier);
			if (resolved && !seen.has(resolved)) queue.push(resolved);
		}
	}

	return seen;
}

function resolveImport(fromFile: string, specifier: string) {
	let base: string;
	if (specifier.startsWith("~/")) {
		base = specifier.slice(2);
	} else if (specifier.startsWith(".")) {
		base = path.posix.join(path.posix.dirname(fromFile), specifier);
	} else {
		return null;
	}

	const candidates = [
		base,
		...SOURCE_EXTENSIONS.map((ext) => `${base}${ext}`),
		...SOURCE_EXTENSIONS.map((ext) => `${base}/index${ext}`),
	];

	return candidates.find((candidate) => parsed.has(candidate)) ?? null;
}

function flattenRoutes(entries: RouteEntry[], parentPath = "") {
	const result: Array<{ file: string; path: string }> = [];

	for (const entry of entries) {
		const fullPath = entry.path
			? path.posix.join(parentPath || "/", entry.path)
			: parentPath || "/";

		result.push({ file: entry.file, path: fullPath });
		result.push(...flattenRoutes(entry.children ?? [], fullPath));
	}

	return result;
}
