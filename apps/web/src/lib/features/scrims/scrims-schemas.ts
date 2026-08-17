import { modesShort } from "@sendou/in-game-lists/modes";
import { add, sub } from "date-fns";
import * as v from "valibot";
import { associationIdentifierSchema } from "#lib/features/associations/associations-schemas.ts";
import {
	customField,
	datetime,
	dualSelectOptional,
	idConstant,
	radioGroupDynamic,
	select,
	selectDynamicOptional,
	selectOptional,
	stageSelect,
	textAreaOptional,
	textArea,
	textFieldOptional,
	toggle,
	tournamentSearchOptional,
} from "#lib/form/fields.ts";
import type { ParamCodec } from "#lib/modules/search-params/search-params.ts";
import {
	coercedDate,
	falsyToNull,
	filterOutNullishMembers,
	id,
	noDuplicates,
	timeString,
} from "#lib/utils/schemas.ts";
import { LUTI_DIVS, SCRIM } from "./scrims-constants.ts";
import type { LutiDiv, TimeRange } from "./scrims-types.ts";
import { parseMapPoolInput } from "./scrims-utils.ts";

export const deletePostSchema = v.object({
	scrimPostId: id,
});

const fromUsers = v.pipe(
	v.unknown(),
	v.transform(filterOutNullishMembers),
	v.array(id),
	v.minLength(3, "forms:errors.minUsersExcludingYourself"),
	v.maxLength(SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER),
	v.check((users) => noDuplicates(users), "forms:errors.usersMustBeUnique"),
);

export const fromSchema = v.variant("mode", [
	v.object({ mode: v.literal("PICKUP"), users: fromUsers }),
	v.object({ mode: v.literal("TEAM"), teamId: id }),
]);

export const newRequestSchema = v.object({
	scrimPostId: id,
	from: fromSchema,
	message: v.pipe(
		v.unknown(),
		v.transform(falsyToNull),
		v.nullable(
			v.pipe(v.string(), v.maxLength(SCRIM.REQUEST_MESSAGE_MAX_LENGTH)),
		),
	),
	at: v.nullish(coercedDate()),
});

export const acceptRequestSchema = v.object({
	scrimPostRequestId: id,
});

export const cancelRequestSchema = v.object({
	scrimPostRequestId: id,
});

export const cancelScrimFormSchema = v.object({
	scrimPostId: idConstant(),
	reason: textArea({
		label: "labels.scrimCancelReason",
		bottomText: "bottomTexts.scrimCancelReasonHelp",
		maxLength: SCRIM.CANCEL_REASON_MAX_LENGTH,
	}),
});

const timeRangeSchema = v.object({
	start: timeString,
	end: timeString,
});

const divsBaseSchema = v.pipe(
	v.object({
		min: v.nullable(v.picklist(LUTI_DIVS)),
		max: v.nullable(v.picklist(LUTI_DIVS)),
	}),
	v.check((div) => {
		if (!div) return true;

		if (div.max && !div.min) return false;
		if (div.min && !div.max) return false;

		return true;
	}, "forms:errors.divBothOrNeither"),
);

export const divsSchema = v.pipe(divsBaseSchema, v.transform(normalizeDivs));

function normalizeDivs<T extends { min: string | null; max: string | null }>(
	divs: T,
): T {
	if (!divs.min || !divs.max) return divs;

	const minIndex = LUTI_DIVS.indexOf(divs.min as LutiDiv);
	const maxIndex = LUTI_DIVS.indexOf(divs.max as LutiDiv);
	if (minIndex === -1 || maxIndex === -1) return divs;

	if (maxIndex > minIndex) {
		return { ...divs, min: divs.max, max: divs.min };
	}

	return divs;
}

export const scrimsFiltersSchema = v.object({
	weekdayTimes: v.fallback(v.nullable(timeRangeSchema), null),
	weekendTimes: v.fallback(v.nullable(timeRangeSchema), null),
	divs: v.fallback(v.nullable(divsSchema), null),
});

