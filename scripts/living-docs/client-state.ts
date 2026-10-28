import fs from "node:fs";
import path from "node:path";
import type { Node } from "oxc-parser";
import {
	jsDocOf,
	lineOf,
	type ParsedFile,
	parseFile,
	ROOT,
	textOf,
	walk,
} from "./ast.ts";
import { featureOfFile } from "./features.ts";
import { highlight } from "./highlight.ts";
import { isTestFile } from "./modules.ts";
import { resolveImport, usagesOf } from "./source-index.ts";

const SEARCH_PARAMS_MODULE = "app/modules/search-params/search-params.ts";
const PERSISTED_STATE_MODULE = "app/modules/persisted-state/persisted-state.ts";
const MAX_RESOLVE_DEPTH = 3;

export interface StateUsage {
	file: string;
	lines: number[];
}

export interface SearchParamDoc {
	/** The param's name in the URL. */
	name: string;
	/** Which `SP` helper declares it, null when it is not an `SP.*` call. */
	helper: "param" | "json" | "custom" | "page" | null;
	/** The value schema (or codec for `SP.custom`) as highlighted HTML. */
	schemaHtml: string | null;
	/** Source of the default, `null` for nullable params declaring none. */
	default: string;
	/** Source of the `loader` option. */
	loader: string | null;
	resets: string[];
	compress: boolean;
	timeDependent: boolean;
	/** Another definition's param reused as is, e.g. `weaponLandingSearchParams.shape.category`. */
	sharedFrom: string | null;
	description: string;
	line: number;
}

interface StateDefinitionBase {
	/** The const holding the definition. */
	name: string;
	exported: boolean;
	file: string;
	line: number;
	/** Feature folder, or the directory of files outside them. */
	feature: string;
	description: string;
	/** Where an exported definition is imported, test files excluded. */
	usages: StateUsage[];
	/** Lines of its own file using it, the declaration excluded. */
	localLines: number[];
	/** Test files using it, typically for the `assertRoundTrips` test every definition gets. */
	testFiles: string[];
}

export interface SearchParamsDefinitionDoc extends StateDefinitionBase {
	kind: "searchParams";
	params: SearchParamDoc[];
}

export interface PersistedStateDoc extends StateDefinitionBase {
	kind: "persisted";
	/** `defineMap` declares a family of keys sharing `key` as their prefix. */
	isMap: boolean;
	/** The storage key, or the key prefix of a map. Source text when not a string literal. */
	key: string;
	storage: string;
	schemaHtml: string | null;
	default: string | null;
	/** Other definitions whose storage key is the same (or within this map's prefix). */
	collidesWith: string[];
}

export type ClientStateDoc = SearchParamsDefinitionDoc | PersistedStateDoc;

/** Every `SearchParams.define` and `PersistedState.define`/`defineMap` of `app/`, in file order. */
export function documentClientState(sourceFiles: string[]): ClientStateDoc[] {
	const appFiles = sourceFiles.filter(
		(file) => file.startsWith("app/") && !isTestFile(file),
	);
	const definitions: ClientStateDoc[] = [];

	for (const file of appFiles) {
		if (file === SEARCH_PARAMS_MODULE || file === PERSISTED_STATE_MODULE) {
			continue;
		}
		const source = fs.readFileSync(path.join(ROOT, file), "utf8");
		if (
			!source.includes("search-params/search-params") &&
			!source.includes("persisted-state/persisted-state")
		) {
			continue;
		}

		definitions.push(...definitionsOf(parseFile(file), sourceFiles));
	}

	copySharedParams(
		definitions.filter(
			(definition): definition is SearchParamsDefinitionDoc =>
				definition.kind === "searchParams",
		),
	);
	markCollisions(
		definitions.filter(
			(definition): definition is PersistedStateDoc =>
				definition.kind === "persisted",
		),
	);

	return definitions;
}

