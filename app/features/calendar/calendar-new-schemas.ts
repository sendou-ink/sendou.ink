import * as v from "valibot";
import type { TeamPickSettings } from "~/db/tables-json";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as TeamPick from "~/features/tournament/core/TeamPick";
import { TEAM_PICK_POOLS } from "~/features/tournament/tournament-constants";
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
	radioGroup,
	select,
	selectDynamicOptional,
	textAreaOptional,
	textField,
	textFieldOptional,
	toggle,
} from "~/form/fields";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort } from "~/modules/in-game-lists/types";
import { id, modeShort, type ValidationCtx } from "~/utils/schema";
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

// extracted so the literal item values don't widen to `string` in the object's inferred value type
const mapPickingStyleField = radioGroup({
	label: "labels.mapPickingStyle",
	items: [
		{ value: "TO", label: "options.mapPickingStyle.TO" },
		{ value: "AUTO", label: "options.mapPickingStyle.AUTO" },
	],
});

const teamPickModesField = checkboxGroup({
	label: "labels.teamPickModes",
	items: modesShort.map((mode) => ({
		value: mode,
		label: `modes.${mode}` as const,
	})),
});

const teamPickPoolField = radioGroup({
	label: "labels.teamPickPool",
	items: TEAM_PICK_POOLS.map((pool) => ({
		value: pool,
		label: `options.teamPickPool.${pool}` as const,
	})),
});

/** How many maps a team picks per mode, one entry per picked mode. */
export type TeamPickCountsFormValue = Array<{ mode: ModeShort; count: number }>;

const teamPickCountsField = customField(
	{ initialValue: [] as TeamPickCountsFormValue },
	v.array(
		v.object({
			mode: modeShort,
			count: v.pipe(v.number(), v.integer()),
		}),
	),
);

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
	// calendar events span multiple dates, tournaments have exactly one (`startTime`); only the
	// relevant field is rendered, `calendarNewSyncRefine` enforces the right one per type
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
		// derived from the league setting, never picked by hand
		items: CALENDAR_EVENT.TAGS.filter((tag) => tag !== "LEAGUE").map((tag) => ({
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
	mapPickingStyle: mapPickingStyleField,
	teamPickModes: teamPickModesField,
	teamPickCounts: teamPickCountsField,
	teamPickPool: teamPickPoolField,
	// organizer's map pool: of a calendar event, a "TO" tournament or the custom pool of a team picked one
	pool: customField({ initialValue: "" }, v.optional(v.string())),
	// only rendered (and validated) for tournaments, calendar events keep the empty initial values
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
	isLeague: toggle({
		label: "labels.league",
		bottomText: "bottomTexts.league",
	}),
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

	if (data.toToolsEnabled && data.mapPickingStyle === "AUTO") {
		validateTeamPick(data, ctx);
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

function validateTeamPick(
	data: Pick<
		v.InferOutput<typeof calendarNewBaseSchema>,
		"teamPickModes" | "teamPickCounts" | "teamPickPool" | "pool"
	>,
	ctx: ValidationCtx,
) {
	if (data.teamPickModes.length === 0) {
		ctx.addIssue({
			path: ["teamPickModes"],
			message: "forms:errors.teamPick.noModes",
		});
		return;
	}

	const teamPick = teamPickSettingsFromFormValues(data);
	const pool = TeamPick.effectivePool(teamPick, customTeamPickPool(data));

	if (
		teamPick.pool === "CUSTOM" &&
		TeamPick.poolShortfalls(teamPick, pool).length > 0
	) {
		ctx.addIssue({
			path: ["pool"],
			message: "forms:errors.teamPick.poolTooSmall",
		});
		return;
	}

	const countOutOfRange = teamPick.modes.some(
		({ mode, count }) => count < 1 || count > TeamPick.maxCount(pool, mode),
	);
	if (countOutOfRange) {
		ctx.addIssue({
			path: ["teamPickCounts"],
			message: "forms:errors.teamPick.countOutOfRange",
		});
	}
}

/** Team pick settings the form values describe, a picked mode without a count gets the default one. */
export function teamPickSettingsFromFormValues(data: {
	teamPickModes: ModeShort[];
	teamPickCounts: TeamPickCountsFormValue;
	teamPickPool: TeamPickSettings["pool"];
}): TeamPickSettings {
	const modes = TeamPick.sortModes(data.teamPickModes);
	const defaultCount = TeamPick.defaultCount(modes.length);

	return {
		modes: modes.map((mode) => ({
			mode,
			count:
				data.teamPickCounts.find((count) => count.mode === mode)?.count ??
				defaultCount,
		})),
		pool: data.teamPickPool,
	};
}

/** The custom pool of a team picked tournament, limited to the picked modes. */
export function customTeamPickPool(data: {
	teamPickModes: ModeShort[];
	pool?: string;
}) {
	if (!data.pool) return [];

	return MapPool.toDbList(data.pool).filter((map) =>
		data.teamPickModes.includes(map.mode),
	);
}
