import { json } from "@remix-run/node";
import {
	unstable_composeUploadHandlers as composeUploadHandlers,
	unstable_createMemoryUploadHandler as createMemoryUploadHandler,
	unstable_parseMultipartFormData as parseMultipartFormData,
} from "@remix-run/node";
import type { Params, UIMatch } from "@remix-run/react";
import type { Namespace, TFunction } from "i18next";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { navItems } from "~/components/layout/nav-items";
import { s3UploadHandler } from "~/features/img-upload";
import invariant from "./invariant";

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
		if (e instanceof z.ZodError) {
			console.error(e);
			throw new Response(JSON.stringify(e), { status: 400 });
		}

		throw e;
	}
}

export function parseSafeSearchParams<T extends z.ZodTypeAny>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): z.SafeParseReturnType<any, z.infer<T>> {
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
		if (e instanceof z.ZodError) {
			console.error(e);
			throw new Response(JSON.stringify(e), { status: 400 });
		}

		throw e;
	}
}

/** Parse formData with the given schema. Throws HTTP 400 response if fails. */
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
		if (e instanceof z.ZodError) {
			console.error(e);
			throw new Response(JSON.stringify(e), { status: 400 });
		}

		throw e;
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
			errors: parsed.error.errors.map((error) => error.message),
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

/** Asserts condition is truthy. Throws a new `Response` with given status code if falsy.  */
export function validate(
	condition: any,
	message?: string,
	status = 400,
): asserts condition {
	if (condition) return;

	throw new Response(
		message ? JSON.stringify({ validationError: message }) : undefined,
		{
			status,
		},
	);
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
export function privatelyCachedJson<T>(data: T) {
	return json(data, {
		headers: { "Cache-Control": "private, max-age=5" },
	});
}

export async function uploadImageIfSubmitted({
	request,
	fileNamePrefix,
}: {
	request: Request;
	fileNamePrefix: string;
}) {
	const uploadHandler = composeUploadHandlers(
		s3UploadHandler(`${fileNamePrefix}-${nanoid()}-${Date.now()}`),
		createMemoryUploadHandler(),
	);

	try {
		const formData = await parseMultipartFormData(request, uploadHandler);
		const imgSrc = formData.get("img") as string | null;
		invariant(imgSrc);

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
				formData: await request.formData(),
			};
		}

		throw err;
	}
}
