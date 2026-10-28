import { TZDate } from "@date-fns/tz";
import { isWeekend } from "date-fns";
import {
	BEST_TIER_NUMBER,
	WORST_TIER_NUMBER,
} from "~/features/tournament/core/tiering";
import { gamesShort, versusShort } from "~/modules/in-game-lists/games";
import { modesShortWithSpecial } from "~/modules/in-game-lists/modes";
import { assertType } from "~/utils/types";
import type {
	CalendarEvent,
	CalendarEventTag,
	CalendarFilters,
	GroupedCalendarEvents,
} from "../calendar-types";

const MEMBERS_PER_TEAM_BY_VERSUS_TAG = {
	ONES: 1,
	DUOS: 2,
	TRIOS: 3,
} as const satisfies Partial<Record<CalendarEventTag, number>>;

type VersusTag = keyof typeof MEMBERS_PER_TEAM_BY_VERSUS_TAG;

export const FILTERS_KEYS = [
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
	"minTier",
	"maxTier",
	"preferredVersus",
] as const;

assertType<(typeof FILTERS_KEYS)[number], keyof CalendarFilters>();
assertType<keyof CalendarFilters, (typeof FILTERS_KEYS)[number]>();

/** Whether the tag tells the team size (1v1, 2v2 or 3v3). Tournaments never store these, their tag is derived from `minMembersPerTeam` via {@link versusTag}. */
export function isVersusTag(tag: CalendarEventTag): tag is VersusTag {
	return Object.hasOwn(MEMBERS_PER_TEAM_BY_VERSUS_TAG, tag);
}

/** The tag telling the team size of a tournament with the given minimum members per team, null for 4v4. */
export function versusTag(minMembersPerTeam: number): VersusTag | null {
	for (const [tag, membersPerTeam] of Object.entries(
		MEMBERS_PER_TEAM_BY_VERSUS_TAG,
	)) {
		if (membersPerTeam === minMembersPerTeam) return tag as VersusTag;
	}

	return null;
}

/** Default empty calendar filters. */
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
		minTier: BEST_TIER_NUMBER,
		maxTier: WORST_TIER_NUMBER,
	};
}

const defaultFiltersString = filtersToString(defaultFilters());

/** Whether the filters equal the defaults. */
export function isDefaultFilters(filters: CalendarFilters): boolean {
	return filtersToString(filters) === defaultFiltersString;
}

function filtersToString(filters: CalendarFilters): string {
	let result = "";

	for (const key of FILTERS_KEYS) {
		result += `${key}-${filters[key]};`;
	}

	return result;
}

/** Splits each group's events into shown (matching every set filter) and hidden. */
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
			return matchesPreferredStartTime(filters[key], startTime);
		}
		case "isSendou": {
			if (!filters[key]) {
				return true;
			}

			return event.isRanked !== null;
		}
		case "isRanked": {
			if (!filters[key]) {
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
			return matchesGames(event, filters[key]);
		}
		case "preferredVersus": {
			return matchesPreferredVersus(event, filters[key]);
		}
		case "modes": {
			return matchesModes(event, filters[key], filters.modesExact);
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
		case "minTier": {
			return matchesTierRange(event, filters);
		}
		case "maxTier": {
			// handled in the minTier filter
			return true;
		}
		case "orgsIncluded": {
			return matchesOrgsIncluded(event, filters[key]);
		}
		case "orgsExcluded": {
			return matchesOrgsExcluded(event, filters[key]);
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

function matchesPreferredStartTime(
	preferredStartTime: CalendarFilters["preferredStartTime"],
	startTime: number,
) {
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

function matchesGames(event: CalendarEvent, games: CalendarFilters["games"]) {
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

function matchesPreferredVersus(
	event: CalendarEvent,
	preferredVersus: CalendarFilters["preferredVersus"],
) {
	if (
		!preferredVersus.length ||
		preferredVersus.length === versusShort.length
	) {
		return true;
	}

	const tag = event.tags.find(isVersusTag);
	const membersPerTeam = tag
		? MEMBERS_PER_TEAM_BY_VERSUS_TAG[tag]
		: event.minMembersPerTeam;

	const versus = `${membersPerTeam}v${membersPerTeam}`;

	return preferredVersus.some((preferred) => preferred === versus);
}

function matchesModes(
	event: CalendarEvent,
	modes: CalendarFilters["modes"],
	modesExact: CalendarFilters["modesExact"],
) {
	if (!modes.length || modes.length === modesShortWithSpecial.length) {
		return true;
	}

	if (!event.modes) {
		return false;
	}

	if (modesExact) {
		return (
			event.modes.length === modes.length &&
			event.modes.every((mode) => modes.includes(mode))
		);
	}

	return event.modes.some((mode) => modes.includes(mode));
}

function matchesTierRange(
	event: CalendarEvent,
	{ minTier, maxTier }: Pick<CalendarFilters, "minTier" | "maxTier">,
) {
	if (minTier === BEST_TIER_NUMBER && maxTier === WORST_TIER_NUMBER) {
		return true;
	}

	const tier = event.tier ?? event.tentativeTier;
	if (tier === null) {
		return false;
	}

	return tier >= minTier && tier <= maxTier;
}

function matchesOrgsIncluded(
	event: CalendarEvent,
	orgsIncluded: CalendarFilters["orgsIncluded"],
) {
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

function matchesOrgsExcluded(
	event: CalendarEvent,
	orgsExcluded: CalendarFilters["orgsExcluded"],
) {
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

function orgNameMatches({
	orgName,
	value,
}: {
	orgName: string;
	value: string;
}) {
	return orgName.trim().toLowerCase() === value.trim().toLowerCase();
}
