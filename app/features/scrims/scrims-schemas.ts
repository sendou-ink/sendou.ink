import { add, sub } from "date-fns";
import * as v from "valibot";
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
	stringConstant,
	textArea,
	textAreaOptional,
	textFieldOptional,
	toggle,
	tournamentSearchOptional,
} from "~/form/fields";
import { modesShort } from "~/modules/in-game-lists/modes";
import { codec } from "~/modules/search-params/search-params";
import {
	_action,
	date,
	falsyToNull,
	filterOutNullishMembers,
	id,
	noDuplicates,
	preprocess,
	superRefine,
	timeString,
} from "~/utils/schema";
import { associationIdentifierSchema } from "../associations/associations-schemas";
import { LUTI_DIVS, SCRIM } from "./scrims-constants";
import { parseMapPoolInput } from "./scrims-utils";

const deletePostSchema = v.object({
	_action: _action("DELETE_POST"),
	scrimPostId: id,
});

const fromUsers = preprocess(
	filterOutNullishMembers,
	v.pipe(
		v.array(id),
		v.minLength(3, "forms:errors.minUsersExcludingYourself"),
		v.maxLength(SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER),
		v.check((users) => noDuplicates(users), "forms:errors.usersMustBeUnique"),
	),
);

export const fromSchema = v.union([
	v.object({ mode: v.literal("PICKUP"), users: fromUsers }),
	v.object({ mode: v.literal("TEAM"), teamId: id }),
]);

export const newRequestSchema = v.object({
	_action: _action("NEW_REQUEST"),
	scrimPostId: id,
	from: fromSchema,
	message: v.optional(
		preprocess(
			falsyToNull,
			v.nullable(
				v.pipe(v.string(), v.maxLength(SCRIM.REQUEST_MESSAGE_MAX_LENGTH)),
			),
		),
		null,
	),
	at: v.nullish(preprocess(date, v.date())),
});

const acceptRequestSchema = v.object({
	_action: _action("ACCEPT_REQUEST"),
	scrimPostRequestId: id,
});

const cancelRequestSchema = v.object({
	_action: _action("CANCEL_REQUEST"),
	scrimPostRequestId: id,
});

