import * as v from "valibot";
import type { CalendarEventTag } from "~/features/calendar/calendar-types";
import {
	BEST_TIER_NUMBER,
	WORST_TIER_NUMBER,
} from "~/features/tournament/core/tiering";
import { gamesShort, versusShort } from "~/modules/in-game-lists/games";
import { modesShortWithSpecial } from "~/modules/in-game-lists/modes";
import {
	coerceNumber,
	gamesShortSchema,
	id,
	modeShortWithSpecial,
} from "~/utils/schema";
import { CALENDAR_EVENT } from "./calendar-constants";

const calendarEventTagSchema = v.pipe(
	v.string(),
	v.check((val) => CALENDAR_EVENT.TAGS.includes(val as CalendarEventTag)),
);

export const calendarFilterTagsArr = v.pipe(
	v.array(calendarEventTagSchema),
	v.maxLength(CALENDAR_EVENT.TAGS.length),
);

const calendarFiltersPlainStringArr = v.pipe(
	v.array(v.pipe(v.string(), v.maxLength(100))),
	v.maxLength(10),
);
const calendarFiltersIdsArr = v.pipe(v.array(id), v.maxLength(10));
const calendarFilterGamesArr = v.pipe(
	v.array(gamesShortSchema),
	v.minLength(1),
	v.maxLength(3),
);
const preferredStartTime = v.picklist(["ANY", "EU", "NA", "AU"]);
const preferredVersus = v.pipe(
	v.array(v.picklist(versusShort)),
	v.minLength(1),
	v.maxLength(versusShort.length),
);
const modeArr = v.pipe(
	v.array(modeShortWithSpecial),
	v.minLength(1),
	v.maxLength(modesShortWithSpecial.length),
);
const tierNumber = v.pipe(
	coerceNumber(),
	v.integer(),
	v.minValue(BEST_TIER_NUMBER),
	v.maxValue(WORST_TIER_NUMBER),
);

export const calendarFiltersSearchParamsSchema = v.object({
	preferredStartTime: v.fallback(preferredStartTime, "ANY"),
	tagsIncluded: v.fallback(calendarFilterTagsArr, []),
	tagsExcluded: v.fallback(calendarFilterTagsArr, []),
	isSendou: v.fallback(v.boolean(), false),
	isRanked: v.fallback(v.boolean(), false),
	orgsIncluded: v.fallback(calendarFiltersPlainStringArr, []),
	orgsExcluded: v.fallback(calendarFiltersPlainStringArr, []),
	authorIdsExcluded: v.fallback(calendarFiltersIdsArr, []),
	games: v.fallback(calendarFilterGamesArr, [...gamesShort]),
	preferredVersus: v.fallback(preferredVersus, [...versusShort]),
	modes: v.fallback(modeArr, [...modesShortWithSpecial]),
	modesExact: v.fallback(v.boolean(), false),
	minTeamCount: v.fallback(
		v.pipe(coerceNumber(), v.integer(), v.minValue(0)),
		0,
	),
	minTier: v.fallback(tierNumber, BEST_TIER_NUMBER),
	maxTier: v.fallback(tierNumber, WORST_TIER_NUMBER),
});

const TAGS_TO_OMIT: CalendarEventTag[] = [
	"CARDS",
	"SR",
	"S1",
	"S2",
	"ONES",
	"DUOS",
	"TRIOS",
];

export const calendarFilterTags = CALENDAR_EVENT.TAGS.filter(
	(tag) => !TAGS_TO_OMIT.includes(tag),
);
