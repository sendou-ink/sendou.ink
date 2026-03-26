import {
	CalendarDate,
	CalendarDateTime,
	parseDate,
} from "@internationalized/date";
import type { Locale } from "date-fns";
import { formatDistanceToNow as dateFnsFormatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale/da";
import { de } from "date-fns/locale/de";
import { enUS } from "date-fns/locale/en-US";
import { es } from "date-fns/locale/es";
import { fr } from "date-fns/locale/fr";
import { frCA } from "date-fns/locale/fr-CA";
import { he } from "date-fns/locale/he";
import { it } from "date-fns/locale/it";
import { ja } from "date-fns/locale/ja";
import { ko } from "date-fns/locale/ko";
import { nl } from "date-fns/locale/nl";
import { pl } from "date-fns/locale/pl";
import { ptBR } from "date-fns/locale/pt-BR";
import { ru } from "date-fns/locale/ru";
import { zhCN } from "date-fns/locale/zh-CN";
import type { MonthYear } from "~/features/plus-voting/core";
import type { LanguageCode } from "~/modules/i18n/config";
import type { DayMonthYear } from "./zod";

const LOCALE_MAP: Record<LanguageCode, Locale> = {
	da,
	de,
	en: enUS,
	"es-ES": es,
	"es-US": es,
	"fr-CA": frCA,
	"fr-EU": fr,
	he,
	it,
	ja,
	ko,
	nl,
	pl,
	"pt-BR": ptBR,
	ru,
	zh: zhCN,
};

export function formatDistanceToNow(
	date: Parameters<typeof dateFnsFormatDistanceToNow>[0],
	options: Omit<
		NonNullable<Parameters<typeof dateFnsFormatDistanceToNow>[1]>,
		"locale"
	> & { language: LanguageCode },
) {
	return dateFnsFormatDistanceToNow(date, {
		...options,
		locale: LOCALE_MAP[options.language],
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

	result.setDate(
		result.getDate() - (result.getDay() || 7) + 1 + 7 * (week - 1),
	);
	if (position === "end") {
		result.setDate(result.getDate() + 6);
	}
	return result;
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

/**
 * Retrieves a new Date object that is offset by several hours.
 *
 * NOTE: it is important that we work with & return a copy of the date here,
 *  otherwise we will just be mutating the original date passed into this function.
 */
export function getDateWithHoursOffset(date: Date, hoursOffset: number) {
	const copiedDate = new Date(date.getTime());
	copiedDate.setHours(date.getHours() + hoursOffset);
	return copiedDate;
}

export function getDateAtNextFullHour(date: Date) {
	const copiedDate = new Date(date.getTime());
	if (date.getMinutes() > 0) {
		copiedDate.setHours(date.getHours() + 1);
		copiedDate.setMinutes(0);
	}
	copiedDate.setSeconds(0);
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
