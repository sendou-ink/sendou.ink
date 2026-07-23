import type { ActionFunction } from "react-router";
import * as R from "remeda";
import { db } from "~/db/sql";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import { endDroppedTeamMatches } from "~/features/tournament/tournament-utils.server";
import * as BracketRepository from "~/features/tournament-bracket/BracketRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentWebsocketRoom } from "~/features/tournament-bracket/tournament-bracket-utils";
import { tournamentMatchWebsocketRoom } from "~/features/tournament-match/tournament-match-utils";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	errorToastIfFalsy,
	parseParams,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { idObject } from "../../../utils/zod";
import { adminTeamsActionSchema } from "../tournament-admin-schemas.server";
import { requireTournamentOrganizer } from "../tournament-admin-utils.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: adminTeamsActionSchema,
	});

	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });

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
			logger.info(
				`Checked out: tournament team id: ${data.teamId} - user id: ${user.id} - tournament id: ${tournamentId} - bracket idx: ${data.bracketIdx}`,
			);

			break;
		}
		case "DELETE_TEAM": {
			requireTournamentOrganizer(tournament, user);
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(!tournament.hasStarted, "Tournament has started");

			await TournamentTeamRepository.del(team.id);

			for (const member of team.members) {
				ShowcaseTournaments.removeFromCached({
					tournamentId,
					type: "participant",
					userId: member.userId,
				});

				ShowcaseTournaments.updateCachedTournamentTeamCount({
					tournamentId,
					newTeamCount: tournament.ctx.teams.length - 1,
				});
			}

			break;
		}
		case "DROP_TEAM_OUT": {
			requireTournamentOrganizer(tournament, user);
			errorToastIfFalsy(tournament.teamById(data.teamId), "Invalid team id");

			const endedMatchIds = await dropTeamOut({
				tournament,
				teamId: data.teamId,
			});

			sendDroppedMatchChatMessages({
				tournamentId: tournament.ctx.id,
				endedMatchIds,
			});

			break;
		}
		case "UNDO_DROP_TEAM_OUT": {
			requireTournamentOrganizer(tournament, user);

			await TournamentTeamRepository.undoDropOut(data.teamId);

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

	return null;
};

/**
 * Drops a single team out: assigns a random active roster for teams with subs,
 * ends their in-progress matches and marks the team dropped out. Returns the ids
 * of matches that were ended so the caller can broadcast a single batch of chat
 * messages.
 */
async function dropTeamOut({
	tournament,
	teamId,
}: {
	tournament: Awaited<ReturnType<typeof tournamentFromDB>>;
	teamId: number;
}) {
	const droppingTeam = tournament.teamById(teamId);
	invariant(droppingTeam, "Invalid team id");

	// Set active roster only for teams with subs (can't infer which players played)
	// Teams without subs have their roster trivially inferred in summarizer
	const hasSubs = droppingTeam.members.length > tournament.minMembersPerTeam;
	if (hasSubs && !droppingTeam.activeRosterUserIds) {
		const randomRoster = R.sample(
			droppingTeam.members.map((m) => m.userId),
			tournament.minMembersPerTeam,
		);
		await TournamentTeamRepository.setActiveRoster({
			teamId,
			activeRosterUserIds: randomRoster,
		});
	}

	const endedMatchIds = await db.transaction().execute(async (trx) => {
		const droppedResult = endDroppedTeamMatches({
			tournament,
			data: await BracketRepository.findByTournamentId(tournament.ctx.id, trx),
			droppedTeamId: teamId,
		});
		await BracketRepository.applyMatchChanges(
			droppedResult.changedMatches,
			trx,
		);

		return droppedResult.endedMatchIds;
	});

	await TournamentTeamRepository.dropOut({
		tournamentTeamId: teamId,
		previewBracketIdxs: tournament.brackets.flatMap((b, idx) =>
			b.preview ? idx : [],
		),
	});

	return endedMatchIds;
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
			room: tournamentMatchWebsocketRoom(matchId),
			type: "TOURNAMENT_MATCH_UPDATED" as const,
			revalidateOnly: true as const,
		})),
		{
			room: tournamentWebsocketRoom(tournamentId),
			type: "TOURNAMENT_UPDATED" as const,
			revalidateOnly: true as const,
		},
	]);
}
