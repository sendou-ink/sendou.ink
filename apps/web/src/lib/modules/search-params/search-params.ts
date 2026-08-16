import { isDeepEqual } from "remeda";
import * as v from "valibot";
import {
	compressToBase64,
	decompressFromBase64,
} from "#lib/utils/compression.ts";

/**
 * URL search param definitions: one `define()` per route or feature drives
 * remote query args, client state, and href building. Ported from the React
 * app's module with valibot in place of zod; the `shouldRevalidate` member is
 * gone because remote queries are keyed on their (decoded) args — an URL write
 * that decodes to the same values reuses the cached query instead of refetching.
 */

const COMPRESSED_PREFIX = "lz~";
const ESCAPED_PREFIX = "lz~~";
const DECODE_CACHE_MAX_SIZE = 300;
const MAX_DECOMPRESSED_VALUE_BYTES = 256 * 1024;
const DEFAULT_MAX_PAGE = 1000;

const DECODE_FAILED = Symbol("DECODE_FAILED");

type ScalarBase = "string" | "number" | "boolean";

type EncodeMode = "canonical" | "compact";

type AnyValiSchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>;

interface ParamOptionsBase {
	/** Whether changing this param must rerun the route's queries. `false` params write through shallow navigation only. */
	loader: boolean;
	/** Param keys reset to their defaults whenever this param is written. */
	resets?: string[];
	/** The param's canonical encoding is the compressed form. Only for params whose values are inherently large. */
	compress?: boolean;
	/** The value schema reads the clock, so its decode results must never be cached. */
	timeDependent?: boolean;
}

type DefaultOption<T> = {
	/** Value used when the param is missing or fails to decode. Values equal to it are omitted from the URL. Must be a static value. */
	default: T;
};

type ParamOptions<T> = ParamOptionsBase &
	(unknown extends T
		? DefaultOption<T>
		: null extends T
			? {
					/** Omit it: a nullable param's default is always `null`. */
					default?: null;
				}
			: DefaultOption<T>);

type ResolvedParamOptions<T> = ParamOptionsBase & { default: T };

export interface ParamDef<T> {
	default: T;
	loader: boolean;
	resets: string[];
	compress: boolean;
	timeDependent: boolean;
	decodeValues: (values: string[]) => T;
	encodePlain: (value: T) => string[];
	decodeCache: Map<string, T>;
}

type AnyShape = Record<string, ParamDef<any>>;

export type SearchParamsValues<Shape extends AnyShape> = {
	[K in keyof Shape]: Shape[K] extends ParamDef<infer T> ? T : never;
};

export interface SearchParamsDefinition<Shape extends AnyShape> {
	shape: Shape;
	keys: string[];
	/** Decodes all params of the definition. Total: defaults resolve for missing or malformed values, never throws. */
	parse: (input: Request | URL | URLSearchParams) => SearchParamsValues<Shape>;
	/** Builds a href with the given values encoded as search params. Values equal to their default are omitted. */
	href: (
		path: string,
		values: Partial<SearchParamsValues<Shape>>,
		opts?: { compress?: boolean },
	) => string;
}

/**
 * Creates a search params definition from param declarations (see `SP.param`,
 * `SP.json` and `SP.custom`). One definition per route or feature drives
 * remote query args, client state and href building.
 */
export function define<Shape extends AnyShape>(
	shape: Shape,
): SearchParamsDefinition<Shape> {
	const keys = Object.keys(shape);

	for (const [key, def] of Object.entries(shape)) {
		for (const resetKey of def.resets) {
			if (!keys.includes(resetKey)) {
				throw new Error(
					`Search param "${key}" resets unknown param "${resetKey}"`,
				);
			}
		}
	}

	const definition: SearchParamsDefinition<Shape> = {
		shape,
		keys,
		parse: (input) => {
			const searchParams = toSearchParams(input);
			const result: Record<string, unknown> = {};
			for (const key of keys) {
				result[key] = decodeParam(shape[key], searchParams.getAll(key));
			}
			return result as SearchParamsValues<Shape>;
		},
		href: (path, values, opts) => {
			const searchParams = new URLSearchParams();
			const mode: EncodeMode = opts?.compress ? "compact" : "canonical";
			for (const key of keys) {
				if (!(key in values)) continue;
				for (const encoded of encodeParam(shape[key], values[key], mode)) {
					searchParams.append(key, encoded);
				}
			}
			const queryString = searchParams.toString();
			if (!queryString) return path;

			return `${path}${path.includes("?") ? "&" : "?"}${queryString}`;
		},
	};

	return definition;
}

/**
 * Decodes one param from its raw URL values, resolving to the default when the
 * param is missing or malformed. Uses a per-param cache keyed on the raw values
 * so repeated decodes of the same string return the same reference. Params
 * declared `timeDependent` skip the cache and decode fresh every time.
 */
