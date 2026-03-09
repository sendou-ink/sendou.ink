export function winnersArrayToWinner(winners: ("ALPHA" | "BRAVO")[]) {
	const alphaCount = winners.filter((winner) => winner === "ALPHA").length;
	const bravoCount = winners.filter((winner) => winner === "BRAVO").length;

	if (alphaCount > bravoCount) return "ALPHA";
	if (bravoCount > alphaCount) return "BRAVO";

	return null;
}

export function resolveGroupMemberOf(args: {
	groupAlpha: { members: { id: number }[] };
	groupBravo: { members: { id: number }[] };
	userId: number | undefined;
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
