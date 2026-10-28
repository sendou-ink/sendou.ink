import fs from "node:fs";
import path from "node:path";
import type { Node } from "oxc-parser";
import {
	type JsDoc,
	jsDocOf,
	lineOf,
	type ParsedFile,
	parseFile,
	ROOT,
	textOf,
} from "./ast.ts";
import { importsOf, type Usage, usagesOf } from "./source-index.ts";
import { type UnitTestCase, unitTestsOf } from "./unit-tests.ts";

const MAX_CONST_LINES = 12;

const USAGE_KINDS = [
	{
		id: "loader",
		label: "Loaders",
		singular: "loader",
		test: (p: string) => p.includes("/loaders/"),
	},
	{
		id: "action",
		label: "Actions",
		singular: "action",
		test: (p: string) => p.includes("/actions/"),
	},
	{
		id: "route",
		label: "Routes",
		singular: "route",
		test: (p: string) => p.includes("/routes/"),
	},
	{
		id: "repository",
		label: "Repositories",
		singular: "repository",
		test: (p: string) => /Repository\.server\.ts$/.test(p),
	},
	{
		id: "module",
		label: "Modules",
		singular: "module",
		test: isModuleFile,
	},
	{
		id: "hook",
		label: "Hooks",
		singular: "hook",
		test: (p: string) => /^use[A-Z]/.test(path.basename(p)),
	},
	{
		id: "component",
		label: "Components",
		singular: "component",
		test: (p: string) => p.includes("/components/") || p.endsWith(".tsx"),
	},
	{
		id: "routine",
		label: "Routines",
		singular: "routine",
		test: (p: string) => p.includes("/routines/"),
	},
	{
		id: "script",
		label: "Scripts",
		singular: "script",
		test: (p: string) => p.startsWith("scripts/"),
	},
	{ id: "other", label: "Other", singular: "other", test: () => true },
] as const;

export type UsageKind = (typeof USAGE_KINDS)[number]["id"];

export interface UsageGroup {
	kind: UsageKind;
	label: string;
	singular: string;
	items: Array<{
		file: string;
		line: number;
		/** Paths of the routes the file serves, as their module, loader or action. */
		routes: string[];
	}>;
}

export interface ExportDoc {
	name: string;
	kind: "function" | "const" | "type" | "interface" | "class" | "enum";
	line: number;
	doc: JsDoc | null;
	signature: string;
	usages: UsageGroup[];
	unitTests: UnitTestCase[];
}

export interface ModuleDoc {
	name: string;
	path: string;
	overview: string | null;
	types: ExportDoc[];
	values: ExportDoc[];
	testOnlyExports: string[];
	/** Unit tests not about any one export. */
	otherUnitTests: UnitTestCase[];
	/** Other core modules this one imports. */
	dependencies: string[];
	/** Every non-test file using the module, grouped by what kind of file it is. */
	dependents: UsageGroup[];
}

/** The Module.ts files of a feature: capitalized, non-test files of its `core/` folder. */
export function featureModulePaths(featureDir: string) {
	const coreDir = `${featureDir}/core`;
	if (!fs.existsSync(path.join(ROOT, coreDir))) return [];

	return fs
		.readdirSync(path.join(ROOT, coreDir))
		.filter(
			(name) =>
				/^[A-Z]\w*(\.server)?\.ts$/.test(name) && !name.includes(".test."),
		)
		.sort()
		.map((name) => `${coreDir}/${name}`);
}

/** Documentation of a Module.ts file: its overview, exports with their JSDoc and where they are used. */
export function documentModule(
	modulePath: string,
	sourceFiles: string[],
	routePathsByFile: Map<string, string[]>,
) {
	const file = parseFile(modulePath);
	const usages = usagesOf(modulePath, sourceFiles);
	const productionUsages = usages.filter((usage) => !isTestFile(usage.file));

	const collected = collectExports(file);
	const unitTests = unitTestsOf(
		modulePath,
		collected.map((exported) => exported.name),
	);
	const exports = collected.map((exported) => ({
		...exported,
		usages: groupUsages(
			productionUsages.filter((usage) => usage.exportName === exported.name),
			routePathsByFile,
		),
		unitTests: unitTests.byExport.get(exported.name) ?? [],
	}));

	const isTestOnly = (exported: ExportDoc) =>
		exported.usages.length === 0 &&
		usages.some((usage) => usage.exportName === exported.name);

	const visible = exports.filter((exported) => !isTestOnly(exported));

	return {
		name: path.basename(modulePath).replace(/\.ts$/, ""),
		path: modulePath,
		overview: fileOverview(file),
		types: visible.filter((e) => e.kind === "type" || e.kind === "interface"),
		values: visible.filter((e) => e.kind !== "type" && e.kind !== "interface"),
		testOnlyExports: exports.filter(isTestOnly).map((e) => e.name),
		otherUnitTests: [
			...unitTests.unmatched,
			...exports.filter(isTestOnly).flatMap((e) => e.unitTests),
		],
		dependencies: importsOf(modulePath).filter(isModuleFile),
		dependents: groupUsages(
			uniqueBy(productionUsages, (usage) => usage.file),
			routePathsByFile,
		),
	} satisfies ModuleDoc;
}

