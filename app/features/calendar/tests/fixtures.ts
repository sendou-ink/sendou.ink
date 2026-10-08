import { addDays } from "date-fns";
import type * as v from "valibot";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { calendarNewSchema } from "../calendar-new-schemas";
import { defaultBracketsFormValues } from "../calendar-progression-form";

export type CalendarNewFormValues = v.InferOutput<typeof calendarNewSchema>;

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
		regClosesAt: null,
		minMembersPerTeam: "4",
		maxMembersPerTeam: undefined,
		mapPickingStyle: "TO",
		teamPickModes: [],
		teamPickCounts: [],
		teamPickPool: "SENDOUQ",
		pool: new MapPool({ TW: [], SZ: [1], TC: [], RM: [], CB: [] }).serialized,
		...defaultBracketsFormValues(),
		isRanked: true,
		enableNoScreenToggle: true,
		enableSubs: true,
		autonomousSubs: true,
		requireInGameNames: false,
		isInvitational: false,
		isTest: false,
		isLeague: false,
		isDraft: false,
		requireSendouQParticipation: false,
		...overrides,
	};
}
