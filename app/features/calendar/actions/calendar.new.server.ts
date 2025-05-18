import type { ActionFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import type { CalendarEventTag } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { newCalendarEventActionSchema } from "~/features/calendar/calendar-schemas";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { notify } from "~/features/notifications/core/notify.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { requireRole } from "~/modules/permissions/guards.server";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	parseFormData,
	uploadImageIfSubmitted,
} from "~/utils/remix.server";
import { calendarEventPage } from "~/utils/urls";
import { CALENDAR_EVENT } from "../calendar-constants";
import { canEditCalendarEvent } from "../calendar-utils";
import { regClosesAtDate } from "../calendar-utils";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);

	const { avatarFileName, formData } = await uploadImageIfSubmitted({
		request,
		fileNamePrefix: "tournament-logo",
	});
	const data = await parseFormData({
		formData,
		schema: newCalendarEventActionSchema,
		parseAsync: true,
	});

	requireRole(user, "CALENDAR_EVENT_ADDER");

	const startTimes = data.date.map((date) => dateToDatabaseTimestamp(date));
	const commonArgs = {
		authorId: user.id,
		organizationId: data.organizationId ?? null,
		name: data.name,
		description: data.description,
		rules: data.rules,
		startTimes,
		bracketUrl: data.bracketUrl,
		discordInviteCode: data.discordInviteCode,
		tags: data.tags
			? data.tags
					.sort(
						(a, b) =>
							CALENDAR_EVENT.TAGS.indexOf(a as CalendarEventTag) -
							CALENDAR_EVENT.TAGS.indexOf(b as CalendarEventTag),
					)
					.join(",")
			: data.tags,
		badges: data.badges ?? [],
		// newly uploaded avatar
		avatarFileName,
		// reused avatar either via edit or template
		avatarImgId: data.avatarImgId ?? undefined,
		autoValidateAvatar: user.roles.includes("SUPPORTER"),
		toToolsEnabled: user.roles.includes("TOURNAMENT_ADDER")
			? Number(data.toToolsEnabled)
			: 0,
		toToolsMode:
			rankedModesShort.find((mode) => mode === data.toToolsMode) ?? null,
		bracketProgression: data.bracketProgression ?? null,
		minMembersPerTeam: data.minMembersPerTeam ?? undefined,
		isRanked: data.isRanked ?? undefined,
		isTest: data.isTest ?? undefined,
		isInvitational: data.isInvitational ?? false,
		deadlines: data.strictDeadline ? ("STRICT" as const) : ("DEFAULT" as const),
		enableNoScreenToggle: data.enableNoScreenToggle ?? undefined,
		enableSubs: data.enableSubs ?? undefined,
		requireInGameNames: data.requireInGameNames ?? undefined,
		autonomousSubs: data.autonomousSubs ?? undefined,
		tournamentToCopyId: data.tournamentToCopyId,
		regClosesAt: data.regClosesAt
			? dateToDatabaseTimestamp(
					regClosesAtDate({
						startTime: databaseTimestampToDate(startTimes[0]),
						closesAt: data.regClosesAt,
					}),
				)
			: undefined,
	};
	errorToastIfFalsy(
		!commonArgs.toToolsEnabled || commonArgs.bracketProgression,
		"Bracket progression must be set for tournaments",
	);

	const deserializedMaps = (() => {
		if (!data.pool) return;

		return MapPool.toDbList(data.pool);
	})();

	if (data.eventToEditId) {
		const eventToEdit = badRequestIfFalsy(
			await CalendarRepository.findById({ id: data.eventToEditId }),
		);
		if (eventToEdit.tournamentId) {
			const tournament = await tournamentFromDB({
				tournamentId: eventToEdit.tournamentId,
				user,
			});
			errorToastIfFalsy(
				!tournament.hasStarted,
				"Tournament has already started",
			);

			errorToastIfFalsy(tournament.isAdmin(user), "Not authorized");
		} else {
			// editing regular calendar event
			errorToastIfFalsy(
				canEditCalendarEvent({ user, event: eventToEdit }),
				"Not authorized",
			);
		}

		await CalendarRepository.update({
			eventId: data.eventToEditId,
			mapPoolMaps: deserializedMaps,
			...commonArgs,
		});

		if (eventToEdit.tournamentId) {
			clearTournamentDataCache(eventToEdit.tournamentId);
			ShowcaseTournaments.clearParticipationInfoMap();
		}

		throw redirect(calendarEventPage(data.eventToEditId));
	}
	const mapPickingStyle = () => {
		if (data.toToolsMode === "TO") return "TO" as const;
		if (data.toToolsMode) return `AUTO_${data.toToolsMode}` as const;

		return "AUTO_ALL" as const;
	};
	const { eventId: createdEventId, tournamentId: createdTournamentId } =
		await CalendarRepository.create({
			mapPoolMaps: deserializedMaps,
			isFullTournament: data.toToolsEnabled,
			mapPickingStyle: mapPickingStyle(),
			...commonArgs,
		});

	if (createdTournamentId) {
		clearTournamentDataCache(createdTournamentId);
		ShowcaseTournaments.clearParticipationInfoMap();
		ShowcaseTournaments.clearCachedTournaments();

		if (data.isTest) {
			notify({
				notification: {
					type: "TO_TEST_CREATED",
					meta: {
						tournamentName: data.name,
						tournamentId: createdTournamentId,
					},
				},
				defaultSeenUserIds: [user.id],
				userIds: [user.id],
			});
		}
	}

	throw redirect(calendarEventPage(createdEventId));
};
