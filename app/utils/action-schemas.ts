import type { z } from "zod";

/** `_action` literals of an action schema (union or single branch). */
export type ActionsOf<TSchema extends z.ZodTypeAny> =
	z.infer<TSchema> extends {
		_action: infer TAction extends string;
	}
		? TAction
		: never;

/** Non-`_action` fields of the schema branch matching the given action, in parsed types. */
export type FieldsOf<
	TSchema extends z.ZodTypeAny,
	TAction extends string,
> = Omit<Extract<z.infer<TSchema>, { _action: TAction }>, "_action">;

/** Serializes a parsed field value into its form data representation. */
export function serializeFieldValue(value: unknown) {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	return JSON.stringify(value);
}
