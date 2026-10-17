// Vitest-style typing: loose expected values, as expectations are often partial or wider than what they are
// compared to, and `test.each` rows inferred without `const`, so object rows don't turn into readonly literals
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "bun:test" {
	// registered in app/dom-test-matchers.ts
	interface Matchers<T = unknown>
		extends TestingLibraryMatchers<
			ReturnType<typeof expect.stringContaining>,
			T
		> {
		toBe(expected: unknown): void;
		toEqual(expected: unknown): void;
		toStrictEqual(expected: unknown): void;
		toContain(expected: unknown): void;
		toContainEqual(expected: unknown): void;
	}

	interface Test<T extends ReadonlyArray<unknown>> {
		each<Row extends Readonly<[unknown, ...unknown[]]>>(
			table: readonly Row[],
		): Test<Row>;
		each<Row extends readonly unknown[]>(table: readonly Row[]): Test<Row>;
		each<Row>(table: readonly Row[]): Test<[Row]>;
	}
}
