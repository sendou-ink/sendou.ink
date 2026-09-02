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

/** Detects the locale and sets up the request-scoped i18next instance behind {@link getLocale} and {@link getServerTFunction}. */
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

/** `TFunction` bound to the request's locale and the given namespaces (all in-memory, no async loading). */
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
 * Request-scoped i18next instance for SSR, read from the router context so `entry.server` can call it.
 * Falls back to a shared default-language instance when an error boundary renders for a request whose
 * middleware threw before {@link i18nMiddleware} ran, so a second error doesn't mask the original.
 */
export function getI18nInstance(
	context: Readonly<RouterContextProvider>,
): i18n {
	try {
		return getInstanceFromContext(context);
	} catch {
		return fallbackI18nInstance();
	}
}

/** `TFunction` bound to a fixed language, for outside a request (e.g. notifications) or a required language. */
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

let sharedFallbackInstance: i18n | undefined;

function fallbackI18nInstance(): i18n {
	if (!sharedFallbackInstance) {
		const instance = createInstance();
		instance.use(initReactI18next);
		// initAsync: false is safe with in-memory resources and lets the sync getI18nInstance call this
		instance.init({
			...config,
			resources,
			lng: config.fallbackLng,
			initAsync: false,
		});
		sharedFallbackInstance = instance;
	}
	return sharedFallbackInstance;
}
