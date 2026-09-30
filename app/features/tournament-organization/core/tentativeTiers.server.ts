import { calculateTentativeTier } from "~/features/tournament/core/tiering";
import * as TournamentOrganizationRepository from "../TournamentOrganizationRepository.server";
import * as Series from "./Series";

interface SeriesMatch {
	substringMatches: string[];
	tentativeTier: number;
}

async function loadCache(): Promise<Map<number, SeriesMatch[]>> {
	const rows = await TournamentOrganizationRepository.findAllSeries();

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

	const match = Series.findByEventName({
		series: seriesList,
		eventName: tournamentName,
	});

	return match?.tentativeTier ?? null;
}

export async function refreshTentativeTiersCache(): Promise<void> {
	cache = await loadCache();
}
