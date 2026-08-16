import { calculateTentativeTier } from "#lib/features/tournament/tournament-utils.ts";
import { db } from "#lib/server/db/sql.ts";

interface SeriesMatch {
	substringMatches: string[];
	tentativeTier: number;
}

function findAllSeriesWithTierHistory() {
	return db
		.selectFrom("TournamentOrganizationSeries")
		.select(["organizationId", "substringMatches", "tierHistory"])
		.execute();
}

let cache: Map<number, SeriesMatch[]> | null = null;

async function loadCache(): Promise<Map<number, SeriesMatch[]>> {
	const rows = await findAllSeriesWithTierHistory();

	const result = new Map<number, SeriesMatch[]>();
	for (const row of rows) {
		if (!row.tierHistory?.length) continue;

		const tentativeTier = calculateTentativeTier(row.tierHistory);
		if (tentativeTier === null) continue;

		const existing = result.get(row.organizationId) ?? [];
		existing.push({
			substringMatches: row.substringMatches,
			tentativeTier,
		});
		result.set(row.organizationId, existing);
	}
	return result;
}

/** Tentative tier of a tournament based on its organization's series history, or `null` when it has none. */
export async function getTentativeTier(
	orgId: number,
	tournamentName: string,
): Promise<number | null> {
	if (!cache) {
		cache = await loadCache();
	}

	const seriesList = cache.get(orgId);
	if (!seriesList) return null;

	const nameLower = tournamentName.toLowerCase();
	const match = seriesList.find((s) =>
		s.substringMatches.some((m) => nameLower.includes(m.toLowerCase())),
	);

	return match?.tentativeTier ?? null;
}

export async function refreshTentativeTiersCache(): Promise<void> {
	cache = await loadCache();
}
