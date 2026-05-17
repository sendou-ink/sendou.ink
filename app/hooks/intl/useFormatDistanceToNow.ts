import { useTranslation } from "react-i18next";
import type { LanguageCode } from "~/modules/i18n/config";
import {
	databaseTimestampToDate,
	formatDistanceToNow as formatDistanceToNowUtil,
} from "~/utils/dates";

/**
 * Hook that returns a `formatDistanceToNow` function (date-fns) bound to the
 * current site language, for locale-aware "x ago" / "in x" output.
 *
 * Accepts either a `Date` or a database timestamp (`number`); numbers are
 * converted via `databaseTimestampToDate`.
 *
 * Note: this intentionally does NOT honor the user's "always use browser
 * language" preference (unlike `useDateTimeFormat`). The browser may be set to
 * a language we have not loaded a date-fns locale for, so we use the
 * site language to guarantee a translated result.
 */
export function useFormatDistanceToNow() {
	const { i18n } = useTranslation();

	return (
		date: Date | number,
		options?: Omit<Parameters<typeof formatDistanceToNowUtil>[1], "language">,
	) => {
		return formatDistanceToNowUtil(
			typeof date === "number" ? databaseTimestampToDate(date) : date,
			{
				...options,
				language: i18n.language as LanguageCode,
			},
		);
	};
}
