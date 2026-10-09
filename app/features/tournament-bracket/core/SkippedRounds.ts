import type { SkippableRound } from "~/db/tables-json";
import type { RoundSection } from "./engine/types";

type EliminationType = "single_elimination" | "double_elimination";

/** Named rounds that can be left unplayed, in the order they are played. */
export const SKIPPABLE_ROUNDS = {
	single_elimination: ["SEMIS", "FINALS", "THIRD_PLACE_MATCH"],
	double_elimination: [
		"WB_FINALS",
		"LB_SEMIS",
		"LB_FINALS",
		"GRAND_FINALS",
		"BRACKET_RESET",
	],
} as const satisfies Record<EliminationType, SkippableRound[]>;

/** Every round that can be skipped in some bracket type. */
export const ALL_SKIPPABLE_ROUNDS = [
	...SKIPPABLE_ROUNDS.single_elimination,
	...SKIPPABLE_ROUNDS.double_elimination,
] as const;

/** Rounds receiving teams from the round (directly or through another round), so they can't be played if it is skipped. */
const DEPENDENTS: Record<SkippableRound, SkippableRound[]> = {
	SEMIS: ["FINALS", "THIRD_PLACE_MATCH"],
	FINALS: [],
	THIRD_PLACE_MATCH: [],
	WB_FINALS: ["LB_FINALS", "GRAND_FINALS", "BRACKET_RESET"],
	LB_SEMIS: ["LB_FINALS", "GRAND_FINALS", "BRACKET_RESET"],
	LB_FINALS: ["GRAND_FINALS", "BRACKET_RESET"],
	GRAND_FINALS: ["BRACKET_RESET"],
	BRACKET_RESET: [],
};

/** Rounds that must be played for the given round to be played. */
export function prerequisitesOf(round: SkippableRound): SkippableRound[] {
	return (Object.keys(DEPENDENTS) as SkippableRound[]).filter((candidate) =>
		DEPENDENTS[candidate].includes(round),
	);
}

/** Skipped rounds after skipping `round`, which also skips every round depending on it. */
export function withSkipped(
	type: EliminationType,
	skipped: SkippableRound[],
	round: SkippableRound,
): SkippableRound[] {
	return inPlayOrder(type, [...skipped, round, ...DEPENDENTS[round]]);
}

/** Skipped rounds after playing `round`, which also plays every round it depends on. */
export function withPlayed(
	type: EliminationType,
	skipped: SkippableRound[],
	round: SkippableRound,
): SkippableRound[] {
	const played = new Set([round, ...prerequisitesOf(round)]);

	return inPlayOrder(
		type,
		skipped.filter((candidate) => !played.has(candidate)),
	);
}

/** Whether every round of the bracket type can be skipped and every round depending on a skipped one is skipped too. */
export function isValid(
	type: EliminationType,
	skipped: SkippableRound[],
): boolean {
	const skippable: readonly SkippableRound[] = SKIPPABLE_ROUNDS[type];
	if (skipped.some((round) => !skippable.includes(round))) return false;

	return skipped.every((round) =>
		DEPENDENTS[round].every((dependent) => skipped.includes(dependent)),
	);
}

/** Skipped rounds of the bracket type with their dependents included, in play order. Rounds of another bracket type are left out. */
export function normalized(
	type: EliminationType,
	skipped: SkippableRound[] | undefined,
): SkippableRound[] {
	if (!skipped) return [];

	return inPlayOrder(
		type,
		skipped.flatMap((round) => [round, ...DEPENDENTS[round]]),
	);
}

/**
 * Round numbers of a section of one elimination group that are skipped. Rounds are identified from the
 * end of the section, so e.g. "FINALS" is always the last round of the bracket, whatever its size.
 *
 * @param roundCount Rounds the section has when nothing is skipped.
 */
export function skippedRoundNumbers({
	type,
	section,
	roundCount,
	skipped,
}: {
	type: EliminationType;
	section: RoundSection;
	roundCount: number;
	skipped: SkippableRound[];
}): Set<number> {
	const result = new Set<number>();
	const fromEnd = (offset: number) => {
		const roundNumber = roundCount - offset;
		if (roundNumber >= 1) result.add(roundNumber);
	};

	for (const round of normalized(type, skipped)) {
		switch (round) {
			case "FINALS":
				if (section === "winners") fromEnd(0);
				break;
			case "SEMIS":
				if (section === "winners") fromEnd(1);
				break;
			case "THIRD_PLACE_MATCH":
				if (section === "finals") result.add(1);
				break;
			case "WB_FINALS":
				if (section === "winners") fromEnd(0);
				break;
			case "LB_FINALS":
				if (section === "losers") fromEnd(0);
				break;
			case "LB_SEMIS":
				if (section === "losers") fromEnd(1);
				break;
			case "GRAND_FINALS":
				if (section === "finals") result.add(1);
				break;
			case "BRACKET_RESET":
				if (section === "finals") result.add(2);
				break;
		}
	}

	return result;
}

function inPlayOrder(
	type: EliminationType,
	rounds: SkippableRound[],
): SkippableRound[] {
	return SKIPPABLE_ROUNDS[type].filter((round) => rounds.includes(round));
}
