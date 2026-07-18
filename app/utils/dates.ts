import {
	CalendarDate,
	CalendarDateTime,
	parseDate,
} from "@internationalized/date";
import type { Locale } from "date-fns";
import { formatDistanceToNow as dateFnsFormatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import type { MonthYear } from "~/features/plus-voting/core";
import type { LanguageCode } from "~/modules/i18n/config";
import { logger } from "./logger";
import type { DayMonthYear } from "./zod";

// en-US ships with date-fns core as the default locale, so it costs no extra bytes
const LOCALE_LOADERS: Record<LanguageCode, () => Promise<Locale>> = {
	da: () => import("date-fns/locale/da").then((module) => module.da),
	de: () => import("date-fns/locale/de").then((module) => module.de),
	en: () => Promise.resolve(enUS),
	"es-ES": () => import("date-fns/locale/es").then((module) => module.es),
	"es-US": () => import("date-fns/locale/es").then((module) => module.es),
	"fr-CA": () => import("date-fns/locale/fr-CA").then((module) => module.frCA),
	"fr-EU": () => import("date-fns/locale/fr").then((module) => module.fr),
	he: () => import("date-fns/locale/he").then((module) => module.he),
	it: () => import("date-fns/locale/it").then((module) => module.it),
	ja: () => import("date-fns/locale/ja").then((module) => module.ja),
	ko: () => import("date-fns/locale/ko").then((module) => module.ko),
	nl: () => import("date-fns/locale/nl").then((module) => module.nl),
	pl: () => import("date-fns/locale/pl").then((module) => module.pl),
	"pt-BR": () => import("date-fns/locale/pt-BR").then((module) => module.ptBR),
	ru: () => import("date-fns/locale/ru").then((module) => module.ru),
	zh: () => import("date-fns/locale/zh-CN").then((module) => module.zhCN),
};

const loadedLocales = new Map<LanguageCode, Locale>();

/**
 * Loads the date-fns locale for the given language into the in-memory cache
 * used by {@link formatDistanceToNow}. Load failures are logged and result in
 * an English fallback instead of rejecting.
 */
export async function loadDateFnsLocale(language: LanguageCode) {
	if (loadedLocales.has(language)) return;

	const loader = LOCALE_LOADERS[language];
	if (!loader) return;

	try {
		loadedLocales.set(language, await loader());
	} catch (error) {
		logger.warn(
			`Failed to load date-fns locale for language ${language}`,
			error,
		);
	}
}

/** Loads every date-fns locale into the cache (meant for the server where bundle size does not matter). */
export function loadAllDateFnsLocales() {
	return Promise.all(
		(Object.keys(LOCALE_LOADERS) as LanguageCode[]).map(loadDateFnsLocale),
	);
}

/**
 * Formats how long ago / until the given date in the given language. The
 * language's date-fns locale must be loaded first via
 * {@link loadDateFnsLocale}; otherwise falls back to English.
 */
export function formatDistanceToNow(
	date: Parameters<typeof dateFnsFormatDistanceToNow>[0],
	options: Omit<
		NonNullable<Parameters<typeof dateFnsFormatDistanceToNow>[1]>,
		"locale"
	> & { language: LanguageCode },
) {
	return dateFnsFormatDistanceToNow(date, {
		...options,
		locale: loadedLocales.get(options.language) ?? enUS,
	});
}

export function databaseTimestampToDate(timestamp: number) {
	return new Date(databaseTimestampToJavascriptTimestamp(timestamp));
}

export function databaseTimestampToJavascriptTimestamp(timestamp: number) {
	return timestamp * 1000;
}

export function dateToDatabaseTimestamp(date: Date) {
	return Math.floor(date.getTime() / 1000);
}

export function databaseTimestampNow() {
	return dateToDatabaseTimestamp(new Date());
}

/**
 * Converts a date represented by day, month, and year into a JavaScript Date object, noon UTC.
 */
export function dayMonthYearToDate({ day, month, year }: DayMonthYear) {
	return new Date(Date.UTC(year, month, day, 12));
}

/**
 * Converts a JavaScript Date object into a CalendarDateTime object (used by react-aria-components).
 */
export function dateToDateValue(date: Date) {
	return new CalendarDateTime(
		date.getFullYear(),
		date.getMonth() + 1,
		date.getDate(),
		date.getHours(),
		date.getMinutes(),
		date.getSeconds(),
	);
}

/**
 * Converts a JavaScript Date object into a CalendarDate object (used by react-aria-components for date-only pickers).
 */
export function dateToCalendarDate(date: Date) {
	return new CalendarDate(
		date.getFullYear(),
		date.getMonth() + 1,
		date.getDate(),
	);
}

/**
 * Converts a date represented by day, month, and year into a DateValue object (used by react-aria-components), noon UTC.
 */
export function dayMonthYearToDateValue({ day, month, year }: DayMonthYear) {
	const isoString = dateToYYYYMMDD(new Date(Date.UTC(year, month, day, 12)));

	return parseDate(isoString);
}

/**
 * Converts a date represented by day, month, and year into a database timestamp, noon UTC.
 */
export function dayMonthYearToDatabaseTimestamp(args: DayMonthYear) {
	return dateToDatabaseTimestamp(dayMonthYearToDate(args));
}

// https://stackoverflow.com/a/71336659
export function weekNumberToDate({
	week,
	year,
	position = "start",
}: {
	week: number;
	year: number;
	/** start = Date of Monday, end = Date of Sunday */
	position?: "start" | "end";
}) {
	const result = new Date(Date.UTC(year, 0, 4));

	result.setUTCDate(
		result.getUTCDate() - (result.getUTCDay() || 7) + 1 + 7 * (week - 1),
	);
	if (position === "end") {
		result.setUTCDate(result.getUTCDate() + 6);
	}
	return result;
}

/**
 * Returns the UTC date range covering an ISO week: the Monday that starts the
 * week and the Monday that starts the following week (a 7-day span). Uses UTC
 * date arithmetic so the span is exactly 7×24h regardless of the server's
 * timezone or any DST transition that falls inside the week.
 */
export function weekNumberToDateRange({
	week,
	year,
}: {
	week: number;
	year: number;
}) {
	const startTime = weekNumberToDate({ week, year });

	const endTime = new Date(startTime);
	endTime.setUTCDate(endTime.getUTCDate() + 7);

	return { startTime, endTime };
}

/**
 * Checks if a date is valid or not.
 *
 * Returns:
 * - True if date is valid
 * - False otherwise
 */
export function isValidDate(date: Date) {
	return !Number.isNaN(date.getTime());
}

/** Returns date as a string with the format YYYY-MM-DDThh:mm in user's time zone */
export function dateToYearMonthDayHourMinuteString(date: Date) {
	const copiedDate = new Date(date.getTime());

	if (!isValidDate(copiedDate)) {
		throw new Error("tried to format string from invalid date");
	}

	const year = copiedDate.getFullYear();
	const month = copiedDate.getMonth() + 1;
	const day = copiedDate.getDate();
	const hour = copiedDate.getHours();
	const minute = copiedDate.getMinutes();

	return `${year}-${prefixZero(month)}-${prefixZero(day)}T${prefixZero(
		hour,
	)}:${prefixZero(minute)}`;
}

function prefixZero(number: number) {
	return number < 10 ? `0${number}` : number;
}

export function getDateAtNextFullHour(date: Date) {
	const copiedDate = new Date(date.getTime());
	if (
		date.getMinutes() > 0 ||
		date.getSeconds() > 0 ||
		date.getMilliseconds() > 0
	) {
		copiedDate.setHours(date.getHours() + 1);
		copiedDate.setMinutes(0);
	}
	copiedDate.setSeconds(0);
	copiedDate.setMilliseconds(0);
	return copiedDate;
}

export function dateToYYYYMMDD(date: Date) {
	return date.toISOString().split("T")[0];
}

// same as datesOfMonth but contains null at the start to start with monday
export function nullPaddedDatesOfMonth({ month, year }: MonthYear) {
	const dates = datesOfMonth({ month, year });
	const firstDay = dates[0].getUTCDay();
	const nulls = Array.from(
		{ length: firstDay === 0 ? 6 : firstDay - 1 },
		() => null,
	);
	return [...nulls, ...dates];
}

function datesOfMonth({ month, year }: MonthYear) {
	const dates = [];
	const date = new Date(Date.UTC(year, month, 1));
	while (date.getUTCMonth() === month) {
		dates.push(new Date(date));
		date.setUTCDate(date.getUTCDate() + 1);
	}
	return dates;
}
