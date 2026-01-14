import type { FileUpload } from "@remix-run/form-data-parser";
import { parseFormData as parseMultipartFormData } from "@remix-run/form-data-parser";
import type { Namespace, TFunction } from "i18next";
import { nanoid } from "nanoid";
import type { Ok, Result } from "neverthrow";
import type { Params, UIMatch } from "react-router";
import { data, redirect } from "react-router";
import type { z } from "zod";
import type { navItems } from "~/components/layout/nav-items";
import { uploadStreamToS3 } from "~/features/img-upload/s3.server";
import invariant from "./invariant";
import { logger } from "./logger";

export function notFoundIfFalsy<T>(value: T | null | undefined): T {
	if (!value) throw new Response(null, { status: 404 });

	return value;
}

export function notFoundIfNullLike<T>(value: T | null | undefined): T {
	if (value === null || value === undefined)
		throw new Response(null, { status: 404 });

	return value;
}

export function unauthorizedIfFalsy<T>(value: T | null | undefined): T {
	if (!value) throw new Response(null, { status: 401 });

	return value;
}

export function badRequestIfFalsy<T>(value: T | null | undefined): T {
	if (!value) {
		throw new Response(null, { status: 400 });
	}

	return value;
}

export function parseSearchParams<T extends z.ZodTypeAny>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): z.infer<T> {
	const url = new URL(request.url);
	const searchParams = Object.fromEntries(url.searchParams);

	try {
		return schema.parse(searchParams);
	} catch (e) {
		logger.error("Error parsing search params", e);

		throw errorToastRedirect("Validation failed");
	}
}

export function parseSafeSearchParams<T extends z.ZodTypeAny>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}) {
	const url = new URL(request.url);
	return schema.safeParse(Object.fromEntries(url.searchParams));
}

/** Parse formData of a request with the given schema. Throws HTTP 400 response if fails. */
export async function parseRequestPayload<T extends z.ZodTypeAny>({
	request,
	schema,
	parseAsync,
}: {
	request: Request;
	schema: T;
	parseAsync?: boolean;
}): Promise<z.infer<T>> {
	const formDataObj =
		request.headers.get("Content-Type") === "application/json"
			? await request.json()
			: formDataToObject(await request.formData());
	try {
		const parsed = parseAsync
			? await schema.parseAsync(formDataObj)
			: schema.parse(formDataObj);

		return parsed;
	} catch (e) {
		logger.error("Error parsing request payload", e);

		throw errorToastRedirect("Validation failed");
	}
}

/** Parse formData with the given schema. Throws a request to show an error toast if it fails. */
export async function parseFormData<T extends z.ZodTypeAny>({
	formData,
	schema,
	parseAsync,
}: {
	formData: FormData;
	schema: T;
	parseAsync?: boolean;
}): Promise<z.infer<T>> {
	const formDataObj = formDataToObject(formData);
	try {
		const parsed = parseAsync
			? await schema.parseAsync(formDataObj)
			: schema.parse(formDataObj);

		return parsed;
	} catch (e) {
		logger.error("Error parsing form data", e);

		throw errorToastRedirect("Validation failed");
	}
}

/** Parse params with the given schema. Throws HTTP 404 response if fails. */
export function parseParams<T extends z.ZodTypeAny>({
	params,
	schema,
}: {
	params: Params<string>;
	schema: T;
}): z.infer<T> {
	const parsed = schema.safeParse(params);
	if (!parsed.success) {
		throw new Response(null, { status: 404 });
	}

	return parsed.data;
}

export async function safeParseRequestFormData<T extends z.ZodTypeAny>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): Promise<
	{ success: true; data: z.infer<T> } | { success: false; errors: string[] }
> {
	const parsed = schema.safeParse(formDataToObject(await request.formData()));

	// this implementation is somewhat redundant but it's the only way I got types to work nice
	if (!parsed.success) {
		return {
			success: false,
			errors: parsed.error.issues.map(
				(issue: { message: string }) => issue.message,
			),
		};
	}

	return {
		success: true,
		data: parsed.data,
	};
}

