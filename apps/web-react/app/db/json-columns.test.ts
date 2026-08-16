import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { JSON_COLUMNS } from "./json-columns";

describe("JSON_COLUMNS", () => {
	test("matches the JSONColumnType declarations in tables.ts", () => {
		expect([...JSON_COLUMNS].sort()).toEqual(jsonColumnsFromTablesSource());
	});
});

function jsonColumnsFromTablesSource() {
	const source = readFileSync(new URL("./tables.ts", import.meta.url), "utf8");

	const jsonColumnsByInterface = new Map<string, string[]>();
	const interfaceRegex = /(?:export )?interface (\w+) \{([\s\S]*?)\n\}/g;
	for (const match of source.matchAll(interfaceRegex)) {
		const [, interfaceName, body] = match;
		if (interfaceName === "DB") continue;

		const columns = [];
		for (const line of body.split("\n")) {
			const columnMatch = line.match(
				/^\s*(\w+)\??:\s*.*JSONColumnType(?:Nullable)?</,
			);
			if (columnMatch) columns.push(columnMatch[1]);
		}
		if (columns.length > 0) {
			jsonColumnsByInterface.set(interfaceName, columns);
		}
	}

	const dbInterfaceBody = source.slice(source.indexOf("export interface DB {"));
	const entries = [];
	for (const match of dbInterfaceBody.matchAll(/^\t(\w+): (\w+);/gm)) {
		const [, tableName, interfaceName] = match;
		for (const column of jsonColumnsByInterface.get(interfaceName) ?? []) {
			entries.push(`${tableName}.${column}`);
		}
	}

	return entries.sort();
}
