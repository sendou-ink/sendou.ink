import fs from "node:fs";
import path from "node:path";
import type { Node } from "oxc-parser";
import {
	commentsBetween,
	jsDocOf,
	lineOf,
	type ParsedFile,
	parseFile,
	ROOT,
	walk,
} from "./ast.ts";
import { allSourceFiles, resolveImport } from "./source-index.ts";

const ENV_EXAMPLE_FILE = ".env.example";
const CONFIG_FILES = [
	{ file: "app/config.server.ts", exportName: "ServerConfig", scope: "server" },
	{ file: "app/config.ts", exportName: "Config", scope: "client" },
] as const;
/** Files outside `allSourceFiles()` that read env vars: the build, test and docs site configs. */
const EXTRA_SOURCE_FILES = ["docs/site/astro.config.ts"];
/** What Vite puts on `import.meta.env` itself, not variables of the environment. */
const VITE_BUILTINS = new Set(["MODE", "BASE_URL", "PROD", "DEV", "SSR"]);
const ENV_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/;
/** Unit tests set variables like `TZ` to test against them, which isn't the code reading them. */
const UNIT_TEST_FILE_REGEX = /\.test\.tsx?$/;

export type EnvVarSection = "server" | "client" | "scripts" | "tooling";

export interface EnvVarRead {
	file: string;
	line: number;
	/** How it is read, e.g. `ServerConfig.discord.clientId`, `process.env` or `"MOD_DISCORD_WEBHOOK_URL"` for a name passed around as a string. */
	via: string;
	/** The comment on the line above the read, often the one explaining what the variable does. */
	note: string | null;
}

export interface EnvVarSchema {
	file: string;
	line: number;
	/** `null` when the variable has no default, in production the default is never used for `requiredInProd` ones. */
	default: string | null;
	requiredInProd: boolean;
	isBoolean: boolean;
	/** The values a picklist allows. */
	values: string[] | null;
	/** The `//` comment above the key. */
	comment: string;
	/** Variables that must be set together with this one. */
	requiredWith: string[];
}

export interface EnvConfigProperty {
	/** e.g. `ServerConfig.discord.clientId` */
	path: string;
	/** JSDoc of the property and of the objects it is nested in. */
	doc: string;
	file: string;
	line: number;
}

export interface EnvVar {
	name: string;
	/** Server and client are the app's (`app/config.server.ts`, `app/config.ts`), scripts the ones of `.env.example` only scripts read and tooling the rest. */
	section: EnvVarSection;
	/** The `//` comment above it in `.env.example`. */
	description: string;
	/** Its line of `.env.example`, null when it isn't listed there. */
	example: { value: string; line: number } | null;
	schema: EnvVarSchema | null;
	configProperties: EnvConfigProperty[];
	reads: EnvVarRead[];
}

/** Every environment variable: those of `.env.example`, the app's config schemas and the ones code reads directly, with where each is read. */
export function documentEnvVars(): EnvVar[] {
	const examples = parseEnvExample();
	const schemas = new Map<string, EnvVarSchema & { scope: EnvVarSection }>();
	const configProperties = new Map<string, EnvConfigProperty[]>();
	const reads = new Map<string, EnvVarRead[]>();
	const addRead = (name: string, read: EnvVarRead) => {
		reads.set(name, [...(reads.get(name) ?? []), read]);
	};

	for (const config of CONFIG_FILES) {
		const file = parseFile(config.file);
		for (const [name, schema] of schemaEntries(file)) {
			schemas.set(name, { ...schema, scope: config.scope });
		}
		for (const property of exportedProperties(file, config.exportName)) {
			for (const name of property.names) {
				configProperties.set(name, [
					...(configProperties.get(name) ?? []),
					property.ref,
				]);
			}
		}
	}

	const knownNames = new Set([...examples.keys(), ...schemas.keys()]);
	const configFiles = new Set<string>(CONFIG_FILES.map(({ file }) => file));
	const sourceFiles = [
		...allSourceFiles(),
		...rootConfigFiles(),
		...EXTRA_SOURCE_FILES,
	].filter((file) => !UNIT_TEST_FILE_REGEX.test(file));

	for (const sourceFile of sourceFiles) {
		const file = parseFile(sourceFile);

		for (const config of CONFIG_FILES) {
			for (const usage of configUsages(file, config)) {
				for (const [name, properties] of configProperties) {
					const matches = properties.some(
						(property) =>
							usage.path === property.path ||
							property.path.startsWith(`${usage.path}.`) ||
							usage.path.startsWith(`${property.path}.`),
					);
					if (matches) addRead(name, usage);
				}
			}
		}

		for (const read of directReads(file, knownNames, configFiles)) {
			addRead(read.name, read);
		}
	}

	const names = [
		...examples.keys(),
		...schemas.keys(),
		...[...reads.keys()].sort(),
	];

	return [...new Set(names)].map((name) => {
		const example = examples.get(name) ?? null;
		const schema = schemas.get(name) ?? null;
		const nameReads = uniqueReads(reads.get(name) ?? []);

		return {
			name,
			section: sectionOf(name, schema?.scope ?? null, example, nameReads),
			description: example?.description ?? "",
			example: example ? { value: example.value, line: example.line } : null,
			schema: schema
				? {
						file: schema.file,
						line: schema.line,
						default: schema.default,
						requiredInProd: schema.requiredInProd,
						isBoolean: schema.isBoolean,
						values: schema.values,
						comment: schema.comment,
						requiredWith: schema.requiredWith,
					}
				: null,
			configProperties: configProperties.get(name) ?? [],
			reads: nameReads,
		};
	});
}

