// which database tables code reaches: the Kysely queries of a declaration and of every declaration it references, followed across files

import type { Node } from "oxc-parser";
import {
	createCache,
	lineOf,
	type ParsedFile,
	parseFile,
	walk,
} from "./ast.ts";
import { dbTableNames } from "./db-tables.ts";
import { resolveImport } from "./source-index.ts";

const READ_METHODS = new Set([
	"selectFrom",
	"innerJoin",
	"leftJoin",
	"rightJoin",
	"fullJoin",
	"crossJoin",
	"innerJoinLateral",
	"leftJoinLateral",
	"crossJoinLateral",
]);
const WRITE_METHODS = new Set([
	"insertInto",
	"replaceInto",
	"updateTable",
	"deleteFrom",
	"mergeInto",
]);
/** Type annotations reference names that are never run, e.g. `ReturnType<typeof findById>`. */
const TYPE_NODES = new Set([
	"TSTypeAnnotation",
	"TSTypeReference",
	"TSTypeQuery",
	"TSTypeParameterInstantiation",
	"TSTypeParameterDeclaration",
	"TSTypeAliasDeclaration",
	"TSInterfaceDeclaration",
	"TSImportType",
]);
const RAW_SQL_READ_REGEX = /\b(?:from|join)\s+"(\w+)"/gi;
const RAW_SQL_WRITE_REGEX =
	/\b(?:insert\s+into|update|delete\s+from)\s+"(\w+)"/gi;
const MAX_RESOLVE_DEPTH = 10;

export interface TableAccess {
	table: string;
	reads: boolean;
	writes: boolean;
}

/** A top-level declaration of a file. */
export interface DeclarationRef {
	file: string;
	name: string;
}

export interface RepositoryCall {
	repository: string;
	name: string;
	/** The declaration the root references the call through, null when the root makes the call itself. */
	via: (DeclarationRef & { line: number }) | null;
}

export interface DataTrace {
	/** Line of the root's declaration. */
	line: number;
	/** Tables queried outside of repository functions (or, for a repository function, outside of other repositories). */
	tables: TableAccess[];
	repositoryCalls: RepositoryCall[];
}

interface DeclarationFacts {
	line: number;
	tables: TableAccess[];
	references: DeclarationRef[];
}

export function isRepositoryFile(file: string) {
	return /Repository\.server\.ts$/.test(file);
}

/**
 * The tables `root` queries and the repository functions it calls, following every declaration it references.
 * Repository functions of other repositories than the root's own are calls and not followed, unless
 * `followRepositories`, which reaches every table the root ends up querying.
 */
export function traceDeclaration(
	root: DeclarationRef,
	{ followRepositories = false } = {},
): DataTrace {
	const tables: TableAccess[] = [];
	const calls = new Map<string, RepositoryCall>();
	const visited = new Set([refKey(root)]);
	const queue: Array<{ ref: DeclarationRef; via: DeclarationRef | null }> = [
		{ ref: root, via: null },
	];

	let cursor = 0;
	while (cursor < queue.length) {
		const { ref, via } = queue[cursor++];
		const facts = factsOf(ref);
		if (!facts) continue;

		tables.push(...facts.tables);

		for (const target of facts.references) {
			const key = refKey(target);
			if (visited.has(key)) continue;
			visited.add(key);

			const isCall =
				!followRepositories &&
				isRepositoryFile(target.file) &&
				target.file !== root.file;
			if (isCall) {
				calls.set(key, {
					repository: target.file,
					name: target.name,
					via: via ? { ...via, line: factsOf(via)?.line ?? 1 } : null,
				});
				continue;
			}

			queue.push({ ref: target, via: via ?? target });
		}
	}

	return {
		line: factsOf(root)?.line ?? 1,
		tables: mergeTableAccesses(tables),
		repositoryCalls: [...calls.values()],
	};
}

const reachableTablesCache = createCache<string, TableAccess[]>();

