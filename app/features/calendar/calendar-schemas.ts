import { z } from "zod";
import type { CalendarEventTag } from "~/features/calendar/calendar-types";
import {
	BEST_TIER_NUMBER,
	WORST_TIER_NUMBER,
} from "~/features/tournament/core/tiering";
import { gamesShort, versusShort } from "~/modules/in-game-lists/games";
import { modesShortWithSpecial } from "~/modules/in-game-lists/modes";
import { gamesShortSchema, id, modeShortWithSpecial } from "~/utils/zod";
import { CALENDAR_EVENT } from "./calendar-constants";

const calendarEventTagSchema = z
	.string()
	.refine((val) => CALENDAR_EVENT.TAGS.includes(val as CalendarEventTag));

export const calendarFilterTagsArr = z
	.array(calendarEventTagSchema)
	.max(CALENDAR_EVENT.TAGS.length);

const calendarFiltersPlainStringArr = z.array(z.string().max(100)).max(10);
const calendarFiltersIdsArr = z.array(id).max(10);
const calendarFilterGamesArr = z.array(gamesShortSchema).min(1).max(3);
const preferredStartTime = z.enum(["ANY", "EU", "NA", "AU"]);
const preferredVersus = z
	.array(z.enum(versusShort))
	.min(1)
	.max(versusShort.length);
const modeArr = z
	.array(modeShortWithSpecial)
	.min(1)
	.max(modesShortWithSpecial.length);
const tierNumber = z.coerce
	.number()
	.int()
	.min(BEST_TIER_NUMBER)
	.max(WORST_TIER_NUMBER);

export const calendarFiltersSearchParamsSchema = z.object({
	preferredStartTime: preferredStartTime.catch("ANY"),
	tagsIncluded: calendarFilterTagsArr.catch([]),
	tagsExcluded: calendarFilterTagsArr.catch([]),
	isSendou: z.boolean().catch(false),
	isRanked: z.boolean().catch(false),
	orgsIncluded: calendarFiltersPlainStringArr.catch([]),
	orgsExcluded: calendarFiltersPlainStringArr.catch([]),
	authorIdsExcluded: calendarFiltersIdsArr.catch([]),
	games: calendarFilterGamesArr.catch([...gamesShort]),
	preferredVersus: preferredVersus.catch([...versusShort]),
	modes: modeArr.catch([...modesShortWithSpecial]),
	modesExact: z.boolean().catch(false),
	minTeamCount: z.coerce.number().int().nonnegative().catch(0),
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
