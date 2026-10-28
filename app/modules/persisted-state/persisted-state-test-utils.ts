import { expect } from "bun:test";
import type {
	PersistedDefinition,
	PersistedMapDefinition,
} from "./persisted-state";

/** Asserts `decode(encode(x))` deep-equals `x` for every example, and that a missing value decodes to the default. */
export function assertRoundTrips<T>(
	definition: PersistedDefinition<T> | PersistedMapDefinition<T>,
	examples: NoInfer<T>[],
) {
	expect(definition.decode(null), "missing → default").toEqual(
		definition.default,
	);

	for (const value of examples) {
		expect(
			definition.decode(definition.encode(value)),
			`round trip of ${JSON.stringify(value)}`,
		).toEqual(value);
	}
}

/** Asserts that each given raw stored string decodes to the definition's default. */
export function assertDecodesToDefault<T>(
	definition: PersistedDefinition<T> | PersistedMapDefinition<T>,
	raws: string[],
) {
	for (const raw of raws) {
		expect(definition.decode(raw), `${JSON.stringify(raw)} → default`).toEqual(
			definition.default,
		);
	}
}
