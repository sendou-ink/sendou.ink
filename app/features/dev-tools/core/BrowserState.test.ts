import * as v from "valibot";
import { describe, expect, test } from "vitest";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import * as BrowserState from "./BrowserState";

const definition = SearchParams.define({
	page: SP.param(v.pipe(v.number(), v.integer(), v.minValue(1)), {
		default: 1,
		loader: true,
	}),
	tab: SP.param(v.picklist(["a", "b"]), { default: "a", loader: false }),
});

const describe_ = (
	search: string,
	{
		source = "app/features/x/x-search-params.ts",
		readers = 1,
	}: { source?: string; readers?: number } = {},
) =>
	BrowserState.describeSearchParams({
		search,
		definitions: [{ definition, source, declaredAt: null, readers }],
		isPageSource: () => false,
		isRouteRevalidator: () => false,
	});

describe("BrowserState.describeSearchParams", () => {
	test.each([
		{ search: "?page=2", status: "ok" },
		{ search: "?tab=b", status: "default" },
		{ search: "?page=1", status: "redundant" },
		{ search: "?page=abc", status: "invalid" },
	])("page in $search is $status", ({ search, status }) => {
		const page = describe_(search).page[0]?.params.find(
			(param) => param.key === "page",
		);

		expect(page?.status).toBe(status);
	});

	test("lists params no definition declares", () => {
		expect(describe_("?page=2&utm_source=x").unknownKeys).toEqual([
			"utm_source",
		]);
	});

	test("leaves out definitions unrelated to the URL or the page", () => {
		const described = describe_("?other=1", { readers: 0 });

		expect([
			...described.page,
			...described.shared,
			...described.unused,
		]).toEqual([]);
	});

	test.each([
		{ why: "feature, read", source: undefined, readers: 1, group: "page" },
		{ why: "feature, unread", source: undefined, readers: 0, group: "unused" },
		{
			why: "outside features, read",
			source: "app/components/x-search-params.ts",
			readers: 1,
			group: "shared",
		},
		{
			why: "outside features, unread",
			source: "app/components/x-search-params.ts",
			readers: 0,
			group: "unused",
		},
	] as const)("groups $why as $group", ({ source, readers, group }) => {
		expect(describe_("?page=2", { source, readers })[group]).toHaveLength(1);
	});
});

describe("BrowserState.declaredName", () => {
	const code = [
		'import * as SearchParams from "/app/modules/search-params/search-params.ts";',
		"export const fooSearchParams = SearchParams.define({",
		"SearchParams.define({});",
	].join("\n");

	test.each([
		{ why: "assigned", line: 2, expected: "fooSearchParams" },
		{ why: "not assigned", line: 3, expected: null },
		{ why: "out of range", line: 9, expected: null },
	])("$why", ({ line, expected }) => {
		expect(BrowserState.declaredName(code, line)).toBe(expected);
	});
});

describe("BrowserState.describeStorage", () => {
	const single = PersistedState.define({
		key: "test-flag",
		storage: "local",
		schema: v.boolean(),
		default: false,
	});
	const map = PersistedState.defineMap({
		keyPrefix: "test-map__",
		storage: "local",
		schema: v.number(),
		default: 0,
	});

	test("pairs entries with their owner and flags values failing to decode", () => {
		const { rows, unsetDefinitions } = BrowserState.describeStorage({
			entries: [
				{ storage: "local", key: "test-map__a", raw: "5" },
				{ storage: "local", key: "test-map__b", raw: '"x"' },
				{ storage: "local", key: "third-party", raw: "?" },
			],
			definitions: [single, map],
		});

		expect(rows.map((row) => ({ key: row.key, status: row.status }))).toEqual([
			{ key: "test-map__a", status: "ok" },
			{ key: "test-map__b", status: "malformed" },
			{ key: "third-party", status: "unknown" },
		]);
		expect(unsetDefinitions).toEqual([single]);
	});
});
