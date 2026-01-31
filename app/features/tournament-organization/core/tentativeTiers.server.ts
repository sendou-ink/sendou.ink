import { calculateTentativeTier } from "~/features/tournament/core/tiering";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";

interface SeriesMatch {
	substringMatches: string[];
	tentativeTier: number;
}

async function loadCache(): Promise<Map<number, SeriesMatch[]>> {
	const rows =
		await TournamentOrganizationRepository.findAllSeriesWithTierHistory();

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

let cache = await loadCache();

export function getTentativeTier(
	orgId: number,
	tournamentName: string,
): number | null {
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
