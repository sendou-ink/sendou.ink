import fs from "node:fs";
import path from "node:path";
import { parseSync } from "oxc-parser";
import { ROOT } from "../living-docs/ast.ts";
import { allSourceFiles, resolveImport } from "../living-docs/source-index.ts";

export interface TestCandidate {
	/** Repo relative. */
	file: string;
	/** Imports between the test file and the target, 1 for a test importing it directly. */
	distance: number;
}

type ImporterGraph = Map<string, Set<string>>;

/**
 * The unit test files that import `target` directly or through other modules, nearest first.
 * These are only candidates: the baseline run tells which of them execute the mutated code.
 */
export function testCandidatesOf(
	target: string,
	graph: ImporterGraph,
): TestCandidate[] {
	const distances = new Map([[target, 0]]);
	const queue = [target];
	for (let file = queue.shift(); file; file = queue.shift()) {
		for (const importer of graph.get(file) ?? []) {
			if (distances.has(importer)) continue;

			distances.set(importer, distances.get(file)! + 1);
			queue.push(importer);
		}
	}

	return [...distances]
		.filter(([file]) => isUnitTestFile(file))
		.map(([file, distance]) => ({ file, distance }))
		.sort((a, b) => a.distance - b.distance || a.file.localeCompare(b.file));
}

/** For every source file the files importing a value from it, re-exports and `import()` included. */
export function importerGraph(): ImporterGraph {
	const graph: ImporterGraph = new Map();

	for (const file of allSourceFiles()) {
		for (const specifier of valueImportSpecifiers(file)) {
			const imported = resolveImport(file, specifier);
			if (!imported) continue;

			const importers = graph.get(imported) ?? new Set();
			importers.add(file);
			graph.set(imported, importers);
		}
	}

	return graph;
}

/** Whether the unit projects of `vitest.unit.config.ts` run the file. */
export function isUnitTestFile(file: string) {
	return (
		/\.test\.tsx?$/.test(file) &&
		!file.includes(".browser.test.") &&
		!file.startsWith("e2e/") &&
		!/^app\/features\/scanner\/tests\/[^/]+$/.test(file)
	);
}

function valueImportSpecifiers(file: string) {
	const source = fs.readFileSync(path.join(ROOT, file), "utf8");
	const { module } = parseSync(file, source);

	return [
		...module.staticImports
			.filter(
				(statement) =>
					statement.entries.length === 0 ||
					statement.entries.some((entry) => !entry.isType),
			)
			.map((statement) => statement.moduleRequest.value),
		...module.staticExports.flatMap((statement) =>
			statement.entries
				.filter((entry) => entry.moduleRequest && !entry.isType)
				.map((entry) => entry.moduleRequest!.value),
		),
		...module.dynamicImports.map((dynamicImport) =>
			source
				.slice(
					dynamicImport.moduleRequest.start,
					dynamicImport.moduleRequest.end,
				)
				.replace(/^["'`]|["'`]$/g, ""),
		),
	];
}
