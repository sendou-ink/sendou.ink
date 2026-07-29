import type { Namespace, TFunction } from "i18next";
import type { Ok, Result } from "neverthrow";
import type { Params, UIMatch } from "react-router";
import { data, redirect } from "react-router";
import type { z } from "zod";
import type { navItems } from "~/components/layout/nav-items";
import { ServerConfig } from "~/config.server";
import { logger } from "./logger";
import { currentRequestPathname } from "./request-context.server";

export function notFoundIfNullish<T>(value: T | null | undefined): T {
	if (value === null || value === undefined) {
		throw new Response(null, { status: 404 });
	}

	return value;
}

export function unauthorizedIfFalsy<T>(value: T | null | undefined): T {
	if (!value) throw new Response(null, { status: 401 });

	return value;
}

/** Throws a HTTP 403 (Forbidden) response, ending execution of the loader/action early */
export function forbidden() {
	throw new Response(null, { status: 403 });
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

/**
 * Resolves the pagination state of a loader whose current page comes from the
 * `page` search param. `pagesCount` is at minimum 1 so empty result sets stay
 * on page 1.
 *
 * If the requested `page` exceeds `pagesCount`, throws a redirect to the last
 * available page (preserving other search params).
 */
export function paginate({
	url,
	page,
	pageSize,
	totalCount,
}: {
	url: URL;
	page: number;
	pageSize: number;
	totalCount: number;
}): { currentPage: number; pagesCount: number } {
	const pagesCount = Math.max(1, Math.ceil(totalCount / pageSize));

	if (page > pagesCount) {
		const searchParams = new URLSearchParams(url.searchParams);
		searchParams.set("page", String(pagesCount));
		throw redirect(`${url.pathname}?${searchParams.toString()}`);
	}

	return { currentPage: page, pagesCount };
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

/**
 * Parse formData of a request with the given schema. Throws HTTP 400 response if fails.
 *
 * When using SendouForm, use parseFormData from /app/form/parse.server.ts instead.
 * */
export async function parseRequestPayload<T extends z.ZodTypeAny>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): Promise<z.infer<T>> {
	const formDataObj =
		request.headers.get("Content-Type") === "application/json"
			? await request.json()
			: formDataToObject(await request.formData());
	try {
		return await schema.parseAsync(formDataObj);
	} catch (e) {
		logger.error("Error parsing request payload", e);

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

/** Parse JSON body with the given schema. Throws HTTP 400 response if fails. */
export async function parseBody<T extends z.ZodTypeAny>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): Promise<z.infer<T>> {
	const parsed = schema.safeParse(await request.json());
	if (!parsed.success) {
		throw new Response(null, { status: 400 });
	}

	return parsed.data;
}

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

const LOHI_TOKEN_HEADER_NAME = "Lohi-Token";

/** Some endpoints can only be accessed with an auth token. Used by Lohi bot and cron jobs. */
export function canAccessLohiEndpoint(request: Request) {
	return request.headers.get(LOHI_TOKEN_HEADER_NAME) === ServerConfig.lohiToken;
}

function errorToastRedirect(message: string) {
	return redirect(`${currentRequestPathname() ?? ""}?__error=${message}`);
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
	return redirect(`${currentRequestPathname() ?? ""}?__success=${message}`);
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

export type Breadcrumb =
	| {
			imgPath: string;
			type: "IMAGE";
			href: string;
			text?: string;
			/** Seed for the identicon shown if `imgPath` fails to load. */
			identiconInput?: string;
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

	/**
	 * When `true`, the shared `<Main>` rendered by a parent layout (e.g. the
	 * tournament layout) fills the whole content area instead of the page
	 * max-width, while the page content stays centered at the normal width.
	 * Lets a descendant (e.g. the bracket) break out and grow wider than the
	 * page when it needs to.
	 */
	mainBreakout?: boolean;
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
