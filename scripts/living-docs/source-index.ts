import fs from "node:fs";
import path from "node:path";
import {
	createCache,
	lineOf,
	type ParsedFile,
	parseFile,
	ROOT,
	walk,
} from "./ast.ts";

const SOURCE_DIRS = ["app", "e2e", "scripts"];
const IGNORED_DIRS = new Set(["node_modules", "output", "living-docs"]);
const RESOLVE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export interface Usage {
	file: string;
	line: number;
	exportName: string;
}

/** Repo relative paths of every TypeScript file the docs look for usages in. */
export function allSourceFiles() {
	const files: string[] = [];

	const visit = (dir: string) => {
		const entries = fs
			.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
			.sort((a, b) => (a.name < b.name ? -1 : 1));
		for (const entry of entries) {
			const relative = `${dir}/${entry.name}`;
			if (entry.isDirectory()) {
				if (!IGNORED_DIRS.has(entry.name)) visit(relative);
			} else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
				files.push(relative);
			}
		}
	};
	for (const dir of SOURCE_DIRS) visit(dir);

	return files;
}

/** Resolves an import specifier of `fromFile` to a repo relative file path, null for packages. */
export function resolveImport(fromFile: string, specifier: string) {
	let base: string;
	if (specifier.startsWith("~/")) base = `app/${specifier.slice(2)}`;
	else if (specifier.startsWith(".")) {
		base = path.posix.normalize(
			path.posix.join(path.posix.dirname(fromFile), specifier),
		);
	} else return null;

	for (const suffix of RESOLVE_SUFFIXES) {
		const candidate = `${base}${suffix}`;
		if (
			fs.existsSync(path.join(ROOT, candidate)) &&
			fs.statSync(path.join(ROOT, candidate)).isFile()
		)
			return candidate;
	}

	return null;
}

/** Repo relative paths of the files `file` imports values (not only types) from. */
export function importsOf(file: string) {
	const parsed = parseFile(file);

	return parsed.imports
		.filter(
			(entry) =>
				entry.entries.length === 0 ||
				entry.entries.some((specifier) => !specifier.isType),
		)
		.map((entry) => resolveImport(file, entry.moduleRequest.value))
		.filter((resolved): resolved is string => resolved !== null);
}

/** Every named or namespace member use of `modulePath`'s exports across the source files. */
export function usagesOf(modulePath: string, files: string[]) {
	const moduleBaseName = path.basename(modulePath).replace(/\.tsx?$/, "");
	const importStem = moduleBaseName.replace(/\.server$/, "");
	const usages: Usage[] = [];

	for (const file of files) {
		if (file === modulePath) continue;
		if (!sourceOf(file).includes(importStem)) continue;

		usages.push(...usagesInFile(parseFile(file), modulePath));
	}

	return usages;
}

const sources = createCache<string, string>();

function sourceOf(file: string) {
	const cached = sources.get(file);
	if (cached !== undefined) return cached;

	const source = fs.readFileSync(path.join(ROOT, file), "utf8");
	sources.set(file, source);
	return source;
}

function usagesInFile(file: ParsedFile, modulePath: string) {
	const usages: Usage[] = [];
	const namespaces = new Set<string>();

	for (const entry of file.imports) {
		if (resolveImport(file.path, entry.moduleRequest.value) !== modulePath) {
			continue;
		}

		for (const specifier of entry.entries) {
			if (specifier.importName.kind === "NamespaceObject") {
				namespaces.add(specifier.localName.value);
			} else if (specifier.importName.name) {
				usages.push({
					file: file.path,
					line: lineOf(file, entry.start),
					exportName: specifier.importName.name,
				});
			}
		}
	}

	if (namespaces.size === 0) return usages;

	const seen = new Set<string>();
	walk(file.program, (node) => {
		let namespace: string | null = null;
		let member: string | null = null;

		if (
			node.type === "MemberExpression" &&
			!node.computed &&
			node.object.type === "Identifier" &&
			node.property.type === "Identifier"
		) {
			namespace = node.object.name;
			member = node.property.name;
		} else if (
			node.type === "TSQualifiedName" &&
			node.left.type === "Identifier"
		) {
			namespace = node.left.name;
			member = node.right.name;
		}

		if (!namespace || !member || !namespaces.has(namespace)) return;

		const line = lineOf(file, node.start);
		const key = `${member}:${line}`;
		if (seen.has(key)) return;
		seen.add(key);

		usages.push({ file: file.path, line, exportName: member });
		return;
	});

	return usages;
}
