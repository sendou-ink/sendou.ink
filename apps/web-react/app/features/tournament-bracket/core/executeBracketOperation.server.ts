import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import { endDroppedTeamMatches } from "~/features/tournament/tournament-utils.server";
import * as BracketRepository from "../BracketRepository.server";
import type * as Engine from "./engine";
import type { Tournament } from "./Tournament";

/**
 * Runs an engine operation against freshly hydrated bracket data and persists
 * the resulting match changes, all in one transaction: hydrate → operate →
 * (end dropped teams' matches) → apply changes → extra statements.
 */
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
	/** Whether unfinished matches of dropped out teams should be ended after the operation (resolved from its result when given a function). */
	endDroppedTeams: boolean | ((result: T) => boolean);
	/** Extra statements to run inside the same transaction, after the match changes have been applied. */
	inTransaction?: (result: T, trx: Transaction<DB>) => void | Promise<void>;
}): Promise<{ result: T; endedMatchIds: number[] }> {
	let result!: T;
	let endedMatchIds: number[] = [];

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

		await BracketRepository.applyMatchChanges(
			{ previousData: bracketData, result: applied },
			trx,
		);
		await inTransaction?.(result, trx);
	});

	return { result, endedMatchIds };
}
