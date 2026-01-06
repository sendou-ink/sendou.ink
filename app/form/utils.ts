import type { z } from "zod";

export function infoMessageId(fieldId: string) {
	return `${fieldId}-info`;
}

export function getNestedValue(
	obj: Record<string, unknown>,
	path: string,
): unknown {
	const parts = path.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (current === null || current === undefined) return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

export function setNestedValue(
	obj: Record<string, unknown>,
	path: string,
	value: unknown,
): Record<string, unknown> {
	const parts = path.split(".");
	if (parts.length === 1) {
		return { ...obj, [path]: value };
	}
	const [head, ...tail] = parts;
	const nested = (obj[head!] as Record<string, unknown>) ?? {};
	return {
		...obj,
		[head!]: setNestedValue(nested, tail.join("."), value),
	};
}

export function getNestedSchema(
	schema: z.ZodObject<z.ZodRawShape>,
	path: string,
): z.ZodType | undefined {
	const parts = path.split(".");
	let current: z.ZodType = schema;

	for (const part of parts) {
		const unwrapped = unwrapSchema(current);
		if ("shape" in unwrapped && unwrapped.shape) {
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

	const issue = result.error.issues[0];
	if (!issue) return undefined;

	if (
		issue.code === "invalid_type" &&
		(value === null || value === undefined || value === "")
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
