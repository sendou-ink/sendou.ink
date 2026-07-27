import invariant from "~/utils/invariant";
import * as BracketRepository from "../tournament-bracket/BracketRepository.server";
import * as Engine from "../tournament-bracket/core/engine";
import { tournamentFromDB } from "../tournament-bracket/core/Tournament.server";

/**
 * Starts a tournament with the given seeding and tournament ID.
 * Assumes that the tournament has only one bracket.
 */
export async function dbStartTournament(seeding: number[], tournamentId = 1) {
	const tournament = await tournamentFromDB({
		tournamentId,
		user: undefined,
	});

	invariant(
		seeding.every((id) => tournament.ctx.teams.some((team) => team.id === id)),
	);

	const bracket = tournament.bracketByIdx(0)!;

	const createInput: Engine.CreateBracketInput = {
		type: bracket.type,
		seeding,
		settings: bracket.settings,
	};

	await BracketRepository.insertBracket({
		tournamentId: tournament.ctx.id,
		name: bracket.name,
		bracket: Engine.create({
			...createInput,
			maps: Engine.create(createInput).round.map((round) => ({
				roundId: round.id,
				count: 3,
				type: "BEST_OF",
				list: ([1, 2, 3] as const).map((stageId) => ({
					mode: "SZ",
					stageId,
				})),
			})),
		}),
	});
}
