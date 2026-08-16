import { expect } from "vitest";
import type {
	PersistedDefinition,
	PersistedMapDefinition,
} from "./persisted-state";

/**
 * Asserts `decode(encode(x))` deep-equals `x` for every given example value,
 * and that a missing value decodes to the default. Every feature definition
 * registers a test with representative and edge-case values.
 */
export function assertRoundTrips<T>(
	definition: PersistedDefinition<T> | PersistedMapDefinition<T>,
	examples: NoInfer<T>[],
) {
	expect
		.soft(definition.decode(null), "missing → default")
		.toEqual(definition.default);

	for (const value of examples) {
		expect
			.soft(
				definition.decode(definition.encode(value)),
				`round trip of ${JSON.stringify(value)}`,
			)
			.toEqual(value);
	}
}

/** Asserts that each given raw stored string decodes to the definition's default. */
export function assertDecodesToDefault<T>(
	definition: PersistedDefinition<T> | PersistedMapDefinition<T>,
	raws: string[],
) {
	for (const raw of raws) {
		expect
			.soft(definition.decode(raw), `${JSON.stringify(raw)} → default`)
			.toEqual(definition.default);
	}
}
