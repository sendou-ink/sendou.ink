import type { BracketData } from "~/features/tournament-bracket/core/engine/types";
import { TOURNAMENT } from "../../tournament/tournament-constants";

/** Rounds of one side of an elimination bracket in play order with their display names. `winners` includes the grand finals, `single` the consolation final. */
export function getRounds(args: {
	bracketData: BracketData;
	type: "winners" | "losers" | "single";
}) {
	let showingBracketReset = args.bracketData.round.length > 1;
	const rounds = args.bracketData.round
		.filter((round) =>
			args.type === "losers"
				? round.section === "losers"
				: round.section !== "losers",
		)
		.filter((round, i, allRounds) => {
			const isBracketReset =
				args.type === "winners" && i === allRounds.length - 1;
			const grandFinalsMatch =
				args.type === "winners"
					? args.bracketData.match.find(
							(match) => match.roundId === allRounds[allRounds.length - 2]?.id,
						)
					: undefined;

			if (isBracketReset && grandFinalsMatch?.winnerSide === "opponent1") {
				showingBracketReset = false;
				return false;
			}

			const matches = args.bracketData.match.filter(
				(match) => match.roundId === round.id,
			);

			const atLeastOneNonByeMatch = matches.some(
				(m) => m.opponent1 && m.opponent2,
			);

			return atLeastOneNonByeMatch;
		});

	const hasThirdPlaceMatch =
		args.type === "single" &&
		args.bracketData.round.some((round) => round.section === "finals");
	const namedRounds = rounds.map((round, i) => {
		const name = () => {
			if (
				showingBracketReset &&
				args.type === "winners" &&
				i === rounds.length - 2
			) {
				return TOURNAMENT.ROUND_NAMES.GRAND_FINALS;
			}

			if (hasThirdPlaceMatch && i === rounds.length - 2) {
				return TOURNAMENT.ROUND_NAMES.FINALS;
			}
			if (hasThirdPlaceMatch && i === rounds.length - 1) {
				return TOURNAMENT.ROUND_NAMES.THIRD_PLACE_MATCH;
			}

			if (args.type === "winners" && i === rounds.length - 1) {
				return showingBracketReset
					? TOURNAMENT.ROUND_NAMES.BRACKET_RESET
					: TOURNAMENT.ROUND_NAMES.GRAND_FINALS;
			}

			const namePrefix =
				args.type === "winners" ? "WB " : args.type === "losers" ? "LB " : "";

			const finalsOffSet = () => {
				if (args.type !== "winners") return 1;
				if (showingBracketReset) return 3;
				return 2;
			};
			const isFinals = i === rounds.length - finalsOffSet();

			const semisOffSet = () => {
				if (args.type !== "winners") return hasThirdPlaceMatch ? 3 : 2;
				if (showingBracketReset) return 4;
				return 3;
			};
			const isSemis = i === rounds.length - semisOffSet();

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
