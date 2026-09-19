import { addDays } from "date-fns";
import type * as v from "valibot";
import type { calendarNewSchemaServer } from "../calendar-new-schemas.server";
import { defaultBracketsFormValues } from "../calendar-progression-form";

export type CalendarNewFormValues = v.InferOutput<
	typeof calendarNewSchemaServer
>;

/** Every field of the calendar new form filled in for a tournament starting in a week, override what the test is about. */
export function calendarNewFormValues(
	overrides: Partial<CalendarNewFormValues> = {},
): CalendarNewFormValues {
	return {
		toToolsEnabled: true,
		name: "In The Zone",
		description: "",
		organizationId: "",
		rules: "",
		date: [],
		startTime: addDays(new Date(), 7).toISOString() as never,
		bracketUrl: "",
		discordInviteCode: "",
		tags: [],
		badges: [],
		trophyId: null,
		avatarImgId: null,
		regClosesAt: "0",
		minMembersPerTeam: "4",
		maxMembersPerTeam: undefined,
		mapPickingStyle: "TO",
		teamPickModes: [],
		teamPickCounts: [],
		teamPickPool: "SENDOUQ",
		pool: "",
		...defaultBracketsFormValues(),
		isRanked: true,
		enableNoScreenToggle: true,
		enableSubs: true,
		autonomousSubs: true,
		requireInGameNames: false,
		isInvitational: false,
		isTest: false,
		isDraft: false,
		requireSendouQParticipation: false,
		...overrides,
	};
}
