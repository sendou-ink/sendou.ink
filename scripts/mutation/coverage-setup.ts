import fs from "node:fs";
import { expect } from "vitest";
import { readRunDescriptor } from "./run-descriptor.ts";

// baseline run only: records the functions of the targets each test file executes

const run = readRunDescriptor();
const testFile = expect.getState().testPath;
const seen = new Set<string>();

(globalThis as any).__mutationHit = (targetIndex: number, scopeId: number) => {
	const key = `${targetIndex}\t${scopeId}`;
	if (seen.has(key) || run.mode !== "baseline") return;

	seen.add(key);
	fs.appendFileSync(run.coverageFile, `${testFile}\t${key}\n`);
};
