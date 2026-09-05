import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { endDroppedTeamMatches } from "~/features/tournament/tournament-utils.server";
import * as BracketRepository from "../BracketRepository.server";
import type * as Engine from "./engine";
import type { Tournament } from "./Tournament";

/** One transaction: hydrate → operate → (end dropped teams' matches) → apply changes → extra statements. */
export async function executeBracketOperation<T extends Engine.EngineResult>({
	tournamentId,
	tournament,
	operation,
	endDroppedTeams,
	inTransaction,
}: {
	tournamentId: number;
	tournament: Tournament;
	operation: (bracketData: Engine.BracketData) => T;
	/** End unfinished matches of dropped out teams after the operation (a function resolves it from the result). */
	endDroppedTeams: boolean | ((result: T) => boolean);
	/** Run inside the same transaction after the match changes. */
	inTransaction?: (result: T, trx: Transaction<DB>) => void | Promise<void>;
}): Promise<{ result: T; endedMatchIds: number[] }> {
	let result!: T;
	let endedMatchIds: number[] = [];
	let changedChatRoomIds: number[] = [];

	await db.transaction().execute(async (trx) => {
		const bracketData = await BracketRepository.findByTournamentId(
			tournamentId,
			trx,
		);
		result = operation(bracketData);

		let applied: Engine.EngineResult = result;

		const shouldEndDroppedTeamMatches =
			typeof endDroppedTeams === "function"
				? endDroppedTeams(result)
				: endDroppedTeams;
		if (shouldEndDroppedTeamMatches) {
			const droppedResult = endDroppedTeamMatches({
				tournament,
				data: result.data,
			});
			endedMatchIds = droppedResult.endedMatchIds;
			applied = {
				data: droppedResult.data,
				changedMatches: [
					...result.changedMatches,
					...droppedResult.changedMatches,
				],
			};
		}

		changedChatRoomIds = await BracketRepository.applyMatchChanges(
			{
				previousData: bracketData,
				result: applied,
				isLeague: tournament.isLeague,
			},
			trx,
		);
		await inTransaction?.(result, trx);
	});

	// after the commit so the refetch it prompts can not read the pre-commit state
	ChatSystemMessage.notifyRoomsChangedByRoomIds(changedChatRoomIds);

	return { result, endedMatchIds };
}
