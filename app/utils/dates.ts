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
import type { DayMonthYear } from "./schema";

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

/** Caches the date-fns locale for {@link formatDistanceToNow}; a load failure is logged and falls back to English. */
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

/** Loads every date-fns locale (server only, bundle size irrelevant). */
export function loadAllDateFnsLocales() {
	return Promise.all(
		(Object.keys(LOCALE_LOADERS) as LanguageCode[]).map(loadDateFnsLocale),
	);
}

/** How long ago / until the date in the given language; falls back to English unless {@link loadDateFnsLocale} ran. */
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

/** Day/month/year to a Date at noon UTC. */
export function dayMonthYearToDate({ day, month, year }: DayMonthYear) {
	return new Date(Date.UTC(year, month, day, 12));
}

/** Date to a react-aria-components CalendarDateTime. */
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

/** Date to a react-aria-components CalendarDate (date-only pickers). */
export function dateToCalendarDate(date: Date) {
	return new CalendarDate(
		date.getFullYear(),
		date.getMonth() + 1,
		date.getDate(),
	);
}

/** Day/month/year to a react-aria-components DateValue, noon UTC. */
export function dayMonthYearToDateValue({ day, month, year }: DayMonthYear) {
	const isoString = dateToYYYYMMDD(new Date(Date.UTC(year, month, day, 12)));

	return parseDate(isoString);
}

/** Day/month/year to a database timestamp, noon UTC. */
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
 * UTC range of an ISO week: its Monday to the next Monday. UTC arithmetic keeps the span exactly
 * 7×24h regardless of server timezone or DST.
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

export function isValidDate(date: Date) {
	return !Number.isNaN(date.getTime());
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

/** Same as datesOfMonth but padded with nulls at the start so the month starts on a Monday */
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
