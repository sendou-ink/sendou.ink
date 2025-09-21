import { query } from '$app/server';
import { id } from '$lib/utils/zod';
import z from 'zod';
import { requireTournament } from '../tournament/utils.server';
import { notFoundIfFalsy } from '$lib/server/remote-functions';
import * as Deadline from '$lib/core/tournament-bracket/Deadline';
import type { TournamentRoundMaps } from '$lib/server/db/tables';
import type { BracketCore } from '$lib/core/tournament-bracket/bracket-core';
import { getEliminationBracketRounds } from '$lib/core/tournament/rounds';
import type { TournamentCore } from '$lib/core/tournament/tournament-core';
import invariant from '$lib/utils/invariant';

export const findBracket = query(
	z.object({
		tournamentId: id,
		bracketIdx: z.coerce.number().min(0).max(10)
	}),
	async ({ tournamentId, bracketIdx }) => {
		const tournament = await requireTournament(tournamentId);
		const bracket = notFoundIfFalsy(tournament.bracketByIdx(bracketIdx));

		return bracketManagerDataSetToBracketData(bracket);
	}
);

function bracketManagerDataSetToBracketData(bracket: BracketCore): BracketData {
	switch (bracket.data.stage[0].type) {
		case 'double_elimination': {
			const winnersRounds = getEliminationBracketRounds({
				bracketData: bracket.data,
				type: 'winners'
			});
			const losersRounds = getEliminationBracketRounds({
				bracketData: bracket.data,
				type: 'losers'
			});

			return {
				type: 'double_elimination',
				isPreview: bracket.preview,
				winners: winnersRounds.map(
					getRoundMapper(bracket.tournament, (round) =>
						round.name.includes('Grand') ? 'GF' : 'WB'
					)
				),
				losers: losersRounds.map(getRoundMapper(bracket.tournament, () => 'LB'))
			};
		}
		default: {
			throw new Error('Not implemented yet');
		}
	}
}

function getRoundMapper(
	tournament: TournamentCore,
	identifierPrefix: (round: ReturnType<typeof getEliminationBracketRounds>[number]) => string
) {
	return (round: ReturnType<typeof getEliminationBracketRounds>[number]): RoundData => {
		console.log(round);
		return {
			name: round.name,
			id: round.id,
			deadline: undefined, // xxx: add deadline info
			maps: round.maps ?? undefined,
			matches: round.matches.map((match) => {
				function resolveTeam(side: 0 | 1): BracketTeamData | null {
					const team = side === 0 ? match.opponent1 : match.opponent2;
					if (!team || !team.id) return null;

					const fullTeam = tournament.teamById(team.id);
					invariant(fullTeam);

					return {
						isSimulated: false,
						seed: fullTeam.seed,
						name: fullTeam.name,
						logoUrl: tournament.tournamentTeamLogoSrc(fullTeam) ?? null,
						result: team.result ?? null
					};
				}

				return {
					id: match.id,
					identifier: `${identifierPrefix(round)} ${round.number}.${match.number}`,
					teams: [resolveTeam(0), resolveTeam(1)],
					score: null,
					isOver: false,
					stream: null
				};
			})
		};
	};
}

export type BracketTeamData = {
	result: 'win' | 'loss' | null;
	isSimulated: boolean;
	seed: number;
	name: string;
	logoUrl: string | null;
};

export type BracketMatchData = {
	id: number;
	/** Teams of the match. If null, it is a BYE. */
	teams: [BracketTeamData | null, BracketTeamData | null];
	score: [number, number] | null;
	/** Short identifier e.g. "WB 1.1" */
	identifier: string;
	stream: 'LIVE' | 'LOCK' | null;
};

export interface RoundData {
	id: number;
	name: string;
	deadline?: Deadline.Deadline;
	maps?: Omit<TournamentRoundMaps, 'list'>;
	matches: Array<BracketMatchData>;
}

export type BracketData =
	| {
			type: 'double_elimination';
			isPreview: boolean;
			winners: Array<RoundData>;
			losers: Array<RoundData>;
	  }
	| {
			type: 'single_elimination';
			isPreview: boolean;
			rounds: Array<RoundData>;
	  };
