import i18next, { type BackendModule } from "i18next";
import { initReactI18next } from "react-i18next";
import {
	config,
	DEFAULT_LANGUAGE,
	type GameLanguageCode,
	languageChain,
} from "./config";
import { isGameNamespace, localeFileUrl } from "./locale-files";

let gameLanguage: GameLanguageCode = DEFAULT_LANGUAGE;
const gameTranslationsCache = new Map<
	string,
	Promise<Record<string, string>>
>();

/**
 * Loads the locale files. In-game names are the same for every language: the game language's merged over the
 * languages it falls back to.
 */
const localeBackend: BackendModule = {
	type: "backend",
	init: () => {},
	read: (language, namespace, callback) => {
		const translations = isGameNamespace(namespace)
			? gameTranslations(namespace)
			: fetchLocaleFile(language, namespace);

		translations.then(
			(result) => callback(null, result),
			(error: Error) => callback(error, null),
		);
	},
};

export function i18nLoader() {
	gameLanguage =
		(document.documentElement.dataset.gameLanguage as GameLanguageCode) ??
		DEFAULT_LANGUAGE;

	return i18next
		.use(initReactI18next)
		.use(localeBackend)
		.init({
			...config,
			lng: document.documentElement.lang,
			ns: getInitialNamespaces(),
			// without this hydration fails in E2E tests
			initAsync: false,
		});
}

/** Switches the language in-game names are loaded in, already loaded ones need reloading */
export function setGameLanguage(language: GameLanguageCode) {
	gameLanguage = language;
}

export function currentGameLanguage() {
	return gameLanguage;
}

function gameTranslations(namespace: string) {
	const key = `${gameLanguage}/${namespace}`;
	let cached = gameTranslationsCache.get(key);
	if (!cached) {
		cached = Promise.all(
			languageChain(gameLanguage)
				.toReversed()
				.map((language) => fetchLocaleFile(language, namespace)),
		).then((files) => Object.assign({}, ...files));
		// a failed load is retried by i18next
		cached.catch(() => gameTranslationsCache.delete(key));
		gameTranslationsCache.set(key, cached);
	}

	return cached;
}

async function fetchLocaleFile(
	language: string,
	namespace: string,
): Promise<Record<string, string>> {
	const url = localeFileUrl(language, namespace);
	if (!url) return {};

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to load ${language}/${namespace}.json`);
	}

	return response.json();
}

declare global {
	interface Window {
		__reactRouterRouteModules: Record<string, { handle?: unknown } | undefined>;
	}
}

/** Namespaces used server-side, preloaded before hydration. Vendored from remix-i18next (removed in v8). */
function getInitialNamespaces(): string[] {
	return Object.values(window.__reactRouterRouteModules).flatMap((route) => {
		const handle = route?.handle;
		if (typeof handle !== "object" || handle === null) return [];
		if (!("i18n" in handle)) return [];
		const namespaces = (handle as { i18n: unknown }).i18n;
		if (typeof namespaces === "string") return [namespaces];
		if (
			Array.isArray(namespaces) &&
			namespaces.every((value) => typeof value === "string")
		) {
			return namespaces as string[];
		}
		return [];
	});
}