export const timeRangeCodec: ParamCodec<TimeRange | null> = {
	decode: (encoded) => {
		if (encoded[5] !== "-") return { ok: true, value: null };

		const parsed = v.safeParse(timeRangeSchema, {
			start: encoded.slice(0, 5),
			end: encoded.slice(6),
		});
		return parsed.success
			? { ok: true, value: parsed.output }
			: { ok: true, value: null };
	},
	encode: (timeRange) =>
		timeRange === null ? "" : `${timeRange.start}-${timeRange.end}`,
};

export const divsCodec: ParamCodec<{
	min: LutiDiv | null;
	max: LutiDiv | null;
} | null> = {
	decode: (encoded) => {
		const [max, min] = encoded.split("-");

		const parsed = v.safeParse(divsBaseSchema, {
			max: max || null,
			min: min || null,
		});
		return parsed.success
			? { ok: true, value: normalizeDivs(parsed.output) }
			: { ok: true, value: null };
	},
	encode: (divs) => (divs === null ? "" : `${divs.max}-${divs.min}`),
};

const divsFormField = dualSelectOptional({
	fields: [
		{
			label: "labels.scrimMaxDiv",
			items: LUTI_DIVS.map((div) => ({ label: () => div, value: div })),
		},
		{
			label: "labels.scrimMinDiv",
			items: LUTI_DIVS.map((div) => ({ label: () => div, value: div })),
		},
	],
	validate: {
		func: ([max, min]) => {
			if ((max && !min) || (!max && min)) return false;
			return true;
		},
		message: "errors.divBothOrNeither",
	},
});

export const persistScrimFiltersSchema = v.object({
	filters: scrimsFiltersSchema,
});

export const submitMapListFormSchema = v.pipe(
	v.object({
		scrimPostId: idConstant(),
		source: radioGroupDynamic({
			label: "labels.scrimMapSource",
		}),
		serializedPool: textFieldOptional({
			label: "labels.scrimMapPool",
			placeholder: "placeholders.scrimMapPool",
			maxLength: 500,
			validate: {
				func: (val) => parseMapPoolInput(val) !== null,
				message: "forms:errors.invalidMapPool",
			},
		}),
		tournamentId: tournamentSearchOptional({
			label: "labels.scrimMapsTournament",
		}),
	}),
	v.forward(
		v.check(
			(data) => ["POOL", "TOURNAMENT", "FROM_POST"].includes(data.source),
			"forms:errors.required",
		),
		["source"],
	),
	v.forward(
		v.check(
			(data) => !(data.source === "POOL" && !data.serializedPool),
			"forms:errors.invalidMapPool",
		),
		["serializedPool"],
	),
	v.forward(
		v.check(
			(data) => !(data.source === "TOURNAMENT" && !data.tournamentId),
			"forms:errors.scrimTournamentRequired",
		),
		["tournamentId"],
	),
);

export const removeMapListSchema = v.object({
	scrimPostId: id,
});

export const reportMapSchema = v.object({
	scrimPostId: id,
	mapId: id,
	winnerSide: v.picklist(["ALPHA", "BRAVO"]),
});

export const undoMapSchema = v.object({
	scrimPostId: id,
});

export const replayMapSchema = v.object({
	scrimPostId: id,
});

export const pickMapFormSchema = v.object({
	scrimPostId: idConstant(),
	mode: select({
		label: "labels.vodMode",
		items: modesShort.map((m) => ({
			label: `modes.${m}`,
			value: m,
		})),
	}),
	stageId: stageSelect({ label: "labels.vodStage" }),
});

const MAX_SCRIM_POST_TEXT_LENGTH = 500;

export const RANGE_END_OPTIONS = [
	"+30min",
	"+1hour",
	"+1.5hours",
	"+2hours",
	"+2.5hours",
	"+3hours",
] as const;

export const scrimRequestFormSchema = v.object({
	scrimPostId: idConstant(),
	from: customField({ initialValue: null }, fromSchema),
	message: textAreaOptional({
		label: "labels.scrimRequestMessage",
		maxLength: SCRIM.REQUEST_MESSAGE_MAX_LENGTH,
	}),
	at: selectDynamicOptional({
		label: "labels.scrimRequestStartTime",
		bottomText: "bottomTexts.scrimRequestStartTime",
	}),
});

