import { form, getRequestEvent } from '$app/server';
import { extractLocaleFromRequest } from '$lib/paraglide/runtime';
import { zodErrorsToFormErrors } from '$lib/utils/zod';
import { error } from '@sveltejs/kit';
import z from 'zod';
import * as z4 from 'zod/v4/core';

export function notFoundIfFalsy<T>(value: T | null | undefined): T {
	if (!value) error(404);

	return value;
}

type ParaglideFunction = (
	inputs?: any,
	options?: {
		locale?: 'en' | undefined;
	}
) => string;

export function validatedForm<T extends z4.$ZodType>(
	schema: T,
	callback: (data: z.infer<T>) => Promise<void | {
		errors: Partial<Record<keyof z.infer<T>, ParaglideFunction>>;
	}>
) {
	return form(async (formData) => {
		const formDataObj = formDataToObject(formData);
		const parsed = z.safeParse(schema, formDataObj);

		if (!parsed.success) {
			return {
				errors: zodErrorsToFormErrors(parsed.error)
			};
		}

		const result = await callback(parsed.data);
		if (!result) return;

		// translate errors

		const request = getRequestEvent().request;

		return {
			errors: Object.fromEntries(
				Object.entries(result.errors).map(([key, i18nFn]) => {
					return [
						key,
						(i18nFn as ParaglideFunction)(undefined, { locale: extractLocaleFromRequest(request) })
					];
				})
			)
		};
	});
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
