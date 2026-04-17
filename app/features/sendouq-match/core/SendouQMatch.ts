import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";

export function score(match: {
	mapList: Array<{ winnerGroupId: number | null }>;
	groupAlpha: { id: number };
	groupBravo: { id: number };
}) {
	const mapsToWin = Math.ceil(SENDOUQ_BEST_OF / 2);
	const alphaWins = match.mapList.filter(
		(m) => m.winnerGroupId === match.groupAlpha.id,
	).length;
	const bravoWins = match.mapList.filter(
		(m) => m.winnerGroupId === match.groupBravo.id,
	).length;

	return {
		mapsToWin,
		alphaWins,
		bravoWins,
		isDecisive: alphaWins >= mapsToWin || bravoWins >= mapsToWin,
	};
}
