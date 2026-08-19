import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";
import { config } from "./config";

export function i18nLoader() {
	return i18next
		.use(initReactI18next)
		.use(LanguageDetector)
		.use(Backend)
		.init({
			...config,
			ns: getInitialNamespaces(),
			backend: {
				loadPath: (lng: any, ns: any) => {
					// use vite static asset fingerprinting
					return new URL(
						`../../../locales/${lng[0]}/${ns[0]}.json`,
						import.meta.url,
					).href;
				},
			},
			detection: {
				order: ["htmlTag"],
				caches: [],
			},
			// without this hydration fails in E2E tests
			initAsync: false,
		});
}

declare global {
	interface Window {
		__reactRouterRouteModules: Record<string, { handle?: unknown } | undefined>;
	}
}

/**
 * Get the list of namespaces used by the application server-side so they can be
 * set on i18next init options and preloaded before hydration.
 *
 * Vendored from remix-i18next (removed in v8).
 */
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
