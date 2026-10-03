import * as R from "remeda";
import type { ParsedBracket } from "./Progression";

interface CheckInRow {
	bracketIdx: number | null;
	checkedInAt: number;
	isCheckOut: boolean;
}

/**
 * Brackets that share their check-in with the given bracket: every bracket requiring check-in that starts at the same time.
 * A team checked in to one of them is checked in to all, so a team moving between them keeps its check-in.
 *
 * @example
 * // Alpha (1) and Beta (2) both start at 18:00, Gamma (3) at 20:00
 * CheckIn.sharedBracketIdxs(1, progression) // [1, 2]
 */
export function sharedBracketIdxs(
	bracketIdx: number,
	progression: ParsedBracket[],
): number[] {
	const bracket = progression[bracketIdx];
	if (!bracket.startTime) return [bracketIdx];

	return progression.flatMap((candidate, candidateIdx) =>
		candidate.requiresCheckIn && candidate.startTime === bracket.startTime
			? [candidateIdx]
			: [],
	);
}

/**
 * Is the team checked in to the brackets (from {@link sharedBracketIdxs})? The latest check-in or check-out among them decides.
 */
export function isCheckedInToBrackets(
	checkIns: CheckInRow[],
	bracketIdxs: number[],
): boolean {
	const latest = R.firstBy(
		checkIns.filter(
			(checkIn) =>
				checkIn.bracketIdx !== null && bracketIdxs.includes(checkIn.bracketIdx),
		),
		[(checkIn) => checkIn.checkedInAt, "desc"],
	);

	return Boolean(latest && !latest.isCheckOut);
}
