import * as v from "valibot";
import { dynamicMessage } from "#lib/modules/i18n/messages.ts";

export function errorMessageId(fieldId: string) {
	return `${fieldId}-error`;
}

export function infoMessageId(fieldId: string) {
	return `${fieldId}-info`;
}

/**
 * Translates a form text that may be a namespaced translation key
 * (`"forms:labels.start"`); plain strings pass through untouched.
 */
export function translateFormText(text: string | undefined) {
	if (!text || !text.includes(":")) return text;

	const [namespace, path] = text.split(":");
	const translated = dynamicMessage(
		`${namespace}_${path.replaceAll(/[.-]/g, "_")}`,
	);

	// an unknown key resolves to itself; show the original text in that case
	return translated === `${namespace}_${path.replaceAll(/[.-]/g, "_")}`
		? text
		: translated;
}

/** Resolves a form field item's label (a key, a plain value or a producer fn). */
export function translateItemLabel(label: string | number | (() => string)) {
	if (typeof label === "function") return label();
	if (typeof label === "string") return translateFormText(label) ?? label;
	return String(label);
}

/**
 * Accessibility attributes for a form control. Ids are derived from the field
 * `name` because the error/info messages render with name-based ids — the
 * error id is also included in `aria-describedby` since `aria-errormessage`
 * support in screen readers is still inconsistent.
 */
export function ariaAttributes({
	name,
	error,
	bottomText,
	required,
}: {
	name?: string;
	error?: string;
	bottomText?: string;
	required?: boolean;
}) {
	const describedBy = name
		? [
				error ? errorMessageId(name) : undefined,
				bottomText ? infoMessageId(name) : undefined,
			]
				.filter((id) => id !== undefined)
				.join(" ")
		: "";

	return {
		"aria-invalid": error ? ("true" as const) : undefined,
		"aria-describedby": describedBy !== "" ? describedBy : undefined,
		"aria-errormessage": error && name ? errorMessageId(name) : undefined,
		"aria-required": required ? ("true" as const) : undefined,
	};
}

export type AnyFormSchema = v.GenericSchema<
	Record<string, unknown>,
	Record<string, unknown>
>;

/**
 * The underlying object schema of a form schema, unwrapping `v.pipe(...)`
 * wrappers added by cross-field checks/transforms.
 */
export function objectEntries(
	schema: AnyFormSchema,
): Record<string, v.GenericSchema<unknown, unknown>> {
	const unwrapped = unwrapToObject(schema);
	return unwrapped?.entries ?? {};
}

function unwrapToObject(
	schema: unknown,
): { entries: Record<string, v.GenericSchema<unknown, unknown>> } | undefined {
	if (typeof schema !== "object" || schema === null) return undefined;

	if ("entries" in schema) {
		return schema as {
			entries: Record<string, v.GenericSchema<unknown, unknown>>;
		};
	}

	if ("pipe" in schema && Array.isArray((schema as { pipe: unknown[] }).pipe)) {
		return unwrapToObject((schema as { pipe: unknown[] }).pipe[0]);
	}

	return undefined;
}

/**
 * Builds a form field name (e.g. `members[0].userId`) from a valibot issue
 * path so that server- and client-side validation errors key fields
 * identically.
 */
export function buildFieldPath(
	path: ReadonlyArray<{ key: unknown }> | undefined,
): string | null {
	if (!path || path.length === 0) return null;

	return path
		.map((segment, index) => {
			const key = segment.key;
			if (typeof key === "number") return `[${key}]`;
			if (typeof key !== "string") return null;
			return index === 0 ? key : `.${key}`;
		})
		.filter((part) => part !== null)
		.join("");
}

/**
 * Validates a single top-level field's value against its schema, mapping
 * common empty-value failures to the generic required message.
 */
export function validateField(
	schema: AnyFormSchema,
	name: string,
	value: unknown,
): string | undefined {
	const fieldSchema = objectEntries(schema)[name];
	if (!fieldSchema) return undefined;

	const result = v.safeParse(fieldSchema, value);
	if (result.success) return undefined;

	const issue = result.issues[0];
	if (!issue) return undefined;

	const valueIsEmpty = value === null || value === undefined || value === "";
	if (
		valueIsEmpty &&
		(issue.kind === "schema" ||
			issue.type === "min_length" ||
			issue.type === "min_value")
	) {
		return "forms:errors.required";
	}

	if (
		issue.type === "min_length" &&
		(issue as { requirement?: unknown }).requirement === 1
	) {
		return "forms:errors.required";
	}

	return issue.message;
}

/**
 * Derives all client errors from a single full-schema parse. Each issue is
 * attributed both to its top-level field (single-control composites read their
 * error keyed by their own name even when the issue points inside the value)
 * and to its full nested path.
 */
export function computeFieldErrors(
	schema: AnyFormSchema,
	values: Record<string, unknown>,
): Record<string, string> {
	const newErrors: Record<string, string> = {};

	const fullValidation = v.safeParse(schema, values);
	if (fullValidation.success) return newErrors;

	for (const issue of fullValidation.issues) {
		const firstKey = issue.path?.[0]?.key;
		const topLevelKey = typeof firstKey === "string" ? firstKey : undefined;
		if (topLevelKey && newErrors[topLevelKey] === undefined) {
			const topLevelError = validateField(
				schema,
				topLevelKey,
				values[topLevelKey],
			);
			newErrors[topLevelKey] = topLevelError ?? issue.message;
		}
	}

	return newErrors;
}

export function computeTopLevelFieldErrors(
	schema: AnyFormSchema,
	values: Record<string, unknown>,
): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const key of Object.keys(objectEntries(schema))) {
		const error = validateField(schema, key, values[key]);
		if (error) errors[key] = error;
	}
	return errors;
}