export function decodeParam<T>(def: ParamDef<T>, values: string[]): T {
	if (def.timeDependent) return def.decodeValues(values);

	const cacheKey = JSON.stringify(values);
	if (def.decodeCache.has(cacheKey)) {
		return def.decodeCache.get(cacheKey) as T;
	}

	const decoded = def.decodeValues(values);

	if (def.decodeCache.size >= DECODE_CACHE_MAX_SIZE) {
		def.decodeCache.clear();
	}
	def.decodeCache.set(cacheKey, decoded);

	return decoded;
}

/**
 * Encodes one param value to its URL values. Returns an empty array (param
 * absent) for values equal to the default.
 */
export function encodeParam<T>(
	def: ParamDef<T>,
	value: T,
	mode: EncodeMode = "canonical",
): string[] {
	if (isDeepEqual(value, def.default)) return [];

	return def.encodePlain(value).map((plain) => wrapValue(plain, def, mode));
}

/**
 * Applies a partial values update on top of the current search params,
 * preserving params outside the definition, applying declared `resets` and
 * omitting values equal to their defaults. A key written in the same batch is
 * never reset by another key of that batch.
 */
export function applyToSearchParams<Shape extends AnyShape>(
	definition: SearchParamsDefinition<Shape>,
	current: URLSearchParams,
	updates: Partial<SearchParamsValues<Shape>>,
): { next: URLSearchParams; navigationNeeded: boolean } {
	const next = new URLSearchParams(current);
	let navigationNeeded = false;

	const updatedKeys = definition.keys.filter((key) => key in updates);

	const resetKeys = new Set<string>();
	for (const key of updatedKeys) {
		for (const resetKey of definition.shape[key].resets) {
			if (!(resetKey in updates)) resetKeys.add(resetKey);
		}
	}

	for (const key of updatedKeys) {
		const def = definition.shape[key];
		if (def.loader) {
			navigationNeeded = true;
		}

		next.delete(key);
		for (const encoded of encodeParam(def, updates[key])) {
			next.append(key, encoded);
		}
	}

	for (const resetKey of resetKeys) {
		if (definition.shape[resetKey].loader && next.has(resetKey)) {
			navigationNeeded = true;
		}
		next.delete(resetKey);
	}

	return { next, navigationNeeded };
}

/**
 * Serializes only the definition's keys out of a search string. Used as a
 * cheap fingerprint: it changes exactly when one of the definition's params
 * changes in the URL.
 */
export function pickRelevantSearch(keys: string[], search: string): string {
	const searchParams = new URLSearchParams(search);
	const picked = new URLSearchParams();
	for (const key of keys) {
		for (const value of searchParams.getAll(key)) {
			picked.append(key, value);
		}
	}
	return picked.toString();
}

/** A bidirectional string codec for `SP.custom` params. `decode` must be total: report failure via `ok: false`, never throw. */
export interface ParamCodec<Value> {
	decode: (plain: string) => { ok: true; value: Value } | { ok: false };
	encode: (value: Value) => string;
}

/**
 * Param declaration helpers. `SP.param` is the canonical declaration deriving
 * the URL encoding from the value schema; `SP.json` and `SP.custom` are the
 * explicit helpers for shapes outside the derivation table.
 */
