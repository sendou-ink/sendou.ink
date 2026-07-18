import type { ActionFunction } from "react-router";
import { redirect } from "react-router";
import type { CalendarEventTag } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { notify } from "~/features/notifications/core/notify.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import { parseFormDataWithImages } from "~/form/parse.server";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import { requireRole } from "~/modules/permissions/guards.server";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import {
	badRequestIfFalsy,
	errorToast,
	errorToastIfFalsy,
} from "~/utils/remix.server";
import { pathnameFromPotentialURL } from "~/utils/strings";
import { calendarEventPage } from "~/utils/urls";
import { CALENDAR_EVENT } from "../calendar-constants";
import { calendarNewSchemaServer } from "../calendar-new-schemas.server";
import { canEditCalendarEvent, regClosesAtDate } from "../calendar-utils";
import { findValidOrganizations } from "../loaders/calendar.new.server";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();

	const result = await parseFormDataWithImages({
		request,
		schema: calendarNewSchemaServer,
	});
	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}
	const data = result.data;

	const isEditing = Boolean(data.eventToEditId);
	const isAddingTournament = data.toToolsEnabled;
	const isTournamentAdder = user.roles.includes("TOURNAMENT_ADDER");
	const organizationId = data.organizationId
		? Number(data.organizationId)
		: null;

	if (organizationId) {
		await validateOrganization({
			userId: user.id,
			organizationId,
			isTournamentAdder,
		});
	} else if (!isEditing) {
		requireRole(
			isAddingTournament ? "TOURNAMENT_ADDER" : "CALENDAR_EVENT_ADDER",
		);
	}

	if (data.trophyId) {
		const trophyOrganizationId = await TrophyRepository.findOrganizationIdById(
			data.trophyId,
		);
		if (trophyOrganizationId !== organizationId) {
			errorToast("Trophy does not belong to the selected organization");
		}
		data.badges = [];
	}

	const managedBadges = await BadgeRepository.findManagedByUserId(user.id);

	const dates =
		isAddingTournament && data.startTime ? [data.startTime] : data.date;
	const startTimes = dates.map((date) => dateToDatabaseTimestamp(date));
	const commonArgs = {
		authorId: user.id,
		organizationId,
		name: data.name,
		description: data.description,
		rules: data.rules,
		startTimes,
		bracketUrl: data.bracketUrl || "https://sendou.ink",
		discordInviteCode: data.discordInviteCode
			? pathnameFromPotentialURL(data.discordInviteCode)
			: data.discordInviteCode,
		tags:
			data.tags.length > 0
				? data.tags
						.toSorted(
							(a, b) =>
								CALENDAR_EVENT.TAGS.indexOf(a as CalendarEventTag) -
								CALENDAR_EVENT.TAGS.indexOf(b as CalendarEventTag),
						)
						.join(",")
				: null,
		badges: data.badges.filter((badge) =>
			managedBadges.some((mb) => mb.id === badge),
		),
		trophyId: data.trophyId ?? null,
		// resolved by parseFormDataWithImages from the `image()` field
		avatarImgId: data.avatarImgId ?? undefined,
		toToolsEnabled: Number(data.toToolsEnabled),
		toToolsMode:
			rankedModesShort.find((mode) => mode === data.toToolsMode) ?? null,
		bracketProgression: data.bracketProgression ?? null,
		minMembersPerTeam: Number(data.minMembersPerTeam),
		maxMembersPerTeam:
			data.minMembersPerTeam === "4" && data.maxMembersPerTeam
				? data.maxMembersPerTeam
				: undefined,
		isRanked: data.isRanked,
		isTest: data.isTest,
		isDraft: data.isDraft,
		isInvitational: data.isInvitational,
		enableNoScreenToggle: data.enableNoScreenToggle,
		enableSubs: data.enableSubs,
		requireInGameNames: data.requireInGameNames,
		requireSendouQParticipation: data.requireSendouQParticipation,
		autonomousSubs: data.autonomousSubs,
		tournamentToCopyId: data.tournamentToCopyId,
		regClosesAt:
			isAddingTournament && data.regClosesAt
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

	const deserializedMaps = data.pool ? MapPool.toDbList(data.pool) : undefined;

	if (data.eventToEditId) {
		const eventToEdit = badRequestIfFalsy(
			await CalendarRepository.findById(data.eventToEditId),
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

			errorToastIfFalsy(
				tournament.canEditEventInfo(user, { isTournamentAdder }),
				"Not authorized",
			);

			// once published, a tournament can't be flipped back to draft
			if (!tournament.isDraft) {
				commonArgs.isDraft = false;
			}
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

/** Checks user has permissions to create a tournament in this organization */
async function validateOrganization({
	userId,
	organizationId,
	isTournamentAdder,
}: {
	userId: number;
	organizationId: number;
	isTournamentAdder: boolean;
}) {
	const orgs = await findValidOrganizations(userId, isTournamentAdder);

	const isValid = orgs.some(
		(org) => typeof org !== "string" && org.id === organizationId,
	);

	if (!isValid) errorToast("Not authorized to add event for this organization");
}
