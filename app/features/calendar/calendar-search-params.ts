import * as v from "valibot";
import {
	BEST_TIER_NUMBER,
	WORST_TIER_NUMBER,
} from "~/features/tournament/core/tiering";
import { gamesShort, versusShort } from "~/modules/in-game-lists/games";
import { modesShortWithSpecial } from "~/modules/in-game-lists/modes";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import { gamesShortSchema, modeShortWithSpecial } from "~/utils/schema";
import { calendarFilterTagsArr } from "./calendar-schemas";

export const VIEW_FILTERS = [
	"registered",
	"hosting",
	"scrims",
	"saved",
	"organization",
] as const;
export type ViewFilter = (typeof VIEW_FILTERS)[number];

const tierNumber = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(BEST_TIER_NUMBER),
	v.maxValue(WORST_TIER_NUMBER),
);

// plain number schemas (not `dayMonthYear`'s coercing ones) because SP.param
// derives the URL encoding from the schema's base type and coerces itself
const dayNumber = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(1),
	v.maxValue(31),
);
const monthNumber = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(0),
	v.maxValue(11),
);
const yearNumber = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(2015),
	v.maxValue(2100),
);

export const calendarSearchParams = SearchParams.define({
	modes: SP.param(
		v.pipe(
			v.array(modeShortWithSpecial),
			v.minLength(1),
			v.maxLength(modesShortWithSpecial.length),
		),
		{ default: [...modesShortWithSpecial], loader: true },
	),
	modesExact: SP.param(v.boolean(), { default: false, loader: true }),
	games: SP.param(
		v.pipe(
			v.array(gamesShortSchema),
			v.minLength(1),
			v.maxLength(gamesShort.length),
		),
		{
			default: [...gamesShort],
			loader: true,
		},
	),
	preferredVersus: SP.param(
		v.pipe(
			v.array(v.picklist(versusShort)),
			v.minLength(1),
			v.maxLength(versusShort.length),
		),
		{ default: [...versusShort], loader: true },
	),
	preferredStartTime: SP.param(v.picklist(["ANY", "EU", "NA", "AU"]), {
		default: "ANY",
		loader: true,
	}),
	tagsIncluded: SP.param(calendarFilterTagsArr, {
		default: [],
		loader: true,
	}),
	tagsExcluded: SP.param(calendarFilterTagsArr, {
		default: [],
		loader: true,
	}),
	isSendou: SP.param(v.boolean(), { default: false, loader: true }),
	isRanked: SP.param(v.boolean(), { default: false, loader: true }),
	minTeamCount: SP.param(v.pipe(v.number(), v.integer(), v.minValue(0)), {
		default: 0,
		loader: true,
	}),
	minTier: SP.param(tierNumber, { default: BEST_TIER_NUMBER, loader: true }),
	maxTier: SP.param(tierNumber, { default: WORST_TIER_NUMBER, loader: true }),
	orgsIncluded: SP.param(
		v.pipe(v.array(v.pipe(v.string(), v.maxLength(100))), v.maxLength(10)),
		{
			default: [],
			loader: true,
		},
	),
	orgsExcluded: SP.param(
		v.pipe(v.array(v.pipe(v.string(), v.maxLength(100))), v.maxLength(10)),
		{
			default: [],
			loader: true,
		},
	),
	authorIdsExcluded: SP.param(
		v.pipe(
			v.array(v.pipe(v.number(), v.integer(), v.gtValue(0))),
			v.maxLength(10),
		),
		{
			default: [],
			loader: true,
		},
	),
	/** False once the user has edited the filters, making the URL win over their saved defaults. */
	useDefaults: SP.param(v.boolean(), { default: true, loader: true }),
	day: SP.param(v.nullable(dayNumber), { loader: true }),
	month: SP.param(v.nullable(monthNumber), { loader: true }),
	year: SP.param(v.nullable(yearNumber), { loader: true }),
});

export const calendarEventsSearchParams = SearchParams.define({
	view: SP.param(v.nullable(v.picklist(VIEW_FILTERS)), { loader: false }),
});

export const calendarNewSearchParams = SearchParams.define({
	eventId: SP.param(v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))), {
		loader: true,
	}),
	copyEventId: SP.param(
		v.nullable(v.pipe(v.number(), v.integer(), v.gtValue(0))),
		{
			loader: true,
		},
	),
	tournament: SP.param(v.boolean(), {
		default: false,
		loader: true,
	}),
});
