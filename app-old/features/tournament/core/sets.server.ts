import type { Tables } from "~/db/tables";
import type { User } from "~/db/types";
import type { ModeShort, StageId } from "~/modules/in-game-lists";
import type { TournamentMaplistSource } from "~/modules/tournament-map-list-generator";
import { sourceTypes } from "~/modules/tournament-map-list-generator";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { findRoundsByTournamentId } from "../queries/findRoundsByTournamentId.server";
import {
	type SetHistoryByTeamIdItem,
	setHistoryByTeamId,
} from "../queries/setHistoryByTeamId.server";

export interface PlayedSet {
	tournamentMatchId: number;
	score: [teamBeingViewed: number, opponent: number];
	round: {
		type: "winners" | "losers" | "single_elim" | "round_robin" | "swiss";
		round: number | "finals" | "grand_finals" | "bracket_reset";
	};
	stageName: string;
	maps: Array<{
		stageId: StageId;
		modeShort: ModeShort;
		result: "win" | "loss";
		source: TournamentMaplistSource;
	}>;
	opponent: {
		id: number;
		name: string;
		/** Team's roster that played in this set */
		roster: Array<
			Pick<
				User,
				"id" | "username" | "discordAvatar" | "discordId" | "customUrl"
			>
		>;
	};
}

export function winCounts(sets: PlayedSet[]) {
	let setsWon = 0;
	let totalSets = 0;
	let mapsWon = 0;
	let totalMaps = 0;

	for (const set of sets) {
		let mapsWonThisSet = 0;
		let totalMapsThisSet = 0;

		for (const map of set.maps) {
			if (map.result === "win") {
				mapsWonThisSet++;
			}
			totalMapsThisSet++;
		}

		totalSets++;
		if (mapsWonThisSet > totalMapsThisSet / 2) {
			setsWon++;
		}

		mapsWon += mapsWonThisSet;
		totalMaps += totalMapsThisSet;
	}

	return {
		sets: {
			won: setsWon,
			total: totalSets,
			percentage: Math.round((setsWon / totalSets) * 100),
		},
		maps: {
			won: mapsWon,
			total: totalMaps,
			percentage: Math.round((mapsWon / totalMaps) * 100),
		},
	};
}

export function tournamentTeamSets({
	tournamentTeamId,
	tournamentId,
}: {
	tournamentTeamId: number;
	tournamentId: number;
}): PlayedSet[] {
	const sets = setHistoryByTeamId(tournamentTeamId);
	const allRounds = findRoundsByTournamentId(tournamentId);

	return sets.map((set) => {
		const round =
			allRounds.find((round) => round.stageId === set.stageId) ?? allRounds[0];

		const resolveRound = () => {
			if (round.stageType === "round_robin" || round.stageType === "swiss") {
				return set.roundNumber;
			}

			if (set.groupNumber === 3) {
				if (set.roundNumber === 2) return "bracket_reset";

				return "grand_finals";
			}

			const maxRoundNumberOfGroup = Math.max(
				...allRounds
					.filter(
						(round) =>
							round.groupNumber === set.groupNumber &&
							round.stageId === set.stageId,
					)
					.map((round) => round.roundNumber),
			);

			if (set.roundNumber === maxRoundNumberOfGroup) {
				return "finals";
			}

			return set.roundNumber;
		};

		return {
			tournamentMatchId: set.tournamentMatchId,
			stageName: round.stageName,
			round: {
				round: resolveRound(),
				type: resolveRoundType({
					groupNumber: set.groupNumber,
					stageType: round.stageType,
				}),
			},
			maps: set.matches.map((match) => ({
				stageId: match.stageId,
				modeShort: match.mode,
				result: match.wasWinner ? "win" : "loss",
				source: parseTournamentMaplistSource(match.source),
			})),
			score: flipScoreIfNeeded(set),
			opponent: {
				id: set.otherTeamId,
				name: set.otherTeamName,
				roster: set.players,
			},
		};
	});
}

function parseTournamentMaplistSource(source: string): TournamentMaplistSource {
	if (sourceTypes.includes(source as any)) {
		return source as TournamentMaplistSource;
	}

	const parsed = Number(source);

	invariant(!Number.isNaN(parsed), `Invalid source: ${source}`);

	return parsed;
}

function flipScoreIfNeeded(set: SetHistoryByTeamIdItem): [number, number] {
	const score: [number, number] = [
		set.opponentOneScore ?? 0,
		set.opponentTwoScore ?? 0,
	];

	const wonTheSet =
		set.matches.reduce((acc, cur) => cur.wasWinner + acc, 0) >
		set.matches.length / 2;

	if (
		(wonTheSet && score[0] < score[1]) ||
		(!wonTheSet && score[0] > score[1])
	) {
		return [score[1], score[0]];
	}

	return score;
}

function resolveRoundType({
	groupNumber,
	stageType,
}: {
	groupNumber: number;
	stageType: Tables["TournamentStage"]["type"];
}) {
	if (stageType === "single_elimination") {
		return "single_elim";
	}

	if (stageType === "round_robin") {
		return "round_robin";
	}

	if (stageType === "swiss") {
		return "swiss";
	}

	if (groupNumber === 1 || groupNumber === 3) {
		return "winners";
	}

	if (groupNumber === 2) {
		return "losers";
	}

	logger.warn(
		`resolveRoundType: groupNumber ${groupNumber} and stageType ${stageType} not handled`,
	);
	return "single_elim";
}