export const SP = {
	/**
	 * Declares a param whose URL encoding is derived from the valibot value
	 * schema's type tree. Supported shapes: strings, numbers, booleans, string
	 * and number picklists/enums/literals, same-base-type unions, arrays of
	 * those (encoded as repeated keys) and a top-level `v.nullable()` wrapper
	 * (`null` encodes as param absent, so `default` is omitted for those).
	 * Anything else is a `define()`-time error — use `SP.json` or `SP.custom`
	 * instead.
	 */
	param<S extends AnyValiSchema>(
		schema: S,
		opts: ParamOptions<v.InferOutput<S>>,
	): ParamDef<v.InferOutput<S>> {
		const resolved = resolveOptions(opts);
		let core: AnyValiSchema = schema;

		assertNoTransforms(core);

		if (core.type === "optional") {
			throw new Error(
				"Search params use v.nullable() instead of v.optional() (null encodes as param absent)",
			);
		}
		if (core.type === "nullable") {
			if (resolved.default !== null) {
				throw new Error(
					"A v.nullable() search param must have null as its default, otherwise null and the default could not be told apart in the URL",
				);
			}
			core = (core as unknown as { wrapped: AnyValiSchema }).wrapped;
			assertNoTransforms(core);
		}

		if (core.type === "array") {
			const itemSchema = (core as unknown as { item: AnyValiSchema }).item;
			const itemBase = deriveScalarBase(itemSchema);
			if (!itemBase) {
				throw new Error(
					`Cannot derive an URL encoding for the array item schema of a search param (got ${describeSchema(itemSchema)}). Use SP.json or SP.custom.`,
				);
			}
			return arrayParam(schema, itemSchema, itemBase, resolved);
		}

		const base = deriveScalarBase(core);
		if (!base) {
			throw new Error(
				`Cannot derive an URL encoding for a search param schema (got ${describeSchema(core)}). Use SP.json or SP.custom.`,
			);
		}
		return scalarParam(schema, base, resolved);
	},

	/** Declares the 1-based `page` param of a paginated route. */
	page(opts?: { max?: number; resets?: string[] }): ParamDef<number> {
		return SP.param(
			v.pipe(
				v.number(),
				v.integer(),
				v.minValue(1),
				v.maxValue(opts?.max ?? DEFAULT_MAX_PAGE),
			),
			{ default: 1, loader: true, resets: opts?.resets },
		);
	},

	/** Declares a param encoded as `JSON.stringify` in a single value. For objects and whole-array-as-one-param values. */
	json<S extends AnyValiSchema>(
		schema: S,
		opts: ParamOptions<v.InferOutput<S>>,
	): ParamDef<v.InferOutput<S>> {
		const resolved = resolveOptions(opts);

		return {
			...baseDef(resolved),
			decodeValues: (values) => {
				if (values.length === 0) return resolved.default;
				const plain = unwrapValue(values[0]);
				if (plain === DECODE_FAILED) return resolved.default;
				let json: unknown;
				try {
					json = JSON.parse(plain);
				} catch {
					return resolved.default;
				}
				const parsed = v.safeParse(schema, json);
				return parsed.success ? parsed.output : resolved.default;
			},
			encodePlain: (value) => [JSON.stringify(value)],
		};
	},

	/**
	 * Escape hatch: declares a param from an explicit {@link ParamCodec}. The
	 * codec's `decode` may accept legacy formats while `encode` always emits the
	 * canonical one.
	 */
	custom<Value>(
		codec: ParamCodec<Value>,
		opts: ParamOptions<Value>,
	): ParamDef<Value> {
		const resolved = resolveOptions(opts);

		return {
			...baseDef(resolved),
			decodeValues: (values) => {
				if (values.length === 0) return resolved.default;
				const plain = unwrapValue(values[0]);
				if (plain === DECODE_FAILED) return resolved.default;
				const decoded = codec.decode(plain);
				return decoded.ok ? decoded.value : resolved.default;
			},
			encodePlain: (value) => [codec.encode(value)],
		};
	},
};

function resolveOptions<T>(opts: ParamOptions<T>): ResolvedParamOptions<T> {
	const { default: defaultValue, ...rest } = opts as ParamOptionsBase & {
		default?: T;
	};

	return { ...rest, default: (defaultValue ?? null) as T };
}

function baseDef<T>(
	opts: ResolvedParamOptions<T>,
): Pick<
	ParamDef<T>,
	"default" | "loader" | "resets" | "compress" | "timeDependent" | "decodeCache"
> {
	return {
		default: opts.default,
		loader: opts.loader,
		resets: opts.resets ?? [],
		compress: opts.compress ?? false,
		timeDependent: opts.timeDependent ?? false,
		decodeCache: new Map(),
	};
}

function scalarParam<T>(
	schema: AnyValiSchema,
	base: ScalarBase,
	opts: ResolvedParamOptions<T>,
): ParamDef<T> {
	return {
		...baseDef(opts),
		decodeValues: (values) => {
			if (values.length === 0) return opts.default;
			const plain = unwrapValue(values[0]);
			if (plain === DECODE_FAILED) return opts.default;
			const candidate = plainToScalar(plain, base);
			if (candidate === DECODE_FAILED) return opts.default;
			const parsed = v.safeParse(schema, candidate);
			return parsed.success ? (parsed.output as T) : opts.default;
		},
		encodePlain: (value) => [String(value)],
	};
}

function arrayParam<T>(
	schema: AnyValiSchema,
	itemSchema: AnyValiSchema,
	itemBase: ScalarBase,
	opts: ResolvedParamOptions<T>,
): ParamDef<T> {
	return {
		...baseDef(opts),
		decodeValues: (values) => {
			if (values.length === 0) return opts.default;

			const plains: string[] = [];
			for (const value of values) {
				const plain = unwrapValue(value);
				if (plain !== DECODE_FAILED) plains.push(plain);
			}

			let items = plains;
			if (plains.length === 1) {
				if (plains[0] === "") {
					items = [];
				} else if (plains[0].startsWith("[")) {
					// legacy decode fallback for JSON-encoded arrays
					try {
						const parsed = JSON.parse(plains[0]);
						if (Array.isArray(parsed)) {
							items = parsed.map((member) => String(member));
						}
					} catch {}
				} else if (itemBase === "number" && plains[0].includes(",")) {
					// legacy decode fallback for comma-joined numeric arrays
					items = plains[0].split(",");
				}
			}

			const members: unknown[] = [];
			for (const item of items) {
				const candidate = plainToScalar(item, itemBase);
				if (candidate === DECODE_FAILED) continue;
				const parsed = v.safeParse(itemSchema, candidate);
				if (parsed.success) members.push(parsed.output);
			}

			const parsed = v.safeParse(schema, members);
			return parsed.success ? (parsed.output as T) : opts.default;
		},
		encodePlain: (value) => {
			const items = value as unknown[];
			if (items.length === 0) return [""];
			return items.map((item) => String(item));
		},
	};
}

