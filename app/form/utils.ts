import * as v from "valibot";
import type { AnySyncSchema } from "~/utils/schema";
import { getFormFieldMetadata } from "./fields";
import type { FormField, FormObjectSchema } from "./types";

export function infoMessageId(fieldId: string) {
	return `${fieldId}-info`;
}

/** Builds a field name (e.g. `members[0].userId`) from an issue path so server and client errors key fields identically. */
export function buildFieldPath(path: PropertyKey[]): string | null {
	if (path.length === 0) return null;

	return path
		.map((segment, index) => {
			if (typeof segment === "number") return `[${segment}]`;
			if (typeof segment === "symbol") return null;
			return index === 0 ? segment : `.${segment}`;
		})
		.filter((part) => part !== null)
		.join("");
}

/** Path of a valibot issue as plain keys, for {@link buildFieldPath}. */
export function issuePathKeys(issue: v.BaseIssue<unknown>): PropertyKey[] {
	return (issue.path ?? []).map((item) => (item as { key: PropertyKey }).key);
}

export function getNestedValue(
	obj: Record<string, unknown>,
	path: string,
): unknown {
	const parts = parsePath(path);
	let current: unknown = obj;
	for (const part of parts) {
		if (current === null || current === undefined) return undefined;
		if (typeof part === "number") {
			current = (current as unknown[])[part];
		} else {
			current = (current as Record<string, unknown>)[part];
		}
	}
	return current;
}