export const cancelScrimFormSchema = v.object({
	_action: stringConstant("CANCEL_SCRIM"),
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

	const minIndex = LUTI_DIVS.indexOf(divs.min as (typeof LUTI_DIVS)[number]);
	const maxIndex = LUTI_DIVS.indexOf(divs.max as (typeof LUTI_DIVS)[number]);
	if (minIndex === -1 || maxIndex === -1) return divs;

	if (maxIndex > minIndex) {
		return { ...divs, min: divs.max, max: divs.min };
	}

	return divs;
}

const scrimsFiltersSchema = v.object({
	weekdayTimes: v.fallback(v.nullable(timeRangeSchema), null),
	weekendTimes: v.fallback(v.nullable(timeRangeSchema), null),
	divs: v.fallback(v.nullable(divsSchema), null),
});

export const timeRangeCodec = codec(v.nullable(timeRangeSchema), {
	decode: (encoded) => {
		if (encoded[5] !== "-") return null;

		return { start: encoded.slice(0, 5), end: encoded.slice(6) };
	},
	encode: (timeRange) =>
		timeRange === null ? "" : `${timeRange.start}-${timeRange.end}`,
});

export const divsCodec = codec(v.nullable(divsBaseSchema), {
	decode: (encoded) => {
		const [max, min] = encoded.split("-");

		return normalizeDivs({
			max: max ?? null,
			min: min ?? null,
		});
	},
	encode: (divs) => (divs === null ? "" : `${divs.max}-${divs.min}`),
});

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

const persistScrimFiltersSchema = v.object({
	_action: _action("PERSIST_SCRIM_FILTERS"),
	filters: scrimsFiltersSchema,
});

export const scrimsActionSchema = v.union([
	deletePostSchema,
	newRequestSchema,
	acceptRequestSchema,
	cancelRequestSchema,
	persistScrimFiltersSchema,
]);

export const submitMapListFormSchema = v.pipe(
	v.object({
		_action: stringConstant("SUBMIT_MAP_LIST"),
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
	superRefine((data, ctx) => {
		if (!["POOL", "TOURNAMENT", "FROM_POST"].includes(data.source)) {
			ctx.addIssue({
				path: ["source"],
				message: "forms:errors.required",
			});
		}
		if (data.source === "POOL" && !data.serializedPool) {
			ctx.addIssue({
				path: ["serializedPool"],
				message: "forms:errors.invalidMapPool",
			});
		}
		if (data.source === "TOURNAMENT" && !data.tournamentId) {
			ctx.addIssue({
				path: ["tournamentId"],
				message: "forms:errors.scrimTournamentRequired",
			});
		}
	}),
);

const removeMapListSchema = v.object({
	_action: _action("REMOVE_MAP_LIST"),
});

const reportMapSchema = v.object({
	_action: _action("REPORT_MAP"),
	mapId: id,
	winnerSide: v.picklist(["ALPHA", "BRAVO"]),
});

const undoMapSchema = v.object({
	_action: _action("UNDO_MAP"),
});

const replayMapSchema = v.object({
	_action: _action("REPLAY_MAP"),
});

export const pickMapFormSchema = v.object({
	_action: stringConstant("PICK_MAP"),
	mode: select({
		label: "labels.vodMode",
		items: modesShort.map((m) => ({
			label: `modes.${m}` as const,
			value: m,
		})),
	}),
	stageId: stageSelect({ label: "labels.vodStage" }),
});

export const scrimIdActionSchema = v.union([
	cancelScrimFormSchema,
	submitMapListFormSchema,
	removeMapListSchema,
	reportMapSchema,
	undoMapSchema,
	replayMapSchema,
	pickMapFormSchema,
]);

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
	_action: stringConstant("NEW_REQUEST"),
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
	{ label: "options.scrimFlexibility.notFlexible" as const, value: "" },
	{ label: "options.scrimFlexibility.+30min" as const, value: "+30min" },
	{ label: "options.scrimFlexibility.+1hour" as const, value: "+1hour" },
	{ label: "options.scrimFlexibility.+1.5hours" as const, value: "+1.5hours" },
	{ label: "options.scrimFlexibility.+2hours" as const, value: "+2hours" },
	{ label: "options.scrimFlexibility.+2.5hours" as const, value: "+2.5hours" },
	{ label: "options.scrimFlexibility.+3hours" as const, value: "+3hours" },
] as const;

const mapsItems = [
	{ label: "options.scrimMaps.noPreference" as const, value: "NO_PREFERENCE" },
	{ label: "options.scrimMaps.szOnly" as const, value: "SZ" },
	{ label: "options.scrimMaps.rankedOnly" as const, value: "RANKED" },
	{ label: "options.scrimMaps.allModes" as const, value: "ALL" },
	{ label: "options.scrimMaps.tournament" as const, value: "TOURNAMENT" },
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
				at: v.pipe(
					v.nullish(preprocess(date, v.date())),
					v.check((date) => {
						if (!date) return true;
						if (date < sub(new Date(), { days: 1 })) return false;
						return true;
					}, "errors.dateInPast"),
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
	superRefine((post, ctx) => {
		if (post.maps === "TOURNAMENT" && !post.mapsTournamentId) {
			ctx.addIssue({
				path: ["mapsTournamentId"],
				message: "forms:errors.tournamentMustBeSelected",
			});
		}

		if (
			post.notFoundVisibility.at &&
			post.notFoundVisibility.forAssociation === post.baseVisibility
		) {
			ctx.addIssue({
				path: ["notFoundVisibility"],
				message: "forms:errors.visibilityMustBeDifferent",
			});
		}

		if (post.baseVisibility === "PUBLIC" && post.notFoundVisibility.at) {
			ctx.addIssue({
				path: ["notFoundVisibility"],
				message: "forms:errors.visibilityNotAllowedWhenPublic",
			});
		}

		if (post.notFoundVisibility.at && post.notFoundVisibility.at > post.at) {
			ctx.addIssue({
				path: ["notFoundVisibility"],
				message: "forms:errors.dateAfterScrimDate",
			});
		}

		if (post.notFoundVisibility.at && post.at < new Date()) {
			ctx.addIssue({
				path: ["notFoundVisibility"],
				message: "forms:errors.canNotSetIfLookingNow",
			});
		}
	}),
);