function plainToScalar(
	plain: string,
	base: ScalarBase,
): string | number | boolean | typeof DECODE_FAILED {
	if (base === "string") return plain;

	if (base === "number") {
		if (plain.trim() === "") return DECODE_FAILED;
		const parsed = Number(plain);
		return Number.isFinite(parsed) ? parsed : DECODE_FAILED;
	}

	if (plain === "true") return true;
	if (plain === "false") return false;
	return DECODE_FAILED;
}

function deriveScalarBase(schema: AnyValiSchema): ScalarBase | null {
	if (schema.type === "string") return "string";
	if (schema.type === "number") return "number";
	if (schema.type === "boolean") return "boolean";

	if (schema.type === "picklist" || schema.type === "enum") {
		return uniformTypeOf(
			(schema as unknown as { options: unknown[] }).options,
		);
	}
	if (schema.type === "literal") {
		return uniformTypeOf([(schema as unknown as { literal: unknown }).literal]);
	}
	if (schema.type === "union") {
		const options = (schema as unknown as { options: AnyValiSchema[] })
			.options;
		const bases = options.map(deriveScalarBase);
		if (bases[0] && bases.every((base) => base === bases[0])) {
			return bases[0];
		}
		return null;
	}

	return null;
}

function assertNoTransforms(schema: AnyValiSchema) {
	const pipe = (schema as unknown as { pipe?: Array<{ kind: string }> }).pipe;
	if (pipe?.some((item) => item.kind === "transformation")) {
		throw new Error(
			`Cannot derive an URL encoding for a search param schema with transformations (got ${describeSchema(schema)} with a transform). Use SP.json or SP.custom.`,
		);
	}
}

function uniformTypeOf(values: unknown[]): ScalarBase | null {
	const types = new Set(values.map((value) => typeof value));
	if (types.size !== 1) return null;

	const type = Array.from(types)[0];
	if (type === "string" || type === "number" || type === "boolean") {
		return type;
	}
	return null;
}

function describeSchema(schema: AnyValiSchema) {
	return schema.type;
}

function toSearchParams(
	input: Request | URL | URLSearchParams,
): URLSearchParams {
	if (input instanceof URLSearchParams) return input;
	if (input instanceof URL) return input.searchParams;
	return new URL(input.url).searchParams;
}

function wrapValue<T>(plain: string, def: ParamDef<T>, mode: EncodeMode) {
	if (def.compress) return compressTransportValue(plain);

	if (mode === "compact") {
		const compressed = compressTransportValue(plain);
		const escaped = escapePlainValue(plain);
		if (urlEncodedLength(compressed) < urlEncodedLength(escaped)) {
			return compressed;
		}
	}

	return escapePlainValue(plain);
}

/** Length the value takes in the URL, i.e. percent-encoded as `URLSearchParams` writes it. */
function urlEncodedLength(value: string) {
	return new URLSearchParams([["", value]]).toString().length;
}

/**
 * Wraps a plain encoded value in the compressed transport form. Any param can
 * arrive compressed like this; used by round-trip tests and share links.
 */
export function compressTransportValue(plain: string) {
	return `${COMPRESSED_PREFIX}${compressToBase64(plain, { urlSafe: true })}`;
}

function escapePlainValue(plain: string) {
	if (!plain.startsWith(COMPRESSED_PREFIX)) return plain;

	return `${ESCAPED_PREFIX}${plain.slice(COMPRESSED_PREFIX.length)}`;
}

function unwrapValue(raw: string): string | typeof DECODE_FAILED {
	if (raw.startsWith(ESCAPED_PREFIX)) {
		return `${COMPRESSED_PREFIX}${raw.slice(ESCAPED_PREFIX.length)}`;
	}

	if (raw.startsWith(COMPRESSED_PREFIX)) {
		const decompressed = decompressFromBase64(
			raw.slice(COMPRESSED_PREFIX.length),
			{ maxDecompressedBytes: MAX_DECOMPRESSED_VALUE_BYTES },
		);
		return decompressed === null ? DECODE_FAILED : decompressed;
	}

	return raw;
}
