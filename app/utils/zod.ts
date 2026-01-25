import type { ZodType } from "zod";
import { z } from "zod";
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
import { FRIEND_CODE_REGEXP } from "../features/sendouq/q-constants";
import { SHORT_NANOID_LENGTH } from "./id";
import type { Unpacked } from "./types";
import { assertType } from "./types";

export const id = z.coerce.number({ message: "Required" }).int().positive();
export const idObject = z.object({
	id,
});
export const optionalId = z.coerce.number().int().positive().optional();

export const inviteCode = z.string().length(SHORT_NANOID_LENGTH);
export const inviteCodeObject = z.object({
	inviteCode,
});

export const nonEmptyString = z.string().trim().min(1, {
	message: "Required",
});

export const dbBoolean = z.coerce.number().min(0).max(1).int();

const hexCodeRegex = /^#(?:[0-9a-fA-F]{3}){1,2}[0-9]{0,2}$/; // https://stackoverflow.com/a/1636354
export const hexCode = z.string().regex(hexCodeRegex);

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

export const themeInputSchema = z.object({
	baseHue: z
		.number()
		.min(THEME_INPUT_LIMITS.BASE_HUE_MIN)
		.max(THEME_INPUT_LIMITS.BASE_HUE_MAX),
	baseChroma: z
		.number()
		.min(THEME_INPUT_LIMITS.BASE_CHROMA_MIN)
		.max(THEME_INPUT_LIMITS.BASE_CHROMA_MAX),
	accentHue: z
		.number()
		.min(THEME_INPUT_LIMITS.ACCENT_HUE_MIN)
		.max(THEME_INPUT_LIMITS.ACCENT_HUE_MAX),
	accentChroma: z
		.number()
		.min(THEME_INPUT_LIMITS.ACCENT_CHROMA_MIN)
		.max(THEME_INPUT_LIMITS.ACCENT_CHROMA_MAX),
	radiusBox: z
		.number()
		.int()
		.min(THEME_INPUT_LIMITS.RADIUS_MIN)
		.max(THEME_INPUT_LIMITS.RADIUS_MAX),
	radiusField: z
		.number()
		.int()
		.min(THEME_INPUT_LIMITS.RADIUS_MIN)
		.max(THEME_INPUT_LIMITS.RADIUS_MAX),
	radiusSelector: z
		.number()
		.int()
		.min(THEME_INPUT_LIMITS.RADIUS_MIN)
		.max(THEME_INPUT_LIMITS.RADIUS_MAX),
	borderWidth: z
		.number()
		.min(THEME_INPUT_LIMITS.BORDER_WIDTH_MIN)
		.max(THEME_INPUT_LIMITS.BORDER_WIDTH_MAX)
		.refine(
			(val) =>
				isValidStep(
					val,
					THEME_INPUT_LIMITS.BORDER_WIDTH_MIN,
					THEME_INPUT_LIMITS.BORDER_WIDTH_STEP,
				),
			{ message: "Must be a valid step increment" },
		),
	sizeField: z
		.number()
		.min(THEME_INPUT_LIMITS.SIZE_MIN)
		.max(THEME_INPUT_LIMITS.SIZE_MAX)
		.refine(
			(val) =>
				isValidStep(
					val,
					THEME_INPUT_LIMITS.SIZE_MIN,
					THEME_INPUT_LIMITS.SIZE_STEP,
				),
			{ message: "Must be a valid step increment" },
		),
	sizeSelector: z
		.number()
		.min(THEME_INPUT_LIMITS.SIZE_MIN)
		.max(THEME_INPUT_LIMITS.SIZE_MAX)
		.refine(
			(val) =>
				isValidStep(
					val,
					THEME_INPUT_LIMITS.SIZE_MIN,
					THEME_INPUT_LIMITS.SIZE_STEP,
				),
			{ message: "Must be a valid step increment" },
		),
	sizeSpacing: z
		.number()
		.min(THEME_INPUT_LIMITS.SIZE_MIN)
		.max(THEME_INPUT_LIMITS.SIZE_MAX)
		.refine(
			(val) =>
				isValidStep(
					val,
					THEME_INPUT_LIMITS.SIZE_MIN,
					THEME_INPUT_LIMITS.SIZE_STEP,
				),
			{ message: "Must be a valid step increment" },
		),
});

const timeStringRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const timeString = z.string().regex(timeStringRegex);

const abilityNameToType = (val: string) =>
	abilities.find((ability) => ability.name === val)?.type;
export const headMainSlotAbility = z
	.string()
	.refine(
		(val) =>
			["STACKABLE", "HEAD_MAIN_ONLY"].includes(abilityNameToType(val) as any),
		{ message: "forms:errors.required" },
	);
export const clothesMainSlotAbility = z
	.string()
	.refine(
		(val) =>
			["STACKABLE", "CLOTHES_MAIN_ONLY"].includes(
				abilityNameToType(val) as any,
			),
		{ message: "forms:errors.required" },
	);
export const shoesMainSlotAbility = z
	.string()
	.refine(
		(val) =>
			["STACKABLE", "SHOES_MAIN_ONLY"].includes(abilityNameToType(val) as any),
		{ message: "forms:errors.required" },
	);
