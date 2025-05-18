import playerData from "./top-ten.json";

export function seasonHasTopTen(season: number) {
	return !!playerData[season];
}

export function playerTopTenData({
	season,
	userId,
}: {
	season: number;
	userId: number;
}) {
	for (const player of playerData[season] ?? []) {
		if (player.id === userId) {
			return player;
		}
	}

	return null;
}

export function playerTopTenPlacement({
	season,
	userId,
}: {
	season: number;
	userId: number;
}) {
	for (const [i, player] of (playerData[season] ?? []).entries()) {
		if (player.id === userId) {
			return i + 1;
		}
	}

	return null;
}
