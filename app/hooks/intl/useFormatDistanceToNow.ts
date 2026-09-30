import { useTranslation } from "react-i18next";
import type { LanguageCode } from "~/modules/i18n/config";
import {
	databaseTimestampToDate,
	formatDistanceToNow as formatDistanceToNowUtil,
} from "~/utils/dates";

/**
 * date-fns `formatDistanceToNow` bound to the site language, taking a `Date` or database timestamp. Unlike
 * `useDateTimeFormat` it ignores the "always use browser language" preference: that language may have no
 * date-fns locale loaded.
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
