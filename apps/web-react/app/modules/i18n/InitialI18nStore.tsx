import type { i18n } from "i18next";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useMatches } from "react-router";
import { DEFAULT_LANGUAGE } from "./config";

declare global {
	interface Window {
		__initialI18nStore?: Record<string, Record<string, object>>;
	}
}

/**
 * Embeds the translation bundles the server rendered with (the page language
 * plus the English fallback) into the HTML so client-side i18next can
 * initialize from them instead of fetching every initial namespace over HTTP
 * before hydration can start.
 */
export function InitialI18nStore({ locale }: { locale: string }) {
	const { i18n } = useTranslation();
	const matches = useMatches();

	// computed once so client-side navigations don't re-serialize the store;
	// on hydration the embedded store round-trips to the exact server markup
	const [scriptHtml] = React.useState(() => {
		const store = initialStore(i18n, locale, namespacesFromMatches(matches));

		return `window.__initialI18nStore=${JSON.stringify(store).replace(
			/</g,
			"\\u003c",
		)}`;
	});

	return (
		<script
			suppressHydrationWarning
			dangerouslySetInnerHTML={{ __html: scriptHtml }}
		/>
	);
}

function namespacesFromMatches(matches: Array<{ handle: unknown }>): string[] {
	const namespaces = matches.flatMap((match) => {
		const handle = match.handle;
		if (typeof handle !== "object" || handle === null) return [];
		if (!("i18n" in handle)) return [];
		const value = (handle as { i18n: unknown }).i18n;
		if (typeof value === "string") return [value];
		if (
			Array.isArray(value) &&
			value.every((item) => typeof item === "string")
		) {
			return value as string[];
		}
		return [];
	});

	return [...new Set(namespaces)];
}

function initialStore(
	i18nInstance: i18n,
	locale: string,
	namespaces: string[],
): Record<string, Record<string, object>> {
	if (typeof window !== "undefined" && window.__initialI18nStore) {
		return window.__initialI18nStore;
	}

	const languages =
		locale === DEFAULT_LANGUAGE ? [locale] : [locale, DEFAULT_LANGUAGE];

	const store: Record<string, Record<string, object>> = {};
	for (const language of languages) {
		const bundles: Record<string, object> = {};
		for (const namespace of namespaces) {
			const bundle = i18nInstance.getResourceBundle(language, namespace);
			if (bundle) {
				bundles[namespace] = withoutUntranslated(bundle);
			}
		}
		store[language] = bundles;
	}

	return store;
}

function withoutUntranslated(value: object): object {
	const result: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		if (child === "") continue;
		if (typeof child === "object" && child !== null && !Array.isArray(child)) {
			result[key] = withoutUntranslated(child);
		} else {
			result[key] = child;
		}
	}

	return result;
}
