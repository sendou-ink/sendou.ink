import * as R from "remeda";
import type { Standing } from "~/features/tournament-bracket/core/Bracket";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import invariant from "~/utils/invariant";
import { getBracketProgressionLabel } from "../tournament-utils";

export type TournamentStandingsResult =
	| { type: "single"; standings: Standing[] }
	| {
			type: "multi";
			standings: Array<{
				div: string;
				standings: Standing[];
			}>;
	  };

/** Converts tournament standings from single or multi-division format into a flat array */
export function flattenStandings(
	standingsResult: TournamentStandingsResult,
): Standing[] {
	return standingsResult.type === "single"
		? standingsResult.standings
		: standingsResult.standings.flatMap((div) => div.standings);
}

/** Calculates SPR (Seed Performance Rating) - see https://web.archive.org/web/20250513034545/https://www.pgstats.com/articles/introducing-spr-and-uf */
export function calculateSPR({
	standings,
	teamId,
}: {
	standings: Standing[];
	teamId: number;
}) {
	const uniquePlacements = R.unique(
		standings.map((standing) => standing.placement),
	).sort((a, b) => a - b);

	const teamStanding = standings.find(
		(standing) => standing.team.id === teamId,
	);
	// defensive check to avoid crashing
	if (!teamStanding) {
		return 0;
	}

	const expectedPlacement =
		standings[(teamStanding.team.seed ?? 0) - 1]?.placement;
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
	teamId,
}: {
	tournament: Tournament;
	teamId: number;
}) {
	const startingBracketIdx = tournament.teamById(teamId)?.startingBracketIdx;

	let bracketIdxs: number[];

	if (typeof startingBracketIdx !== "number" || startingBracketIdx === 0) {
		bracketIdxs = Progression.bracketIdxsForStandings(
			tournament.ctx.settings.bracketProgression,
		);
	} else {
		const reachableBrackets = Progression.bracketsReachableFrom(
			startingBracketIdx,
			tournament.ctx.settings.bracketProgression,
		);
		const reachableSet = new Set(reachableBrackets);

		const allBracketIdxs = tournament.ctx.settings.bracketProgression
			.map((_, idx) => idx)
			.sort((a, b) => b - a);
		bracketIdxs = allBracketIdxs.filter((idx) => reachableSet.has(idx));
	}

	const brackets = bracketIdxs
		.reverse()
		.map((bracketIdx) => tournament.bracketByIdx(bracketIdx)!);

	const matches = brackets.flatMap((bracket, i) =>
		bracket.data.match
			.filter(
				(match) =>
					match.opponent1 &&
					match.opponent2 &&
					(match.opponent1?.id === teamId || match.opponent2?.id === teamId) &&
					(match.opponent1.result === "win" ||
						match.opponent2?.result === "win"),
			)
			.map((match) => ({
				...match,
				bracketIdx: bracketIdxs[bracketIdxs.length - 1 - i],
			})),
	);

	return matches.map((match) => {
		const opponentId = (
			match.opponent1?.id === teamId ? match.opponent2?.id : match.opponent1?.id
		)!;
		const team = tournament.teamById(opponentId);

		const result =
			match.opponent1?.id === teamId
				? match.opponent1.result
				: match.opponent2?.result;

		return {
			id: match.id,
			// defensive fallback
			vsSeed: team?.seed ?? 0,
			// defensive fallback
			result: result ?? "win",
			bracketIdx: match.bracketIdx,
		};
	});
}

/**
 * Computes the standings for a given tournament by aggregating results from relevant brackets.
 *
 * For example if the tournament format is round robin (where 2 out of 4 teams per group advance) to single elimination,
 * the top teams are decided by the single elimination bracket, and the teams who failed to make the bracket are ordered
 * by their performance in the round robin group stage.
 *
 * Returns a discriminated union:
 * - For tournaments with a single starting bracket, returns type 'single' with overall standings
 * - For tournaments with multiple starting brackets, returns type 'multi' with standings per division
 */
export function tournamentStandings(
	tournament: Tournament,
): TournamentStandingsResult {
	const startingBracketIdxs = Progression.startingBrackets(
		tournament.ctx.settings.bracketProgression,
	);

	if (startingBracketIdxs.length <= 1) {
		return {
			type: "single",
			standings: tournamentStandingsForBracket(tournament, undefined),
		};
	}

	return {
		type: "multi",
		standings: startingBracketIdxs.map((bracketIdx) => ({
			div: getBracketProgressionLabel(
				bracketIdx,
				tournament.ctx.settings.bracketProgression,
			),
			standings: tournamentStandingsForBracket(tournament, bracketIdx),
		})),
	};
}

/**
 * Computes the standings for a given tournament starting from a specific bracket.
 * If bracketIdx is undefined, computes overall standings for the entire tournament.
 * Otherwise, only includes brackets that are reachable from the given bracketIdx.
 */
function tournamentStandingsForBracket(
	tournament: Tournament,
	bracketIdx: number | undefined,
): Standing[] {
	let bracketIdxs: number[];

	const isSingleStartingBracket = typeof bracketIdx !== "number";

	if (isSingleStartingBracket) {
		bracketIdxs = Progression.bracketIdxsForStandings(
			tournament.ctx.settings.bracketProgression,
		);
	} else {
		const reachableBrackets = Progression.bracketsReachableFrom(
			bracketIdx,
			tournament.ctx.settings.bracketProgression,
		);
		const reachableSet = new Set(reachableBrackets);

		const allBracketIdxs = tournament.ctx.settings.bracketProgression
			.map((_, idx) => idx)
			.sort((a, b) => b - a);
		bracketIdxs = allBracketIdxs.filter((idx) => reachableSet.has(idx));
	}

	const result: Standing[] = [];
	const alreadyIncludedTeamIds = new Set<number>();

	const finalBracketIsOver = tournament.brackets.some(
		(bracket) => bracket.isFinals && bracket.everyMatchOver,
	);

	for (const idx of bracketIdxs) {
		const bracket = tournament.bracketByIdx(idx);
		invariant(bracket);

		// sometimes a bracket might not be played so then we ignore it from the standings
		if (isSingleStartingBracket && finalBracketIsOver && bracket.preview) {
			continue;
		}

		const standings = standingsToMergeable({
			alreadyIncludedTeamIds,
			standings: bracket.standings,
			teamsAboveFromAnotherBracketsCount: alreadyIncludedTeamIds.size,
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

function standingsToMergeable<
	T extends { team: { id: number }; placement: number },
>({
	alreadyIncludedTeamIds,
	standings,
	teamsAboveFromAnotherBracketsCount,
}: {
	alreadyIncludedTeamIds: Set<number>;
	standings: T[];
	teamsAboveFromAnotherBracketsCount: number;
}) {
	const result: T[] = [];

	const filtered = standings.filter(
		(standing) => !alreadyIncludedTeamIds.has(standing.team.id),
	);

	// e.g. if standings start at 3rd place, this must mean there is 2 teams left to finish _this_ bracket
	const unfinishedTeamsCount = (standings.at(0)?.placement ?? 1) - 1;

	let placement = 1;

	for (const [i, standing] of filtered.entries()) {
		const placementChanged =
			i !== 0 && standing.placement !== filtered[i - 1].placement;

		if (placementChanged) {
			placement = i + 1;
		}

		result.push({
			...standing,
			placement:
				placement + teamsAboveFromAnotherBracketsCount + unfinishedTeamsCount,
		});
	}

	return result;
}
