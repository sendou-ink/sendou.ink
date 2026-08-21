import * as v from "valibot";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import {
	array,
	badges,
	checkboxGroup,
	customField,
	datetime,
	datetimeOptional,
	hidden,
	idConstantOptional,
	image,
	numberFieldOptional,
	select,
	selectDynamicOptional,
	textAreaOptional,
	textField,
	textFieldOptional,
	toggle,
} from "~/form/fields";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { id, type ValidationCtx } from "~/utils/schema";
import { CALENDAR_EVENT, REG_CLOSES_AT_OPTIONS } from "./calendar-constants";
import {
	bracketsFormField,
	progressionFormField,
	validateBracketProgressionFormValues,
} from "./calendar-progression-form";
import { calendarEventMaxDate, calendarEventMinDate } from "./calendar-utils";

/** Single date row of the {@link calendarNewBaseSchema} `date` array (calendar events). */
const calendarEventDateField = datetime({
	label: "labels.date",
	min: calendarEventMinDate,
	max: calendarEventMaxDate,
});

// extracted so its literal item values don't widen to `string` in the
// object's inferred value type
const toToolsModeField = select({
	label: "labels.mapPickingStyle",
	items: [
		{ value: "ALL", label: "options.toToolsMode.ALL" },
		{ value: "SZ", label: "options.toToolsMode.SZ" },
		{ value: "TC", label: "options.toToolsMode.TC" },
		{ value: "RM", label: "options.toToolsMode.RM" },
		{ value: "CB", label: "options.toToolsMode.CB" },
		{ value: "TO", label: "options.toToolsMode.TO" },
	],
});

export const calendarNewBaseSchema = v.object({
	// discriminates between a calendar event and a tournament; seeded from the loader, no visible control
	toToolsEnabled: hidden(v.boolean(), false),
	eventToEditId: idConstantOptional(),
	tournamentToCopyId: idConstantOptional(),
	name: textField({
		label: "labels.name",
		minLength: CALENDAR_EVENT.NAME_MIN_LENGTH,
		maxLength: CALENDAR_EVENT.NAME_MAX_LENGTH,
	}),
	description: textAreaOptional({
		label: "labels.description",
		maxLength: CALENDAR_EVENT.DESCRIPTION_MAX_LENGTH,
	}),
	organizationId: selectDynamicOptional({ label: "labels.organization" }),
	rules: textAreaOptional({
		label: "labels.rules",
		bottomText: "bottomTexts.bioMarkdown",
		maxLength: CALENDAR_EVENT.RULES_MAX_LENGTH,
	}),
	// calendar events can span multiple dates; tournaments always have exactly one
	// (`startTime`). Only the relevant field is rendered, and the other stays at its
	// empty initial value — `calendarNewSyncRefine` enforces the right one per type.
	date: array({
		label: "labels.dates",
		max: CALENDAR_EVENT.MAX_AMOUNT_OF_DATES,
		field: calendarEventDateField,
	}),
	startTime: datetimeOptional({
		label: "labels.date",
		bottomText: "bottomTexts.tournamentStartTime",
		min: calendarEventMinDate,
		max: calendarEventMaxDate,
	}),
	bracketUrl: textFieldOptional({
		label: "labels.bracketUrl",
		maxLength: CALENDAR_EVENT.BRACKET_URL_MAX_LENGTH,
		validate: "url",
	}),
	discordInviteCode: textFieldOptional({
		label: "labels.discordInvite",
		maxLength: CALENDAR_EVENT.DISCORD_INVITE_CODE_MAX_LENGTH,
		leftAddon: "https://discord.gg/",
	}),
	tags: checkboxGroup({
		label: "labels.tags",
		items: CALENDAR_EVENT.TAGS.map((tag) => ({
			value: tag,
			label: `options.tag.${tag}` as const,
		})),
	}),
	badges: badges({ label: "labels.badges", maxCount: 50 }),
	trophyId: customField({ initialValue: null }, v.nullish(id)),
	avatarImgId: image({
		label: "labels.logo",
		bottomText: "bottomTexts.avatarValidation",
		autoValidate: true,
	}),
	regClosesAt: select({
		label: "labels.regClosesAt",
		bottomText: "bottomTexts.regClosesAt",
		items: REG_CLOSES_AT_OPTIONS.map((option) => ({
			value: option,
			label: `options.regClosesAt.${option}` as const,
		})),
	}),
	minMembersPerTeam: select({
		label: "labels.playersCount",
		items: [4, 3, 2, 1].map((count) => ({
			value: String(count),
			label: () => `${count}v${count}`,
		})),
	}),
	maxMembersPerTeam: numberFieldOptional({
		label: "labels.maxTeamSize",
		bottomText: "bottomTexts.maxTeamSize",
	}),
	toToolsMode: toToolsModeField,
	pool: customField({ initialValue: "" }, v.optional(v.string())),
	// the two bracket progression fields are only rendered (and validated) for
	// tournaments; for calendar events both stay at their empty initial value
	brackets: bracketsFormField,
	progression: progressionFormField,
	isRanked: toggle({
		label: "labels.ranked",
		bottomText: "bottomTexts.ranked",
	}),
	enableNoScreenToggle: toggle({
		label: "labels.splattercolorScreenToggle",
		bottomText: "bottomTexts.splattercolorScreen",
	}),
	enableSubs: toggle({
		label: "labels.lfgTab",
		bottomText: "bottomTexts.lfgTab",
	}),
	autonomousSubs: toggle({
		label: "labels.autonomousSubs",
		bottomText: "bottomTexts.autonomousSubs",
	}),
	requireInGameNames: toggle({
		label: "labels.requireInGameNames",
		bottomText: "bottomTexts.requireInGameNames",
	}),
	isInvitational: toggle({
		label: "labels.invitational",
		bottomText: "bottomTexts.invitational",
	}),
	isTest: toggle({ label: "labels.test", bottomText: "bottomTexts.test" }),
	isDraft: toggle({
		label: "labels.draft",
		bottomText: "bottomTexts.draftInfo",
	}),
	requireSendouQParticipation: toggle({
		label: "labels.requireSendouQ",
		bottomText: "bottomTexts.requireSendouQ",
	}),
});

