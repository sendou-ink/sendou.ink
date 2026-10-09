import { describe, expect, test } from "vitest";
import { MapPool } from "./map-pool";

describe("MapPool.fromUserInput", () => {
	const VALID_POOL = "tw:3330000;sz:3a14000;tc:2c98000;rm:2bc0000;cb:39c0000";

	test("returns null for empty string", () => {
		expect(MapPool.fromUserInput("")).toBeNull();
	});

	test("returns null for whitespace-only string", () => {
		expect(MapPool.fromUserInput("   \t\n  ")).toBeNull();
	});

	test("returns null when the parsed pool is empty", () => {
		expect(MapPool.fromUserInput("not-a-valid-pool")).toBeNull();
	});

	test("returns a MapPool for a bare serialized pool", () => {
		const result = MapPool.fromUserInput(VALID_POOL);

		expect(result).toBeInstanceOf(MapPool);
		expect(result?.serialized).toBe(VALID_POOL);
	});

	test("trims whitespace around a bare serialized pool", () => {
		const result = MapPool.fromUserInput(`  ${VALID_POOL}  `);

		expect(result?.serialized).toBe(VALID_POOL);
	});

	test("extracts the pool param from a full URL", () => {
		const result = MapPool.fromUserInput(
			`https://sendou.ink/maps?pool=${VALID_POOL}`,
		);

		expect(result?.serialized).toBe(VALID_POOL);
	});

	test("returns null for a URL without a pool param", () => {
		expect(MapPool.fromUserInput("https://sendou.ink/maps?other=1")).toBeNull();
	});

	test("ignores other URL params when extracting pool", () => {
		const result = MapPool.fromUserInput(
			`https://sendou.ink/maps?foo=bar&pool=${VALID_POOL}&baz=qux`,
		);

		expect(result?.serialized).toBe(VALID_POOL);
	});

	test("returns null for a malformed URL with ://", () => {
		expect(MapPool.fromUserInput("not a url://")).toBeNull();
	});

	test("parses the pool value from a query-string fragment", () => {
		expect(MapPool.fromUserInput(`pool=${VALID_POOL}`)?.serialized).toBe(
			VALID_POOL,
		);
	});

	test("stops at the next & in a query-string fragment", () => {
		expect(
			MapPool.fromUserInput(`pool=${VALID_POOL}&other=1`)?.serialized,
		).toBe(VALID_POOL);
	});

	test("preserves leading params before pool= in a query-string fragment", () => {
		expect(
			MapPool.fromUserInput(`foo=bar&pool=${VALID_POOL}`)?.serialized,
		).toBe(VALID_POOL);
	});
});
