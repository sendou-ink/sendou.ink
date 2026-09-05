import type { Tables } from "~/db/tables";
import type { FindByTournamentTeamIdItem } from "~/features/tournament-match/TournamentMatchRepository.server";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { parseMaplistSource } from "~/modules/tournament-map-list-generator/source";
import type { TournamentMaplistSource } from "~/modules/tournament-map-list-generator/types";
import { logger } from "~/utils/logger";

export interface AllRoundsItem {
	stageId: number;
	stageName: string;
	stageType: Tables["TournamentStage"]["type"];
	roundNumber: number;
	groupNumber: number;
}

export interface PlayedSet {
	tournamentMatchId: number;
	score: [teamBeingViewed: number, opponent: number];
	/** Per the bracket; can disagree with the maps and score, e.g. an organizer overrode the winner after reports. */
	result: "win" | "loss";
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
		roster: Array<
			Pick<
				Tables["User"],
				| "id"
				| "username"
				| "discordAvatar"
				| "discordId"
				| "customUrl"
				| "country"
			> & { customAvatarUrl: string | null }
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
		if (set.result === "win") {
			setsWon++;
		}

		mapsWon += mapsWonThisSet;
		totalMaps += totalMapsThisSet;
	}

	return {
		sets: {
			won: setsWon,
			total: totalSets,
			percentage: totalSets === 0 ? 0 : Math.round((setsWon / totalSets) * 100),
		},
		maps: {
			won: mapsWon,
			total: totalMaps,
			percentage: totalMaps === 0 ? 0 : Math.round((mapsWon / totalMaps) * 100),
		},
	};
}

export function tournamentTeamSets({
	sets,
	allRounds,
}: {
	sets: FindByTournamentTeamIdItem[];
	allRounds: AllRoundsItem[];
}): PlayedSet[] {
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
				source: parseMaplistSource(match.source),
			})),
			result: set.winnerSide === set.teamSide ? "win" : "loss",
			score: scoreFromTeamPerspective(set),
			opponent: {
				id: set.otherTeamId,
				name: set.otherTeamName,
				roster: set.players,
			},
		};
	});
}

function scoreFromTeamPerspective(
	set: FindByTournamentTeamIdItem,
): [number, number] {
	return set.teamSide === "opponent1"
		? [set.opponentOneScore ?? 0, set.opponentTwoScore ?? 0]
		: [set.opponentTwoScore ?? 0, set.opponentOneScore ?? 0];
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
