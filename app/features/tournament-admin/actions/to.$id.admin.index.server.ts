import type { ActionFunction } from "react-router";
import * as R from "remeda";
import { db } from "~/db/sql";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import * as PendingCheckIns from "~/features/tournament/core/PendingCheckIns.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { endDroppedTeamMatches } from "~/features/tournament/tournament-utils.server";
import * as BracketRepository from "~/features/tournament-bracket/BracketRepository.server";
import type * as Engine from "~/features/tournament-bracket/core/engine";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	clearTournamentDataCache,
	notifyTournamentStatusChanged,
	requireTournamentOrganizer,
	tournamentFromParams,
} from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentChannel } from "~/features/tournament-bracket/tournament-bracket-utils";
import { tournamentMatchChannel } from "~/features/tournament-match/tournament-match-utils";
import { invariant } from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { adminTeamsActionSchema } from "../tournament-admin-schemas";

export const action: ActionFunction = async ({ request, params }) => {
	const data = await parseRequestPayload({
		request,
		schema: adminTeamsActionSchema,
	});

	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "action" },
	);

	let statusChangedUserIds: number[] = [];

	switch (data._action) {
		case "CHECK_IN": {
			requireTournamentOrganizer(tournament, user);
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(
				data.bracketIdx !== 0 ||
					tournament.checkInConditionsFulfilledByTeamId(team.id).isFulfilled,
				`Can't check-in - ${tournament.checkInConditionsFulfilledByTeamId(team.id).reason}`,
			);
			errorToastIfFalsy(
				team.checkIns.length > 0 || data.bracketIdx === 0,
				"Can't check-in to follow up bracket if not checked in for the event itself",
			);

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Invalid bracket idx");
			errorToastIfFalsy(bracket.preview, "Bracket has been started");

			await TournamentTeamRepository.checkIn(data.teamId, {
				// no sources = regular check in
				bracketIdx: bracket.sources ? data.bracketIdx : undefined,
			});
			await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);

			if (!bracket.sources) {
				PendingCheckIns.clearCache();
				await resolveNotifications({
					userIds: team.memberUserIds,
					type: "TO_CHECK_IN_OPENED",
					meta: { tournamentId },
				});
			}

			statusChangedUserIds = team.memberUserIds;

			break;
		}
		case "CHECK_OUT": {
			requireTournamentOrganizer(tournament, user);
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(
				data.bracketIdx !== 0 || !tournament.hasStarted,
				"Tournament has started",
			);

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Invalid bracket idx");
			errorToastIfFalsy(bracket.preview, "Bracket has been started");

			await TournamentTeamRepository.checkOut({
				tournamentTeamId: data.teamId,
				// no sources = regular check in
				bracketIdx: !bracket.sources ? null : data.bracketIdx,
			});
			if (!bracket.sources) {
				PendingCheckIns.clearCache();
			}
			await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);
			logger.info(
				`Checked out: tournament team id: ${data.teamId} - user id: ${user.id} - tournament id: ${tournamentId} - bracket idx: ${data.bracketIdx}`,
			);

			statusChangedUserIds = team.memberUserIds;

			break;
		}
		case "DELETE_TEAM": {
			requireTournamentOrganizer(tournament, user);
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(!tournament.hasStarted, "Tournament has started");

			ChatSystemMessage.notifyRoomsChanged(
				await TournamentTeamRepository.deleteById(team.id),
			);

			for (const userId of team.memberUserIds) {
				ShowcaseTournaments.removeFromCached({
					tournamentId,
					type: "participant",
					userId,
				});
			}
			await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);

			statusChangedUserIds = team.memberUserIds;

			break;
		}
		case "DROP_TEAM_OUT": {
			requireTournamentOrganizer(tournament, user);
			errorToastIfFalsy(tournament.teamById(data.teamId), "Invalid team id");

			const { endedMatchIds, statusChangedTeamIds } = await dropTeamOut({
				tournament,
				teamId: data.teamId,
			});

			sendDroppedMatchChatMessages({
				tournamentId: tournament.ctx.id,
				endedMatchIds,
			});

			statusChangedUserIds = statusChangedTeamIds.flatMap(
				(teamId) => tournament.teamById(teamId)?.memberUserIds ?? [],
			);

			break;
		}
		case "UNDO_DROP_TEAM_OUT": {
			requireTournamentOrganizer(tournament, user);

			await TournamentTeamRepository.undoDropOut(data.teamId);

			statusChangedUserIds =
				tournament.teamById(data.teamId)?.memberUserIds ?? [];

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

	await notifyTournamentStatusChanged(tournamentId, statusChangedUserIds);

	return null;
};

