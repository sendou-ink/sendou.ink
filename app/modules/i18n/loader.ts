import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";
import { initReactI18next } from "react-i18next";
import { getInitialNamespaces } from "remix-i18next/client";
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
			initImmediate: false,
		});
}
