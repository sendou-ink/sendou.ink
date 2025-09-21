import * as R from 'remeda';
import type { Standing } from '../tournament-bracket/bracket-core';
import type { TournamentCore } from './tournament-core';
import * as Progression from '$lib/core/tournament-bracket/Progression';

/** Calculates SPR (Seed Performance Rating) - see https://web.archive.org/web/20250513034545/https://www.pgstats.com/articles/introducing-spr-and-uf */
export function calculateSPR({ standings, teamId }: { standings: Standing[]; teamId: number }) {
	const uniquePlacements = R.unique(standings.map((standing) => standing.placement)).sort(
		(a, b) => a - b
	);

	const teamStanding = standings.find((standing) => standing.team.id === teamId);
	// defensive check to avoid crashing
	if (!teamStanding) {
		return 0;
	}

	const expectedPlacement = standings[(teamStanding.team.seed ?? 0) - 1]?.placement;
	// defensive check to avoid crashing
	if (!expectedPlacement) {
		return 0;
	}

	const teamPlacement = teamStanding.placement;
	const actualIndex = uniquePlacements.indexOf(teamPlacement);
	const expectedIndex = uniquePlacements.indexOf(expectedPlacement);

	return expectedIndex - actualIndex;
}

/** Teams matches that contributed to the standings, in the order they were played in */
export function matchesPlayed({
	tournament,
	teamId
}: {
	tournament: TournamentCore;
	teamId: number;
}) {
	const brackets = Progression.bracketIdxsForStandings(tournament.ctx.settings.bracketProgression)
		.reverse()
		.map((bracketIdx) => tournament.bracketByIdx(bracketIdx)!);

	const matches = brackets.flatMap((bracket, bracketIdx) =>
		bracket.data.match
			.filter(
				(match) =>
					match.opponent1 &&
					match.opponent2 &&
					(match.opponent1?.id === teamId || match.opponent2?.id === teamId) &&
					(match.opponent1.result === 'win' || match.opponent2?.result === 'win')
			)
			.map((match) => ({ ...match, bracketIdx }))
	);

	return matches.map((match) => {
		const opponentId = (
			match.opponent1?.id === teamId ? match.opponent2?.id : match.opponent1?.id
		)!;
		const team = tournament.teamById(opponentId);

		const result =
			match.opponent1?.id === teamId ? match.opponent1.result : match.opponent2?.result;

		return {
			id: match.id,
			// defensive fallback
			vsSeed: team?.seed ?? 0,
			// defensive fallback
			result: result ?? 'win',
			bracketIdx: match.bracketIdx
		};
	});
}

/**
 * Computes the standings for a given tournament by aggregating results from relevant brackets.
 *
 * For example if the tournament format is round robin (where 2 out of 4 teams per group advance) to single elimination,
 * the top teams are decided by the single elimination bracket, and the teams who failed to make the bracket are ordered
 * by their performance in the round robin group stage.
 */
export function tournamentStandings(tournament: TournamentCore): Standing[] {
	const bracketIdxs = Progression.bracketIdxsForStandings(
		tournament.ctx.settings.bracketProgression
	);

	const result: Standing[] = [];
	const alreadyIncludedTeamIds = new Set<number>();

	const finalBracketIsOver = tournament.brackets.some(
		(bracket) => bracket.isFinals && bracket.everyMatchOver
	);

	for (const bracketIdx of bracketIdxs) {
		const bracket = tournament.bracketByIdx(bracketIdx);
		if (!bracket) continue;
		// sometimes a bracket might not be played so then we ignore it from the standings
		if (finalBracketIsOver && bracket.preview) continue;

		const standings = standingsToMergeable({
			alreadyIncludedTeamIds,
			standings: bracket.standings,
			teamsAboveFromAnotherBracketsCount: alreadyIncludedTeamIds.size
		});
		result.push(...standings);

		for (const teamId of bracket.participantTournamentTeamIds) {
			alreadyIncludedTeamIds.add(teamId);
		}
		for (const teamId of bracket.teamsPendingCheckIn ?? []) {
			alreadyIncludedTeamIds.add(teamId);
		}
	}

	return result;
}

function standingsToMergeable<T extends { team: { id: number }; placement: number }>({
	alreadyIncludedTeamIds,
	standings,
	teamsAboveFromAnotherBracketsCount
}: {
	alreadyIncludedTeamIds: Set<number>;
	standings: T[];
	teamsAboveFromAnotherBracketsCount: number;
}) {
	const result: T[] = [];

	const filtered = standings.filter((standing) => !alreadyIncludedTeamIds.has(standing.team.id));

	// e.g. if standings start at 3rd place, this must mean there is 2 teams left to finish _this_ bracket
	const unfinishedTeamsCount = (standings.at(0)?.placement ?? 1) - 1;

	let placement = 1;

	for (const [i, standing] of filtered.entries()) {
		const placementChanged = i !== 0 && standing.placement !== filtered[i - 1].placement;

		if (placementChanged) {
			placement = i + 1;
		}

		result.push({
			...standing,
			placement: placement + teamsAboveFromAnotherBracketsCount + unfinishedTeamsCount
		});
	}

	return result;
}
