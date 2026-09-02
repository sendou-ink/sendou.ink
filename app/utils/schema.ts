import * as v from "valibot";
import {
	abilities,
	type abilitiesShort,
} from "~/modules/in-game-lists/abilities";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
} from "~/modules/in-game-lists/weapon-ids";
import { SHORT_NANOID_LENGTH } from "./id";
import type { Unpacked } from "./types";
import { assertType } from "./types";

/** Any synchronous valibot schema. */
export type AnySyncSchema = v.GenericSchema<any, any>;

/** Any valibot schema, sync or async. */
export type AnySchema = AnySyncSchema | v.GenericSchemaAsync<any, any>;

/** Runs `fn` on the raw input before validating it with `schema`. */
export function preprocess<TSchema extends AnySyncSchema>(
	fn: (value: unknown) => unknown,
	schema: TSchema,
) {
	return v.pipe(
		v.unknown(),
		v.transform(fn as (value: unknown) => v.InferInput<TSchema>),
		schema,
	);
}

/** Issue collector the cross-field validators report to (see {@link superRefine}). */
export interface ValidationCtx {
	addIssue: (issue: { message: string; path?: PropertyKey[] }) => void;
}

/** Validation action running `fn` on the parsed value with an `addIssue` taking plain key paths. */
export function superRefine<TValue>(
	fn: (value: TValue, ctx: ValidationCtx) => void,
) {
	return v.rawCheck<TValue>(({ dataset, addIssue }) => {
		if (!dataset.typed) return;
		fn(dataset.value, {
			addIssue: (issue) => {
				addIssue({
					message: issue.message,
					path: issue.path?.length
						? toIssuePath(dataset.value, issue.path)
						: undefined,
				});
			},
		});
	});
}

/** Async counterpart of {@link superRefine}. */
export function superRefineAsync<TValue>(
	fn: (value: TValue, ctx: ValidationCtx) => Promise<void>,
) {
	return v.rawCheckAsync<TValue>(async ({ dataset, addIssue }) => {
		if (!dataset.typed) return;
		await fn(dataset.value, {
			addIssue: (issue) => {
				addIssue({
					message: issue.message,
					path: issue.path?.length
						? toIssuePath(dataset.value, issue.path)
						: undefined,
				});
			},
		});
	});
}

function toIssuePath(
	root: unknown,
	keys: PropertyKey[],
): [v.IssuePathItem, ...v.IssuePathItem[]] {
	let current: unknown = root;
	const items = keys.map((key) => {
		const value = (current as Record<PropertyKey, unknown> | undefined)?.[key];
		const item = {
			type: "unknown" as const,
			origin: "value" as const,
			input: current,
			key,
			value,
		};
		current = value;
		return item;
	});
	return items as unknown as [v.IssuePathItem, ...v.IssuePathItem[]];
}

/** Coerces the input with `Number()` before validating. */
export function coerceNumber(message?: string) {
	return v.pipe(v.unknown(), v.transform(Number), v.number(message));
}

export const id = v.pipe(coerceNumber("Required"), v.integer(), v.minValue(1));
export const idObject = v.object({
	id,
});

export const inviteCode = v.pipe(v.string(), v.length(SHORT_NANOID_LENGTH));

export const nonEmptyString = v.pipe(
	v.string(),
	v.trim(),
	v.minLength(1, "Required"),
);

// matches #RGB and #RRGGBB only (no alpha) https://stackoverflow.com/a/1636354
const hexCodeWithoutAlphaRegex = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
export const hexCodeWithoutAlpha = v.pipe(
	v.string(),
	v.regex(hexCodeWithoutAlphaRegex),
);

export const THEME_INPUT_LIMITS = {
	BASE_HUE_MIN: 0,
	BASE_HUE_MAX: 360,
	BASE_CHROMA_MIN: 0,
	BASE_CHROMA_MAX: 0.1,
	ACCENT_HUE_MIN: 0,
	ACCENT_HUE_MAX: 360,
	ACCENT_CHROMA_MIN: 0,
	ACCENT_CHROMA_MAX: 0.3,
	RADIUS_MIN: 0,
	RADIUS_MAX: 5,
	RADIUS_STEP: 1,
	BORDER_WIDTH_MIN: 0.5,
	BORDER_WIDTH_MAX: 2,
	BORDER_WIDTH_STEP: 0.5,
	SIZE_MIN: 0.9,
	SIZE_MAX: 1.1,
	SIZE_STEP: 0.05,
} as const;

