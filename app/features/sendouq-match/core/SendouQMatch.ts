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

/**
 * Returns which side ("ALPHA" or "BRAVO") of the match the given user belongs
 * to, or null if they are not a member of either group.
 */
export function resolveGroupMemberOf(args: {
	groupAlpha: { members: { id: number }[] };
	groupBravo: { members: { id: number }[] };
	userId: number | null | undefined;
}): "ALPHA" | "BRAVO" | null {
	if (!args.userId) return null;

	if (args.groupAlpha.members.some((m) => m.id === args.userId)) {
		return "ALPHA";
	}

	if (args.groupBravo.members.some((m) => m.id === args.userId)) {
		return "BRAVO";
	}

	return null;
}