function definitionsOf(file: ParsedFile, sourceFiles: string[]) {
	const defineCallees = defineCalleesOf(file);
	if (defineCallees.size === 0) return [];

	const definitions: ClientStateDoc[] = [];
	let usages: ReturnType<typeof usagesOf> | null = null;

	for (const statement of file.program.body) {
		const exported = statement.type === "ExportNamedDeclaration";
		const declaration = exported ? statement.declaration : statement;
		if (declaration?.type !== "VariableDeclaration") continue;

		for (const declarator of declaration.declarations) {
			const init = declarator.init;
			if (
				declarator.id.type !== "Identifier" ||
				init?.type !== "CallExpression"
			) {
				continue;
			}
			const callee = defineCallees.get(textOf(file, init.callee));
			const options = init.arguments[0];
			if (!callee || options?.type !== "ObjectExpression") continue;

			const name = declarator.id.name;
			if (exported) usages ??= usagesOf(file.path, sourceFiles);
			const ownUsages = (usages ?? []).filter(
				(usage) => usage.exportName === name,
			);

			const base = {
				name,
				exported,
				file: file.path,
				line: lineOf(file, declarator.start),
				feature: featureOfFile(file.path),
				description: jsDocOf(file, statement.start)?.description ?? "",
				usages: groupByFile(
					ownUsages.filter((usage) => !isTestFile(usage.file)),
				),
				localLines: localReferenceLines(file, name, declarator.id.start),
				testFiles: [
					...new Set(
						ownUsages
							.filter((usage) => isTestFile(usage.file))
							.map((usage) => usage.file),
					),
				],
			};

			definitions.push(
				callee === "searchParams"
					? {
							...base,
							kind: "searchParams",
							params: searchParamsOf(file, options),
						}
					: persistedStateOf(file, options, base, callee === "persistedMap"),
			);
		}
	}

	return definitions;
}

/** Callee source (`SearchParams.define`, `define`) → what it defines, from the file's imports of the two modules. */
function defineCalleesOf(file: ParsedFile) {
	const callees = new Map<
		string,
		"searchParams" | "persisted" | "persistedMap"
	>();

	for (const entry of file.imports) {
		const resolved = resolveImport(file.path, entry.moduleRequest.value);
		if (
			resolved !== SEARCH_PARAMS_MODULE &&
			resolved !== PERSISTED_STATE_MODULE
		) {
			continue;
		}
		const isSearchParams = resolved === SEARCH_PARAMS_MODULE;

		for (const specifier of entry.entries) {
			const local = specifier.localName.value;
			if (specifier.importName.kind === "NamespaceObject") {
				if (isSearchParams) callees.set(`${local}.define`, "searchParams");
				else {
					callees.set(`${local}.define`, "persisted");
					callees.set(`${local}.defineMap`, "persistedMap");
				}
			} else if (specifier.importName.name === "define") {
				callees.set(local, isSearchParams ? "searchParams" : "persisted");
			} else if (specifier.importName.name === "defineMap" && !isSearchParams) {
				callees.set(local, "persistedMap");
			}
		}
	}

	return callees;
}

function searchParamsOf(file: ParsedFile, shape: ObjectExpression) {
	const params: SearchParamDoc[] = [];

	for (const property of shape.properties) {
		if (property.type !== "Property") continue;
		const name = keyName(property.key);
		if (!name) continue;

		const value = resolveLocal(file, property.value);
		const helper =
			value.type === "CallExpression" &&
			value.callee.type === "MemberExpression" &&
			!value.callee.computed &&
			value.callee.property.type === "Identifier"
				? value.callee.property.name
				: null;
		const isSpHelper =
			helper === "param" ||
			helper === "json" ||
			helper === "custom" ||
			helper === "page";
		const args = value.type === "CallExpression" ? value.arguments : [];
		const schema = helper === "page" ? null : (args[0] ?? null);
		const options = objectProperties(
			file,
			helper === "page" ? args[0] : args[1],
		);
		const sharedFrom =
			value.type === "MemberExpression" ? textOf(file, value) : null;

		params.push({
			name,
			helper: isSpHelper ? helper : null,
			schemaHtml: isSpHelper
				? schema
					? highlight(textOf(file, schema))
					: null
				: highlight(textOf(file, value)),
			default: options.get("default") ?? (helper === "page" ? "1" : "null"),
			loader: options.get("loader") ?? (helper === "page" ? "true" : null),
			resets: stringItems(options.get("resets")),
			compress: options.get("compress") === "true",
			timeDependent: options.get("timeDependent") === "true",
			sharedFrom,
			description: jsDocOf(file, property.start)?.description ?? "",
			line: lineOf(file, property.start),
		});
	}

	return params;
}