export const stackableAbility = z
	.string()
	.refine((val) => abilityNameToType(val) === "STACKABLE", {
		message: "forms:errors.required",
	});

export const normalizeFriendCode = (value: string) => {
	const onlyNumbers = value.replace(/\D/g, "");

	const withDashes = onlyNumbers
		.split(/(\d{4})/)
		.filter(Boolean)
		.join("-");

	return withDashes;
};

export const friendCode = z
	.string()
	.regex(FRIEND_CODE_REGEXP)
	.transform(normalizeFriendCode);

export const ability = z.enum([
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
// keep in-game-lists and the zod enum in sync
assertType<z.infer<typeof ability>, Unpacked<typeof abilitiesShort>>();

export const weaponSplId = z.preprocess(
	actualNumber,
	numericEnum(mainWeaponIds),
);

export const subWeaponId = numericEnum(subWeaponIds);

export const specialWeaponId = numericEnum(specialWeaponIds);

export const modeShort = z.enum(["TW", "SZ", "TC", "RM", "CB"]);
export const modeShortWithSpecial = z.enum([
	"TW",
	"SZ",
	"TC",
	"RM",
	"CB",
	"SR",
	"TB",
]);

export const gamesShortSchema = z.enum(["S1", "S2", "S3"]);

export const stageId = z.preprocess(actualNumber, numericEnum(stageIds));

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

const EMPTY_CHARACTERS = ["\u200B", "\u200C", "\u200D", "\u200E", "\u200F", "󠀠"];
const EMPTY_CHARACTERS_REGEX = new RegExp(EMPTY_CHARACTERS.join("|"), "g");

const zalgoRe = /%CC%/g;
export const hasZalgo = (txt: string) => zalgoRe.test(encodeURIComponent(txt));

/** Non-empty string that has the given length (max and optionally min). Prevents z͎͗ͣḁ̵̑l̉̃ͦg̐̓̒o͓̔ͥ text as well as filters out characters that have no width. */
export const safeStringSchema = ({ min, max }: { min?: number; max: number }) =>
	z.preprocess(
		actuallyNonEmptyStringOrNull, // if this returns null, none of the checks below will run because it's not a string
		z
			.string()
			.min(min ?? 0)
			.max(max)
			.refine((text) => !hasZalgo(text), {
				message: "Includes not allowed characters.",
			}),
	);

/** Nullable string that has the given length (max and optionally min). Prevents z͎͗ͣḁ̵̑l̉̃ͦg̐̓̒o͓̔ͥ text as well as filters out characters that have no width. */
export const safeNullableStringSchema = ({
	min,
	max,
}: {
	min?: number;
	max: number;
}) =>
	z.preprocess(
		processMany(undefinedToNull, actuallyNonEmptyStringOrNull),
		z
			.string()
			.min(min ?? 0)
			.max(max)
			.nullable()
			.refine(
				(text) => {
					if (typeof text !== "string") return true;

					return !hasZalgo(text);
				},
				{
					message: "Includes not allowed characters.",
				},
			),
	);

/**
 * Processes the input value and returns a non-empty string with invisible characters cleaned out or null.
 */
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

export function undefinedToNull(value: unknown): unknown {
	if (value === undefined) return null;

	return value;
}

export function actualNumber(value: unknown) {
	if (value === "") return undefined;

	const parsed = Number(value);

	return Number.isNaN(parsed) ? undefined : parsed;
}

export function trimmedString(value: unknown) {
	if (typeof value !== "string") {
		throw new Error("Expected string value");
	}

	return value.trim();
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

export function toArray<T>(value: T | Array<T>) {
	if (Array.isArray(value)) return value;

	return [value];
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

export function checkboxValueToDbBoolean(value: unknown) {
	if (checkboxValueToBoolean(value)) return 1;

	return 0;
}

export const _action = <T extends string>(value: T) =>
	z.preprocess(deduplicate, z.literal(value));

// Fix bug at least in Safari 15 where SubmitButton value might get sent twice
export function deduplicate(value: unknown) {
	if (Array.isArray(value)) {
		const [one, two, ...rest] = value;
		if (rest.length > 0) return value;
		if (one !== two) return value;

		return one;
	}

	return value;
}

// https://github.com/colinhacks/zod/issues/1118#issuecomment-1235065111
export function numericEnum<TValues extends readonly number[]>(
	values: TValues,
) {
	return z.number().superRefine((val, ctx) => {
		if (!values.includes(val)) {
			ctx.addIssue({
				code: z.ZodIssueCode.invalid_value,
				input: val,
				values: [...values],
				message: `Expected one of: ${values.join(", ")}, received ${val}`,
			});
		}
	}) as ZodType<TValues[number]>;
}

export const dayMonthYear = z.object({
	day: z.coerce.number().int().min(1).max(31),
	month: z.coerce.number().int().min(0).max(11),
	year: z.coerce.number().int().min(2015).max(2100),
});

export type DayMonthYear = z.infer<typeof dayMonthYear>;
