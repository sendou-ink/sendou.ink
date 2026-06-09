import type { z } from "zod";
import { formRegistry } from "./fields";
import type { FormField } from "./types";

function infoMessageId(fieldId: string) {
	return `${fieldId}-info`;
}

/**
 * Builds a form field name (e.g. `members[0].userId`) from a Zod issue path so
 * that server- and client-side validation errors key fields identically.
 */
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

// Casting away the registry's deep generic signature avoids "Type instantiation
// is excessively deep" errors when looking up field metadata by schema.
const typedRegistry = formRegistry as {
	get(schema: z.ZodType): FormField | undefined;
};

/**
 * The default value object for a `fieldset` field, built from each sub-field's
 * own `initialValue` (e.g. a `select`'s first option). Returns `{}` for
 * non-fieldset fields.
 */
export function fieldsetDefaults(
	fieldsetMeta: FormField,
): Record<string, unknown> {
	if (fieldsetMeta.type !== "fieldset") return {};

	const shape = fieldsetMeta.fields.shape as Record<string, z.ZodType>;
	const result: Record<string, unknown> = {};
	for (const [key, fieldSchema] of Object.entries(shape)) {
		const fieldMeta = typedRegistry.get(fieldSchema);
		if (fieldMeta) result[key] = fieldMeta.initialValue;
	}
	return result;
}

/**
 * When a leaf field inside an array-of-fieldset item is edited (e.g.
 * `staff[0].userId`), the enclosing item is created on demand. Without this the
 * item would only contain the touched field, dropping defaults that were merely
 * shown as a fallback (e.g. a required `select`'s first option) and failing
 * validation on submit. This seeds the item with its fieldset defaults, keeping
 * any values it already has. Untouched items are never created, so this doesn't
 * affect submitting a pristine form.
 */
export function seedArrayItemDefaults(
	schema: z.ZodObject<z.ZodRawShape>,
	values: Record<string, unknown>,
	name: string,
): Record<string, unknown> {
	const lastBracket = name.lastIndexOf("]");
	// No enclosing array item (`-1`) or the leaf is the array element itself
	// (path ends in `]`, i.e. a primitive array) — nothing to seed.
	if (lastBracket === -1 || lastBracket === name.length - 1) return values;

	const itemPath = name.slice(0, lastBracket + 1);
	const itemSchema = getNestedSchema(schema, itemPath);
	if (!itemSchema) return values;

	const itemMeta = typedRegistry.get(itemSchema);
	if (itemMeta?.type !== "fieldset") return values;

	const existing = getNestedValue(values, itemPath) as
		| Record<string, unknown>
		| undefined;
	const merged = { ...fieldsetDefaults(itemMeta), ...(existing ?? {}) };
	return setNestedValue(values, itemPath, merged);
}

export function getNestedSchema(
	schema: z.ZodObject<z.ZodRawShape>,
	path: string,
): z.ZodType | undefined {
	const parts = parsePath(path);
	let current: z.ZodType = schema;

	for (const part of parts) {
		const unwrapped = unwrapSchema(current);

		if (typeof part === "number") {
			const def = unwrapped._def as {
				type?: string;
				element?: z.ZodType;
			};
			if (def.type === "array" && def.element) {
				current = def.element;
			} else {
				return undefined;
			}
		} else if ("shape" in unwrapped && unwrapped.shape) {
			const nextSchema = (unwrapped.shape as Record<string, z.ZodType>)[part];
			if (!nextSchema) return undefined;
			current = nextSchema;
		} else {
			return undefined;
		}
	}

	return current;
}

function unwrapSchema(schema: z.ZodType): z.ZodType {
	const def = schema._def ?? (schema as unknown as { def: unknown }).def;
	const typeName =
		(def as { typeName?: string }).typeName ?? (def as { type?: string }).type;

	if (
		typeName === "ZodNullable" ||
		typeName === "ZodOptional" ||
		typeName === "ZodDefault" ||
		typeName === "nullable" ||
		typeName === "optional" ||
		typeName === "default"
	) {
		const inner = (def as unknown as { innerType: z.ZodType }).innerType;
		return unwrapSchema(inner);
	}
	if (typeName === "ZodEffects" || typeName === "effects") {
		return unwrapSchema((def as unknown as { schema: z.ZodType }).schema);
	}
	return schema;
}

export function errorMessageId(fieldId: string) {
	return `${fieldId}-error`;
}

export function validateField(
	schema: z.ZodObject<z.ZodRawShape>,
	name: string,
	value: unknown,
): string | undefined {
	const fieldSchema = name.includes(".")
		? getNestedSchema(schema, name)
		: (schema.shape[name] as z.ZodType | undefined);
	if (!fieldSchema) return undefined;

	const result = fieldSchema.safeParse(value);
	if (result.success) return undefined;

	// `array`/`fieldset` fields render each child as its own FormField with its
	// own error slot, so a nested issue (e.g. an empty member inside a `members`
	// array) belongs to that child — attributing it to the parent would surface
	// the wrong message at the wrong field. Other composite fields (e.g. a custom
	// tuple) render as a single control, so their nested issues belong to them.
	const fieldMeta = typedRegistry.get(fieldSchema);
	const childrenRenderOwnErrors =
		fieldMeta?.type === "array" || fieldMeta?.type === "fieldset";
	const issue = childrenRenderOwnErrors
		? result.error.issues.find((i) => i.path.length === 0)
		: result.error.issues[0];
	if (!issue) return undefined;

	const valueIsEmpty = value === null || value === undefined || value === "";
	if (
		valueIsEmpty &&
		(issue.code === "invalid_type" || issue.code === "too_small")
	) {
		return "forms:errors.required";
	}

	if (issue.code === "too_small" && issue.minimum === 1) {
		return "forms:errors.required";
	}

	return issue.message;
}

export function ariaAttributes({
	id,
	error,
	bottomText,
	required,
}: {
	id: string;
	error?: string;
	bottomText?: string;
	required?: boolean;
}) {
	return {
		"aria-invalid": error ? ("true" as const) : undefined,
		"aria-describedby": bottomText ? infoMessageId(id) : undefined,
		"aria-errormessage": error ? errorMessageId(id) : undefined,
		"aria-required": required ? ("true" as const) : undefined,
	};
}
