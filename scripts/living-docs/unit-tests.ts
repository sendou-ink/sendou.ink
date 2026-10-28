import fs from "node:fs";
import path from "node:path";
import type { Argument, Node, Statement } from "oxc-parser";
import { lineOf, type ParsedFile, parseFile, ROOT } from "./ast.ts";

const TEST_FUNCTIONS = new Set(["test", "it"]);

export interface UnitTestCase {
	name: string;
	file: string;
	line: number;
	/** Set for `test.each`, how many rows its table has. */
	caseCount: number | null;
}

export interface ModuleUnitTests {
	byExport: Map<string, UnitTestCase[]>;
	/** Tests whose `describe` names no export of the module. */
	unmatched: UnitTestCase[];
}

/** The unit tests of a Module.ts file, keyed by the export their `describe("Module.fn")` names. */
export function unitTestsOf(
	modulePath: string,
	exportNames: string[],
): ModuleUnitTests {
	const result: ModuleUnitTests = { byExport: new Map(), unmatched: [] };
	const exports = new Set(exportNames);

	for (const testFile of testFilesOf(modulePath)) {
		const file = parseFile(testFile);
		collect(file, file.program.body, [], null, exports, result);
	}

	return result;
}

function testFilesOf(modulePath: string) {
	const dir = path.posix.dirname(modulePath);
	const moduleStem = path.posix.basename(modulePath).replace(/\.ts$/, "");
	const isServer = moduleStem.endsWith(".server");

	return fs
		.readdirSync(path.join(ROOT, dir))
		.filter((name) => {
			const testStem = name.match(/^(.+)\.test\.tsx?$/)?.[1];
			if (!testStem) return false;
			if (testStem === moduleStem) return true;

			return (
				!isServer &&
				testStem.startsWith(`${moduleStem}.`) &&
				testStem !== `${moduleStem}.server`
			);
		})
		.sort()
		.map((name) => `${dir}/${name}`);
}

function collect(
	file: ParsedFile,
	statements: Statement[],
	describePath: string[],
	exportName: string | null,
	exports: Set<string>,
	result: ModuleUnitTests,
) {
	for (const statement of statements) {
		if (statement.type !== "ExpressionStatement") continue;
		const call = statement.expression;
		if (call.type !== "CallExpression") continue;

		const { root, isEach, table } = calleeInfo(call.callee);
		const name = nameOf(file, call.arguments[0]);
		const callback = call.arguments.find(
			(arg) =>
				arg.type === "ArrowFunctionExpression" ||
				arg.type === "FunctionExpression",
		);
		if (!name || !root) continue;

		if (root === "describe") {
			const named = name.replace(/\(\)$/, "").split(".").at(-1)!;
			const matched = !exportName && exports.has(named) ? named : null;
			const body =
				callback &&
				(callback.type === "ArrowFunctionExpression" ||
					callback.type === "FunctionExpression") &&
				callback.body?.type === "BlockStatement"
					? callback.body.body
					: [];

			collect(
				file,
				body,
				matched ? [] : [...describePath, name],
				exportName ?? matched,
				exports,
				result,
			);
			continue;
		}

		if (!TEST_FUNCTIONS.has(root)) continue;

		const testCase: UnitTestCase = {
			name: [...describePath, name].join(" › "),
			file: file.path,
			line: lineOf(file, call.start),
			caseCount:
				isEach && table?.type === "ArrayExpression"
					? table.elements.length
					: null,
		};

		if (exportName) {
			const cases = result.byExport.get(exportName) ?? [];
			cases.push(testCase);
			result.byExport.set(exportName, cases);
		} else {
			result.unmatched.push(testCase);
		}
	}
}

function calleeInfo(callee: Node): {
	root: string | null;
	isEach: boolean;
	table: Argument | null;
} {
	if (callee.type === "Identifier") {
		return { root: callee.name, isEach: false, table: null };
	}
	if (callee.type === "MemberExpression") {
		const inner = calleeInfo(callee.object);
		const isSkipped =
			callee.property.type === "Identifier" &&
			["skip", "todo"].includes(callee.property.name);
		return isSkipped ? { ...inner, root: null } : inner;
	}
	if (callee.type === "CallExpression") {
		const inner = calleeInfo(callee.callee);
		return { ...inner, isEach: true, table: callee.arguments[0] ?? null };
	}
	return { root: null, isEach: false, table: null };
}

function nameOf(file: ParsedFile, node: Argument | undefined) {
	if (node?.type === "Literal" && typeof node.value === "string") {
		return node.value;
	}
	if (node?.type === "TemplateLiteral") {
		return file.source.slice(node.start + 1, node.end - 1);
	}
	return null;
}