function isValidStep(value: number, min: number, step: number) {
	const diff = value - min;
	const steps = Math.round(diff / step);
	return Math.abs(diff - steps * step) < 0.0001;
}

export const themeInputSchema = v.object({
	baseHue: v.pipe(
		v.number(),
		v.minValue(THEME_INPUT_LIMITS.BASE_HUE_MIN),
		v.maxValue(THEME_INPUT_LIMITS.BASE_HUE_MAX),
	),
	baseChroma: v.pipe(
		v.number(),
		v.minValue(THEME_INPUT_LIMITS.BASE_CHROMA_MIN),
		v.maxValue(THEME_INPUT_LIMITS.BASE_CHROMA_MAX),
	),
	accentHue: v.pipe(
		v.number(),
		v.minValue(THEME_INPUT_LIMITS.ACCENT_HUE_MIN),
		v.maxValue(THEME_INPUT_LIMITS.ACCENT_HUE_MAX),
	),
	accentChroma: v.pipe(
		v.number(),
		v.minValue(THEME_INPUT_LIMITS.ACCENT_CHROMA_MIN),
		v.maxValue(THEME_INPUT_LIMITS.ACCENT_CHROMA_MAX),
	),
	chatHue: v.nullable(
		v.pipe(
			v.number(),
			v.minValue(THEME_INPUT_LIMITS.BASE_HUE_MIN),
			v.maxValue(THEME_INPUT_LIMITS.BASE_HUE_MAX),
		),
	),
	radiusBox: v.pipe(
		v.number(),
		v.integer(),
		v.minValue(THEME_INPUT_LIMITS.RADIUS_MIN),
		v.maxValue(THEME_INPUT_LIMITS.RADIUS_MAX),
	),
	radiusField: v.pipe(
		v.number(),
		v.integer(),
		v.minValue(THEME_INPUT_LIMITS.RADIUS_MIN),
		v.maxValue(THEME_INPUT_LIMITS.RADIUS_MAX),
	),
	radiusSelector: v.pipe(
		v.number(),
		v.integer(),
		v.minValue(THEME_INPUT_LIMITS.RADIUS_MIN),
		v.maxValue(THEME_INPUT_LIMITS.RADIUS_MAX),
	),
	borderWidth: v.pipe(
		v.number(),
		v.minValue(THEME_INPUT_LIMITS.BORDER_WIDTH_MIN),
		v.maxValue(THEME_INPUT_LIMITS.BORDER_WIDTH_MAX),
		v.check(
			(val) =>
				isValidStep(
					val,
					THEME_INPUT_LIMITS.BORDER_WIDTH_MIN,
					THEME_INPUT_LIMITS.BORDER_WIDTH_STEP,
				),
			"Must be a valid step increment",
		),
	),
	sizeField: v.pipe(
		v.number(),
		v.minValue(THEME_INPUT_LIMITS.SIZE_MIN),
		v.maxValue(THEME_INPUT_LIMITS.SIZE_MAX),
		v.check(
			(val) =>
				isValidStep(
					val,
					THEME_INPUT_LIMITS.SIZE_MIN,
					THEME_INPUT_LIMITS.SIZE_STEP,
				),
			"Must be a valid step increment",
		),
	),
	sizeSelector: v.pipe(
		v.number(),
		v.minValue(THEME_INPUT_LIMITS.SIZE_MIN),
		v.maxValue(THEME_INPUT_LIMITS.SIZE_MAX),
		v.check(
			(val) =>
				isValidStep(
					val,
					THEME_INPUT_LIMITS.SIZE_MIN,
					THEME_INPUT_LIMITS.SIZE_STEP,
				),
			"Must be a valid step increment",
		),
	),
	sizeSpacing: v.pipe(
		v.number(),
		v.minValue(THEME_INPUT_LIMITS.SIZE_MIN),
		v.maxValue(THEME_INPUT_LIMITS.SIZE_MAX),
		v.check(
			(val) =>
				isValidStep(
					val,
					THEME_INPUT_LIMITS.SIZE_MIN,
					THEME_INPUT_LIMITS.SIZE_STEP,
				),
			"Must be a valid step increment",
		),
	),
});

const timeStringRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const timeString = v.pipe(v.string(), v.regex(timeStringRegex));

const abilityNameToType = (val: string) =>
	abilities.find((ability) => ability.name === val)?.type;
export const headMainSlotAbility = v.pipe(
	v.string(),
	v.check(
		(val) =>
			["STACKABLE", "HEAD_MAIN_ONLY"].includes(abilityNameToType(val) as any),
		"forms:errors.required",
	),
);
export const clothesMainSlotAbility = v.pipe(
	v.string(),
	v.check(
		(val) =>
			["STACKABLE", "CLOTHES_MAIN_ONLY"].includes(
				abilityNameToType(val) as any,
			),
		"forms:errors.required",
	),
);
export const shoesMainSlotAbility = v.pipe(
	v.string(),
	v.check(
		(val) =>
			["STACKABLE", "SHOES_MAIN_ONLY"].includes(abilityNameToType(val) as any),
		"forms:errors.required",
	),
);
export const stackableAbility = v.pipe(
	v.string(),
	v.check(
		(val) => abilityNameToType(val) === "STACKABLE",
		"forms:errors.required",
	),
);

export const normalizeFriendCode = (value: string) => {
	const onlyNumbers = value.replace(/\D/g, "");

	const withDashes = onlyNumbers
		.split(/(\d{4})/)
		.filter(Boolean)
		.join("-");

	return withDashes;
};

export const ability = v.picklist([
	"ISM",
	"ISS",
	"IRU",
	"RSU",
	"SSU",
	"SCU",
	"SS",
	"SPU",
	"QR",
	"QSJ",
	"BRU",
	"RES",
	"SRU",
	"IA",
	"OG",
	"LDE",
	"T",
	"CB",
	"NS",
	"H",
	"TI",
	"RP",
	"AD",
	"SJ",
	"OS",
	"DR",
]);
// keep in-game-lists and the valibot enum in sync
assertType<v.InferOutput<typeof ability>, Unpacked<typeof abilitiesShort>>();

export const weaponSplId = preprocess(actualNumber, numericEnum(mainWeaponIds));

export const subWeaponId = numericEnum(subWeaponIds);

export const specialWeaponId = numericEnum(specialWeaponIds);

export const modeShort = v.picklist(["TW", "SZ", "TC", "RM", "CB"]);
export const modeShortWithSpecial = v.picklist([
	"TW",
	"SZ",
	"TC",
	"RM",
	"CB",
	"SR",
	"TB",
]);

export const gamesShortSchema = v.picklist(["S1", "S2", "S3"]);

export const stageId = preprocess(actualNumber, numericEnum(stageIds));

export function processMany(
	...processFuncs: Array<(value: unknown) => unknown>
) {
	return (value: unknown) => {
		let result = value;

		for (const processFunc of processFuncs) {
			result = processFunc(result);
		}

		return result;
	};
}

