import { TZDate } from "@date-fns/tz";
import { isWeekend } from "date-fns";
import { gamesShort, versusShort } from "~/modules/in-game-lists/games";
import { modesShortWithSpecial } from "~/modules/in-game-lists/modes";
import { assertType } from "~/utils/types";
import type {
	CalendarEvent,
	CalendarFilters,
	GroupedCalendarEvents,
} from "../calendar-types";

const FILTERS_KEYS = [
	"preferredStartTime",
	"tagsIncluded",
	"tagsExcluded",
	"isSendou",
	"isRanked",
	"games",
	"orgsIncluded",
	"orgsExcluded",
	"authorIdsExcluded",
	"modes",
	"modesExact",
	"minTeamCount",
	"preferredVersus",
] as const;

assertType<(typeof FILTERS_KEYS)[number], keyof CalendarFilters>();
assertType<keyof CalendarFilters, (typeof FILTERS_KEYS)[number]>();

/**
 * Returns the default empty state of filter settings for calendar events.
 */
export function defaultFilters(): CalendarFilters {
	return {
		preferredStartTime: "ANY",
		tagsIncluded: [],
		tagsExcluded: [],
		isSendou: false,
		isRanked: false,
		games: [...gamesShort],
		modes: [...modesShortWithSpecial],
		preferredVersus: [...versusShort],
		modesExact: false,
		orgsIncluded: [],
		orgsExcluded: [],
		authorIdsExcluded: [],
		minTeamCount: 0,
	};
}

const defaultFiltersString = filtersToString(defaultFilters());

/**
 * Determines whether the provided calendar filters match the default filter settings.
 */
export function isDefaultFilters(filters: CalendarFilters): boolean {
	return filtersToString(filters) === defaultFiltersString;
}

/**
 * Serializes the given calendar filters object into a string representation to be used as e.g. React key.
 */
export function filtersToString(filters: CalendarFilters): string {
	let result = "";

	for (const key of FILTERS_KEYS) {
		result += `${key}-${filters[key]};`;
	}

	return result;
}

/**
 * Applies the provided calendar filters to a list of grouped calendar events.
 *
 * Returns a new array where each group contains separated lists of shown and hidden events. Event is shown if it matches all set filters.
 */
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
				if (!matchesFilter(calendarEvent, eventTime.at, key, filters)) {
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
	startTime: number,
	key: keyof CalendarFilters,
	filters: CalendarFilters,
): boolean {
	switch (key) {
		case "preferredStartTime": {
			const preferredStartTime = filters[key];
			if (preferredStartTime === "ANY") {
				return true;
			}

			const timeZone =
				preferredStartTime === "EU"
					? "Europe/Paris"
					: preferredStartTime === "NA"
						? "America/Winnipeg"
						: "Australia/Perth";

			const tzDate = new TZDate(startTime, timeZone);

			if (isWeekend(tzDate)) {
				return tzDate.getHours() >= 10 && tzDate.getHours() <= 24;
			}

			return tzDate.getHours() >= 16 && tzDate.getHours() <= 23;
		}
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
		case "games": {
			const games = filters[key];
			if (!games.length || games.length === gamesShort.length) {
				return true;
			}
			const isSplatoonOne = event.tags.includes("S1");
			const isSplatoonTwo = event.tags.includes("S2");
			const isSplatoonThree = !isSplatoonOne && !isSplatoonTwo;

			for (const game of games) {
				if (game === "S1" && isSplatoonOne) {
					return true;
				}
				if (game === "S2" && isSplatoonTwo) {
					return true;
				}
				if (game === "S3" && isSplatoonThree) {
					return true;
				}
			}

			return false;
		}
		case "preferredVersus": {
			const preferredVersus = filters[key];
			if (
				!preferredVersus.length ||
				preferredVersus.length === versusShort.length
			) {
				return true;
			}

			const eventType = event.tags.find(
				(tag) => tag === "ONES" || tag === "DUOS" || tag === "TRIOS",
			);

			if (eventType === "ONES") {
				return preferredVersus.includes("1v1");
			}

			if (eventType === "DUOS") {
				return preferredVersus.includes("2v2");
			}

			if (eventType === "TRIOS") {
				return preferredVersus.includes("3v3");
			}

			return preferredVersus.includes("4v4");
		}
		case "modes": {
			const modes = filters[key];
			if (!modes.length || modes.length === modesShortWithSpecial.length) {
				return true;
			}

			if (!event.modes) {
				return false;
			}

			if (filters.modesExact) {
				return (
					event.modes.length === modes.length &&
					event.modes.every((mode) => modes.includes(mode))
				);
			}

			return event.modes.some((mode) => modes.includes(mode));
		}
		case "modesExact": {
			// handled in the modes filter
			return true;
		}
		case "minTeamCount": {
			const minTeamCount = filters[key];
			if (minTeamCount === 0) {
				return true;
			}

			return event.teamsCount >= minTeamCount;
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
		case "authorIdsExcluded": {
			const authorIds = filters[key];
			if (authorIds.length === 0) {
				return true;
			}

			return !authorIds.some((id) => event.authorId === id);
		}
	}
}

function orgNameMatches({
	orgName,
	value,
}: { orgName: string; value: string }) {
	return orgName.trim().toLowerCase() === value.trim().toLowerCase();
}
