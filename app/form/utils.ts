import type { z } from "zod";

export function formDataToObject(formData: FormData) {
	const result: Record<string, string | string[]> = {};

	for (const [key, value] of formData.entries()) {
		const newValue = String(value);
		const existingValue = result[key];

		if (Array.isArray(existingValue)) {
			existingValue.push(newValue);
		} else if (typeof existingValue === "string") {
			result[key] = [existingValue, newValue];
		} else {
			result[key] = newValue;
		}
	}

	return result;
}

export function infoMessageId(fieldId: string) {
	return `${fieldId}-info`;
}

export function errorMessageId(fieldId: string) {
	return `${fieldId}-error`;
}

export function validateField(
	schema: z.ZodObject<z.ZodRawShape>,
	name: string,
	value: unknown,
): string | undefined {
	const fieldSchema = schema.shape[name] as z.ZodType | undefined;
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

export function resolveDefaultValue({
	name,
	defaultValues,
}: {
	name: string;
	defaultValues: Record<string, unknown> | null | undefined;
}) {
	if (!defaultValues) return undefined;

	const idx = name.match(/\[(\d+)\]$/)?.[1];
	if (idx) {
		const nameWithoutIdx = name.split("[")[0];
		const arrayValue = defaultValues[nameWithoutIdx];
		if (Array.isArray(arrayValue)) {
			return arrayValue[Number(idx)];
		}
	}

	return defaultValues[name];
}
