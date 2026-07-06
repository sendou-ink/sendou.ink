import type { MainWeaponId } from "~/modules/in-game-lists/types";

/**
 * Max edit distance between two normalized names for them to be considered
 * OCR variants of the same name. Short names get a tighter budget so e.g.
 * two different 4-letter names don't collapse into one.
 */
const FUZZY_DISTANCE_LONG = 2;
const FUZZY_DISTANCE_SHORT = 1;
const FUZZY_SHORT_NAME_LENGTH = 6;

interface UnlinkedIngestedRow {
	ingestedInGameName: string;
	ingestedTeamId: number | null;
	mapIndex: number;
	weaponSplId: MainWeaponId;
}

export interface IngestedNameGroup {
	/** the variant detected in the most maps, shown in the UI */
	primaryName: string;
	/** every detected spelling belonging to this group, `primaryName` included */
	names: string[];
	ingestedTeamId: number | null;
	weapons: MainWeaponId[];
	/** 0-based indexes of the match's games this name has weapon rows for */
	mapIndexes: number[];
}

interface LinkablePlayer {
	id: number;
	tournamentTeamId: number;
	inGameName: string | null;
}

/**
 * Groups unlinked ingested weapon rows into one entry per (likely) player.
 * Two detected names on the same team are merged when they are near-identical
 * strings AND never appear in the same map — different maps reading the same
 * splash tag slightly differently. If a merge candidate group turns out
 * ambiguous (two of its names appear in the same map, meaning they must be
 * different players) the whole group is left unmerged for the user to decide.
 */
export function unlinkedNameGroups(
	rows: UnlinkedIngestedRow[],
): IngestedNameGroup[] {
	const aggregates = aggregateByName(rows);

	const byTeam = new Map<number | null, NameAggregate[]>();
	for (const aggregate of aggregates) {
		const list = byTeam.get(aggregate.teamId) ?? [];
		list.push(aggregate);
		byTeam.set(aggregate.teamId, list);
	}

	const result: Array<IngestedNameGroup & { firstSeen: number }> = [];
	for (const teamAggregates of byTeam.values()) {
		result.push(...clusterTeamAggregates(teamAggregates));
	}

	return result
		.sort((a, b) => a.firstSeen - b.firstSeen)
		.map(({ firstSeen: _, ...group }) => group);
}

/**
 * Resolves which sendou.ink user each group should come pre-selected as.
 * A group is matched to a player of its team by exact normalized in-game name
 * first, falling back to a fuzzy match with the same tolerance used for
 * variant merging. Anything ambiguous (a group matching several players, or
 * several groups fuzzy-matching the same player) is left unselected for the
 * user to decide.
 */
export function preselectedUserIdByGroup({
	groups,
	players,
}: {
	groups: IngestedNameGroup[];
	players: LinkablePlayer[];
}): Record<string, number> {
	const claims: Array<{ key: string; playerId: number; exact: boolean }> = [];

	for (const group of groups) {
		const candidates = players.filter(
			(player) =>
				(group.ingestedTeamId === null ||
					player.tournamentTeamId === group.ingestedTeamId) &&
				player.inGameName,
		);

		const exactMatches = candidates.filter((player) =>
			group.names.some(
				(name) =>
					normalizeInGameName(name) === normalizeInGameName(player.inGameName!),
			),
		);
		if (exactMatches.length === 1) {
			claims.push({
				key: groupKey(group),
				playerId: exactMatches[0]!.id,
				exact: true,
			});
			continue;
		}
		if (exactMatches.length > 1) continue;

		const fuzzyMatches = candidates.filter((player) =>
			group.names.some((name) => namesSimilar(name, player.inGameName!)),
		);
		if (fuzzyMatches.length === 1) {
			claims.push({
				key: groupKey(group),
				playerId: fuzzyMatches[0]!.id,
				exact: false,
			});
		}
	}

	const result: Record<string, number> = {};
	for (const claim of claims) {
		const competing = claims.filter((c) => c.playerId === claim.playerId);
		if (competing.length === 1) {
			result[claim.key] = claim.playerId;
			continue;
		}
		if (claim.exact && competing.filter((c) => c.exact).length === 1) {
			result[claim.key] = claim.playerId;
		}
	}

	return result;
}

/** Stable identifier of a group within one match's linking dialog. */
export function groupKey(
	group: Pick<IngestedNameGroup, "ingestedTeamId" | "primaryName">,
) {
	return `${group.ingestedTeamId ?? "unknown"}|${group.primaryName}`;
}

interface NameAggregate {
	name: string;
	teamId: number | null;
	mapIndexes: Set<number>;
	weaponsByMap: Array<{ mapIndex: number; weaponSplId: MainWeaponId }>;
	firstSeen: number;
}

