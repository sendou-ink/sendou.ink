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
	section: Tables["TournamentRound"]["section"];
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

export function tournamentTeamSets({
	sets,
	allRounds,
}: {
	sets: FindByTournamentTeamIdItem[];
	allRounds: AllRoundsItem[];
}): PlayedSet[] {
	return sets.map((set) => {
		const round =
			allRounds.find((candidate) => candidate.stageId === set.stageId) ??
			allRounds[0];

		const resolveRound = () => {
			if (round.stageType === "round_robin" || round.stageType === "swiss") {
				return set.roundNumber;
			}

			if (
				round.stageType === "double_elimination" &&
				set.section === "finals"
			) {
				if (set.roundNumber === 2) return "bracket_reset";

				return "grand_finals";
			}

			const maxRoundNumberOfSection = Math.max(
				...allRounds
					.filter(
						(candidate) =>
							candidate.section === set.section &&
							candidate.stageId === set.stageId,
					)
					.map((candidate) => candidate.roundNumber),
			);

			if (set.roundNumber === maxRoundNumberOfSection) {
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
					section: set.section,
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
	section,
	stageType,
}: {
	section: Tables["TournamentRound"]["section"];
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

	if (section === "winners" || section === "finals") {
		return "winners";
	}

	if (section === "losers") {
		return "losers";
	}

	logger.warn(
		`resolveRoundType: section ${section} and stageType ${stageType} not handled`,
	);
	return "single_elim";
}