export function safeJSONParse(value: unknown): unknown {
	try {
		if (typeof value !== "string") return value;
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

const EMPTY_CHARACTERS = [
	"\u00AD",
	"\u200B",
	"\u200C",
	"\u200D",
	"\u200E",
	"\u200F",
	"󠀠",
	"\u2800",
	"\u3164",
	"\u115F",
	"\u1160",
	"\uFEFF",
	"\u2060",
	"[\\uFE00-\\uFE0F]",
];
const EMPTY_CHARACTERS_REGEX = new RegExp(EMPTY_CHARACTERS.join("|"), "g");

const zalgoRe = /%CC%/;
export const hasZalgo = (txt: string) => zalgoRe.test(encodeURIComponent(txt));

/** Non-empty string that has the given length (max and optionally min). Prevents z͎͗ͣḁ̵̑l̉̃ͦg̐̓̒o͓̔ͥ text as well as filters out characters that have no width. */
export const safeStringSchema = ({ min, max }: { min?: number; max: number }) =>
	preprocess(
		actuallyNonEmptyStringOrNull, // null skips the string checks below
		v.pipe(
			v.string(),
			v.minLength(min ?? 0),
			v.maxLength(max),
			v.check((text) => !hasZalgo(text), "Includes not allowed characters."),
		),
	);

/** Nullable string that has the given length (max and optionally min). Prevents z͎͗ͣḁ̵̑l̉̃ͦg̐̓̒o͓̔ͥ text as well as filters out characters that have no width. */
export const safeNullableStringSchema = ({
	min,
	max,
}: {
	min?: number;
	max: number;
}) =>
	preprocess(
		processMany(undefinedToNull, actuallyNonEmptyStringOrNull),
		v.pipe(
			v.nullable(v.pipe(v.string(), v.minLength(min ?? 0), v.maxLength(max))),
			v.check((text) => {
				if (typeof text !== "string") return true;

				return !hasZalgo(text);
			}, "Includes not allowed characters."),
		),
	);

/** Non-empty string with invisible characters cleaned out, or null. */
export function actuallyNonEmptyStringOrNull(value: unknown) {
	if (typeof value !== "string") return value;

	const trimmed = value.replace(EMPTY_CHARACTERS_REGEX, "").trim();

	return trimmed === "" ? null : trimmed;
}

export function falsyToNull(value: unknown): unknown {
	if (value) return value;

	return null;
}

export function nullLiteraltoNull(value: unknown): unknown {
	if (value === "null") return null;

	return value;
}

function undefinedToNull(value: unknown): unknown {
	if (value === undefined) return null;

	return value;
}

export function actualNumber(value: unknown) {
	if (value === "") return undefined;

	const parsed = Number(value);

	return Number.isNaN(parsed) ? undefined : parsed;
}

export function date(value: unknown) {
	if (typeof value === "string" || typeof value === "number") {
		const valueAsNumber = Number(value);

		return new Date(Number.isNaN(valueAsNumber) ? value : valueAsNumber);
	}

	return value;
}

export function noDuplicates(arr: (number | string)[]) {
	return new Set(arr).size === arr.length;
}

export function filterOutNullishMembers(value: unknown) {
	if (!Array.isArray(value)) return value;

	return value.filter((member) => member !== null && member !== undefined);
}

export function removeDuplicates(value: unknown) {
	if (!Array.isArray(value)) return value;

	return Array.from(new Set(value));
}

export function emptyArrayToNull(value: unknown) {
	if (Array.isArray(value) && value.length === 0) return null;

	return value;
}

export function checkboxValueToBoolean(value: unknown) {
	if (!value) return false;

	if (typeof value !== "string") {
		throw new Error("Expected string checkbox value");
	}

	return value === "on";
}

export const _action = <T extends string>(value: T) =>
	preprocess(deduplicate, v.literal(value));

/** Works around a bug at least in Safari 15 where a SubmitButton value might get sent twice */
export function deduplicate(value: unknown) {
	if (Array.isArray(value)) {
		const [one, two, ...rest] = value;
		if (rest.length > 0) return value;
		if (one !== two) return value;

		return one;
	}

	return value;
}

/** Number schema accepting only the given values, the numeric counterpart of `v.picklist`. */
export function numericEnum<TValues extends readonly number[]>(
	values: TValues,
) {
	return v.pipe(
		v.number(),
		v.check(
			(val) => values.includes(val),
			(issue) =>
				`Expected one of: ${values.join(", ")}, received ${issue.input}`,
		),
	) as unknown as v.GenericSchema<number, TValues[number]>;
}

export const dayMonthYear = v.object({
	day: v.pipe(coerceNumber(), v.integer(), v.minValue(1), v.maxValue(31)),
	month: v.pipe(coerceNumber(), v.integer(), v.minValue(0), v.maxValue(11)),
	year: v.pipe(coerceNumber(), v.integer(), v.minValue(2015), v.maxValue(2100)),
});

export type DayMonthYear = v.InferOutput<typeof dayMonthYear>;
