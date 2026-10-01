import { readFileSync } from "node:fs";
import { sql } from "kysely";
import { describe, expect, test } from "vitest";
import { JSON_COLUMNS } from "./json-columns";
import { db } from "./sql";

describe("JSON_COLUMNS", () => {
	test("matches the JSONColumn declarations in tables.ts", () => {
		expect([...JSON_COLUMNS].sort(alphabetically)).toEqual(
			jsonColumnsFromTablesSource(),
		);
	});
});

describe("JSON parameters", () => {
	test.each([
		{
			why: "object",
			value: { a: 1, b: [true] },
			expected: '{"a":1,"b":[true]}',
		},
		{ why: "array", value: [1, "two"], expected: '[1,"two"]' },
		{ why: "string stays verbatim", value: '{"a":1}', expected: '{"a":1}' },
	])("binds a $why as JSON text", async ({ value, expected }) => {
		const { rows } = await sql<{
			bound: string;
		}>`select ${value} as "bound"`.execute(db);

		expect(rows[0].bound).toBe(expected);
	});
});

function jsonColumnsFromTablesSource() {
	const source = readFileSync(new URL("./tables.ts", import.meta.url), "utf8");

	const jsonColumnsByInterface = new Map<string, string[]>();
	const interfaceRegex = /(?:export )?interface (\w+) \{([\s\S]*?)\n\}/g;
	for (const match of source.matchAll(interfaceRegex)) {
		const [, interfaceName, body] = match;
		if (interfaceName === "DB") continue;

		const columns: string[] = [];
		for (const line of body.split("\n")) {
			const columnMatch = line.match(/^\s*(\w+)\??:\s*.*JSONColumn</);
			if (columnMatch) columns.push(columnMatch[1]);
		}
		if (columns.length > 0) {
			jsonColumnsByInterface.set(interfaceName, columns);
		}
	}

	const dbInterfaceBody = source.slice(source.indexOf("export interface DB {"));
	const entries: string[] = [];
	for (const match of dbInterfaceBody.matchAll(/^\t(\w+): (\w+);/gm)) {
		const [, tableName, interfaceName] = match;
		for (const column of jsonColumnsByInterface.get(interfaceName) ?? []) {
			entries.push(`${tableName}.${column}`);
		}
	}

	return entries.sort(alphabetically);
}

const alphabetically = (a: string, b: string) => a.localeCompare(b);
