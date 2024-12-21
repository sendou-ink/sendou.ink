import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import { removeDuplicates } from "~/utils/arrays";

export function getRounds(args: {
	bracketData: TournamentManagerDataSet;
	type: "winners" | "losers" | "single";
}) {
	const groupIds = args.bracketData.group.flatMap((group) => {
		if (args.type === "winners" && group.number === 2) return [];
		if (args.type === "losers" && group.number !== 2) return [];

		return group.id;
	});

	let showingBracketReset = args.bracketData.round.length > 1;
	const rounds = args.bracketData.round
		.flatMap((round) => {
			if (
				typeof round.group_id === "number" &&
				!groupIds.includes(round.group_id)
			) {
				return [];
			}

			return round;
		})
		.filter((round, i, rounds) => {
			const isBracketReset = args.type === "winners" && i === rounds.length - 1;
			const grandFinalsMatch =
				args.type === "winners"
					? args.bracketData.match.find(
							(match) => match.round_id === rounds[rounds.length - 2]?.id,
						)
					: undefined;

			if (isBracketReset && grandFinalsMatch?.opponent1?.result === "win") {
				showingBracketReset = false;
				return false;
			}

			const matches = args.bracketData.match.filter(
				(match) => match.round_id === round.id,
			);

			const atLeastOneNonByeMatch = matches.some(
				(m) => m.opponent1 && m.opponent2,
			);

			return atLeastOneNonByeMatch;
		});

	const hasThirdPlaceMatch =
		args.type === "single" &&
		removeDuplicates(args.bracketData.match.map((m) => m.group_id)).length > 1;
	const namedRounds = rounds.map((round, i) => {
		const name = () => {
			if (
				showingBracketReset &&
				args.type === "winners" &&
				i === rounds.length - 2
			) {
				return "Grand Finals";
			}

			if (hasThirdPlaceMatch && i === rounds.length - 2) {
				return "Finals";
			}
			if (hasThirdPlaceMatch && i === rounds.length - 1) {
				return "3rd place match";
			}

			if (args.type === "winners" && i === rounds.length - 1) {
				return showingBracketReset ? "Bracket Reset" : "Grand Finals";
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
export function adjustRoundNumbers<T extends { number: number }>(rounds: T[]) {
	if (rounds.at(0)?.number === 1) {
		return rounds;
	}

	return rounds.map((round) => ({ ...round, number: round.number - 1 }));
}
