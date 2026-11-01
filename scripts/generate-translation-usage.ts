/** biome-ignore-all lint/suspicious/noConsole: script */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseSync } from "vite";

// Generates the index of where each translation key is used (source files and the routes rendering them)
// shown on the /translate page. Literal keys are matched exactly, template literals (t(`sorts.${x}`)) by
// their static parts and the route of a file is found by following imports from each route module.
// With --check-unused it instead fails if a key of the English translations is used nowhere.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "app");
const OUTPUT_PATH = path.join(ROOT, "translation-usage.json");
const ENGLISH_LOCALES_PATH = path.join(ROOT, "locales", "en");
const ROOT_MODULE = "root.tsx";
const DEFAULT_NAMESPACE = "common";
// keyed by in-game ids that are listed in app/modules/in-game-lists and translated as t(`game-badges:${id}`)
const GAME_DATA_NAMESPACES = ["game-badges"];

const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const NAMESPACE_DECLARING_FUNCTIONS = ["useTranslation", "getServerTFunction"];
const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"];
const MIN_TEMPLATE_STATIC_LENGTH = 3;

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
	templates: string[][];
};

const startedAt = performance.now();

const englishKeys = loadEnglishKeys();
const knownIds = knownIdsOf(englishKeys);
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

for (const [file, { namespaces, literals, templates }] of parsed) {
	const ids = new Set<string>();
	for (const literal of literals) {
		for (const id of matchLiteral(literal, namespaces)) ids.add(id);
	}
	for (const parts of templates) {
		for (const id of matchTemplate(parts, namespaces)) ids.add(id);
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

if (process.argv.includes("--check-unused")) {
	const unusedKeys = findUnusedKeys();
	if (unusedKeys.length > 0) {
		console.error(
			`Unused translation keys found, delete them from locales/en and run "pnpm run i18n:sync":\n${unusedKeys.join("\n")}`,
		);
		process.exit(1);
	}
	console.info("No unused translation keys");
} else {
	fs.writeFileSync(
		OUTPUT_PATH,
		JSON.stringify({ routes: routePaths, files: filePaths, keys: usage }),
	);

	console.info(
		`Translation usage of ${Object.keys(usage).length} keys written to ${path.relative(ROOT, OUTPUT_PATH)} in ${Math.round(performance.now() - startedAt)}ms`,
	);
}

function loadEnglishKeys() {
	return new Map(
		fs
			.readdirSync(ENGLISH_LOCALES_PATH)
			.map((file) => [
				file.replace(".json", ""),
				Object.keys(
					JSON.parse(
						fs.readFileSync(path.join(ENGLISH_LOCALES_PATH, file), "utf8"),
					),
				),
			]),
	);
}

/** Namespace -> ids of its keys, plural keys also by their id without the suffix */
function knownIdsOf(keysByNamespace: Map<string, string[]>) {
	return new Map(
		[...keysByNamespace].map(([namespace, keys]) => [
			namespace,
			new Set(keys.flatMap((key) => [key, withoutPluralSuffix(key)])),
		]),
	);
}

function findUnusedKeys() {
	const result: string[] = [];

	for (const [namespace, keys] of englishKeys) {
		for (const key of keys) {
			if (
				!usage[`${namespace}:${key}`] &&
				!usage[`${namespace}:${withoutPluralSuffix(key)}`]
			) {
				result.push(`${namespace}:${key}`);
			}
		}
	}

	return result;
}

function withoutPluralSuffix(key: string) {
	const suffix = PLURAL_SUFFIXES.find((sfx) => key.endsWith(sfx));
	return suffix ? key.slice(0, -suffix.length) : key;
}

function matchLiteral(literal: string, fileNamespaces: string[]): string[] {
	const separatorIdx = literal.indexOf(":");
	if (separatorIdx !== -1) {
		const namespace = literal.slice(0, separatorIdx);
		const id = literal.slice(separatorIdx + 1);
		if (knownIds.get(namespace)?.has(id)) return [`${namespace}:${id}`];
	}

	// bare words in files declaring no namespace are more likely e.g. object keys than translation keys
	const candidates =
		fileNamespaces.length > 0
			? [...fileNamespaces, ...GAME_DATA_NAMESPACES]
			: literal.includes(".")
				? [...knownIds.keys()]
				: GAME_DATA_NAMESPACES;

	return candidates
		.filter((namespace) => knownIds.get(namespace)?.has(literal))
		.map((namespace) => `${namespace}:${literal}`);
}

function matchTemplate(parts: string[], fileNamespaces: string[]): string[] {
	const separatorIdx = parts[0].indexOf(":");
	const explicitNamespace = parts[0].slice(0, separatorIdx);
	const hasExplicitNamespace =
		separatorIdx !== -1 && knownIds.has(explicitNamespace);
	const idParts = hasExplicitNamespace
		? [parts[0].slice(separatorIdx + 1), ...parts.slice(1)]
		: parts;
	const staticPart = idParts.join("");

	let namespaces = fileNamespaces;
	if (hasExplicitNamespace) {
		if (staticPart.length === 0) return [];
		namespaces = [explicitNamespace];
	} else {
		if (staticPart.length < MIN_TEMPLATE_STATIC_LENGTH) return [];
		// same reasoning as with bare words in matchLiteral
		if (namespaces.length === 0) {
			if (!staticPart.includes(".")) return [];
			namespaces = [...knownIds.keys()];
		}
	}

	const pattern = new RegExp(
		`^${idParts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".+")}$`,
	);

	return namespaces.flatMap((namespace) =>
		[...(knownIds.get(namespace) ?? [])]
			.filter((id) => pattern.test(id))
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
		templates: [],
	};

	const source = fs.readFileSync(path.join(APP, file), "utf8");
	const { program } = parseSync(file, source);

	const visit = (node: unknown, parentInType = false) => {
		if (Array.isArray(node)) {
			for (const child of node) visit(child, parentInType);
			return;
		}
		if (!node || typeof node !== "object") return;

		const n = node as Record<string, any>;
		let inType = parentInType;

		if (inType) {
			if (n.type === "TSTypeReference" && n.typeName?.name === "TFunction") {
				result.namespaces.push(...typeStringValues(n.typeArguments?.params[0]));
				return;
			}
		} else {
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
						result.namespaces.push(
							...(n.arguments.length === 0
								? [DEFAULT_NAMESPACE]
								: stringValues(n.arguments[0])),
						);
					}
					break;
				case "JSXAttribute":
					// bare words as plain attributes are e.g. content="yes" or type="button"
					if (
						n.value?.type === "Literal" &&
						n.name.name !== "i18nKey" &&
						!n.value.value.includes(".")
					) {
						return;
					}
					break;
				case "Literal":
					if (typeof n.value === "string") result.literals.push(n.value);
					return;
				case "TemplateLiteral":
					if (n.expressions.length === 0) {
						result.literals.push(n.quasis[0].value.cooked);
					} else {
						result.templates.push(
							n.quasis.map((quasi: any) => quasi.value.cooked),
						);
					}
					break;
				case "TSTypeAnnotation":
				case "TSTypeReference":
				case "TSTypeAliasDeclaration":
				case "TSInterfaceDeclaration":
					inType = true;
					break;
			}
		}

		for (const [key, value] of Object.entries(n)) {
			if (key === "type" || key === "start" || key === "end") continue;
			visit(value, inType);
		}
	};
	visit(program.body);
	result.namespaces = [...new Set(result.namespaces)];

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

function typeStringValues(node: any): string[] {
	if (!node) return [];
	if (node.type === "TSLiteralType" && typeof node.literal.value === "string") {
		return [node.literal.value];
	}
	if (node.type === "TSTupleType") {
		return node.elementTypes.flatMap(typeStringValues);
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
