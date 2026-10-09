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
import { defineAction } from "~/form/define-action.server";
import { invariant } from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	errorToast,
	errorToastIfFalsy,
	successToastWithRedirect,
} from "~/utils/remix.server";

export const action = defineAction(
	{ body: finalizeTournamentActionSchema },
	async ({ params, body }) => {
		const { tournament, tournamentId, user } = await tournamentFromParams(
			params,
			{ for: "action" },
		);

		errorToastIfFalsy(
			tournament.canFinalize(user),
			"Can't finalize tournament",
		);

		const event = await CalendarRepository.findById(tournament.ctx.eventId, {
			includeBadgePrizes: true,
			includeTrophy: true,
		});
		invariant(event, "Event not found for tournament");

		const badgeOwnersValid = body.badgeReceivers
			? requireValidBadgeReceivers({
					badgeReceivers: body.badgeReceivers,
					badges: event.badgePrizes ?? [],
					tournament,
				})
			: true;
		if (!badgeOwnersValid) errorToast("New badge owners invalid");

		const trophyReceiver = event.trophy ? (body.trophyReceiver ?? null) : null;
		if (event.trophy) {
			const trophyReceiverValid = requireValidTrophyReceiver({
				trophyReceiver,
				trophy: event.trophy,
				firstPlaceTeams: Standings.winners(
					Standings.tournamentStandings(tournament),
				).map((standing) => standing.team),
				tournament,
			});
			if (!trophyReceiverValid) errorToast("Invalid trophy receiver");
		}

		const finalized = await finalizeTournament({
			tournament,
			badgeReceivers: body.badgeReceivers ?? undefined,
			trophyReceiver: trophyReceiver ?? undefined,
		});

		if (!finalized) {
			return successToastWithRedirect({
				url: tournamentBracketsPage({ tournamentId }),
				message: "Tournament was already finalized",
			});
		}

		if (body.badgeReceivers) {
			logger.info(
				`Badge receivers for tournament id ${tournamentId}: ${JSON.stringify(body.badgeReceivers)}`,
			);

			notifyBadgeReceivers(body.badgeReceivers);
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
	},
);

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
	firstPlaceTeams,
	tournament,
}: {
	trophyReceiver: TournamentTrophyReceiver | null;
	trophy: { id: number };
	firstPlaceTeams: Array<{ memberUserIds: number[] }>;
	tournament: Tournament;
}) {
	const error = validateTrophyReceiver({
		trophyReceiver,
		trophy,
		firstPlaceTeams,
	});
	if (error) {
		logger.warn(
			`validateTrophyReceiver: Invalid trophy receiver for tournament ${tournament.ctx.id}: ${error}`,
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
