import { SENDOUQ_BEST_OF } from "../q-constants";

export function matchEndedAtIndex(scores: ("ALPHA" | "BRAVO")[]) {
	let alphaCount = 0;
	let bravoCount = 0;
	let matchEndedAt = -1;

	const mapsToWin = Math.ceil(SENDOUQ_BEST_OF / 2);
	for (const [i, winner] of scores.entries()) {
		if (winner === "ALPHA") alphaCount++;
		if (winner === "BRAVO") bravoCount++;

		if (alphaCount === mapsToWin || bravoCount === mapsToWin) {
			matchEndedAt = i;
			break;
		}
	}

	if (matchEndedAt === -1) return null;

	return matchEndedAt;
}