function aggregateByName(rows: UnlinkedIngestedRow[]): NameAggregate[] {
	const result: NameAggregate[] = [];

	for (const [rowIdx, row] of rows.entries()) {
		let aggregate = result.find(
			(a) =>
				a.name === row.ingestedInGameName && a.teamId === row.ingestedTeamId,
		);
		if (!aggregate) {
			aggregate = {
				name: row.ingestedInGameName,
				teamId: row.ingestedTeamId,
				mapIndexes: new Set(),
				weaponsByMap: [],
				firstSeen: rowIdx,
			};
			result.push(aggregate);
		}
		aggregate.mapIndexes.add(row.mapIndex);
		aggregate.weaponsByMap.push({
			mapIndex: row.mapIndex,
			weaponSplId: row.weaponSplId,
		});
	}

	return result;
}

function clusterTeamAggregates(
	aggregates: NameAggregate[],
): Array<IngestedNameGroup & { firstSeen: number }> {
	const clusterIdxs = aggregates.map((_, i) => i);
	const rootOf = (i: number): number =>
		clusterIdxs[i] === i ? i : rootOf(clusterIdxs[i]!);

	for (let a = 0; a < aggregates.length; a++) {
		for (let b = a + 1; b < aggregates.length; b++) {
			if (!namesSimilar(aggregates[a]!.name, aggregates[b]!.name)) continue;
			if (mapsOverlap(aggregates[a]!, aggregates[b]!)) continue;
			clusterIdxs[rootOf(b)] = rootOf(a);
		}
	}

	const clusters = new Map<number, NameAggregate[]>();
	for (const [i, aggregate] of aggregates.entries()) {
		const root = rootOf(i);
		const members = clusters.get(root) ?? [];
		members.push(aggregate);
		clusters.set(root, members);
	}

	const result: Array<IngestedNameGroup & { firstSeen: number }> = [];
	for (const members of clusters.values()) {
		if (members.length > 1 && anyMapsOverlap(members)) {
			// two names of this cluster appeared in the same map, so at least
			// some of them are different players after all -> user decides
			result.push(...members.map((member) => toGroup([member])));
		} else {
			result.push(toGroup(members));
		}
	}

	return result;
}

function toGroup(
	members: NameAggregate[],
): IngestedNameGroup & { firstSeen: number } {
	const primary = [...members].sort(
		(a, b) =>
			b.mapIndexes.size - a.mapIndexes.size || a.firstSeen - b.firstSeen,
	)[0]!;

	const weapons: MainWeaponId[] = [];
	const allWeapons = members
		.flatMap((member) => member.weaponsByMap)
		.sort((a, b) => a.mapIndex - b.mapIndex);
	for (const { weaponSplId } of allWeapons) {
		if (!weapons.includes(weaponSplId)) weapons.push(weaponSplId);
	}

	return {
		primaryName: primary.name,
		names: members.map((member) => member.name),
		ingestedTeamId: primary.teamId,
		weapons,
		mapIndexes: [
			...new Set(members.flatMap((member) => [...member.mapIndexes])),
		].sort((a, b) => a - b),
		firstSeen: Math.min(...members.map((member) => member.firstSeen)),
	};
}

function mapsOverlap(a: NameAggregate, b: NameAggregate) {
	return [...a.mapIndexes].some((mapIndex) => b.mapIndexes.has(mapIndex));
}

function anyMapsOverlap(members: NameAggregate[]) {
	const seen = new Set<number>();
	for (const member of members) {
		for (const mapIndex of member.mapIndexes) {
			if (seen.has(mapIndex)) return true;
			seen.add(mapIndex);
		}
	}
	return false;
}

function namesSimilar(a: string, b: string) {
	const normalizedA = normalizeInGameName(a);
	const normalizedB = normalizeInGameName(b);
	if (normalizedA === normalizedB) return true;

	const allowed =
		Math.max(normalizedA.length, normalizedB.length) >= FUZZY_SHORT_NAME_LENGTH
			? FUZZY_DISTANCE_LONG
			: FUZZY_DISTANCE_SHORT;

	return editDistance(normalizedA, normalizedB) <= allowed;
}

function normalizeInGameName(name: string) {
	return name.split("#")[0]!.normalize("NFKC").trim().toLowerCase();
}

function editDistance(a: string, b: string) {
	const charsA = Array.from(a);
	const charsB = Array.from(b);
	if (charsA.length === 0) return charsB.length;
	if (charsB.length === 0) return charsA.length;

	let previousRow = Array.from({ length: charsB.length + 1 }, (_, i) => i);
	for (let i = 1; i <= charsA.length; i++) {
		const currentRow = [i];
		for (let j = 1; j <= charsB.length; j++) {
			currentRow[j] = Math.min(
				previousRow[j]! + 1,
				currentRow[j - 1]! + 1,
				previousRow[j - 1]! + (charsA[i - 1] === charsB[j - 1] ? 0 : 1),
			);
		}
		previousRow = currentRow;
	}

	return previousRow[charsB.length]!;
}
