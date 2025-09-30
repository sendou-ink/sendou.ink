import { form, getRequestEvent } from '$app/server';
import { extractLocaleFromRequest } from '$lib/paraglide/runtime';
import { zodErrorsToFormErrors } from '$lib/utils/zod';
import { error } from '@sveltejs/kit';
import z from 'zod';
import { requireUser, type AuthenticatedUser } from './auth/session';
import * as ImageRepository from '$lib/server/db/repositories/image';
import { resolveFieldsByType } from '$lib/utils/form';
import * as S3 from './s3';
import type { Result } from 'neverthrow';
import { formDataToObject } from '$lib/form/utils';

export function notFoundIfFalsy<T>(value: T | null | undefined): T {
	if (!value) error(404);

	return value;
}

export function badRequestIfFalsy<T>(value: T | null | undefined): T {
	if (!value) {
		error(400);
	}

	return value;
}

export function badRequestIfErr<T, E>(result: Result<T, E>): T {
	if (result.isErr()) {
		error(400);
	}

	return result.value;
}

/** Throws HTTP Error 400 Bad Request with the given message */
export function badRequest(message: string): never {
	error(400, message);
}

type ParaglideFunction = (
	inputs?: any,
	options?: {
		locale?: 'en' | undefined;
	}
) => string;

export type SchemaToFunctionInput<T> = {
	[K in keyof T]: T[K] extends File | null | undefined
		? number | null | undefined
		: T[K] extends (File | null | undefined)[]
			? (number | null | undefined)[]
			: T[K];
};

export type SchemaToDefaultValues<T> = {
	[K in keyof T]: T[K] extends File | null | undefined
		? string | null | undefined
		: T[K] extends (File | null | undefined)[]
			? (string | null | undefined)[]
			: T[K];
};

export function validatedForm<T extends z.ZodObject>(
	schema: T,
	callback: (
		data: SchemaToFunctionInput<z.infer<T>>,
		user: AuthenticatedUser
	) => Promise<void | {
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

		const uploadedImages = await uploadImages(schema, formData);

		const result = await callback(
			{ ...parsed.data, ...uploadedImages } as SchemaToFunctionInput<z.infer<T>>,
			await requireUser()
		);
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

/**
 * Uploads images to S3 compatible storage and saves them to the SQLite database, if any included in the request.
 * Images are automatically validated for eligible users. Only validated images are shown to other users.
 *
 * @returns an object where keys are form field names and values ids of "UserSubmittedImage" table or null if no images were uploaded
 */
async function uploadImages<T extends z.ZodObject>(schema: T, formData: FormData) {
	const fileFields = resolveFieldsByType(schema, 'file');
	if (fileFields.length === 0) return null;

	const user = await requireUser();
	const result: Partial<Record<keyof T, number | null>> = {};

	for (const field of fileFields) {
		const file = formData.get(field);

		if (!(file instanceof File)) {
			// they keep the existing uploaded image
			result[field as keyof T] = undefined;
			continue;
		}

		const isEmptyInput = file.size === 0;
		if (isEmptyInput) {
			// previously uploaded file should be deleted
			result[field as keyof T] = null;
			continue;
		}

		const uploadedFileName = await S3.putFile(file);

		const shouldAutoValidate = user.roles.includes('SUPPORTER');
		const { id } = await ImageRepository.insert({
			submitterUserId: user.id,
			url: uploadedFileName,
			validatedAt: shouldAutoValidate ? new Date() : null
		});
		result[field as keyof T] = id;
	}

	return result;
}