function sectionOf(
	name: string,
	scope: EnvVarSection | null,
	example: unknown,
	reads: EnvVarRead[],
): EnvVarSection {
	if (scope) return scope;
	if (!example) return "tooling";
	if (name.startsWith("VITE_")) return "client";

	return reads.some((read) => read.file.startsWith("app/"))
		? "server"
		: "scripts";
}

/** Variable → its value and the comment above it, or the block's last comment when it has none of its own. */
function parseEnvExample() {
	const lines = fs
		.readFileSync(path.join(ROOT, ENV_EXAMPLE_FILE), "utf8")
		.split("\n");
	const examples = new Map<
		string,
		{ value: string; line: number; description: string }
	>();

	let pending: string[] = [];
	let blockComment = "";
	for (const [index, line] of lines.entries()) {
		const trimmed = line.trim();
		if (trimmed === "") {
			pending = [];
			blockComment = "";
			continue;
		}

		const comment = trimmed.match(/^(?:\/\/|#)\s?(.*)$/);
		if (comment) {
			pending.push(comment[1].trim());
			continue;
		}

		const variable = trimmed.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
		if (!variable) continue;

		if (pending.length > 0) {
			blockComment = pending.join(" ");
			pending = [];
		}
		examples.set(variable[1], {
			value: variable[2].replace(/^"(.*)"$/, "$1"),
			line: index + 1,
			description: blockComment,
		});
	}

	return examples;
}

/** The keys of the `v.object({…})` the config file's `schema` validates `process.env` with. */
function schemaEntries(file: ParsedFile) {
	const entries = new Map<string, EnvVarSchema>();
	const requiredWith = requireTogetherPairs(file);

	let object: Node | null = null;
	walk(file.program, (node) => {
		if (object) return false;
		if (
			node.type === "CallExpression" &&
			calleeName(node.callee) === "v.object" &&
			node.arguments[0]?.type === "ObjectExpression"
		) {
			object = node.arguments[0];
			return false;
		}
		return;
	});
	if (!object) throw new Error(`No v.object({…}) schema in ${file.path}`);

	let previousEnd = (object as Node).start + 1;
	for (const property of (object as Node & { type: "ObjectExpression" })
		.properties) {
		if (property.type !== "Property" || property.key.type !== "Identifier") {
			continue;
		}

		const name = property.key.name;
		entries.set(name, {
			file: file.path,
			line: lineOf(file, property.start),
			...describeSchema(property.value),
			comment: commentsBetween(file, previousEnd, property.start).join("\n\n"),
			requiredWith: requiredWith.get(name) ?? [],
		});
		previousEnd = property.end;
	}

	return entries;
}

function describeSchema(
	node: Node,
): Pick<EnvVarSchema, "default" | "requiredInProd" | "isBoolean" | "values"> {
	const facts = {
		default: null as string | null,
		requiredInProd: false,
		isBoolean: false,
		values: null as string[] | null,
	};
	if (node.type !== "CallExpression") return facts;

	const callee = calleeName(node.callee);
	if (callee === "requiredInProd") {
		return {
			...facts,
			requiredInProd: true,
			default: literalString(node.arguments[1]),
		};
	}
	if (callee !== "v.optional") return facts;

	const inner = node.arguments[0];
	if (inner?.type === "Identifier" && inner.name === "envBoolean") {
		facts.isBoolean = true;
	}
	if (
		inner?.type === "CallExpression" &&
		calleeName(inner.callee) === "v.picklist" &&
		inner.arguments[0]?.type === "ArrayExpression"
	) {
		facts.values = inner.arguments[0].elements
			.map((element) => literalString(element))
			.filter((value) => value !== null);
	}
	facts.default = literalString(node.arguments[1]);

	return facts;
}

/** `requireTogether(ctx, val, "A", "B")` calls, both ways. */
function requireTogetherPairs(file: ParsedFile) {
	const pairs = new Map<string, string[]>();
	walk(file.program, (node) => {
		if (
			node.type !== "CallExpression" ||
			calleeName(node.callee) !== "requireTogether"
		) {
			return;
		}

		const a = literalString(node.arguments[2]);
		const b = literalString(node.arguments[3]);
		if (!a || !b) return;
		pairs.set(a, [...(pairs.get(a) ?? []), b]);
		pairs.set(b, [...(pairs.get(b) ?? []), a]);
		return;
	});

	return pairs;
}

/** The leaf properties of the exported config object, with the variables (`values.X`) each is computed from. */
function exportedProperties(file: ParsedFile, exportName: string) {
	const properties: Array<{ names: string[]; ref: EnvConfigProperty }> = [];

	const visit = (object: Node, parentPath: string, parentDocs: string[]) => {
		if (object.type !== "ObjectExpression") return;

		for (const property of object.properties) {
			if (property.type !== "Property" || property.key.type !== "Identifier") {
				continue;
			}

			const propertyPath = `${parentPath}.${property.key.name}`;
			const doc = jsDocOf(file, property.start)?.description;
			const docs = doc ? [...parentDocs, doc] : parentDocs;

			if (property.value.type === "ObjectExpression") {
				visit(property.value, propertyPath, docs);
				continue;
			}

			const names = new Set<string>();
			walk(property.value, (node) => {
				if (
					node.type === "MemberExpression" &&
					!node.computed &&
					node.object.type === "Identifier" &&
					node.object.name === "values" &&
					node.property.type === "Identifier"
				) {
					names.add(node.property.name);
				}
				return;
			});

			properties.push({
				names: [...names],
				ref: {
					path: propertyPath,
					doc: docs.join("\n\n"),
					file: file.path,
					line: lineOf(file, property.start),
				},
			});
		}
	};

	for (const statement of file.program.body) {
		if (
			statement.type !== "ExportNamedDeclaration" ||
			statement.declaration?.type !== "VariableDeclaration"
		) {
			continue;
		}
		for (const declarator of statement.declaration.declarations) {
			if (
				declarator.id.type === "Identifier" &&
				declarator.id.name === exportName &&
				declarator.init
			) {
				visit(declarator.init, exportName, []);
			}
		}
	}

	return properties;
}

/** Each `Config.a.b` member chain of a file importing the config object, `path` as the config file names it. */
function configUsages(
	file: ParsedFile,
	config: (typeof CONFIG_FILES)[number],
): Array<EnvVarRead & { path: string }> {
	if (file.path === config.file) return [];

	const localNames = new Set<string>();
	for (const entry of file.imports) {
		if (resolveImport(file.path, entry.moduleRequest.value) !== config.file) {
			continue;
		}
		for (const specifier of entry.entries) {
			if (specifier.importName.name === config.exportName) {
				localNames.add(specifier.localName.value);
			}
		}
	}
	if (localNames.size === 0) return [];

	const usages: Array<EnvVarRead & { path: string }> = [];
	walk(file.program, (node) => {
		if (node.type !== "MemberExpression") return;

		const chain = memberChain(node);
		if (!chain || !localNames.has(chain[0])) return;

		const usagePath = [config.exportName, ...chain.slice(1)].join(".");
		const line = lineOf(file, node.start);
		usages.push({
			file: file.path,
			line,
			via: usagePath,
			note: commentAbove(file, line),
			path: usagePath,
		});
		return false;
	});

	return usages;
}

/** `process.env.X`, `import.meta.env.X`, `const { X } = process.env`, `loadEnv(…).X` and known names passed around as strings. */
function directReads(
	file: ParsedFile,
	knownNames: Set<string>,
	configFiles: Set<string>,
) {
	const found: Array<EnvVarRead & { name: string }> = [];
	const writes = new Set<number>();
	const envObjects = new Set<string>();
	const add = (name: string, node: Node, via: string) => {
		if (!ENV_NAME_REGEX.test(name) || VITE_BUILTINS.has(name)) return;
		const line = lineOf(file, node.start);
		found.push({
			name,
			file: file.path,
			line,
			via,
			note: commentAbove(file, line),
		});
	};

	walk(file.program, (node) => {
		if (node.type.startsWith("TS") && !RUNTIME_TS_NODES.has(node.type)) {
			return false;
		}

		if (node.type === "AssignmentExpression") writes.add(node.left.start);
		if (node.type === "UnaryExpression" && node.operator === "delete") {
			writes.add(node.argument.start);
		}

		if (node.type === "VariableDeclarator" && node.init) {
			if (
				node.id.type === "ObjectPattern" &&
				envObjectOf(node.init, envObjects)
			) {
				for (const property of node.id.properties) {
					if (
						property.type === "Property" &&
						property.key.type === "Identifier"
					) {
						add(
							property.key.name,
							property,
							envObjectOf(node.init, envObjects)!,
						);
					}
				}
			}
			if (
				node.id.type === "Identifier" &&
				node.init.type === "CallExpression" &&
				calleeName(node.init.callee) === "loadEnv"
			) {
				envObjects.add(node.id.name);
			}
		}

		if (node.type === "MemberExpression" && !writes.has(node.start)) {
			const via = envObjectOf(node.object, envObjects);
			if (!via) return;

			const name = node.computed
				? literalString(node.property)
				: node.property.type === "Identifier"
					? node.property.name
					: null;
			if (name) add(name, node, via);
			return false;
		}

		if (
			node.type === "Literal" &&
			typeof node.value === "string" &&
			knownNames.has(node.value) &&
			!configFiles.has(file.path)
		) {
			add(node.value, node, `"${node.value}"`);
		}

		return;
	});

	return found;
}

/** TS nodes whose children run, e.g. the expression of `x as T`. */
const RUNTIME_TS_NODES = new Set([
	"TSAsExpression",
	"TSSatisfiesExpression",
	"TSNonNullExpression",
	"TSInstantiationExpression",
]);

/** How `node` refers to the environment (`process.env`, `import.meta.env` or a `loadEnv()` result), null when it doesn't. */
function envObjectOf(node: Node, envObjects: Set<string>) {
	if (node.type === "Identifier" && envObjects.has(node.name)) {
		return "loadEnv()";
	}
	if (
		node.type !== "MemberExpression" ||
		node.computed ||
		node.property.type !== "Identifier" ||
		node.property.name !== "env"
	) {
		return null;
	}
	if (node.object.type === "Identifier" && node.object.name === "process") {
		return "process.env";
	}
	if (node.object.type === "MetaProperty") return "import.meta.env";

	return null;
}

/** `a.b.c` as `["a", "b", "c"]`, null for anything but plain identifiers. */
function memberChain(node: Node): string[] | null {
	if (node.type === "Identifier") return [node.name];
	if (
		node.type !== "MemberExpression" ||
		node.computed ||
		node.property.type !== "Identifier"
	) {
		return null;
	}

	const object = memberChain(node.object);
	return object ? [...object, node.property.name] : null;
}

function calleeName(callee: Node) {
	return memberChain(callee)?.join(".") ?? null;
}

function literalString(node: Node | null | undefined) {
	return node?.type === "Literal" && typeof node.value === "string"
		? node.value
		: null;
}

/** The comment ending on the line above `line`, consecutive `//` lines joined. */
function commentAbove(file: ParsedFile, line: number) {
	const parts: string[] = [];
	let expectedEndLine = line - 1;

	for (const comment of [...file.comments].reverse()) {
		const endLine = lineOf(file, comment.end);
		if (endLine > expectedEndLine) continue;
		if (endLine < expectedEndLine) break;

		const text = comment.value
			.replace(/^\*/, "")
			.split("\n")
			.map((part) => part.replace(/^\s*\* ?/, "").trim())
			.join(" ")
			.trim();
		if (text.startsWith("biome-ignore")) break;

		parts.unshift(text);
		if (comment.type !== "Line") break;
		expectedEndLine = lineOf(file, comment.start) - 1;
	}

	return parts.length > 0 ? parts.join(" ") : null;
}

function rootConfigFiles() {
	return fs
		.readdirSync(ROOT)
		.filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts"));
}

function uniqueReads(reads: EnvVarRead[]) {
	const seen = new Set<string>();

	return reads
		.filter((read) => {
			const key = `${read.file}:${read.line}:${read.via}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}
