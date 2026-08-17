import type { UserPreferences } from "#lib/db/tables-json.ts";
import { loggedInUser } from "#lib/features/auth/user-state.ts";
import { getLocale } from "#lib/paraglide/runtime.js";
import { databaseTimestampToDate } from "#lib/utils/dates.ts";
import { browser } from "$app/env";

/**
 * Zero-width space rendered (hidden via `invisible`) during SSR so the element
 * reserves exactly one normal text line, avoiding layout shift on hydration
 * without an empty box's baseline quirks.
 */
const SSR_PLACEHOLDER = "​";

const SSR_FORMATTER = {
	format: (_date: Date | number) => SSR_PLACEHOLDER,
	formatRange: (_from: Date | number, _to: Date | number) => SSR_PLACEHOLDER,
};

/**
 * Resolves the language and hour cycle to use when formatting dates and times
 * for the current user. Prefers a browser language sharing a base tag with the
 * active site language (e.g. `en-GB` over site `en`) for regional formatting.
 * `isLoaded` is `false` during SSR; gate locale-dependent output on it to
 * avoid hydration flicker.
 */
export function userIntlPreference() {
	const siteLanguage = getLocale();
	const browserLanguages = browser ? navigator.languages : [];

	// does the user want to use their browser language even if the site is in another language?
	const language =
		browserLanguages.find((lang) => compareLanguages(lang, siteLanguage)) ??
		siteLanguage;

	return {
		language,
		hourCycle: resolveHourCycle(loggedInUser()?.preferences?.clockFormat),
		isLoaded: browser,
	};
}

/**
 * SSR-safe wrapper around `Intl.DateTimeFormat`.
 *
 * Uses the user's locale and hour cycle preferences via
 * {@link userIntlPreference}. During SSR the returned formatter's methods
 * return a zero-width space placeholder so the element reserves one text line
 * until the client-formatted value replaces it on hydration.
 *
 * Inputs accept either a `Date` or a database timestamp (`number`); numbers
 * are converted via `databaseTimestampToDate`.
 */
export function dateTimeFormat(options: Intl.DateTimeFormatOptions) {
	const { language, hourCycle, isLoaded } = userIntlPreference();

	const formatter = new Intl.DateTimeFormat(language, {
		...options,
		...(options.hour && hourCycle ? { hourCycle } : {}),
	});

	const realFormatter = {
		format: (date: Date | number) => {
			return formatter.format(
				typeof date === "number" ? databaseTimestampToDate(date) : date,
			);
		},
		formatRange: (from: Date | number, to: Date | number) => {
			return formatter.formatRange(
				typeof from === "number" ? databaseTimestampToDate(from) : from,
				typeof to === "number" ? databaseTimestampToDate(to) : to,
			);
		},
	};

	return {
		formatter: isLoaded ? realFormatter : SSR_FORMATTER,
		isLoaded,
	};
}

function resolveHourCycle(
	clockFormat: UserPreferences["clockFormat"],
): "h12" | "h23" | undefined {
	if (clockFormat === "12h") return "h12";
	if (clockFormat === "24h") return "h23";
	return undefined;
}

function compareLanguages(a: string, b: string) {
	const baseA = a.split("-")[0];
	const baseB = b.split("-")[0];

	return baseA.toUpperCase() === baseB.toUpperCase();
}
