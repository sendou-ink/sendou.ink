import type { ShouldRevalidateFunction } from "react-router";
import { isDeepEqual } from "remeda";
import * as v from "valibot";
import { compressToBase64, decompressFromBase64 } from "~/utils/compression";

type AnySchema = v.GenericSchema<any, any>;

const COMPRESSED_PREFIX = "lz~";
const ESCAPED_PREFIX = "lz~~";
const DECODE_CACHE_MAX_SIZE = 300;
const MAX_DECOMPRESSED_VALUE_BYTES = 256 * 1024;
const DEFAULT_MAX_PAGE = 1000;

const DECODE_FAILED = Symbol("DECODE_FAILED");

type ScalarBase = "string" | "number" | "boolean";

type EncodeMode = "canonical" | "compact";

interface ParamOptionsBase {
	/** Whether changing this param must run loaders. `false` params write through `history.replaceState` and never trigger revalidation. */
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
	/** Revalidates only when a `loader: true` param's decoded canonical value changed. */
	shouldRevalidate: ShouldRevalidateFunction;
}

/** One definition per route/feature (from `SP.*` declarations) drives parsing, client state, hrefs and revalidation. */
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
		shouldRevalidate: (args) => {
			if (args.currentUrl.pathname !== args.nextUrl.pathname) {
				return args.defaultShouldRevalidate;
			}
			if (args.formMethod && args.formMethod !== "GET") {
				return args.defaultShouldRevalidate;
			}
			if (args.currentUrl.href === args.nextUrl.href) {
				return args.defaultShouldRevalidate;
			}
			const current = args.currentUrl.searchParams;
			const next = args.nextUrl.searchParams;
			if (unknownParamsChanged(keys, current, next)) {
				return args.defaultShouldRevalidate;
			}
			for (const key of keys) {
				const def = shape[key];
				if (!def.loader) continue;
				if (
					!isDeepEqual(
						decodeParam(def, current.getAll(key)),
						decodeParam(def, next.getAll(key)),
					)
				) {
					return true;
				}
			}
			return false;
		},
	};

	return definition;
}

/**
 * Decodes raw URL values, resolving to the default when missing or malformed. Cached per raw values
 * so the same string returns the same reference; `timeDependent` params skip the cache.
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

/** Encodes to URL values; empty (param absent) for the default. */
export function encodeParam<T>(
	def: ParamDef<T>,
	value: T,
	mode: EncodeMode = "canonical",
): string[] {
	if (isDeepEqual(value, def.default)) return [];

	return def.encodePlain(value).map((plain) => wrapValue(plain, def, mode));
}

/**
 * Merges a partial update into the current search params: outside params preserved, `resets` applied,
 * defaults omitted. A key written in the same batch is never reset by another key of that batch.
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

/** Only the definition's keys of a search string; a fingerprint that changes exactly when one of them does. */
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

/** Bidirectional URL encoding for an `SP.custom` param. */
export interface ParamCodec<Value> {
	/** Decodes a plain URL value; `undefined` means malformed, resolving the param to its default. */
	decode: (plain: string) => Value | undefined;
	/** Encodes a value to its canonical plain URL form. Must succeed for every value of the type. */
	encode: (value: Value) => string;
}

/** {@link ParamCodec} whose decode result is validated against `schema`; `decode` returns `undefined` for malformed input. */
export function codec<TSchema extends AnySchema>(
	schema: TSchema,
	impl: {
		decode: (encoded: string) => unknown;
		encode: (value: v.InferOutput<TSchema>) => string;
	},
): ParamCodec<v.InferOutput<TSchema>> {
	return {
		decode: (encoded) => {
			const parsed = v.safeParse(schema, impl.decode(encoded));
			return parsed.success ? parsed.output : undefined;
		},
		encode: impl.encode,
	};
}

/** Widens a codec to accept `null`, which must be the default and so never reaches `encode`. */
export function nullableCodec<Value>(
	inner: ParamCodec<Value>,
): ParamCodec<Value | null> {
	return {
		decode: inner.decode,
		encode: (value) => {
			if (value === null) {
				throw new Error(
					"Cannot encode null; a nullable search param's default is null, which is omitted from the URL",
				);
			}
			return inner.encode(value);
		},
	};
}

