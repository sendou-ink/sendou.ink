import { expect } from "vitest";
import type {
	ParamDef,
	SearchParamsDefinition,
	SearchParamsValues,
} from "./search-params";
import * as SearchParams from "./search-params";

type AnyShape = Record<string, ParamDef<any>>;

/**
 * Asserts `decode(encode(x))` deep-equals `x` for every given example value,
 * through both the plain and the compressed transport form, and additionally
 * through a full `href` → `parse` cycle. Every feature definition registers a
 * test with representative and edge-case values.
 */
export function assertRoundTrips<Shape extends AnyShape>(
	definition: SearchParamsDefinition<Shape>,
	examples: {
		[K in keyof Shape]: Array<SearchParamsValues<Shape>[K]>;
	},
) {
	for (const key of definition.keys) {
		const def = definition.shape[key];

		expect
			.soft(SearchParams.decodeParam(def, []), `${key}: absent → default`)
			.toEqual(def.default);

		for (const value of examples[key]) {
			const encoded = SearchParams.encodeParam(def, value);
			expect
				.soft(
					SearchParams.decodeParam(def, encoded),
					`${key}: plain round trip of ${JSON.stringify(value)}`,
				)
				.toEqual(value);

			const compressed =
				def.compress || encoded.length === 0
					? encoded
					: def
							.encodePlain(value)
							.map((plain) => SearchParams.compressTransportValue(plain));
			expect
				.soft(
					SearchParams.decodeParam(def, compressed),
					`${key}: compressed round trip of ${JSON.stringify(value)}`,
				)
				.toEqual(value);

			const href = definition.href("/round-trip", {
				[key]: value,
			} as Partial<SearchParamsValues<Shape>>);
			const parsed = definition.parse(new URL(href, "http://localhost"));
			expect
				.soft(
					parsed[key],
					`${key}: href → parse round trip of ${JSON.stringify(value)}`,
				)
				.toEqual(value);
		}
	}
}

/** Asserts that each given raw URL value list decodes to the param's default. */
export function assertDecodesToDefault<Shape extends AnyShape>(
	definition: SearchParamsDefinition<Shape>,
	key: keyof Shape & string,
	rawValuesList: string[][],
) {
	const def = definition.shape[key];

	for (const rawValues of rawValuesList) {
		expect
			.soft(
				SearchParams.decodeParam(def, rawValues),
				`${key}: ${JSON.stringify(rawValues)} → default`,
			)
			.toEqual(def.default);
	}
}