function persistedStateOf(
	file: ParsedFile,
	options: ObjectExpression,
	base: Omit<
		PersistedStateDoc,
		| "kind"
		| "isMap"
		| "key"
		| "storage"
		| "schemaHtml"
		| "default"
		| "collidesWith"
	>,
	isMap: boolean,
): PersistedStateDoc {
	const properties = objectProperties(file, options);
	const schema = properties.get("schema");

	return {
		...base,
		kind: "persisted",
		isMap,
		key: unquote(properties.get(isMap ? "keyPrefix" : "key") ?? ""),
		storage: unquote(properties.get("storage") ?? ""),
		schemaHtml: schema ? highlight(schema) : null,
		default: properties.get("default") ?? null,
		collidesWith: [],
	};
}

/** Fills in a param reused from another definition (`other.shape.key`) with what that one declares. */
function copySharedParams(definitions: SearchParamsDefinitionDoc[]) {
	for (const definition of definitions) {
		definition.params = definition.params.map((param) => {
			const [, definitionName, key] =
				param.sharedFrom?.match(/^(\w+)\.shape\.(\w+)$/) ?? [];
			const source = definitions
				.find((other) => other.name === definitionName)
				?.params.find((other) => other.name === key);
			if (!source) return param;

			return {
				...source,
				name: param.name,
				sharedFrom: param.sharedFrom,
				description: param.description || source.description,
				line: param.line,
			};
		});
	}
}

function markCollisions(definitions: PersistedStateDoc[]) {
	for (const definition of definitions) {
		definition.collidesWith = definitions
			.filter(
				(other) =>
					other !== definition &&
					other.storage === definition.storage &&
					(other.key === definition.key ||
						(definition.isMap && other.key.startsWith(definition.key)) ||
						(other.isMap && definition.key.startsWith(other.key))),
			)
			.map((other) => `${other.file}#${other.name}`);
	}
}

type ObjectExpression = Extract<Node, { type: "ObjectExpression" }>;

/** Property name → value source of an object literal, empty for anything else. */
function objectProperties(file: ParsedFile, node: Node | undefined | null) {
	const properties = new Map<string, string>();
	const object = node ? resolveLocal(file, node) : null;
	if (object?.type !== "ObjectExpression") return properties;

	for (const property of object.properties) {
		if (property.type === "SpreadElement") {
			for (const [name, value] of objectProperties(file, property.argument)) {
				properties.set(name, value);
			}
			continue;
		}
		if (property.type !== "Property") continue;
		const name = keyName(property.key);
		if (name) properties.set(name, textOf(file, property.value));
	}

	return properties;
}

/** A top-level const of the file it is declared by, e.g. a param or options object shared by several definitions. */
function resolveLocal(file: ParsedFile, node: Node, depth = 0): Node {
	if (node.type !== "Identifier" || depth > MAX_RESOLVE_DEPTH) return node;

	for (const statement of file.program.body) {
		const declaration =
			statement.type === "ExportNamedDeclaration"
				? statement.declaration
				: statement;
		if (declaration?.type !== "VariableDeclaration") continue;

		for (const declarator of declaration.declarations) {
			if (
				declarator.id.type === "Identifier" &&
				declarator.id.name === node.name &&
				declarator.init
			) {
				return resolveLocal(file, declarator.init, depth + 1);
			}
		}
	}

	return node;
}

function keyName(key: Node) {
	if (key.type === "Identifier") return key.name;
	if (key.type === "Literal" && typeof key.value === "string") return key.value;

	return null;
}

function stringItems(source: string | undefined) {
	if (!source) return [];

	return [...source.matchAll(/["'`]([^"'`]+)["'`]/g)].map(([, item]) => item);
}

function unquote(source: string) {
	return source.match(/^(["'])(.*)\1$/)?.[2] ?? source;
}

function localReferenceLines(
	file: ParsedFile,
	name: string,
	declaredAt: number,
) {
	const lines = new Set<number>();
	walk(file.program, (node) => {
		if (
			node.type === "Identifier" &&
			node.name === name &&
			node.start !== declaredAt
		) {
			lines.add(lineOf(file, node.start));
		}
		return;
	});

	return [...lines].sort((a, b) => a - b);
}

function groupByFile(usages: Array<{ file: string; line: number }>) {
	const byFile = new Map<string, Set<number>>();
	for (const usage of usages) {
		const lines = byFile.get(usage.file) ?? new Set();
		lines.add(usage.line);
		byFile.set(usage.file, lines);
	}

	return [...byFile]
		.map(([file, lines]) => ({
			file,
			lines: [...lines].sort((a, b) => a - b),
		}))
		.sort((a, b) => (a.file < b.file ? -1 : 1));
}
