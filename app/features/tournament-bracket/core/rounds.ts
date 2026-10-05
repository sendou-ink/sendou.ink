import type { BracketData } from "~/features/tournament-bracket/core/engine/types";
import { TOURNAMENT } from "../../tournament/tournament-constants";

/**
 * Rounds of one side of an elimination group in play order with their display names. `winners` includes the grand finals, `single` the consolation final.
 * Names are positional in the full bracket, so with skipped rounds e.g. the last round played can still be "WB Semis".
 *
 * @param groupId Group whose rounds are returned, defaults to the group of the first round (bracket data usually holds one group).
 */
export function getRounds(args: {
	bracketData: BracketData;
	type: "winners" | "losers" | "single";
	groupId?: number;
}) {
	const groupId = args.groupId ?? args.bracketData.round[0]?.groupId;
	const groupRounds = args.bracketData.round.filter(
		(round) => round.groupId === groupId,
	);
	const matchesOfRound = (roundId: number) =>
		args.bracketData.match.filter((match) => match.roundId === roundId);

	const firstRound = groupRounds.find(
		(round) => round.section === "winners" && round.number === 1,
	);
	const upperBracketRoundCount = firstRound
		? Math.log2(matchesOfRound(firstRound.id).length * 2)
		: 0;
	const losersRoundCount = Math.max(0, (upperBracketRoundCount - 1) * 2);

	const grandFinal = groupRounds.find(
		(round) => round.section === "finals" && round.number === 1,
	);
	const grandFinalsMatch = grandFinal
		? matchesOfRound(grandFinal.id)[0]
		: undefined;

	const rounds = groupRounds
		.filter((round) =>
			args.type === "losers"
				? round.section === "losers"
				: round.section !== "losers",
		)
		.filter((round) => {
			const isBracketReset =
				args.type === "winners" &&
				round.section === "finals" &&
				round.number === 2;

			if (isBracketReset && grandFinalsMatch?.winnerSide === "opponent1") {
				return false;
			}

			return matchesOfRound(round.id).some((m) => m.opponent1 && m.opponent2);
		});

	const namedRounds = rounds.map((round, i) => {
		const name = () => {
			if (round.section === "finals") {
				if (args.type === "single") {
					return TOURNAMENT.ROUND_NAMES.THIRD_PLACE_MATCH;
				}

				return round.number === 1
					? TOURNAMENT.ROUND_NAMES.GRAND_FINALS
					: TOURNAMENT.ROUND_NAMES.BRACKET_RESET;
			}

			// only one match in the group, it decides the winner
			if (args.type === "winners" && upperBracketRoundCount === 1) {
				return TOURNAMENT.ROUND_NAMES.GRAND_FINALS;
			}

			const namePrefix =
				args.type === "winners" ? "WB " : args.type === "losers" ? "LB " : "";

			const sectionRoundCount = Math.max(
				round.section === "losers" ? losersRoundCount : upperBracketRoundCount,
				...groupRounds
					.filter((candidate) => candidate.section === round.section)
					.map((candidate) => candidate.number),
			);
			const isFinals = round.number === sectionRoundCount;
			const isSemis = round.number === sectionRoundCount - 1;

			return `${namePrefix}${
				isFinals ? "Finals" : isSemis ? "Semis" : `Round ${i + 1}`
			}`;
		};

		return {
			...round,
			name: name(),
		};
	});

	return adjustRoundNumbers(namedRounds);
}

// adjusting losers bracket round numbers to start from 1, can sometimes start with 2 if byes are certain way
function adjustRoundNumbers<T extends { number: number }>(rounds: T[]) {
	if (rounds.at(0)?.number === 1) {
		return rounds;
	}

	return rounds.map((round) => ({ ...round, number: round.number - 1 }));
}
