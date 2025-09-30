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
import { groupNumberToLetters } from '$lib/core/tournament-bracket/utils';

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
		case 'round_robin': {
			return {
				type: 'round_robin',
				showCompactify: false,
				isPreview: bracket.preview,
				groups: bracket.data.group.map((group) => {
					const groupMatches = bracket.data.match.filter((match) => match.group_id === group.id);
					const groupRounds = bracket.data.round.filter((round) => round.group_id === group.id);

					return {
						letters: groupNumberToLetters(group.number),
						standings: [],
						rounds: groupRounds.map((round): RoundData => {
							const roundMatches = groupMatches.filter((match) => match.round_id === round.id);

							return {
								name: `Round ${round.number}`,
								id: round.id,
								deadline: undefined, // xxx: add deadline info
								maps: round.maps ?? undefined,
								matches: roundMatches.map((match) =>
									mapMatch({
										match,
										tournament: bracket.tournament,
										identifier: `${groupNumberToLetters(group.number)}${round.number}.${match.number}`
									})
								)
							};
						})
					};
				})
			};
		}
		case 'single_elimination': {
			const rounds = getEliminationBracketRounds({
				bracketData: bracket.data,
				type: 'single'
			});

			return {
				type: 'single_elimination',
				showCompactify: rounds.length > 2,
				isPreview: bracket.preview,
				rounds: rounds.map(getEliminationRoundMapper(bracket.tournament, () => ''))
			};
		}
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
				showCompactify: winnersRounds.length > 3,
				isPreview: bracket.preview,
				winners: winnersRounds.map(
					getEliminationRoundMapper(bracket.tournament, (round) =>
						round.name.includes('Grand') || round.name.includes('Bracket') ? 'GF' : 'WB'
					)
				),
				losers: losersRounds.map(getEliminationRoundMapper(bracket.tournament, () => 'LB'))
			};
		}
		default: {
			throw new Error('Not implemented yet');
		}
	}
}

function mapMatch({
	match,
	tournament,
	identifier
}: {
	match: BracketCore['data']['match'][number];
	tournament: TournamentCore;
	identifier: string;
}): BracketMatchData {
	function resolveTeam(side: 0 | 1): BracketTeamData | null | undefined {
		const team = side === 0 ? match.opponent1 : match.opponent2;
		if (!team) return null;
		if (!team.id) return undefined;

		const fullTeam = tournament.teamById(team.id);
		invariant(fullTeam);

		return {
			isSimulated: false,
			seed: fullTeam.seed,
			name: fullTeam.name,
			logoUrl: tournament.tournamentTeamLogoSrc(fullTeam) ?? null,
			result: team.result ?? null,
			roster: fullTeam.members.map((member) => member.username)
		};
	}

	return {
		id: match.id,
		identifier,
		teams: [resolveTeam(0), resolveTeam(1)],
		score:
			resolveTeam(0) && resolveTeam(1)
				? [match.opponent1?.score ?? 0, match.opponent2?.score ?? 0]
				: null,
		isOver:
			match.opponent1?.result === 'win' ||
			match.opponent2?.result === 'win' ||
			match.opponent1 === null ||
			match.opponent2 === null,
		stream: null
	};
}

function getEliminationRoundMapper(
	tournament: TournamentCore,
	identifierPrefix: (round: ReturnType<typeof getEliminationBracketRounds>[number]) => string
) {
	return (round: ReturnType<typeof getEliminationBracketRounds>[number]): RoundData => {
		return {
			name: round.name,
			id: round.id,
			deadline: undefined, // xxx: add deadline info
			maps: round.maps ?? undefined,
			matches: round.matches.map((match) =>
				mapMatch({
					match,
					tournament,
					identifier: `${identifierPrefix(round)} ${round.number}.${match.number}`
				})
			)
		};
	};
}

export type BracketTeamData = {
	result: 'win' | 'loss' | null;
	isSimulated: boolean;
	seed: number;
	name: string;
	logoUrl: string | null;
	roster: string[];
};

export type BracketMatchData = {
	id: number;
	/** Teams of the match. If `null`, it is a BYE. `undefined` means no team yet */
	teams: [BracketTeamData | null | undefined, BracketTeamData | null | undefined];
	score: [number, number] | null;
	/** Short identifier e.g. "WB 1.1" */
	identifier: string;
	stream: 'LIVE' | 'LOCK' | null;
	isOver: boolean;
};

export interface RoundData {
	id: number;
	name: string;
	deadline?: Deadline.Deadline;
	maps?: Omit<TournamentRoundMaps, 'list'>;
	matches: Array<BracketMatchData>;
}

export interface StandingsData {
	team: BracketTeamData;
	stats: Array<{
		identifier: 'SET_WL' | 'TB' | 'MAP_WL' | 'SCORE';
		value: string;
	}>;
	destination?: {
		bracket: string;
		overridden: boolean;
		tentative: boolean;
	};
}

export type BracketData =
	| {
			type: 'double_elimination';
			isPreview: boolean;
			showCompactify: boolean;
			winners: Array<RoundData>;
			losers: Array<RoundData>;
	  }
	| {
			type: 'single_elimination';
			isPreview: boolean;
			showCompactify: boolean;
			rounds: Array<RoundData>;
	  }
	| {
			type: 'round_robin';
			isPreview: boolean;
			showCompactify: boolean;
			groups: Array<{
				letters: string;
				rounds: Array<RoundData>;
				standings: Array<StandingsData>;
			}>;
	  };
