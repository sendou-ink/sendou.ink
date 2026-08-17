import { stageIds } from "@sendou/in-game-lists/stage-ids";
import type { StageId } from "@sendou/in-game-lists/types";
import * as v from "valibot";

/** Valibot ports of the React app's `~/utils/zod.ts` primitives. */

export const id = v.pipe(
	v.unknown(),
	v.transform((value) => (typeof value === "number" ? value : Number(value))),
	v.number("Required"),
	v.check((value) => Number.isInteger(value) && value > 0, "Required"),
);

export const idObject = v.object({ id });

export const stageId = v.pipe(
	v.unknown(),
	v.transform((value) => (typeof value === "number" ? value : Number(value))),
	v.picklist(stageIds as unknown as StageId[]),
);

const TIME_STRING_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const timeString = v.pipe(v.string(), v.regex(TIME_STRING_REGEX));

const EMPTY_CHARACTERS = [
	"\u00AD",
	"\u200B",
	"\u200C",
	"\u200D",
	"\u200E",
	"\u200F",
	"\u{E0020}",
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

/**
 * Processes the input value and returns a non-empty string with invisible
 * characters cleaned out or null.
 */
export function actuallyNonEmptyStringOrNull(value: unknown) {
	if (typeof value !== "string") return value;

	const trimmed = value.replace(EMPTY_CHARACTERS_REGEX, "").trim();

	return trimmed === "" ? null : trimmed;
}

/** Non-empty string that has the given length (max and optionally min). Prevents z͎͗ͣḁ̵̑l̉̃ͦg̐̓̒o͓̔ͥ text as well as filters out characters that have no width. */
export const safeStringSchema = ({ min, max }: { min?: number; max: number }) =>
	v.pipe(
		v.unknown(),
		v.transform(actuallyNonEmptyStringOrNull),
		v.string(),
		v.minLength(min ?? 0),
		v.maxLength(max),
		v.check((text) => !hasZalgo(text), "Includes not allowed characters."),
	);

/** Nullable string that has the given length (max and optionally min). Prevents z͎͗ͣḁ̵̑l̉̃ͦg̐̓̒o͓̔ͥ text as well as filters out characters that have no width. */
export const safeNullableStringSchema = ({
	min,
	max,
}: {
	min?: number;
	max: number;
}) =>
	v.pipe(
		v.unknown(),
		v.transform((value) => actuallyNonEmptyStringOrNull(value ?? null)),
		v.nullable(
			v.pipe(
				v.string(),
				v.minLength(min ?? 0),
				v.maxLength(max),
				v.check((text) => !hasZalgo(text), "Includes not allowed characters."),
			),
		),
	);

/** Coerces string/number inputs to a `Date` before validating. */
export const coercedDate = (
	...checks: Array<v.GenericPipeAction<Date, Date>>
) =>
	v.pipe(
		v.unknown(),
		v.transform(toDate),
		v.date("forms:errors.required"),
		...(checks as []),
	);

function toDate(value: unknown) {
	if (typeof value === "string" || typeof value === "number") {
		const valueAsNumber = Number(value);

		return new Date(Number.isNaN(valueAsNumber) ? value : valueAsNumber);
	}

	return value;
}

export function falsyToNull(value: unknown): unknown {
	if (value) return value;

	return null;
}

export function noDuplicates(arr: Array<number | string>) {
	return new Set(arr).size === arr.length;
}

export function filterOutNullishMembers(value: unknown) {
	if (!Array.isArray(value)) return value;

	return value.filter((member) => member !== null && member !== undefined);
}
