import type { ZodType } from "zod";
import { z } from "zod";
import { CUSTOM_CSS_VAR_COLORS } from "~/constants";
import type { abilitiesShort } from "~/modules/in-game-lists";
import { abilities, mainWeaponIds, stageIds } from "~/modules/in-game-lists";
import { FRIEND_CODE_REGEXP } from "../features/sendouq/q-constants";
import type { Unpacked } from "./types";
import { assertType } from "./types";

export const id = z.coerce.number({ message: "Required" }).int().positive();
export const optionalId = z.coerce.number().int().positive().optional();

export const nonEmptyString = z.string().trim().min(1, {
	message: "Required",
});

export const dbBoolean = z.coerce.number().min(0).max(1).int();

const hexCodeRegex = /^#(?:[0-9a-fA-F]{3}){1,2}[0-9]{0,2}$/; // https://stackoverflow.com/a/1636354
export const hexCode = z.string().regex(hexCodeRegex);

const abilityNameToType = (val: string) =>
	abilities.find((ability) => ability.name === val)?.type;
export const headMainSlotAbility = z
	.string()
	.refine((val) =>
		["STACKABLE", "HEAD_MAIN_ONLY"].includes(abilityNameToType(val) as any),
	);
export const clothesMainSlotAbility = z
	.string()
	.refine((val) =>
		["STACKABLE", "CLOTHES_MAIN_ONLY"].includes(abilityNameToType(val) as any),
	);
export const shoesMainSlotAbility = z
	.string()
	.refine((val) =>
		["STACKABLE", "SHOES_MAIN_ONLY"].includes(abilityNameToType(val) as any),
	);
export const stackableAbility = z
	.string()
	.refine((val) => abilityNameToType(val) === "STACKABLE");

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

export const modeShort = z.enum(["TW", "SZ", "TC", "RM", "CB"]);

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
		const parsedValue = z.string().parse(value);
		return JSON.parse(parsedValue);
	} catch (e) {
		return undefined;
	}
}

/**
 * Safely splits a string by a specified delimiter as Zod preprocess function.
 *
 * @param splitBy - The delimiter to split the string by. Defaults to a comma (",").
 * @returns A function that takes a value and returns the split string if the value is a string,
 *          otherwise returns the original value.
 */
export const safeSplit =
	(splitBy = ",") =>
	(value: unknown): unknown => {
		if (typeof value !== "string") return value;

		return value.split(splitBy);
	};

export function falsyToNull(value: unknown): unknown {
	if (value) return value;

	return null;
}

export function nullLiteraltoNull(value: unknown): unknown {
	if (value === "null") return null;

	return value;
}

export function jsonParseable(value: unknown) {
	try {
		JSON.parse(value as string);
		return true;
	} catch {
		return false;
	}
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

export const _action = <T extends z.Primitive>(value: T) =>
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
				code: z.ZodIssueCode.invalid_enum_value,
				options: [...values],
				received: val,
			});
		}
	}) as ZodType<TValues[number]>;
}

export const dayMonthYear = z.object({
	day: z.number().int().min(1).max(31),
	month: z.number().int().min(0).max(11),
	year: z.number().int().min(2015).max(2100),
});

export type DayMonthYear = z.infer<typeof dayMonthYear>;

export const customCssVarObject = z.preprocess(
	falsyToNull,
	z.string().nullable().refine(validSerializedCustomCssVarObject, {
		message: "Invalid custom CSS var object",
	}),
);

function validSerializedCustomCssVarObject(value: unknown) {
	if (!value) return true;

	try {
		const parsedValue = JSON.parse(value as string);

		for (const [key, value] of Object.entries(parsedValue)) {
			if (!CUSTOM_CSS_VAR_COLORS.includes(key as any)) return false;
			if (!hexCodeRegex.test(value as string)) return false;
		}

		return true;
	} catch {
		return false;
	}
}
