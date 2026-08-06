import { z } from "zod";
import { gamesShort, versusShort } from "~/modules/in-game-lists/games";
import { modesShortWithSpecial } from "~/modules/in-game-lists/modes";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";
import {
	dayMonthYear,
	gamesShortSchema,
	modeShortWithSpecial,
} from "~/utils/zod";
import { calendarEventTagSchema } from "./calendar-schemas";

export const VIEW_FILTERS = [
	"registered",
	"hosting",
	"scrims",
	"saved",
	"organization",
] as const;
export type ViewFilter = (typeof VIEW_FILTERS)[number];

export const calendarSearchParams = SearchParams.define({
	modes: SP.param(
		z.array(modeShortWithSpecial).min(1).max(modesShortWithSpecial.length),
		{ default: [...modesShortWithSpecial], loader: true },
	),
	modesExact: SP.param(z.boolean(), { default: false, loader: true }),
	games: SP.param(z.array(gamesShortSchema).min(1).max(gamesShort.length), {
		default: [...gamesShort],
		loader: true,
	}),
	preferredVersus: SP.param(
		z.array(z.enum(versusShort)).min(1).max(versusShort.length),
		{ default: [...versusShort], loader: true },
	),
	preferredStartTime: SP.param(z.enum(["ANY", "EU", "NA", "AU"]), {
		default: "ANY",
		loader: true,
	}),
	tagsIncluded: SP.param(z.array(calendarEventTagSchema), {
		default: [],
		loader: true,
	}),
	tagsExcluded: SP.param(z.array(calendarEventTagSchema), {
		default: [],
		loader: true,
	}),
	isSendou: SP.param(z.boolean(), { default: false, loader: true }),
	isRanked: SP.param(z.boolean(), { default: false, loader: true }),
	minTeamCount: SP.param(z.number().int().nonnegative(), {
		default: 0,
		loader: true,
	}),
	orgsIncluded: SP.param(z.array(z.string().max(100)).max(10), {
		default: [],
		loader: true,
	}),
	orgsExcluded: SP.param(z.array(z.string().max(100)).max(10), {
		default: [],
		loader: true,
	}),
	authorIdsExcluded: SP.param(z.array(z.number().int().positive()).max(10), {
		default: [],
		loader: true,
	}),
	/** False once the user has edited the filters, making the URL win over their saved defaults. */
	useDefaults: SP.param(z.boolean(), { default: true, loader: true }),
	day: SP.param(dayMonthYear.shape.day.nullable(), { loader: true }),
	month: SP.param(dayMonthYear.shape.month.nullable(), { loader: true }),
	year: SP.param(dayMonthYear.shape.year.nullable(), { loader: true }),
});

export const calendarEventsSearchParams = SearchParams.define({
	view: SP.param(z.enum(VIEW_FILTERS).nullable(), { loader: false }),
});

export const calendarNewSearchParams = SearchParams.define({
	eventId: SP.param(z.number().int().positive().nullable(), { loader: true }),
	copyEventId: SP.param(z.number().int().positive().nullable(), {
		loader: true,
	}),
	tournament: SP.param(z.boolean(), {
		default: false,
		loader: true,
	}),
});