function formDataToObject(formData: FormData) {
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

const LOHI_TOKEN_HEADER_NAME = "Lohi-Token";

/** Some endpoints can only be accessed with an auth token. Used by Lohi bot and cron jobs. */
export function canAccessLohiEndpoint(request: Request) {
	invariant(process.env.LOHI_TOKEN, "LOHI_TOKEN is required");
	return request.headers.get(LOHI_TOKEN_HEADER_NAME) === process.env.LOHI_TOKEN;
}

function errorToastRedirect(message: string) {
	return redirect(`?__error=${message}`);
}

/** Asserts condition is truthy. Throws a redirect triggering an error toast with given message otherwise.  */
export function errorToastIfFalsy(
	condition: any,
	message: string,
): asserts condition {
	if (condition) return;

	throw errorToastRedirect(message);
}

/**
 * To be used in loader or action function. Asserts that the provided `Result` value is an `Ok` variant of the `neverthrow` library.
 *
 * If the value is an `Err`, shows an error toast to the user with the error message. The function will stop execution by throwing a redirect meaning it is safe to operate on the value after this function call.
 */
export function errorToastIfErr<T, E extends string>(
	value: Result<T, E>,
): asserts value is Ok<T, never> {
	if (value.isErr()) {
		throw errorToastRedirect(value.error);
	}
}

/** Throws a redirect triggering an error toast with given message.  */
export function errorToast(message: string) {
	throw errorToastRedirect(message);
}

export function successToast(message: string) {
	return redirect(`?__success=${message}`);
}

export function successToastWithRedirect({
	message,
	url,
}: {
	message: string;
	url: string;
}) {
	return redirect(`${url}?__success=${message}`);
}

export type ActionError = { field: string; msg: string; isError: true };

export function actionError<T extends z.ZodTypeAny>({
	msg,
	field,
}: {
	msg: string;
	field: (keyof z.infer<T> & string) | `${keyof z.infer<T> & string}.root`;
}): ActionError {
	return { msg, field, isError: true };
}

export type Breadcrumb =
	| {
			imgPath: string;
			type: "IMAGE";
			href: string;
			text?: string;
			rounded?: boolean;
	  }
	| { text: string; type: "TEXT"; href: string };

/**
 * Our custom type for route handles - the keys are defined by us or
 * libraries that parse them.
 *
 * Can be set per route using `export const handle: SendouRouteHandle = { };`
 * Can be accessed for all currently active routes via the `useMatches()` hook.
 */
export type SendouRouteHandle = {
	/** The i18n translation files used for this route, via remix-i18next */
	i18n?: Namespace;

	/**
	 * A function that returns the breadcrumb text that should be displayed in
	 * the <Breadcrumb> component
	 */
	breadcrumb?: (args: {
		match: UIMatch;
		t: TFunction<"common", undefined>;
	}) => Breadcrumb | Array<Breadcrumb> | undefined;

	/** The name of a navItem that is active on this route. See nav-items.ts */
	navItemName?: (typeof navItems)[number]["name"];
};

/** Caches the loader response with "private" Cache-Control meaning that CDN won't cache the response.
 * To be used when the response is different for each user. This is especially useful when the response
 * is prefetched on link hover.
 */
export function privatelyCachedJson<T>(dataValue: T) {
	return data(dataValue, {
		headers: { "Cache-Control": "private, max-age=5" },
	});
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

type FileUploadHandler = (
	fileUpload: FileUpload,
) => Promise<string | null | undefined>;
type ParseFormDataOptions = { maxFileSize?: number };

export function safeParseMultipartFormData(
	request: Request,
	uploadHandler?: FileUploadHandler,
): Promise<FormData>;
export function safeParseMultipartFormData(
	request: Request,
	options?: ParseFormDataOptions,
	uploadHandler?: FileUploadHandler,
): Promise<FormData>;
export async function safeParseMultipartFormData(
	request: Request,
	optionsOrHandler?: ParseFormDataOptions | FileUploadHandler,
	uploadHandler?: FileUploadHandler,
): Promise<FormData> {
	try {
		if (typeof optionsOrHandler === "function") {
			return await parseMultipartFormData(request, optionsOrHandler);
		}
		return await parseMultipartFormData(
			request,
			optionsOrHandler,
			uploadHandler,
		);
	} catch (err) {
		if (
			err instanceof Error &&
			err.cause instanceof Error &&
			err.cause.name === "MaxFileSizeExceededError"
		) {
			throw errorToastRedirect(
				`File size exceeds maximum allowed size of ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
			);
		}
		throw err;
	}
}

export async function uploadImageIfSubmitted({
	request,
	fileNamePrefix,
}: {
	request: Request;
	fileNamePrefix: string;
}) {
	const preDecidedFilename = `${fileNamePrefix}-${nanoid()}-${Date.now()}`;

	const uploadHandler = async (fileUpload: FileUpload) => {
		if (fileUpload.fieldName === "img") {
			const [, ending] = fileUpload.name.split(".");
			invariant(ending);
			const newFilename = `${preDecidedFilename}.${ending}`;

			const uploadedFileLocation = await uploadStreamToS3(
				fileUpload.stream(),
				newFilename,
			);
			return uploadedFileLocation;
		}
		return null;
	};

	let formData: FormData;

	try {
		formData = await safeParseMultipartFormData(request, uploadHandler);
		const imgSrc = formData.get("img") as string | null;
		if (!imgSrc) {
			throw new TypeError("No image submitted");
		}

		const urlParts = imgSrc.split("/");
		const fileName = urlParts[urlParts.length - 1];
		invariant(fileName);

		return {
			avatarFileName: fileName,
			formData,
		};
	} catch (err) {
		// user did not submit image
		if (err instanceof TypeError) {
			return {
				avatarFileName: undefined,
				// @ts-expect-error: TODO: jank but temporary jank. Later lets refactor to a more general and robust way of sending images
				formData,
			};
		}

		throw err;
	}
}