function parsePath(path: string): (string | number)[] {
	const parts: (string | number)[] = [];
	const regex = /([^.[[\]]+)|\[(\d+)\]/g;
	const matches = path.matchAll(regex);
	for (const match of matches) {
		if (match[1] !== undefined) {
			parts.push(match[1]);
		} else if (match[2] !== undefined) {
			parts.push(Number(match[2]));
		}
	}
	return parts;
}

export function setNestedValue(
	obj: Record<string, unknown>,
	path: string,
	value: unknown,
): Record<string, unknown> {
	const parts = parsePath(path);
	if (parts.length === 0) return obj;
	if (parts.length === 1) {
		const key = parts[0]!;
		if (typeof key === "number") {
			const arr = Array.isArray(obj) ? [...obj] : [];
			arr[key] = value;
			return arr as unknown as Record<string, unknown>;
		}
		return { ...obj, [key]: value };
	}

	const [head, ...tail] = parts;
	const tailPath = tail
		.map((p) => (typeof p === "number" ? `[${p}]` : p))
		.join(".")
		.replace(/\.\[/g, "[");

	if (typeof head === "number") {
		const arr = Array.isArray(obj) ? [...obj] : [];
		arr[head] = setNestedValue(
			(arr[head] as Record<string, unknown>) ?? {},
			tailPath,
			value,
		);
		return arr as unknown as Record<string, unknown>;
	}

	const nested = (obj[head] as Record<string, unknown>) ?? {};
	return {
		...obj,
		[head]: setNestedValue(nested, tailPath, value),
	};
}

/** Default value of a `fieldset` field built from its sub-fields' `initialValue`s. `{}` for non-fieldset fields. */
export function fieldsetDefaults(
	fieldsetMeta: FormField,
): Record<string, unknown> {
	if (fieldsetMeta.type !== "fieldset") return {};

	const entries = fieldsetMeta.fields.entries as Record<string, AnySyncSchema>;
	const result: Record<string, unknown> = {};
	for (const [key, fieldSchema] of Object.entries(entries)) {
		const fieldMeta = getFormFieldMetadata(fieldSchema);
		if (fieldMeta) result[key] = fieldMeta.initialValue;
	}
	return result;
}

/**
 * Editing a leaf inside an array-of-fieldset item (e.g. `staff[0].userId`) creates the item on demand;
 * seeds it with its fieldset defaults (keeping existing values) so fallback-only defaults like a
 * required `select`'s first option aren't dropped and fail validation. Untouched items are never created.
 */
export function seedArrayItemDefaults(
	schema: FormObjectSchema,
	values: Record<string, unknown>,
	name: string,
): Record<string, unknown> {
	const lastBracket = name.lastIndexOf("]");
	// no enclosing array item, or the leaf is a primitive array element itself
	if (lastBracket === -1 || lastBracket === name.length - 1) return values;

	const itemPath = name.slice(0, lastBracket + 1);
	const itemSchema = getNestedSchema(schema, itemPath);
	if (!itemSchema) return values;

	const itemMeta = getFormFieldMetadata(itemSchema);
	if (itemMeta?.type !== "fieldset") return values;

	const existing = getNestedValue(values, itemPath) as
		| Record<string, unknown>
		| undefined;
	const merged = { ...fieldsetDefaults(itemMeta), ...(existing ?? {}) };
	return setNestedValue(values, itemPath, merged);
}

export function getNestedSchema(
	schema: FormObjectSchema,
	path: string,
): AnySyncSchema | undefined {
	const parts = parsePath(path);
	let current: AnySyncSchema = schema;

	for (const part of parts) {
		const unwrapped = unwrapSchema(current);

		if (typeof part === "number") {
			if (unwrapped.type === "array" && "item" in unwrapped) {
				current = (unwrapped as unknown as { item: AnySyncSchema }).item;
			} else {
				return undefined;
			}
		} else if ("entries" in unwrapped) {
			const nextSchema = (
				unwrapped as unknown as { entries: Record<string, AnySyncSchema> }
			).entries[part];
			if (!nextSchema) return undefined;
			current = nextSchema;
		} else {
			return undefined;
		}
	}

	return current;
}

/** Unwraps optional/nullable/nullish wrappers and pipes down to the schema carrying `entries`/`item`. */
function unwrapSchema(schema: AnySyncSchema): AnySyncSchema {
	if (
		(schema.type === "optional" ||
			schema.type === "nullable" ||
			schema.type === "nullish") &&
		"wrapped" in schema
	) {
		return unwrapSchema(
			(schema as unknown as { wrapped: AnySyncSchema }).wrapped,
		);
	}

	if ("pipe" in schema) {
		const pipeItems = (schema as unknown as { pipe: Array<{ kind: string }> })
			.pipe;
		const schemas = pipeItems.filter((item) => item.kind === "schema");
		const last = schemas[schemas.length - 1];
		if (last && last !== pipeItems[0]) {
			return unwrapSchema(last as unknown as AnySyncSchema);
		}
	}

	return schema;
}

export function errorMessageId(fieldId: string) {
	return `${fieldId}-error`;
}

export function validateField(
	schema: FormObjectSchema,
	name: string,
	value: unknown,
): string | undefined {
	const fieldSchema = name.includes(".")
		? getNestedSchema(schema, name)
		: (schema.entries[name] as AnySyncSchema | undefined);
	if (!fieldSchema) return undefined;

	const result = v.safeParse(fieldSchema, value);
	if (result.success) return undefined;

	// `array`/`fieldset` children render their own error slots, so nested issues belong to the child;
	// other composites (e.g. a custom tuple) render as one control and own their nested issues
	const fieldMeta = getFormFieldMetadata(fieldSchema);
	const childrenRenderOwnErrors =
		fieldMeta?.type === "array" || fieldMeta?.type === "fieldset";
	const issue = childrenRenderOwnErrors
		? result.issues.find((i) => !i.path || i.path.length === 0)
		: result.issues[0];
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
		(issue.type === "min_length" || issue.type === "min_value") &&
		issue.requirement === 1
	) {
		return "forms:errors.required";
	}

	return issue.message;
}

/**
 * Accessibility attributes for a form control. Ids derive from the field `name` to match the
 * name-based `errorMessageId`/`infoMessageId`. The error id is also in `aria-describedby` since
 * screen reader support for `aria-errormessage` is inconsistent.
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
