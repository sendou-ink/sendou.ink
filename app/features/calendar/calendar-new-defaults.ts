import { addMilliseconds, roundToNearestHours } from "date-fns";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as TeamPick from "~/features/tournament/core/TeamPick";
import type { TournamentMapPickingStyle } from "~/features/tournament/tournament-constants";
import { existingImage } from "~/form/image-field";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import {
	defaultBracketsFormValues,
	progressionToFormValues,
	shiftBracketStartTimes,
} from "./calendar-progression-form";
import type { CalendarEventTag } from "./calendar-types";
import type { loader } from "./loaders/calendar.new.server";

type CalendarNewDefaultsData = Pick<
	SerializeFrom<typeof loader>,
	"isAddingTournament" | "eventToEdit" | "eventToCopy"
>;

/** Starting values of the calendar event / tournament form: of the event being edited or copied, else of a new one. */
export function calendarNewDefaultValues(data: CalendarNewDefaultsData) {
	const baseEvent = data.eventToCopy ?? data.eventToEdit;
	const tournamentCtx = baseEvent?.tournament?.ctx;
	const settings = tournamentCtx?.settings;

	const mapPickingStyle: TournamentMapPickingStyle =
		baseEvent?.mapPickingStyle ?? "AUTO";
	const teamPick =
		settings?.teamPick ?? TeamPick.defaultSettings([...rankedModesShort]);

	const pool = baseEvent?.mapPool
		? new MapPool(baseEvent.mapPool).serialized
		: "";

	const startTime = data.isAddingTournament
		? data.eventToEdit?.startTimes?.[0]
			? databaseTimestampToDate(data.eventToEdit.startTimes[0])
			: roundToNearestHours(new Date(), { roundingMethod: "ceil" })
		: null;

	const bracketProgressionValues = settings?.bracketProgression
		? progressionToFormValues(settings.bracketProgression)
		: data.isAddingTournament
			? defaultBracketsFormValues()
			: { brackets: [], progression: [] };
	// a copy starts at a new time, follow-up brackets and registration closing keep their distance to it
	const copyOffsetMs =
		data.eventToCopy && tournamentCtx && startTime
			? startTime.getTime() -
				databaseTimestampToDate(tournamentCtx.startsAt).getTime()
			: 0;
	const brackets = shiftBracketStartTimes(
		bracketProgressionValues.brackets,
		copyOffsetMs,
	);

	const regClosesAt =
		settings?.regClosesAt && settings.regClosesAt !== tournamentCtx?.startsAt
			? addMilliseconds(
					databaseTimestampToDate(settings.regClosesAt),
					copyOffsetMs,
				)
			: null;

	return {
		toToolsEnabled: data.isAddingTournament,
		eventToEditId: data.eventToEdit?.eventId,
		tournamentToCopyId: data.eventToCopy?.tournamentId ?? undefined,
		name: data.eventToEdit?.name ?? "",
		description: baseEvent?.description ?? "",
		organizationId: baseEvent?.organization?.id
			? String(baseEvent.organization.id)
			: null,
		rules: baseEvent?.rules ?? "",
		date: data.isAddingTournament
			? []
			: (data.eventToEdit?.startTimes?.map((t) =>
					databaseTimestampToDate(t),
				) ?? [roundToNearestHours(new Date(), { roundingMethod: "ceil" })]),
		startTime,
		// tournaments hide this field, the action coalesces the empty value to the default
		bracketUrl: data.isAddingTournament
			? ""
			: (data.eventToEdit?.bracketUrl ?? ""),
		discordInviteCode: baseEvent?.discordInviteCode ?? "",
		tags: (baseEvent?.tags ?? []).filter(isPickableTag),
		badges: baseEvent?.badgePrizes?.map((b) => b.id) ?? [],
		trophyId: baseEvent?.trophy?.id ?? null,
		avatarImgId: existingImage(
			baseEvent?.avatarImgId,
			baseEvent?.tournament?.ctx.logoUrl,
		),
		regClosesAt,
		minMembersPerTeam: String(settings?.minMembersPerTeam ?? 4) as
			| "1"
			| "2"
			| "3"
			| "4",
		maxMembersPerTeam: settings?.maxMembersPerTeam ?? undefined,
		mapPickingStyle,
		teamPickModes: TeamPick.pickedModes(teamPick),
		teamPickCounts: teamPick.modes,
		teamPickPool: teamPick.pool,
		pool,
		brackets,
		progression: bracketProgressionValues.progression,
		isRanked: settings?.isRanked ?? true,
		enableNoScreenToggle: settings?.enableNoScreenToggle ?? true,
		enableSubs: settings?.enableSubs ?? true,
		autonomousSubs: settings?.autonomousSubs ?? true,
		requireInGameNames: settings?.requireInGameNames ?? false,
		isInvitational: settings?.isInvitational ?? false,
		isTest: settings?.isTest ?? false,
		isLeague: settings?.isLeague ?? false,
		isDraft: settings?.isDraft ?? false,
	};
}

function isPickableTag(
	tag: CalendarEventTag,
): tag is Exclude<CalendarEventTag, "LEAGUE"> {
	return tag !== "LEAGUE";
}