/** Shared sync cross-field rules, reused by the server schema (see `*.server.ts`). */
export function calendarNewSyncRefine(
	data: v.InferOutput<typeof calendarNewBaseSchema>,
	ctx: ValidationCtx,
) {
	// a calendar event needs at least one date; a tournament needs its single start time
	if (!data.toToolsEnabled && data.date.length < 1) {
		ctx.addIssue({
			path: ["date"],
			message: "forms:errors.required",
		});
	}

	if (data.toToolsEnabled && !data.startTime) {
		ctx.addIssue({
			path: ["startTime"],
			message: "forms:errors.required",
		});
	}

	// a calendar event needs a bracket URL; tournaments default to sendou.ink in the action
	if (!data.toToolsEnabled && !data.bracketUrl) {
		ctx.addIssue({
			path: ["bracketUrl"],
			message: "forms:errors.bracketUrlRequired",
		});
	}

	if (data.toToolsEnabled) {
		if (data.brackets.length === 0) {
			ctx.addIssue({
				path: ["brackets"],
				message: "forms:errors.bracketProgressionRequired",
			});
		} else {
			validateBracketProgressionFormValues(
				data.brackets,
				data.progression,
				ctx,
			);
		}
	}

	// "Prepicked by teams - All modes" requires one tiebreaker map per ranked mode
	if (data.toToolsEnabled && data.toToolsMode === "ALL") {
		const maps = data.pool ? MapPool.toDbList(data.pool) : [];
		const isValid =
			maps.length === rankedModesShort.length &&
			rankedModesShort.every((mode) => maps.some((map) => map.mode === mode));

		if (!isValid) {
			ctx.addIssue({
				path: ["pool"],
				message: "forms:errors.allModePool",
			});
		}
	}

	if (data.trophyId && data.badges.length > 0) {
		ctx.addIssue({
			path: ["badges"],
			message: "forms:errors.trophyWithBadges",
		});
	}

	if (
		data.toToolsEnabled &&
		data.minMembersPerTeam === "4" &&
		data.maxMembersPerTeam &&
		(data.maxMembersPerTeam < 4 || data.maxMembersPerTeam > 10)
	) {
		ctx.addIssue({
			path: ["maxMembersPerTeam"],
			message: "forms:errors.maxMembersRange",
		});
	}
}