const rangeEndItems = [
	{ label: "options.scrimFlexibility.notFlexible", value: "" },
	{ label: "options.scrimFlexibility.+30min", value: "+30min" },
	{ label: "options.scrimFlexibility.+1hour", value: "+1hour" },
	{ label: "options.scrimFlexibility.+1.5hours", value: "+1.5hours" },
	{ label: "options.scrimFlexibility.+2hours", value: "+2hours" },
	{ label: "options.scrimFlexibility.+2.5hours", value: "+2.5hours" },
	{ label: "options.scrimFlexibility.+3hours", value: "+3hours" },
] as const;

const mapsItems = [
	{ label: "options.scrimMaps.noPreference", value: "NO_PREFERENCE" },
	{ label: "options.scrimMaps.szOnly", value: "SZ" },
	{ label: "options.scrimMaps.rankedOnly", value: "RANKED" },
	{ label: "options.scrimMaps.allModes", value: "ALL" },
	{ label: "options.scrimMaps.tournament", value: "TOURNAMENT" },
] as const;

export const scrimsNewFormSchema = v.pipe(
	v.object({
		at: datetime({
			label: "labels.start",
			bottomText: "bottomTexts.scrimStart",
			min: () => sub(new Date(), { days: 1 }),
			max: () => add(new Date(), { days: 15 }),
			minMessage: "errors.dateInPast",
			maxMessage: "errors.dateTooFarInFuture",
		}),
		rangeEnd: selectOptional({
			label: "labels.scrimStartFlexibility",
			bottomText: "bottomTexts.scrimStartFlexibility",
			items: [...rangeEndItems],
		}),
		baseVisibility: customField(
			{ initialValue: "PUBLIC" },
			associationIdentifierSchema,
		),
		notFoundVisibility: customField(
			{ initialValue: { at: null, forAssociation: "PUBLIC" } },
			v.object({
				at: v.nullish(
					v.pipe(
						coercedDate(),
						v.check(
							(date) => date >= sub(new Date(), { days: 1 }),
							"errors.dateInPast",
						),
					),
				),
				forAssociation: associationIdentifierSchema,
			}),
		),
		divs: divsFormField,
		from: customField({ initialValue: null }, fromSchema),
		postText: textAreaOptional({
			label: "labels.text",
			maxLength: MAX_SCRIM_POST_TEXT_LENGTH,
		}),
		managedByAnyone: toggle({
			label: "labels.scrimManagedByAnyone",
			bottomText: "bottomTexts.scrimManagedByAnyone",
		}),
		maps: select({
			label: "labels.scrimMaps",
			items: [...mapsItems],
		}),
		mapsTournamentId: tournamentSearchOptional({
			label: "labels.scrimMapsTournament",
		}),
	}),
	// a tournament pick is only meaningful when maps come from a tournament, so
	// drop any stale selection instead of erroring on a field that is not rendered
	v.transform((post) =>
		post.maps !== "TOURNAMENT" && post.mapsTournamentId
			? { ...post, mapsTournamentId: null }
			: post,
	),
	v.forward(
		v.check(
			(post) => !(post.maps === "TOURNAMENT" && !post.mapsTournamentId),
			"forms:errors.tournamentMustBeSelected",
		),
		["mapsTournamentId"],
	),
	v.forward(
		v.check(
			(post) =>
				!(
					post.notFoundVisibility.at &&
					post.notFoundVisibility.forAssociation === post.baseVisibility
				),
			"forms:errors.visibilityMustBeDifferent",
		),
		["notFoundVisibility"],
	),
	v.forward(
		v.check(
			(post) => !(post.baseVisibility === "PUBLIC" && post.notFoundVisibility.at),
			"forms:errors.visibilityNotAllowedWhenPublic",
		),
		["notFoundVisibility"],
	),
	v.forward(
		v.check(
			(post) =>
				!(post.notFoundVisibility.at && post.notFoundVisibility.at > post.at),
			"forms:errors.dateAfterScrimDate",
		),
		["notFoundVisibility"],
	),
	v.forward(
		v.check(
			(post) => !(post.notFoundVisibility.at && post.at < new Date()),
			"forms:errors.canNotSetIfLookingNow",
		),
		["notFoundVisibility"],
	),
);
