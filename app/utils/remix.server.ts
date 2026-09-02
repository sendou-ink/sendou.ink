import type { Namespace, TFunction } from "i18next";
import type { Params, UIMatch } from "react-router";
import { data, redirect } from "react-router";
import * as v from "valibot";
import type { navItems } from "~/components/layout/nav-items";
import { ServerConfig } from "~/config.server";
import type { Ok, Result } from "~/utils/result";
import type { AnySchema, AnySyncSchema } from "~/utils/schema";
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

/**
 * Pagination state for a loader driven by the `page` search param. `pagesCount` is at least 1;
 * a `page` past it throws a redirect to the last page (other search params preserved).
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

/** Parses request payload with the schema, error toast redirect on failure. With SendouForm use `parseFormData` from `~/form/parse.server` instead. */
export async function parseRequestPayload<T extends AnySchema>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): Promise<v.InferOutput<T>> {
	const formDataObj =
		request.headers.get("Content-Type") === "application/json"
			? await request.json()
			: formDataToObject(await request.formData());
	try {
		return await v.parseAsync(schema, formDataObj);
	} catch (e) {
		logger.error("Error parsing request payload", e);

		throw errorToastRedirect("Validation failed");
	}
}

/** Parse params with the given schema. Throws HTTP 404 response if fails. */
export function parseParams<T extends AnySyncSchema>({
	params,
	schema,
}: {
	params: Params<string>;
	schema: T;
}): v.InferOutput<T> {
	const parsed = v.safeParse(schema, params);
	if (!parsed.success) {
		throw new Response(null, { status: 404 });
	}

	return parsed.output;
}

/** Parse JSON body with the given schema. Throws HTTP 400 response if fails. */
export async function parseBody<T extends AnySyncSchema>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): Promise<v.InferOutput<T>> {
	const parsed = v.safeParse(schema, await request.json());
	if (!parsed.success) {
		throw new Response(null, { status: 400 });
	}

	return parsed.output;
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

export function errorToastRedirect(message: string) {
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

/** Asserts `Result` is `Ok`; on `Err` throws a redirect showing the error as a toast. */
export function errorToastIfErr<T, E extends string>(
	value: Result<T, E>,
): asserts value is Ok<T> {
	if (!value.ok) {
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

/** Route `handle` shape; read for all active routes via `useMatches()`. */
export type SendouRouteHandle = {
	/** i18n namespaces loaded for this route */
	i18n?: Namespace;

	breadcrumb?: (args: {
		match: UIMatch;
		t: TFunction<"common", undefined>;
	}) => Breadcrumb | Array<Breadcrumb> | undefined;

	/** navItem active on this route, see nav-items.ts */
	navItemName?: (typeof navItems)[number]["name"];

	/**
	 * Parent layout's `<Main>` fills the whole content area (content stays centered at normal
	 * width) so a descendant like the bracket can grow wider than the page.
	 */
	mainBreakout?: boolean;
};

/** Per-user loader response cached with `private` Cache-Control (no CDN), useful for link hover prefetch. */
export function privatelyCachedJson<T>(dataValue: T) {
	return data(dataValue, {
		headers: { "Cache-Control": "private, max-age=5" },
	});
}
