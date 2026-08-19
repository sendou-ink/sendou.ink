import * as v from "valibot";
import type { CalendarEventTag } from "~/features/calendar/calendar-types";
import {
	BEST_TIER_NUMBER,
	WORST_TIER_NUMBER,
} from "~/features/tournament/core/tiering";
import { gamesShort, versusShort } from "~/modules/in-game-lists/games";
import { modesShortWithSpecial } from "~/modules/in-game-lists/modes";
import { gamesShortSchema, id, modeShortWithSpecial } from "~/utils/zod";
import { CALENDAR_EVENT } from "./calendar-constants";

const calendarEventTagSchema = v.pipe(
    v.string(),
    v.check((val) => CALENDAR_EVENT.TAGS.includes(val as CalendarEventTag))
);

export const calendarFilterTagsArr = v.pipe(v.array(calendarEventTagSchema), v.maxLength(CALENDAR_EVENT.TAGS.length));

const calendarFiltersPlainStringArr = v.pipe(v.array(v.pipe(v.string(), v.maxLength(100))), v.maxLength(10));
const calendarFiltersIdsArr = v.pipe(v.array(id), v.maxLength(10));
const calendarFilterGamesArr = v.pipe(v.array(gamesShortSchema), v.minLength(1), v.maxLength(3));
const preferredStartTime = v.picklist(["ANY", "EU", "NA", "AU"]);
const preferredVersus = v.pipe(
    v.array(v.picklist(versusShort)),
    v.minLength(1),
    v.maxLength(versusShort.length)
);
const modeArr = v.pipe(
    v.array(modeShortWithSpecial),
    v.minLength(1),
    v.maxLength(modesShortWithSpecial.length)
);
const tierNumber = v.pipe(
    v.unknown(),
    v.toNumber(),
    v.integer(),
    v.minValue(BEST_TIER_NUMBER),
    v.maxValue(WORST_TIER_NUMBER)
);

export const calendarFiltersSearchParamsSchema = v.object({
	preferredStartTime: preferredStartTime.catch("ANY"),
	tagsIncluded: calendarFilterTagsArr.catch([]),
	tagsExcluded: calendarFilterTagsArr.catch([]),
	isSendou: v.boolean()(false),
	isRanked: v.boolean()(false),
	orgsIncluded: calendarFiltersPlainStringArr.catch([]),
	orgsExcluded: calendarFiltersPlainStringArr.catch([]),
	authorIdsExcluded: calendarFiltersIdsArr.catch([]),
	games: calendarFilterGamesArr.catch([...gamesShort]),
	preferredVersus: preferredVersus.catch([...versusShort]),
	modes: modeArr.catch([...modesShortWithSpecial]),
	modesExact: v.boolean()(false),
	minTeamCount: v.pipe(v.unknown(), v.toNumber(), v.integer(), v.minValue(0))(0),
	minTier: tierNumber.catch(BEST_TIER_NUMBER),
	maxTier: tierNumber.catch(WORST_TIER_NUMBER),
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
