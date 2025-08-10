import { error } from '@sveltejs/kit';
import type z from 'zod';

export function notFoundIfFalsy<T>(value: T | null | undefined): T {
	if (!value) error(404);

	return value;
}

export function parseFormData<T extends z.ZodTypeAny>({
	formData,
	schema
}: {
	formData: FormData;
	schema: T;
}): z.infer<T> {
	const formDataObj = formDataToObject(formData);
	try {
		return schema.parse(formDataObj);
	} catch {
		// xxx: return errors back to the user

		throw new Error('form errors not implemented');
	}
}

function formDataToObject(formData: FormData) {
	const result: Record<string, string | string[]> = {};

	// @ts-expect-error TODO: figure out why it's missing
	for (const [key, value] of formData.entries()) {
		const newValue = String(value);
		const existingValue = result[key];

		if (Array.isArray(existingValue)) {
			existingValue.push(newValue);
		} else if (typeof existingValue === 'string') {
			result[key] = [existingValue, newValue];
		} else {
			result[key] = newValue;
		}
	}

	return result;
}
