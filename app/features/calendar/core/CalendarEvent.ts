import { assertType } from "~/utils/types";
import type {
	CalendarEvent,
	CalendarFilters,
	GroupedCalendarEvents,
} from "../calendar-types";

// xxx: add jsdocs to these

const FILTERS_KEYS = [
	"tagsIncluded",
	"tagsExcluded",
	"isSendou",
	"isRanked",
	"orgsIncluded",
	"orgsExcluded",
] as const;

assertType<(typeof FILTERS_KEYS)[number], keyof CalendarFilters>();
assertType<keyof CalendarFilters, (typeof FILTERS_KEYS)[number]>();

export function defaultFilters(): CalendarFilters {
	return {
		tagsIncluded: [],
		tagsExcluded: [],
		isSendou: false,
		isRanked: false,
		orgsIncluded: [],
		orgsExcluded: [],
	};
}

const defaultFiltersString = filtersToString(defaultFilters());

export function isDefaultFilters(filters: CalendarFilters): boolean {
	return filtersToString(filters) === defaultFiltersString;
}

export function filtersToString(filters: CalendarFilters): string {
	let result = "";

	for (const key of FILTERS_KEYS) {
		result += `${key}-${filters[key]};`;
	}

	return result;
}

export function applyFilters(
	events: {
		at: number;
		events: Array<CalendarEvent>;
	}[],
	filters: CalendarFilters,
): Array<GroupedCalendarEvents> {
	return events.map((eventTime) => {
		const shown: CalendarEvent[] = [];
		const hidden: CalendarEvent[] = [];

		for (const calendarEvent of eventTime.events) {
			let isHidden = false;
			for (const key of FILTERS_KEYS) {
				if (!matchesFilter(calendarEvent, key, filters)) {
					isHidden = true;
					break;
				}
			}
			if (isHidden) {
				hidden.push(calendarEvent);
				continue;
			}

			shown.push(calendarEvent);
		}

		return {
			at: eventTime.at,
			events: {
				shown,
				hidden,
			},
		};
	});
}

function matchesFilter(
	event: CalendarEvent,
	key: keyof CalendarFilters,
	filters: CalendarFilters,
): boolean {
	switch (key) {
		case "isSendou": {
			if (filters[key] !== true) {
				return true;
			}

			return event.isRanked !== null;
		}
		case "isRanked": {
			if (filters[key] !== true) {
				return true;
			}

			return event.isRanked === true;
		}
		case "tagsIncluded": {
			const tags = filters[key];
			if (tags.length === 0) {
				return true;
			}

			return event.tags.some((tag) => tags.includes(tag));
		}
		case "tagsExcluded": {
			const tags = filters[key];
			if (tags.length === 0) {
				return true;
			}

			return !event.tags.some((tag) => tags.includes(tag));
		}
		case "orgsIncluded": {
			const orgsIncluded = filters[key];
			if (orgsIncluded.length === 0) {
				return true;
			}

			const org = event.organization;

			if (!org) {
				return false;
			}

			return orgsIncluded.some((orgName) =>
				orgNameMatches({ orgName: org.name, value: orgName }),
			);
		}
		case "orgsExcluded": {
			const orgsExcluded = filters[key];
			if (orgsExcluded.length === 0) {
				return true;
			}

			const org = event.organization;

			if (!org) {
				return true;
			}

			return !orgsExcluded.some((orgName) =>
				orgNameMatches({ orgName: org.name, value: orgName }),
			);
		}
	}
}

function orgNameMatches({
	orgName,
	value,
}: { orgName: string; value: string }) {
	return orgName.trim().toLowerCase() === value.trim().toLowerCase();
}
