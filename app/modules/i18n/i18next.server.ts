import { AsyncLocalStorage } from "node:async_hooks";
import {
	createInstance,
	type DefaultNamespace,
	type FlatNamespace,
	type i18n,
	type Namespace,
	type TFunction,
} from "i18next";
import { type FallbackNs, initReactI18next } from "react-i18next";
import {
	createCookie,
	type MiddlewareFunction,
	type RouterContextProvider,
} from "react-router";
import { createI18nextMiddleware } from "remix-i18next";
import invariant from "~/utils/invariant";
import { config } from "./config";
import { resources } from "./resources.server";

const TEN_YEARS_IN_SECONDS = 31_536_000 * 10;

export const i18nCookie = createCookie("i18n", {
	sameSite: "lax",
	path: "/",
	maxAge: TEN_YEARS_IN_SECONDS,
});

const [remixI18nextMiddleware, getLocaleFromContext, getInstanceFromContext] =
	createI18nextMiddleware({
		detection: {
			cookie: i18nCookie,
			supportedLanguages: config.supportedLngs,
			fallbackLanguage: config.fallbackLng,
		},
		i18next: {
			...config,
			resources,
		},
		plugins: [initReactI18next],
	});

interface I18nStore {
	locale: string;
	instance: i18n;
}

const i18nAsyncLocalStorage = new AsyncLocalStorage<I18nStore>();

/**
 * Detects the request locale, initializes a request-scoped i18next instance and
 * makes both available to server helpers ({@link getLocale},
 * {@link getServerTFunction}) for the duration of the request.
 */
export const i18nMiddleware: MiddlewareFunction<Response> = (args, next) =>
	remixI18nextMiddleware(args, () =>
		i18nAsyncLocalStorage.run(
			{
				locale: getLocaleFromContext(args.context),
				instance: getInstanceFromContext(args.context),
			},
			() => next(),
		),
	);

/** The locale detected for the current request. */
export function getLocale(): string {
	return currentStore().locale;
}

/**
 * A `TFunction` bound to the current request's locale and the given namespaces.
 * Namespaces are already available in-memory so no async loading is needed.
 */
export function getServerTFunction<
	N extends
		| FlatNamespace
		| readonly [FlatNamespace, ...FlatNamespace[]] = DefaultNamespace,
>(namespaces?: N): TFunction<FallbackNs<N>> {
	const { instance, locale } = currentStore();
	return instance.getFixedT(
		locale,
		namespaces as Namespace,
	) as unknown as TFunction<FallbackNs<N>>;
}

/**
 * The request-scoped i18next instance, used to provide translations while
 * server-side rendering. Reads from the React Router context so it can be called
 * from `entry.server` where the request context is passed explicitly.
 */
export function getI18nInstance(
	context: Readonly<RouterContextProvider>,
): i18n {
	return getInstanceFromContext(context);
}

/**
 * A `TFunction` bound to a fixed language, independent of the current request.
 * Use this when translating outside of a request (e.g. notifications) or when a
 * specific language is required regardless of the user's locale.
 */
export async function getFixedTForLanguage<
	N extends
		| FlatNamespace
		| readonly [FlatNamespace, ...FlatNamespace[]] = DefaultNamespace,
>(language: string, namespaces?: N): Promise<TFunction<FallbackNs<N>>> {
	const instance = createInstance();
	await instance.init({ ...config, resources, lng: language });
	return instance.getFixedT(
		language,
		namespaces as Namespace,
	) as unknown as TFunction<FallbackNs<N>>;
}

function currentStore(): I18nStore {
	const store = i18nAsyncLocalStorage.getStore();
	invariant(store, "i18n store not found, is i18nMiddleware registered?");
	return store;
}
