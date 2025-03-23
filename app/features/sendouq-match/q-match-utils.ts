export function winnersArrayToWinner(winners: ("ALPHA" | "BRAVO")[]) {
	const alphaCount = winners.filter((winner) => winner === "ALPHA").length;
	const bravoCount = winners.filter((winner) => winner === "BRAVO").length;

	if (alphaCount > bravoCount) return "ALPHA";
	if (bravoCount > alphaCount) return "BRAVO";

	return null;
}
