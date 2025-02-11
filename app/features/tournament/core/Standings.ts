import type { Standing } from "~/features/tournament-bracket/core/Bracket";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { removeDuplicates } from "~/utils/arrays";

/** Calculates SPR (Seed Performance Rating) - see https://www.pgstats.com/articles/introducing-spr-and-uf */
export function calculateSPR({
	standings,
	teamId,
}: {
	standings: Standing[];
	teamId: number;
}) {
	const uniquePlacements = removeDuplicates(
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
}: { tournament: Tournament; teamId: number }) {
	const brackets = Progression.bracketIdxsForStandings(
		tournament.ctx.settings.bracketProgression,
	)
		.reverse()
		.map((bracketIdx) => tournament.bracketByIdx(bracketIdx)!);

	const matches = brackets.flatMap((bracket, bracketIdx) =>
		bracket.data.match
			.filter(
				(match) =>
					match.opponent1 &&
					match.opponent2 &&
					(match.opponent1?.id === teamId || match.opponent2?.id === teamId) &&
					(match.opponent1.result === "win" ||
						match.opponent2?.result === "win"),
			)
			.map((match) => ({ ...match, bracketIdx })),
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

export function tournamentStandings(tournament: Tournament): Standing[] {
	const bracketIdxs = Progression.bracketIdxsForStandings(
		tournament.ctx.settings.bracketProgression,
	);

	const result: Standing[] = [];
	const alreadyIncludedTeamIds = new Set<number>();

	const finalBracketIsOver = tournament.brackets.some(
		(bracket) => bracket.isFinals && bracket.everyMatchOver,
	);

	for (const bracketIdx of bracketIdxs) {
		const bracket = tournament.bracketByIdx(bracketIdx);
		if (!bracket) continue;
		// sometimes a bracket might not be played so then we ignore it from the standings
		if (finalBracketIsOver && bracket.preview) continue;

		const standings = standingsToMergeable({
			alreadyIncludedTeamIds,
			standings: bracket.standings,
			teamsAboveCount: alreadyIncludedTeamIds.size,
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
	teamsAboveCount,
}: {
	alreadyIncludedTeamIds: Set<number>;
	standings: T[];
	teamsAboveCount: number;
}) {
	const result: T[] = [];

	const filtered = standings.filter(
		(standing) => !alreadyIncludedTeamIds.has(standing.team.id),
	);

	let placement = teamsAboveCount + 1;

	for (const [i, standing] of filtered.entries()) {
		const placementChanged =
			i !== 0 && standing.placement !== filtered[i - 1].placement;

		if (placementChanged) {
			placement = teamsAboveCount + i + 1;
		}

		result.push({ ...standing, placement });
	}

	return result;
}
