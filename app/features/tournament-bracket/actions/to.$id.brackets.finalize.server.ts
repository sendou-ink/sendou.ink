import type { ActionFunctionArgs } from "react-router";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as Standings from "~/features/tournament/core/Standings";
import { finalizeTournament } from "~/features/tournament-bracket/core/finalizeTournament.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	tournamentFromDB,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import {
	finalizeTournamentActionSchema,
	type TournamentBadgeReceivers,
	type TournamentTrophyReceiver,
} from "~/features/tournament-bracket/tournament-bracket-schemas";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import {
	validateBadgeReceivers,
	validateTrophyReceiver,
} from "~/features/tournament-bracket/tournament-bracket-utils";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	errorToast,
	errorToastIfFalsy,
	parseRequestPayload,
	successToastWithRedirect,
} from "~/utils/remix.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "action" },
	);
	const data = await parseRequestPayload({
		request,
		schema: finalizeTournamentActionSchema,
	});

	errorToastIfFalsy(tournament.canFinalize(user), "Can't finalize tournament");

	const event = await CalendarRepository.findById(tournament.ctx.eventId, {
		includeBadgePrizes: true,
		includeTrophy: true,
	});
	invariant(event, "Event not found for tournament");

	const badgeOwnersValid = data.badgeReceivers
		? requireValidBadgeReceivers({
				badgeReceivers: data.badgeReceivers,
				badges: event.badgePrizes ?? [],
				tournament,
			})
		: true;
	if (!badgeOwnersValid) errorToast("New badge owners invalid");

	const trophyReceiver = event.trophy ? (data.trophyReceiver ?? null) : null;
	if (event.trophy) {
		const trophyReceiverValid = requireValidTrophyReceiver({
			trophyReceiver,
			trophy: event.trophy,
			finalStandings: Standings.flattenStandings(
				Standings.tournamentStandings(tournament),
			),
			tournament,
		});
		if (!trophyReceiverValid) errorToast("Invalid trophy receiver");
	}

	await finalizeTournament({
		tournament,
		badgeReceivers: data.badgeReceivers ?? undefined,
		trophyReceiver: trophyReceiver ?? undefined,
	});

	if (data.badgeReceivers) {
		logger.info(
			`Badge receivers for tournament id ${tournamentId}: ${JSON.stringify(data.badgeReceivers)}`,
		);

		notifyBadgeReceivers(data.badgeReceivers);
	}

	if (trophyReceiver) {
		logger.info(
			`Trophy receiver for tournament id ${tournamentId}: ${JSON.stringify(trophyReceiver)}`,
		);
	}

	// ensure RunningTournament = sidebar updates
	await tournamentFromDB(tournamentId);

	return successToastWithRedirect({
		url: tournamentBracketsPage({ tournamentId }),
		message: "Tournament finalized",
	});
};

function requireValidBadgeReceivers({
	badgeReceivers,
	badges,
	tournament,
}: {
	badgeReceivers: TournamentBadgeReceivers;
	badges: ReadonlyArray<{ id: number }>;
	tournament: Tournament;
}) {
	const error = validateBadgeReceivers({
		badgeReceivers,
		badges,
	});

	if (error) {
		logger.warn(
			`validateBadgeOwners: Invalid badge receivers for tournament ${tournament.ctx.id}: ${error}`,
		);
		return false;
	}

	return true;
}

function requireValidTrophyReceiver({
	trophyReceiver,
	trophy,
	finalStandings,
	tournament,
}: {
	trophyReceiver: TournamentTrophyReceiver | null;
	trophy: { id: number };
	finalStandings: Array<{
		placement: number;
		team: { memberUserIds: number[] };
	}>;
	tournament: Tournament;
}) {
	const error = validateTrophyReceiver({ trophyReceiver, trophy });
	if (error) {
		logger.warn(
			`validateTrophyReceiver: Invalid trophy receiver for tournament ${tournament.ctx.id}: ${error}`,
		);
		return false;
	}

	if (!trophyReceiver) return true;

	const firstPlace = finalStandings.find(
		(standing) => standing.placement === 1,
	);
	if (!firstPlace) {
		logger.warn(
			`validateTrophyReceiver: No 1st place standing for tournament ${tournament.ctx.id}`,
		);
		return false;
	}

	const firstPlaceUserIds = new Set(firstPlace.team.memberUserIds);
	const invalidUserId = trophyReceiver.userIds.find(
		(userId) => !firstPlaceUserIds.has(userId),
	);

	if (invalidUserId !== undefined) {
		logger.warn(
			`validateTrophyReceiver: User ${invalidUserId} not in 1st place team for tournament ${tournament.ctx.id}`,
		);
		return false;
	}

	return true;
}

async function notifyBadgeReceivers(badgeReceivers: TournamentBadgeReceivers) {
	try {
		for (const receiver of badgeReceivers) {
			const badge = await BadgeRepository.findById(receiver.badgeId);
			invariant(badge, `Badge with id ${receiver.badgeId} not found`);

			notify({
				userIds: receiver.userIds,
				notification: {
					type: "BADGE_ADDED",
					meta: {
						badgeName: badge.displayName,
						badgeId: receiver.badgeId,
					},
				},
			});
		}
	} catch (error) {
		logger.error("Error notifying badge receivers", error);
	}
}