/** Every table a declaration ends up querying, through repositories included. */
export function reachableTables(ref: DeclarationRef) {
	const key = refKey(ref);
	const cached = reachableTablesCache.get(key);
	if (cached) return cached;

	const { tables } = traceDeclaration(ref, { followRepositories: true });
	reachableTablesCache.set(key, tables);
	return tables;
}

/** Where the value `name` of `file` is declared, following imports and re-exports. */
export function resolveDeclaration(
	file: string,
	name: string,
	depth = 0,
): DeclarationRef | null {
	if (depth > MAX_RESOLVE_DEPTH || !/\.tsx?$/.test(file)) return null;
	const parsed = parseFile(file);

	if (topLevelDeclarations(parsed).has(name)) return { file, name };

	const imported = importsOf(parsed).get(name);
	if (imported) {
		return imported.importName
			? resolveDeclaration(imported.file, imported.importName, depth + 1)
			: null;
	}

	for (const statement of parsed.program.body) {
		if (statement.type !== "ExportNamedDeclaration") continue;

		for (const specifier of statement.specifiers) {
			if (nameOf(specifier.exported) !== name) continue;

			const local = nameOf(specifier.local);
			if (!statement.source) {
				return local === name
					? null
					: resolveDeclaration(file, local, depth + 1);
			}

			const resolved = resolveImport(file, statement.source.value);
			return resolved ? resolveDeclaration(resolved, local, depth + 1) : null;
		}
	}

	return null;
}

const factsCache = createCache<string, DeclarationFacts | null>();

function factsOf(ref: DeclarationRef) {
	const key = refKey(ref);
	if (factsCache.has(key)) return factsCache.get(key)!;

	const file = parseFile(ref.file);
	const declaration = topLevelDeclarations(file).get(ref.name);
	const facts = declaration ? collectFacts(file, declaration) : null;
	factsCache.set(key, facts);

	return facts;
}

function collectFacts(file: ParsedFile, declaration: Node): DeclarationFacts {
	const tableNames = dbTableNames();
	const declarations = topLevelDeclarations(file);
	const imports = importsOf(file);
	const facts: DeclarationFacts = {
		line: lineOf(file, declaration.start),
		tables: [],
		references: [],
	};

	const addTable = (name: string, writes: boolean) => {
		const table = name.split(/\s+as\s+/)[0].trim();
		if (tableNames.has(table)) {
			facts.tables.push({ table, reads: !writes, writes });
		}
	};
	const addReference = (ref: DeclarationRef | null) => {
		if (ref) facts.references.push(ref);
	};

	const visit = (node: Node): boolean | undefined => {
		if (TYPE_NODES.has(node.type)) return false;

		switch (node.type) {
			case "CallExpression": {
				const callee = node.callee;
				if (callee.type !== "MemberExpression" || callee.computed) break;
				if (callee.property.type !== "Identifier") break;
				const method = callee.property.name;

				if (READ_METHODS.has(method) || WRITE_METHODS.has(method)) {
					for (const name of stringsOf(node.arguments[0])) {
						addTable(name, WRITE_METHODS.has(method));
					}
				} else if (
					method === "table" &&
					callee.object.type === "Identifier" &&
					callee.object.name === "sql"
				) {
					for (const name of stringsOf(node.arguments[0]))
						addTable(name, false);
				}
				break;
			}
			case "TaggedTemplateExpression": {
				if (node.tag.type !== "Identifier" || node.tag.name !== "sql") break;
				const raw = node.quasi.quasis.map((quasi) => quasi.value.raw).join(" ");
				for (const [, name] of raw.matchAll(RAW_SQL_WRITE_REGEX)) {
					addTable(name, true);
				}
				const withoutWrites = raw.replace(RAW_SQL_WRITE_REGEX, "");
				for (const [, name] of withoutWrites.matchAll(RAW_SQL_READ_REGEX)) {
					addTable(name, false);
				}
				break;
			}
			case "MemberExpression": {
				if (node.computed) break;
				const namespace =
					node.object.type === "Identifier"
						? imports.get(node.object.name)
						: undefined;
				if (namespace && !namespace.importName) {
					if (node.property.type === "Identifier") {
						addReference(
							resolveDeclaration(namespace.file, node.property.name),
						);
					}
					return false;
				}
				walk(node.object, visit);
				return false;
			}
			case "Property":
			case "MethodDefinition":
			case "PropertyDefinition": {
				if (node.computed) break;
				if (node.value) walk(node.value, visit);
				return false;
			}
			case "Identifier": {
				if (declarations.has(node.name)) {
					addReference({ file: file.path, name: node.name });
					break;
				}
				const imported = imports.get(node.name);
				if (imported?.importName) {
					addReference(resolveDeclaration(imported.file, imported.importName));
				}
				break;
			}
		}

		return;
	};

	walk(declaration, visit);

	return facts;
}

