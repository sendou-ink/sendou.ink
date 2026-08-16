import playerData from "./top-ten.json" with { type: "json" };

interface TopTenPlayerData {
	id: number;
	name: string;
	countryCode: string;
	transforms?: { top?: number; left?: number };
}

const seasons = playerData as Array<TopTenPlayerData[] | undefined>;

export function seasonHasTopTen(season: number) {
	return !!seasons[season];
}

export function playerTopTenPlacement({
	season,
	userId,
}: {
	season: number;
	userId: number;
}) {
	for (const [i, player] of (seasons[season] ?? []).entries()) {
		if (player.id === userId) {
			return i + 1;
		}
	}

	return null;
}

export function topTenPlayerData({
	season,
	placement,
}: {
	season: number;
	placement: number;
}): TopTenPlayerData | undefined {
	return seasons[season]?.[placement - 1];
}