/** Param declarations. `SP.param` derives the encoding from the schema; `SP.json`/`SP.custom` cover the rest. */
export const SP = {
	/**
	 * Encoding derived from the schema: strings, numbers, booleans, enums/literals, same-base-type unions,
	 * arrays of those (repeated keys) and a top-level `.nullable()` (`null` = absent, no `default`).
	 * Anything else fails at `define()` time — use `SP.json` or `SP.custom`.
	 */
	param<S extends AnySchema>(
		schema: S,
		opts: ParamOptions<v.InferOutput<S>>,
	): ParamDef<v.InferOutput<S>> {
		const resolved = resolveOptions(opts);
		let core: AnySchema = schema;

		if (core.type === "optional" || core.type === "nullish") {
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
			core = (core as unknown as { wrapped: AnySchema }).wrapped;
		}

		if (core.type === "array") {
			const itemSchema = (core as unknown as { item: AnySchema }).item;
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

	/** Declares the 1-based `page` param of a paginated route, as `useSearchParamPagination` expects it. */
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
	json<S extends AnySchema>(
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

	/** Escape hatch taking a {@link ParamCodec}; `decode` may accept legacy formats, `encode` emits the canonical one. */
	custom<Value>(
		paramCodec: ParamCodec<Value>,
		opts: ParamOptions<Value>,
	): ParamDef<Value> {
		const resolved = resolveOptions(opts);

		return {
			...baseDef(resolved),
			decodeValues: (values) => {
				if (values.length === 0) return resolved.default;
				const plain = unwrapValue(values[0]);
				if (plain === DECODE_FAILED) return resolved.default;
				const decoded = paramCodec.decode(plain);
				return decoded === undefined ? resolved.default : decoded;
			},
			encodePlain: (value) => [paramCodec.encode(value)],
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
	schema: AnySchema,
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
	schema: AnySchema,
	itemSchema: AnySchema,
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

function deriveScalarBase(schema: AnySchema): ScalarBase | null {
	if (hasNonValidationPipeItems(schema)) return null;

	if (schema.type === "string") return "string";
	if (schema.type === "number") return "number";
	if (schema.type === "boolean") return "boolean";

	if (schema.type === "picklist" || schema.type === "enum") {
		return uniformTypeOf((schema as unknown as { options: unknown[] }).options);
	}
	if (schema.type === "literal") {
		return uniformTypeOf([(schema as unknown as { literal: unknown }).literal]);
	}
	if (schema.type === "union") {
		const options = (schema as unknown as { options: AnySchema[] }).options;
		const bases = options.map(deriveScalarBase);
		if (bases[0] && bases.every((base) => base === bases[0])) {
			return bases[0];
		}
		return null;
	}

	return null;
}

/** A custom transform or nested schema changes the value's type, so the encoding can't derive from the base type. */
function hasNonValidationPipeItems(schema: AnySchema): boolean {
	if (!("pipe" in schema)) return false;

	const pipeItems = (
		schema as unknown as { pipe: Array<{ kind: string; type: string }> }
	).pipe;
	return pipeItems
		.slice(1)
		.some(
			(item) =>
				item.kind === "schema" ||
				item.type === "transform" ||
				item.type === "raw_transform",
		);
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

function describeSchema(schema: AnySchema) {
	return schema.type;
}

function toSearchParams(
	input: Request | URL | URLSearchParams,
): URLSearchParams {
	if (input instanceof URLSearchParams) return input;
	if (input instanceof URL) return input.searchParams;
	return new URL(input.url).searchParams;
}

function unknownParamsChanged(
	knownKeys: string[],
	current: URLSearchParams,
	next: URLSearchParams,
): boolean {
	const unknownKeys = new Set<string>();
	for (const key of current.keys()) {
		if (!knownKeys.includes(key)) unknownKeys.add(key);
	}
	for (const key of next.keys()) {
		if (!knownKeys.includes(key)) unknownKeys.add(key);
	}

	for (const key of unknownKeys) {
		if (!isDeepEqual(current.getAll(key), next.getAll(key))) return true;
	}
	return false;
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

/** Compressed transport form of a plain value. Any param can arrive like this; used by round-trip tests and share links. */
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
