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
	createContext,
	createCookie,
	type MiddlewareFunction,
	type RouterContextProvider,
} from "react-router";
import { invariant } from "~/utils/invariant";
import {
	config,
	DEFAULT_LANGUAGE,
	type GameLanguageCode,
	gameLanguages,
	type LanguageCode,
	languages,
} from "./config";
import { languageSearchParams } from "./i18n-search-params";
import * as LanguageDetection from "./LanguageDetection";
import { resources, resourcesWithGameLanguage } from "./resources.server";

const TEN_YEARS_IN_SECONDS = 31_536_000 * 10;

const COOKIE_OPTIONS = {
	sameSite: "lax",
	path: "/",
	maxAge: TEN_YEARS_IN_SECONDS,
} as const;

const languageCookie = createCookie("i18n-site", COOKIE_OPTIONS);
const gameLanguageCookie = createCookie("i18n-game", COOKIE_OPTIONS);

const languageCodes = languages.map((lang) => lang.code);
const gameLanguageCodes = gameLanguages.map((lang) => lang.code);

const i18nextContext = createContext<i18n>();

interface I18nStore {
	locale: LanguageCode;
	gameLanguage: GameLanguageCode;
	instance: i18n;
}

const i18nAsyncLocalStorage = new AsyncLocalStorage<I18nStore>();

/**
 * Detects the site's language and the language of in-game names, then sets up the request-scoped i18next
 * instance behind {@link getLocale} and {@link getServerTFunction}. A language picked via search param is
 * remembered in a cookie. Without an explicit pick in-game names follow the site's language preferences, which
 * can have a game language even when the site has no translation for it.
 */
export const i18nMiddleware: MiddlewareFunction<Response> = async (
	{ request, context },
	next,
) => {
	const cookieHeader = request.headers.get("Cookie");
	const { lng, gameLng } = languageSearchParams.parse(request);

	const preferences = [
		lng,
		await languageCookie.parse(cookieHeader),
		...LanguageDetection.acceptedLanguages(
			request.headers.get("Accept-Language"),
		),
	];
	const locale =
		LanguageDetection.match(preferences, languageCodes) ?? DEFAULT_LANGUAGE;
	const gameLanguage =
		gameLng ??
		LanguageDetection.match(
			[await gameLanguageCookie.parse(cookieHeader)],
			gameLanguageCodes,
		) ??
		LanguageDetection.match(preferences, gameLanguageCodes) ??
		DEFAULT_LANGUAGE;

	const instance = requestInstance(locale, gameLanguage);
	context.set(i18nextContext, instance);

	const response = await i18nAsyncLocalStorage.run(
		{ locale, gameLanguage, instance },
		() => next(),
	);

	if (lng) {
		response.headers.append(
			"Set-Cookie",
			await languageCookie.serialize(locale),
		);
	}
	if (gameLng) {
		response.headers.append(
			"Set-Cookie",
			await gameLanguageCookie.serialize(gameLanguage),
		);
	}

	return response;
};

/** The site's language detected for the current request. */
export function getLocale(): LanguageCode {
	return currentStore().locale;
}

/** The language of in-game names (weapons, stages etc.) detected for the current request. */
export function getGameLanguage(): GameLanguageCode {
	return currentStore().gameLanguage;
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
		return context.get(i18nextContext);
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
	return fixedLanguageInstance(language).getFixedT(
		language,
		namespaces as Namespace,
	) as unknown as TFunction<FallbackNs<N>>;
}

// one instance per language pair reused across requests, creating and initializing one costs ~40-100µs
const requestInstances = new Map<string, i18n>();

function requestInstance(
	locale: LanguageCode,
	gameLanguage: GameLanguageCode,
): i18n {
	const key = `${locale}:${gameLanguage}`;
	let instance = requestInstances.get(key);
	if (!instance) {
		instance = createInstance();
		instance.use(initReactI18next);
		instance.init({
			...config,
			resources: resourcesWithGameLanguage(gameLanguage),
			lng: locale,
			initAsync: false,
		});
		requestInstances.set(key, instance);
	}

	return instance;
}

function currentStore(): I18nStore {
	const store = i18nAsyncLocalStorage.getStore();
	invariant(store, "i18n store not found, is i18nMiddleware registered?");
	return store;
}

const fixedLanguageInstances = new Map<string, i18n>();

function fixedLanguageInstance(language: string): i18n {
	let instance = fixedLanguageInstances.get(language);
	if (!instance) {
		instance = createInstance();
		instance.init({ ...config, resources, lng: language, initAsync: false });
		fixedLanguageInstances.set(language, instance);
	}
	return instance;
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
			lng: DEFAULT_LANGUAGE,
			initAsync: false,
		});
		sharedFallbackInstance = instance;
	}
	return sharedFallbackInstance;
}
