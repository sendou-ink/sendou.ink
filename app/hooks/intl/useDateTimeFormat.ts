import { databaseTimestampToDate } from "~/utils/dates";
import { useUserIntlPreference } from "./useUserIntlPreference";

const SSR_FORMATTER = {
	format: (_date: Date | number) => null,
};

// xxx: jsdoc
export function useDateTimeFormat(options: Intl.DateTimeFormatOptions) {
	const { language, hourCycle, isLoaded } = useUserIntlPreference();

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
	};

	return {
		formatter: isLoaded ? realFormatter : SSR_FORMATTER,
		isLoaded,
	};
}