function isModuleFile(file: string) {
	return file.includes("/core/") && /^[A-Z]/.test(path.basename(file));
}

export function isTestFile(file: string) {
	return (
		file.startsWith("e2e/") ||
		/\.test\.tsx?$/.test(file) ||
		file.includes("/tests/") ||
		file.includes("/__tests__/")
	);
}

function fileOverview(file: ParsedFile) {
	const firstStatement = file.program.body[0];
	const comment = file.comments.find(
		(candidate) => !candidate.value.trim().startsWith("biome-ignore"),
	);
	if (!comment || !firstStatement || comment.start > firstStatement.start) {
		return null;
	}

	const gap = file.source.slice(comment.end, firstStatement.start);
	const isAttachedToExport =
		firstStatement.type !== "ImportDeclaration" && !gap.includes("\n\n");
	if (isAttachedToExport) return null;

	return comment.value
		.replace(/^\*/, "")
		.split("\n")
		.map((line) => line.replace(/^\s*(\*|\/\/) ?/, "").trimEnd())
		.join("\n")
		.trim();
}

function collectExports(file: ParsedFile) {
	const exports: Array<Omit<ExportDoc, "usages" | "unitTests">> = [];
	const seen = new Set<string>();

	const add = (
		name: string,
		kind: ExportDoc["kind"],
		statement: Node,
		signatureEnd: number,
	) => {
		// a type and a value may share a name, e.g. `type findById = Unwrapped<typeof findById>`
		const key = `${kind === "type" || kind === "interface" ? "type" : "value"}:${name}`;
		if (seen.has(key)) return;
		seen.add(key);

		exports.push({
			name,
			kind,
			line: lineOf(file, statement.start),
			doc: jsDocOf(file, statement.start),
			signature: textOf(file, { start: statement.start, end: signatureEnd })
				.trimEnd()
				.replace(/\s*\{$/, ""),
		});
	};

	for (const statement of file.program.body) {
		if (statement.type !== "ExportNamedDeclaration" || !statement.declaration) {
			continue;
		}
		const declaration = statement.declaration;

		switch (declaration.type) {
			case "FunctionDeclaration":
			case "TSDeclareFunction": {
				if (!declaration.id) break;
				add(
					declaration.id.name,
					"function",
					statement,
					declaration.body?.start ?? statement.end,
				);
				break;
			}
			case "VariableDeclaration": {
				for (const declarator of declaration.declarations) {
					if (declarator.id.type !== "Identifier") continue;
					const init = declarator.init;
					const isFunction =
						init?.type === "ArrowFunctionExpression" ||
						init?.type === "FunctionExpression";
					add(
						declarator.id.name,
						isFunction ? "function" : "const",
						statement,
						isFunction && init.body
							? init.body.start
							: constSignatureEnd(file, statement),
					);
				}
				break;
			}
			case "TSTypeAliasDeclaration":
				add(declaration.id.name, "type", statement, statement.end);
				break;
			case "TSInterfaceDeclaration":
				add(declaration.id.name, "interface", statement, statement.end);
				break;
			case "ClassDeclaration":
				if (declaration.id) {
					add(declaration.id.name, "class", statement, declaration.body.start);
				}
				break;
			case "TSEnumDeclaration":
				add(declaration.id.name, "enum", statement, statement.end);
				break;
		}
	}

	return exports;
}

function constSignatureEnd(file: ParsedFile, statement: Node) {
	const firstLine = lineOf(file, statement.start);
	const cutLine = firstLine + MAX_CONST_LINES;

	return cutLine < lineOf(file, statement.end)
		? file.lineStarts[cutLine - 1]
		: statement.end;
}

function groupUsages(
	usages: Usage[],
	routePathsByFile: Map<string, string[]>,
): UsageGroup[] {
	const groups: UsageGroup[] = [];

	for (const kind of USAGE_KINDS) {
		const items = usages
			.filter(
				(usage) =>
					USAGE_KINDS.find((candidate) => candidate.test(usage.file))?.id ===
					kind.id,
			)
			.map(({ file, line }) => ({
				file,
				line,
				routes: routePathsByFile.get(file) ?? [],
			}));
		const unique = uniqueBy(items, (item) => item.file);
		if (unique.length > 0) {
			groups.push({
				kind: kind.id,
				label: kind.label,
				singular: kind.singular,
				items: unique,
			});
		}
	}

	return groups;
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
	const seen = new Set<string>();

	return items.filter((item) => {
		if (seen.has(key(item))) return false;
		seen.add(key(item));
		return true;
	});
}