const declarationsCache = createCache<string, Map<string, Node>>();

/** Functions, classes and variables declared at the top level of a file, exported or not. */
function topLevelDeclarations(file: ParsedFile) {
	const cached = declarationsCache.get(file.path);
	if (cached) return cached;

	const declarations = new Map<string, Node>();
	for (const statement of file.program.body) {
		const declaration =
			statement.type === "ExportNamedDeclaration" ||
			statement.type === "ExportDefaultDeclaration"
				? statement.declaration
				: statement;
		if (!declaration) continue;

		switch (declaration.type) {
			case "FunctionDeclaration":
			case "ClassDeclaration":
				if (declaration.id) declarations.set(declaration.id.name, declaration);
				break;
			case "VariableDeclaration":
				for (const declarator of declaration.declarations) {
					if (declarator.id.type === "Identifier") {
						declarations.set(declarator.id.name, declarator);
					}
				}
				break;
		}
	}
	declarationsCache.set(file.path, declarations);

	return declarations;
}

const importsCache = createCache<
	string,
	Map<string, { file: string; importName: string | null }>
>();

/** Value imports of app files by local name, `importName` null for a namespace import. */
function importsOf(file: ParsedFile) {
	const cached = importsCache.get(file.path);
	if (cached) return cached;

	const imports = new Map<
		string,
		{ file: string; importName: string | null }
	>();
	for (const entry of file.imports) {
		const resolved = resolveImport(file.path, entry.moduleRequest.value);
		if (!resolved) continue;

		for (const specifier of entry.entries) {
			if (specifier.isType) continue;
			imports.set(specifier.localName.value, {
				file: resolved,
				importName:
					specifier.importName.kind === "NamespaceObject"
						? null
						: (specifier.importName.name ?? "default"),
			});
		}
	}
	importsCache.set(file.path, imports);

	return imports;
}

function stringsOf(node: Node | undefined): string[] {
	if (!node) return [];
	if (node.type === "Literal" && typeof node.value === "string") {
		return [node.value];
	}
	if (node.type === "ArrayExpression") {
		return node.elements.flatMap((element) =>
			element ? stringsOf(element as Node) : [],
		);
	}

	return [];
}

/** Accesses of the same table merged into one. */
export function mergeTableAccesses(accesses: TableAccess[]): TableAccess[] {
	const merged = new Map<string, TableAccess>();
	for (const access of accesses) {
		const existing = merged.get(access.table);
		merged.set(access.table, {
			table: access.table,
			reads: access.reads || (existing?.reads ?? false),
			writes: access.writes || (existing?.writes ?? false),
		});
	}

	return [...merged.values()].sort((a, b) => a.table.localeCompare(b.table));
}

function nameOf(node: Node) {
	if (node.type === "Identifier") return node.name;
	if (node.type === "Literal") return String(node.value);
	return "";
}

function refKey(ref: DeclarationRef) {
	return `${ref.file}#${ref.name}`;
}
