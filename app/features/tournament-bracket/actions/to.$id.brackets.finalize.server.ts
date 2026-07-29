import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { notify } from "~/features/notifications/core/notify.server";
import { finalizeTournament } from "~/features/tournament-bracket/core/finalizeTournament.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import {
	finalizeTournamentActionSchema,
	type TournamentBadgeReceivers,
} from "~/features/tournament-bracket/tournament-bracket-schemas.server";
import { validateBadgeReceivers } from "~/features/tournament-bracket/tournament-bracket-utils";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	errorToast,
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
	successToastWithRedirect,
} from "~/utils/remix.server";
import { tournamentBracketsPage } from "~/utils/urls";
import { idObject } from "~/utils/zod";

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = requireUser();
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });
	const data = await parseRequestPayload({
		request,
		schema: finalizeTournamentActionSchema,
	});

	errorToastIfFalsy(tournament.canFinalize(user), "Can't finalize tournament");

	const badgeOwnersValid = data.badgeReceivers
		? await requireValidBadgeReceivers(data.badgeReceivers, tournament)
		: true;
	if (!badgeOwnersValid) errorToast("New badge owners invalid");

	await finalizeTournament({
		tournament,
		badgeReceivers: data.badgeReceivers ?? undefined,
	});

	if (data.badgeReceivers) {
		logger.info(
			`Badge receivers for tournament id ${tournamentId}: ${JSON.stringify(data.badgeReceivers)}`,
		);

		notifyBadgeReceivers(data.badgeReceivers);
	}

	// ensure RunningTournament = sidebar updates
	await tournamentFromDB({ tournamentId, user });

	return successToastWithRedirect({
		url: tournamentBracketsPage({ tournamentId }),
		message: "Tournament finalized",
	});
};

async function requireValidBadgeReceivers(
	badgeReceivers: TournamentBadgeReceivers,
	tournament: Tournament,
) {
	const badges = (
		await CalendarRepository.findById(tournament.ctx.eventId, {
			includeBadgePrizes: true,
		})
	)?.badgePrizes;
	invariant(badges, "validateBadgeOwners: Event with badge prizes not found");

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