/**
 * Drops a team out: random active roster for teams with subs, ends their in-progress matches,
 * marks them dropped. Returns the ended match ids for one batch of chat messages and the ids of
 * the teams whose header status the drop moved.
 */
async function dropTeamOut({
	tournament,
	teamId,
}: {
	tournament: Tournament;
	teamId: number;
}) {
	const droppingTeam = tournament.teamById(teamId);
	invariant(droppingTeam, "Invalid team id");

	// only teams with subs need an active roster set, the summarizer infers the rest trivially
	const hasSubs =
		droppingTeam.memberUserIds.length > tournament.minMembersPerTeam;
	if (hasSubs && !droppingTeam.activeRosterUserIds) {
		const randomRoster = R.sample(
			droppingTeam.memberUserIds,
			tournament.minMembersPerTeam,
		);
		await TournamentTeamRepository.setActiveRoster({
			teamId,
			activeRosterUserIds: randomRoster,
		});
	}

	const { endedMatchIds, changedChatRoomIds, statusChangedTeamIds } = await db
		.transaction()
		.execute(async (trx) => {
			const bracketData = await BracketRepository.findByTournamentId(
				tournament.ctx.id,
				trx,
			);
			const droppedResult = endDroppedTeamMatches({
				tournament,
				data: bracketData,
				droppedTeamId: teamId,
			});
			const chatRoomIds = await BracketRepository.applyMatchChanges(
				{
					previousData: bracketData,
					result: droppedResult,
					isLeague: tournament.isLeague,
				},
				trx,
			);

			return {
				endedMatchIds: droppedResult.endedMatchIds,
				changedChatRoomIds: chatRoomIds,
				statusChangedTeamIds: teamIdsAffectedByDrop({
					droppedTeamId: teamId,
					changedMatches: droppedResult.changedMatches,
				}),
			};
		});

	// after the commit so the refetch it prompts can not read the pre-commit state
	ChatSystemMessage.notifyRoomsChangedByRoomIds(changedChatRoomIds);

	await TournamentTeamRepository.dropOut({
		tournamentTeamId: teamId,
		previewBracketIdxs: tournament.brackets.flatMap((b, idx) =>
			b.preview ? idx : [],
		),
	});

	return { endedMatchIds, statusChangedTeamIds };
}

/**
 * The dropped team plus the teams whose header status the drop moves. Read off the propagation's
 * own changed matches: the follow-up match a walkover fills only shares a participant with the
 * ended match once the winner has been written into it.
 */
function teamIdsAffectedByDrop({
	droppedTeamId,
	changedMatches,
}: {
	droppedTeamId: number;
	changedMatches: Engine.MatchData[];
}) {
	const teamIds = new Set([droppedTeamId]);

	for (const match of changedMatches) {
		for (const opponentId of [match.opponent1?.id, match.opponent2?.id]) {
			if (typeof opponentId === "number") teamIds.add(opponentId);
		}
	}

	return Array.from(teamIds);
}

function sendDroppedMatchChatMessages({
	tournamentId,
	endedMatchIds,
}: {
	tournamentId: number;
	endedMatchIds: number[];
}) {
	if (endedMatchIds.length === 0) return;

	ChatSystemMessage.send([
		...endedMatchIds.map((matchId) => ({
			channel: tournamentMatchChannel(matchId),
		})),
		{ channel: tournamentChannel(tournamentId) },
	]);
}
