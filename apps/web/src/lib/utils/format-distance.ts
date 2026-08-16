import { formatDistanceToNow } from "date-fns";

/**
 * Localized "x minutes ago" style distance. Currently formats with date-fns'
 * default (English) locale; non-English date-fns locales load with the wider
 * i18n port.
 */
export function formatDistanceToNowLocalized(date: Date) {
	return formatDistanceToNow(date, { addSuffix: true });
}
